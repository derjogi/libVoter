#!/usr/bin/env bun

import { createClient } from "@libsql/client";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { access, readFile, writeFile } from "fs/promises";
import { chromium, type Page } from "playwright-core";
import * as schema from "../src/lib/db/schema";
import { getVectorStoreManager } from "../src/lib/server/rag/vector-store";

const MAIN_URL =
  "https://voteauckland.co.nz/en/information-for-voters/candidates-2025-local-elections.html";
const ROBOTS_URL = "https://voteauckland.co.nz/robots.txt";
const CANDIDATE_LIST_JSON = "data/candidate-list.json";
const OUTPUT_JSON = "data/all-candidates.json";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
const RETRY_ATTEMPTS = 3;
const DELAY_MS = 2000;

interface CandidateDetails {
  candidate_statement: string;
  key_positions: Record<string, string>;
  why?: string;
  key_skills?: string;
  top_issues?: string;
  supporting_links?: string[];
  photo_url?: string;
}

interface Candidate {
  name: string;
  ward: string;
  link: string;
  details: CandidateDetails;
}

const getDbClient = () => {
  const client = createClient({
    url: process.env.DATABASE_URL || "file:./voting-advisor.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return drizzle(client, { schema });
};

async function checkRobotsTxt(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const lines = text.split("\n");
    const disAllowed = lines.some(
      (line) =>
        line.startsWith("Disallow:") &&
        line.includes("/en/information-for-voters/"),
    );
    if (disAllowed) {
      console.log(
        "Warning: robots.txt may disallow scraping. Proceed with caution.",
      );
    }
    return true;
  } catch (error) {
    console.log("Could not check robots.txt, proceeding anyway.");
    return true;
  }
}

async function scrapeCandidateList(page: Page): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  try {
    await page.waitForLoadState("networkidle");
    // Find all candidate links on the page
    const candidateElements = page.locator('a[href*="/candidates/"]');
    const count = await candidateElements.count();
    for (let i = 0; i < count; i++) {
      console.log(`Scraping candidate ${i + 1} of ${count}`);
      const linkElement = candidateElements.nth(i);
      const link = (await linkElement.getAttribute("href")) || "";
      const name = (await linkElement.textContent()) || "";
      if (name && link) {
        // Extract ward from URL path, e.g., /mayor/ -> Mayor, /albany/ -> Albany Ward
        const url = new URL(link);
        const pathParts = url.pathname.split("/");
        const wardPath = pathParts[4];
        let ward = wardPath
          .replace(/-/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        if (wardPath === "mayor") ward = "Mayor";
        candidates.push({
          name: name.trim(),
          ward: ward.trim(),
          link,
          details: {} as CandidateDetails,
        });
      }
      // await page.waitForTimeout(DELAY_MS);
    }
    console.log(`Scraped ${candidates.length} candidates from list.`);
    // Write to candidate list JSON
    await writeFile(CANDIDATE_LIST_JSON, JSON.stringify(candidates, null, 2));
    console.log(`Written candidate list to ${CANDIDATE_LIST_JSON}`);
  } catch (error) {
    console.error("Error scraping list:", error);
  }
  return candidates;
}

async function scrapeCandidateDetails(
  page: Page,
  link: string,
): Promise<CandidateDetails> {
  // Set shorter timeout to avoid long waits
  const originalTimeout = 30000; // Default Playwright timeout
  page.setDefaultTimeout(2000);

  try {
    await page.goto(link, { waitUntil: "networkidle" });
    console.log(`Loaded candidate page: ${link}`);

    const candidateStatementLocator = page.locator(
      'h4:has-text("Candidate statement") + div p',
    );
    let candidateStatement = "";
    if ((await candidateStatementLocator.count()) > 0) {
      const allPs = await candidateStatementLocator.all();
      const texts = await Promise.all(allPs.map((p) => p.textContent()));
      candidateStatement = texts
        .filter((t) => t)
        .join(" ")
        .trim();
    }

    const whyLocator = page.locator(
      'h2:has-text("Why I want to be elected") + p',
    );
    const why =
      (await whyLocator.count()) > 0
        ? await whyLocator.textContent()
        : undefined;

    const keySkillsLocator = page.locator(
      'h2:has-text("My key skills and qualities") + p',
    );
    const keySkills =
      (await keySkillsLocator.count()) > 0
        ? await keySkillsLocator.textContent()
        : undefined;

    const topIssuesLocator = page.locator(
      'h2:has-text("My top three key issues") + p',
    );
    const topIssues =
      (await topIssuesLocator.count()) > 0
        ? await topIssuesLocator.textContent()
        : undefined;

    // Key positions: under h2 "My position on key topics", each li contains h3 and p
    const key_positions: Record<string, string> = {};
    const policySection = page.locator(
      'h2:has-text("My position on key topics")',
    );
    if ((await policySection.count()) > 0) {
      // Get all li elements in the policy section (h2 -> div -> ul -> li)
      const policyLis = page.locator(
        'h2:has-text("My position on key topics") ~ div ul li',
      );
      const count = await policyLis.count();
      for (let i = 0; i < count; i++) {
        const li = policyLis.nth(i);
        try {
          const h3Element = li.locator("h3");
          const pElement = li.locator("p");
          if ((await h3Element.count()) > 0 && (await pElement.count()) > 0) {
            const h3Text = await h3Element.textContent();
            const pText = await pElement.textContent();
            if (h3Text && pText && h3Text.trim() && pText.trim()) {
              key_positions[h3Text.trim()] = pText.trim();
            }
          }
        } catch (error) {
          // Skip this li if there's an issue
          console.log(
            `Skipping li ${i} due to error:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    const photoUrl =
      (await page.locator(".profile-picture img").getAttribute("src")) ||
      undefined;

    // Supporting links: all external links not from Auckland Council
    const allLinks = await page
      .locator('h2:has-text("Candidate\'s supporting links") ~ ul a')
      .all();
    const supporting_links: string[] = [];
    for (const linkEl of allLinks) {
      const href = await linkEl.getAttribute("href");
      if (
        href &&
        !href.includes("voteauckland") &&
        !href.includes("aucklandcouncil")
      ) {
        supporting_links.push(href);
      }
    }

    page.setDefaultTimeout(originalTimeout);
    return {
      candidate_statement: candidateStatement.trim(),
      key_positions,
      why: why?.trim(),
      key_skills: keySkills?.trim(),
      top_issues: topIssues?.trim(),
      supporting_links,
      photo_url: photoUrl,
    };
  } catch (error) {
    console.error("Error scraping details for link:", link, error);
    page.setDefaultTimeout(originalTimeout);
    return {
      candidate_statement: "",
      key_positions: {},
      why: undefined,
      key_skills: undefined,
      top_issues: undefined,
      supporting_links: undefined,
      photo_url: undefined,
    };
  }
}

async function scrapeCandidates(
  startIndex: number = 0,
  limit?: number,
): Promise<Candidate[]> {
  let browser;
  try {
    console.log("Launching browser...");
    browser = await chromium.launch({ headless: false });
    console.log("Creating context...");
    const context = await browser.newContext({ userAgent: USER_AGENT });
    console.log("Creating page...");
    const page = await context.newPage();
    console.log("Checking robots...");
    await checkRobotsTxt(ROBOTS_URL);
    console.log("Going to main URL...");
    await page.goto(MAIN_URL);
    console.log("Page loaded.");
    let allCandidates: Candidate[];
    try {
      await access(CANDIDATE_LIST_JSON);
      console.log(`Reading candidate list from ${CANDIDATE_LIST_JSON}`);
      const data = await readFile(CANDIDATE_LIST_JSON, "utf-8");
      allCandidates = JSON.parse(data);
    } catch {
      console.log(`Candidate list not found, scraping from page...`);
      allCandidates = await scrapeCandidateList(page);
    }
    const candidates = allCandidates.slice(startIndex);
    const toProcess = limit
      ? Math.min(limit, candidates.length)
      : candidates.length;
    console.log(
      `Starting from index ${startIndex}, processing ${toProcess} candidates.`,
    );
    for (let i = 0; i < toProcess; i++) {
      const candidate = candidates[i];
      console.log(
        `Processing ${i + startIndex + 1}/${allCandidates.length}: ${candidate.name}`,
      );
      let attempts = 0;
      while (attempts < RETRY_ATTEMPTS) {
        candidate.details = await scrapeCandidateDetails(page, candidate.link);
        if (
          candidate.details.candidate_statement ||
          Object.keys(candidate.details.key_positions).length > 0
        )
          break;
        attempts++;
        await page.waitForTimeout(DELAY_MS);
        console.log(`Retry ${attempts} for ${candidate.name}`);
      }
      // Insert to DB immediately
      await insertCandidatesToDB([candidate]);
    }
    await browser.close();
    // Write to JSON
    await writeFile(OUTPUT_JSON, JSON.stringify(allCandidates, null, 2));
    console.log(`Written to ${OUTPUT_JSON}`);
    return allCandidates;
  } catch (error) {
    console.error("Scraping error:", error);
    if (browser) await browser.close();
    throw error;
  }
}

async function insertCandidatesToDB(candidates: Candidate[]) {
  const db = getDbClient();
  try {
    for (const candidate of candidates) {
      await db
        .insert(schema.candidates)
        .values([
          {
            name: candidate.name,
            party: null, // Party not scraped
            ward: candidate.ward,
            candidate_statement: candidate.details.candidate_statement,
            key_positions:
              Object.keys(candidate.details.key_positions).length > 0
                ? candidate.details.key_positions
                : null,
            why: candidate.details.why || null,
            key_skills: candidate.details.key_skills || null,
            top_issues: candidate.details.top_issues || null,
            supporting_links: candidate.details.supporting_links?.length
              ? candidate.details.supporting_links
              : null,
            photo_url: candidate.details.photo_url || null,
            created_at: new Date(),
          },
        ])
        .onConflictDoUpdate({
          target: [schema.candidates.name, schema.candidates.ward],
          set: {
            candidate_statement: sql`excluded.candidate_statement`,
            key_positions: sql`excluded.key_positions`,
            why: sql`excluded.why`,
            key_skills: sql`excluded.key_skills`,
            top_issues: sql`excluded.top_issues`,
            supporting_links: sql`excluded.supporting_links`,
            photo_url: sql`excluded.photo_url`,
          },
        });
    }
    console.log(`Inserted/updated ${candidates.length} candidates to DB.`);
  } catch (error) {
    console.error("DB insertion error:", error);
  } finally {
    // Close client if needed
  }
}

async function main() {
  try {
    // const args = process.argv.slice(2);
    // let startIndex = 0;
    // let limit: number | undefined;
    // const startArg = args.find(arg => arg.startsWith('--start='));
    // if (startArg) {
    //   startIndex = parseInt(startArg.split('=')[1], 10) || 0;
    // }
    // const limitArg = args.find(arg => arg.startsWith('--limit='));
    // if (limitArg) {
    //   limit = parseInt(limitArg.split('=')[1], 10);
    // }
    // console.log("Scraping started from index:", startIndex, limit ? `limit ${limit}` : 'no limit');
    // const candidates = await scrapeCandidates(startIndex, limit);
    // // DB insertion is done incrementally, but write JSON again to ensure all are included
    // console.log("Scraping complete.");
    // Initialize vector store once after all documents are added to the database
    await getVectorStoreManager();
  } catch (error) {
    console.error("Main error:", error);
    process.exit(1);
  }
}

main();
