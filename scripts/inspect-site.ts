#!/usr/bin/env bun

import { chromium } from 'playwright-core';

const URL = 'https://voteauckland.co.nz/en/information-for-voters/candidates-2025-local-elections.html';

async function inspectSite() {
  const browser = await chromium.launch({ headless: false }); // Headless false to see the browser
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });

  // Take full page screenshot
  await page.screenshot({ path: 'data/site-screenshot.png', fullPage: true });

  // Get page title
  const title = await page.title();
  console.log('Page Title:', title);

  // Get HTML content (first 1000 chars)
  const html = await page.content();
  console.log('HTML (first 1000 chars):', html.substring(0, 1000));

  // Try to find candidate elements - log possible selectors
  const headings = await page.locator('h1, h2, h3, h4, h5, h6').allTextContents();
  console.log('Headings:', headings);

  // Look for links that might be candidates
  const links = await page.locator('a').all();
  const candidateLinks = [];
  for (const link of links) {
    const href = await link.getAttribute('href');
    const text = await link.textContent();
    if (href && href.includes('/candidates/') && text.trim() && !text.includes('Information for')) {
      candidateLinks.push({ text: text.trim(), href });
    }
  }
  console.log('Possible candidate links:', candidateLinks.slice(0, 10));

  // Look for ward sections
  const wardSelectors = ['.ward', '[class*="ward"]', 'h2', 'h3'];
  for (const selector of wardSelectors) {
    const elements = await page.locator(selector).allTextContents();
    if (elements.length > 0) {
      console.log(`Elements with selector ${selector}:`, elements.slice(0, 5));
    }
  }

  // Visit a detail page to inspect structure
  if (candidateLinks.length > 0) {
    const detailUrl = candidateLinks[0].href;
    console.log('Visiting detail page:', detailUrl);
    await page.goto(detailUrl, { waitUntil: 'networkidle' });

    // Take screenshot of detail page
    await page.screenshot({ path: 'data/detail-screenshot.png', fullPage: true });

    const detailTitle = await page.title();
    console.log('Detail Page Title:', detailTitle);

    // Get page content
    const content = await page.content();
    console.log('Detail page HTML (first 2000 chars):', content.substring(0, 2000));

    // Look for bio, policies, etc.
    const allP = await page.locator('p').allTextContents();
    console.log('All p elements:', allP.filter(p => p.length > 20).slice(0, 5));

    const allDiv = await page.locator('div').allTextContents();
    console.log('All div elements (long ones):', allDiv.filter(d => d.length > 50).slice(0, 3));

    // Look for contact info
    const emails = await page.locator('[href^="mailto:"]').all();
    for (const e of emails) {
      const href = await e.getAttribute('href');
      const text = await e.textContent();
      console.log('Email:', href, text);
    }

    const phones = await page.locator('[href^="tel:"]').all();
    for (const p of phones) {
      const href = await p.getAttribute('href');
      const text = await p.textContent();
      console.log('Phone:', href, text);
    }

    const links = await page.locator('a[href^="http"]').all();
    for (const l of links) {
      const href = await l.getAttribute('href');
      const text = await l.textContent();
      if (text && href && !href.includes('voteauckland')) {
        console.log('External link:', href, text);
      }
    }

    // Look for photo
    const imgs = await page.locator('img').all();
    for (const i of imgs) {
      const src = await i.getAttribute('src');
      const alt = await i.getAttribute('alt');
      console.log('Img:', src, alt);
    }
  }

  await browser.close();
}

inspectSite().catch(console.error);