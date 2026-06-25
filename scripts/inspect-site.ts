#!/usr/bin/env bun

import { writeFile } from "fs/promises";
import { chromium } from "playwright-core";

const URL =
  process.argv[2] ||
  "https://voteauckland.co.nz/en/information-for-voters/candidates-2025-local-elections.html";

async function inspectSite() {
  const browser = await chromium.launch({ headless: false }); // Headless false to see the browser
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });

  // Take full page screenshot
  await page.screenshot({ path: "data/site-screenshot.png", fullPage: true });

  // Get page title
  const title = await page.title();
  console.log("Page Title:", title);

  // Get HTML content (first 1000 chars)
  const html = await page.content();
  console.log("HTML (first 1000 chars):", html.substring(0, 1000));

  // Try to find candidate elements - log possible selectors
  const headings = await page
    .locator("h1, h2, h3, h4, h5, h6")
    .allTextContents();
  console.log("Headings:", headings);

  // Look for ward sections
  const wardSelectors = [".ward", '[class*="ward"]', "h2", "h3"];
  for (const selector of wardSelectors) {
    const elements = await page.locator(selector).allTextContents();
    if (elements.length > 0) {
      console.log(`Elements with selector ${selector}:`, elements.slice(0, 5));
    }
  }

  // Look for elements with classes or ids
  const allElements = await page.locator("*").all();
  const classCounts: Record<string, number> = {};
  const idCounts: Record<string, number> = {};
  for (const el of allElements.slice(0, 200)) {
    // limit to first 200
    const classAttr = await el.getAttribute("class");
    if (classAttr) {
      const classes = classAttr.split(" ").filter((c) => c);
      classes.forEach((c) => (classCounts[c] = (classCounts[c] || 0) + 1));
    }
    const idAttr = await el.getAttribute("id");
    if (idAttr) {
      idCounts[idAttr] = (idCounts[idAttr] || 0) + 1;
    }
  }
  console.log(
    "Class counts (top):",
    Object.entries(classCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
  );
  console.log("ID counts:", idCounts);

  // Inspect current page as detail page
  // Take screenshot of detail page
  await page.screenshot({ path: "data/detail-screenshot.png", fullPage: true });

  const detailTitle = await page.title();
  console.log("Detail Page Title:", detailTitle);

  // Get page content
  const content = await page.content();
  console.log(
    "Detail page HTML (first 2000 chars):",
    content.substring(0, 2000),
  );
  // Save full HTML to file
  await writeFile("data/detail-page.html", content);
  console.log("Saved full HTML to data/detail-page.html");

  // Look for bio, policies, etc.
  const allP = await page.locator("p").allTextContents();
  console.log("All p elements:", allP.filter((p) => p.length > 20).slice(0, 5));

  const allDiv = await page.locator("div").allTextContents();
  console.log(
    "All div elements (long ones):",
    allDiv.filter((d) => d.length > 50).slice(0, 3),
  );

  // Look for contact info
  const emails = await page.locator('[href^="mailto:"]').all();
  for (const e of emails) {
    const href = await e.getAttribute("href");
    const text = await e.textContent();
    console.log("Email:", href, text);
  }

  const phones = await page.locator('[href^="tel:"]').all();
  for (const p of phones) {
    const href = await p.getAttribute("href");
    const text = await p.textContent();
    console.log("Phone:", href, text);
  }

  const links = await page.locator('a[href^="http"]').all();
  for (const l of links) {
    const href = await l.getAttribute("href");
    const text = await l.textContent();
    if (text && href && !href.includes("voteauckland")) {
      console.log("External link:", href, text);
    }
  }

  // Look for photo
  const imgs = await page.locator("img").all();
  for (const i of imgs) {
    const src = await i.getAttribute("src");
    const alt = await i.getAttribute("alt");
    console.log("Img:", src, alt);
  }

  await browser.close();
}

inspectSite().catch(console.error);
