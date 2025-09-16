#!/usr/bin/env bun

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { chromium } from 'playwright-core';
import { writeFile } from 'fs/promises';

const MAIN_URL = 'https://voteauckland.co.nz/en/information-for-voters/candidates-2025-local-elections.html';
const ROBOTS_URL = 'https://voteauckland.co.nz/robots.txt';
const OUTPUT_JSON = 'data/all-candidates.json';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const RETRY_ATTEMPTS = 3;
const DELAY_MS = 2000;

interface CandidateDetails {
  bio: string;
  policies: string[];
  email?: string;
  phone?: string;
  photo_url?: string;
  website?: string;
}

interface Candidate {
  name: string;
  ward: string;
  link: string;
  details: CandidateDetails;
}

const getDbClient = () => {
  const client = createClient({
    url: process.env.DATABASE_URL || 'file:./voting-advisor.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return drizzle(client, { schema });
};

async function checkRobotsTxt(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const lines = text.split('\n');
    const disAllowed = lines.some(line => line.startsWith('Disallow:') && line.includes('/en/information-for-voters/'));
    if (disAllowed) {
      console.log('Warning: robots.txt may disallow scraping. Proceed with caution.');
    }
    return true;
  } catch (error) {
    console.log('Could not check robots.txt, proceeding anyway.');
    return true;
  }
}

async function scrapeCandidateList(page): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  try {
    await page.waitForLoadState('networkidle');
    // Find all candidate links on the page
    const candidateElements = page.locator('a[href*="/candidates/"]');
    const count = await candidateElements.count();
    for (let i = 0; i < count; i++) {
      console.log(`Scraping candidate ${i + 1} of ${count}`);
      const linkElement = candidateElements.nth(i);
      const link = await linkElement.getAttribute('href') || '';
      const name = await linkElement.textContent() || '';
      if (name && link) {
        // Extract ward from URL path, e.g., /mayor/ -> Mayor, /albany/ -> Albany Ward
        const url = new URL(link);
        const pathParts = url.pathname.split('/');
        const wardPath = pathParts[4];
        let ward = wardPath.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        if (wardPath === 'mayor') ward = 'Mayor';
        if (!ward.includes('Board') && !ward.includes('Trust') && ward !== 'Mayor') {
          ward += ' Ward';
        }
        candidates.push({ name: name.trim(), ward: ward.trim(), link, details: {} as CandidateDetails });
      }
      // await page.waitForTimeout(DELAY_MS);
    }
    console.log(`Scraped ${candidates.length} candidates from list.`);
  } catch (error) {
    console.error('Error scraping list:', error);
  }
  return candidates;
}

async function scrapeCandidateDetails(page, link: string, name: string): Promise<CandidateDetails> {
  try {
    await page.goto(link, { waitUntil: 'networkidle' });
    console.log(`Loaded candidate page: ${link}`);
    // Bio is the first paragraph with candidate statement
    const bio = await page.locator('p').first().textContent() || '';
    // Policies are the headings of key topics (Transport, Water, etc.)
    const policyElements = page.locator('h4');
    const policies = await policyElements.allTextContents();
    // Note: Email and phone are general council contact, not candidate specific
    const email = undefined;
    const phone = undefined;
    // Photo is img inside div with class profile-picture
    const photoUrl = await page.locator('.profile-picture img').getAttribute('src') || undefined;
    // Website is external social media links
    const websiteElement = await page.locator('a[href^="http"]').filter({ hasText: /facebook|instagram|linkedin/i }).first().catch(() => null);
    const website = websiteElement ? await websiteElement.getAttribute('href') : undefined;
    return {
      bio: bio.trim(),
      policies: policies.map(p => p.trim()).filter(p => p),
      email,
      phone,
      photo_url: photoUrl,
      website,
    };
  } catch (error) {
    console.error('Error scraping details for link:', link, error);
    return { bio: '', policies: [] };
  }
}

async function scrapeCandidates(startIndex: number = 0): Promise<Candidate[]> {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: false });
    console.log('Creating context...');
    const context = await browser.newContext({ userAgent: USER_AGENT });
    console.log('Creating page...');
    const page = await context.newPage();
    console.log('Checking robots...');
    await checkRobotsTxt(ROBOTS_URL);
    console.log('Going to main URL...');
    await page.goto(MAIN_URL);
    console.log('Page loaded.');
    const allCandidates = await scrapeCandidateList(page);
    const candidates = allCandidates.slice(startIndex);
    console.log(`Starting from index ${startIndex}, processing ${candidates.length} candidates.`);
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      console.log(`Processing ${i + startIndex + 1}/${allCandidates.length}: ${candidate.name}`);
      let attempts = 0;
      while (attempts < RETRY_ATTEMPTS) {
        candidate.details = await scrapeCandidateDetails(page, candidate.link, candidate.name);
        if (candidate.details.bio || candidate.details.policies.length > 0) break;
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
    console.error('Scraping error:', error);
    if (browser) await browser.close();
    throw error;
  }
}

async function insertCandidatesToDB(candidates: Candidate[]) {
  const db = getDbClient();
  try {
    for (const candidate of candidates) {
      await db.insert(schema.candidates).values({
        name: candidate.name,
        party: null, // Party not scraped
        ward: candidate.ward,
        bio: candidate.details.bio,
        policies: candidate.details.policies,
        email: candidate.details.email,
        phone: candidate.details.phone,
        photo_url: candidate.details.photo_url,
        website: candidate.details.website,
        created_at: new Date(),
      }).onConflictDoUpdate({
        target: [schema.candidates.name, schema.candidates.ward],
        set: {
          bio: sql`excluded.bio`,
          policies: sql`excluded.policies`,
          email: sql`excluded.email`,
          phone: sql`excluded.phone`,
          photo_url: sql`excluded.photo_url`,
          website: sql`excluded.website`,
        },
      });
    }
    console.log(`Inserted/updated ${candidates.length} candidates to DB.`);
  } catch (error) {
    console.error('DB insertion error:', error);
  } finally {
    // Close client if needed
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    let startIndex = 0;
    const startArg = args.find(arg => arg.startsWith('--start='));
    if (startArg) {
      startIndex = parseInt(startArg.split('=')[1], 10) || 0;
    }
    console.log("Scraping started from index:", startIndex);
    const candidates = await scrapeCandidates(startIndex);
    // DB insertion is done incrementally, but write JSON again to ensure all are included
    console.log("Scraping complete.");
  } catch (error) {
    console.error('Main error:', error);
    process.exit(1);
  }
}

main();