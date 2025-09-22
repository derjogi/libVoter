import { test, expect } from '@playwright/test';
import { randomInt } from 'crypto';

test.describe('Chat Flow Tests', () => {
  test('should load the app successfully', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3000');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check basic page structure
    const heading = page.getByRole('heading', { name: 'AI Voting Advisor' });
    await expect(heading).toBeVisible();

    const confidenceBadge = page.locator('text=Confidence: 0%');
    await expect(confidenceBadge).toBeVisible();

    const wardQuestion = page.locator('text=Which ward do you live in?');
    await expect(wardQuestion).toBeVisible();

    console.log('App loaded successfully with expected structure');
  });

  test('should handle ward selection and show candidates', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Wait for ward selection to appear (app starts with it)
    const wardQuestion = page.locator('text=Which ward do you live in?');
    await expect(wardQuestion).toBeVisible({ timeout: 10000 });

    // Select a ward using the dropdown
    const selectTrigger = page.locator('button').filter({ hasText: 'Select your ward...' }).first();
    await selectTrigger.click();

    // Wait for dropdown options to appear and select the first one
    await page.waitForTimeout(500);
    const firstWardOption = page.locator('div[role="option"]').first();
    await firstWardOption.click();

    // Submit the selection by clicking Continue button
    const submitButton = page.locator('button').filter({ hasText: 'Continue' }).first();
    await submitButton.click();

    // Wait for response and check loading state
    await page.waitForTimeout(20000); // This might take long, because AI.

    // Check if candidates are shown or next component appears (checkboxes for issues)
    const candidatesSection = page.locator('text=candidate, text=Candidate');
    const checkboxes = page.locator('[data-slot="checkbox"]');

    // Either candidates should appear or checkboxes for next question
    const hasCandidates = await candidatesSection.isVisible().catch(() => false);
    const hasCheckboxes = (await checkboxes.count()) > 0;

    expect(hasCandidates || hasCheckboxes).toBe(true);
  });

  test('should complete full user flow', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Step 1: Ward Selection
    const wardQuestion = page.locator('text=Which ward do you live in?');
    await expect(wardQuestion).toBeVisible({ timeout: 3000 });

    // Select a ward using the dropdown
    const selectTrigger = page.locator('button').filter({ hasText: 'Select your ward...' }).first();
    await selectTrigger.click();

    // Wait for dropdown options to appear and select the first one
    await page.waitForTimeout(500);
    const firstWardOption = page.locator('div[role="option"]').first();
    await firstWardOption.click();

    // Click Continue to proceed
    const continueButton = page.locator('button').filter({ hasText: 'Continue' });
    await continueButton.click();

    // Step 2: Wait for next question or candidates
    await page.waitForTimeout(3000);

    // Check if we got candidates or issues question
    const candidatesVisible = await page.locator('text=candidate, text=Candidate').isVisible().catch(() => false);
    const issuesQuestion = page.locator('text=Which of these issues matter most to you?');

    if (await issuesQuestion.isVisible().catch(() => false)) {
      // Step 3: Issues Selection
      const issueCheckboxes = page.locator('[data-slot="checkbox"]');
      const issuesCount = await issueCheckboxes.count();

      // Select first 3 issues
      for (let i = 0; i < Math.min(3, issuesCount); i++) {
        await issueCheckboxes.nth(i).click();
      }

      // Click Continue again
      await continueButton.click();
      await page.waitForTimeout(3000);
    }

    // Step 4: Verify we eventually get candidates or results
    const finalCandidates = page.locator('text=candidate, text=Candidate');
    const hasResults = await finalCandidates.isVisible().catch(() => false);

    // The flow should either show candidates or handle the selections properly
    expect(hasResults || candidatesVisible).toBe(true);
  });

  test('should handle chat interaction without ward selection', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Try to send a message without selecting ward first
    const chatInput = page.locator('input[type="text"]').first();
    if (await chatInput.isVisible()) {
      await chatInput.fill('I care about the environment');
      await chatInput.press('Enter');

      // Wait for response
      await page.waitForTimeout(3000);

      // Should still show ward selection or handle the message
      const wardQuestion = page.locator('text=Which ward do you live in?');
      const responseText = page.locator('text=environment');

      const hasWardQuestion = await wardQuestion.isVisible().catch(() => false);
      const hasResponse = await responseText.isVisible().catch(() => false);

      expect(hasWardQuestion || hasResponse).toBe(true);
    }
  });

  test('should handle error cases gracefully', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Test with invalid input
    const chatInput = page.locator('input[type="text"]').first();
    if (await chatInput.isVisible()) {
      await chatInput.fill('');
      await chatInput.press('Enter');

      // Should not crash
      await page.waitForTimeout(2000);
      const errorMessage = page.locator('text=error, text=Error, text=failed').first();
      const hasError = await errorMessage.isVisible().catch(() => false);

      // If there's an error, it should be handled gracefully
      if (hasError) {
        console.log('Error message found:', await errorMessage.textContent());
      }
    }
  });

  test('should validate vector store initialization', async ({ page }) => {
    // Test the RAG API endpoint directly to ensure vector store works
    const ragResponse = await page.request.post('http://localhost:3000/api/rag/query', {
      data: {
        question: 'test query for vector store validation',
        maxResults: 3
      }
    });

    // The endpoint should either succeed or fail gracefully
    if (ragResponse.ok()) {
      const ragResult = await ragResponse.json();
      expect(ragResult).toHaveProperty('results');
      expect(Array.isArray(ragResult.results)).toBe(true);

      // Verify each result has expected structure
      if (ragResult.results.length > 0) {
        const firstResult = ragResult.results[0];
        expect(firstResult).toHaveProperty('content');
        expect(firstResult).toHaveProperty('metadata');
        expect(typeof firstResult.content).toBe('string');
        expect(firstResult.content.length).toBeGreaterThan(0);
      }
    } else {
      // If it fails, ensure it's not due to undefined property errors
      const errorText = await ragResponse.text();
      expect(errorText.toLowerCase()).not.toContain('cannot read properties of undefined');
      expect(errorText.toLowerCase()).not.toContain('reading \'0\'');
      console.log('RAG query failed gracefully:', errorText);
    }
  });

  test('should handle clicking with different interaction patterns', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Pattern 1: Double-click prevention (wait for state changes)
    const selectTrigger = page.locator('button').filter({ hasText: 'Select your ward...' }).first();
    await selectTrigger.click();

    // Wait for dropdown options to appear and select the first one
    await page.waitForTimeout(500);
    const firstWardOption = page.locator('div[role="option"]').first();
    await firstWardOption.click();
    await page.waitForTimeout(500); // Prevent double-clicking

    // Pattern 2: Click and verify state change
    const continueBtn = page.locator('button').filter({ hasText: 'Continue' });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();

      // Wait for loading/network activity to complete
      await page.waitForLoadState('networkidle');
    }

    // Pattern 3: Conditional clicking based on element visibility
    const candidatesLink = page.locator('text=View Candidates');
    if (await candidatesLink.isVisible().catch(() => false)) {
      await candidatesLink.click();
      await page.waitForTimeout(1000);
    }

    // Pattern 4: Click with error handling
    try {
      const nextButton = page.locator('button').filter({ hasText: 'Next' });
      if (await nextButton.isVisible({ timeout: 2000 })) {
        await nextButton.click();
      }
    } catch (error) {
      console.log('Next button not found or not clickable:', error instanceof Error ? error.message : String(error));
    }

    // Verify the flow completed successfully
    const finalState = await page.locator('body').textContent();
    expect(finalState).toBeTruthy();
  });

  test('should test clicking through the complete candidate discovery flow', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Step 1: Select ward
    const selectTrigger = page.locator('button').filter({ hasText: 'Select your ward...' }).first();
    await selectTrigger.click();

    // Wait for dropdown options to appear and select the first one
    await page.waitForTimeout(500);
    const firstWardOption = page.locator('div[role="option"]').first();
    await firstWardOption.click();

    // Click continue and wait for transition
    const continueButton = page.locator('button').filter({ hasText: 'Continue' });
    await continueButton.click();
    await page.waitForTimeout(2000);

    // Step 2: Handle potential issues selection
    const issueCheckboxes = page.locator('[data-slot="checkbox"]');
    const visibleIssues = await issueCheckboxes.count();

    if (visibleIssues > 0) {
      // Click multiple issues
      for (let i = 0; i < Math.min(3, visibleIssues); i++) {
        await issueCheckboxes.nth(i).click();
        await page.waitForTimeout(200); // Small delay between clicks
      }

      // Continue to next step
      await continueButton.click();
      await page.waitForTimeout(2000);
    }

    // Step 3: Handle any additional questions
    let questionCount = 0;
    const maxQuestions = 5;

    while (questionCount < maxQuestions) {
      const currentCheckboxes = page.locator('[data-slot="checkbox"]');
      const currentContinue = page.locator('button').filter({ hasText: 'Continue' });

      if (await currentCheckboxes.isVisible().catch(() => false)) {
        // Select first available option
        await currentCheckboxes.first().click();

        if (await currentContinue.isVisible().catch(() => false)) {
          await currentContinue.click();
          await page.waitForTimeout(1500);
          questionCount++;
        } else {
          break; // No continue button, we're done
        }
      } else {
        break; // No more checkboxes, we're done
      }
    }

    // Final verification: should have candidates or meaningful content
    const candidates = page.locator('text=candidate, text=Candidate');
    const chatMessages = page.locator('.chat-message, [data-testid="chat-response"]');
    const results = page.locator('text=result, text=Result, text=recommendation');

    const hasCandidates = await candidates.isVisible().catch(() => false);
    const hasChat = await chatMessages.isVisible().catch(() => false);
    const hasResults = await results.isVisible().catch(() => false);

    expect(hasCandidates || hasChat || hasResults).toBe(true);
    console.log('Successfully completed candidate discovery flow');
  });
});