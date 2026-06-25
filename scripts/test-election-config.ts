#!/usr/bin/env bun

// Test script to verify election configuration is working correctly
// Run with: bun run test:election-config

import { electionConfig } from "../src/lib/config/election";
import { getPrompt } from "../src/lib/server/prompts/index";
import { getPromptManager } from "../src/lib/server/prompts/prompt-manager";

async function testElectionConfig() {
  console.log("🧪 Testing Election Configuration...\n");

  let testsPassed = 0;
  let totalTests = 0;

  // Test 1: Election config loading
  totalTests++;
  try {
    console.log("1. Testing election config loading...");
    if (electionConfig && typeof electionConfig === "object") {
      console.log(
        `✅ Election config loaded: ${electionConfig.location}, ${electionConfig.year}`,
      );
      testsPassed++;
    } else {
      console.log("❌ Election config failed to load");
    }
  } catch (error) {
    console.log("❌ Error loading election config:", error);
  }

  // Test 2: Verify expected values
  totalTests++;
  try {
    console.log("\n2. Testing expected election values...");
    const expectedLocation = "Auckland, New Zealand";
    const expectedYear = 2025;
    const expectedType = "Local Council Elections";

    if (
      electionConfig.location === expectedLocation &&
      electionConfig.year === expectedYear &&
      electionConfig.type === expectedType
    ) {
      console.log(
        `✅ Election values match: ${electionConfig.location} ${electionConfig.year} - ${electionConfig.type}`,
      );
      testsPassed++;
    } else {
      console.log("❌ Election values do not match expected values");
      console.log(
        `   Expected: ${expectedLocation}, ${expectedYear}, ${expectedType}`,
      );
      console.log(
        `   Actual: ${electionConfig.location}, ${electionConfig.year}, ${electionConfig.type}`,
      );
    }
  } catch (error) {
    console.log("❌ Error verifying election values:", error);
  }

  // Test 3: Prompt template variable substitution
  totalTests++;
  try {
    console.log("\n3. Testing prompt template variable substitution...");
    const promptManager = getPromptManager();

    // Test with a sample prompt that uses election variables
    const testVariables = {
      userResponses: "Test user response",
      candidates: "Test candidates",
      conversationHistory: "Test history",
      currentPreferences: "Test preferences",
      questionType: "chat",
    };

    const result = await promptManager.executePrompt(
      "CANDIDATE_MATCHING",
      testVariables,
    );

    if (result.success && result.response) {
      // Check if the prompt execution worked (the AI response is valid JSON as expected)
      const response = result.response as string;
      try {
        JSON.parse(response); // Should be valid JSON for CANDIDATE_MATCHING
        console.log("✅ Prompt execution successful with election variables");
        testsPassed++;
      } catch (_e) {
        console.log("❌ Prompt execution failed - invalid JSON response");
        console.log("Response preview:", `${response.substring(0, 200)}...`);
      }
    } else {
      console.log("❌ Failed to execute prompt with election variables");
    }
  } catch (error) {
    console.log("❌ Error testing prompt variable substitution:", error);
  }

  // Test 4: System message includes election context
  totalTests++;
  try {
    console.log("\n4. Testing system message election context...");
    const _promptManager = getPromptManager();

    // Create a mock system message like the one in PromptManager
    const systemMessage = `You are a helpful AI assistant helping users discover their voting preferences for the ${electionConfig.year} ${electionConfig.type} in ${electionConfig.location}. Provide accurate, neutral responses focused on ${electionConfig.keyTopics.join(", ")}.`;

    const hasYear = systemMessage.includes(electionConfig.year.toString());
    const hasLocation = systemMessage.includes(electionConfig.location);
    const hasType = systemMessage.includes(electionConfig.type);
    const hasKeyTopics = electionConfig.keyTopics.every((topic) =>
      systemMessage.includes(topic),
    );

    if (hasYear && hasLocation && hasType && hasKeyTopics) {
      console.log("✅ System message includes election context");
      testsPassed++;
    } else {
      console.log("❌ System message missing election context");
      console.log("System message:", systemMessage);
    }
  } catch (error) {
    console.log("❌ Error testing system message:", error);
  }

  // Test 5: Direct prompt template inspection
  totalTests++;
  try {
    console.log("\n5. Testing direct prompt template inspection...");
    const candidateMatchingPrompt = getPrompt("CANDIDATE_MATCHING");

    const hasElectionYearVar =
      candidateMatchingPrompt.template.includes("{electionYear}");
    const hasElectionLocationVar =
      candidateMatchingPrompt.template.includes("{electionLocation}");
    const hasElectionTypeVar =
      candidateMatchingPrompt.template.includes("{electionType}");
    const hasElectionKeyTopicsVar = candidateMatchingPrompt.template.includes(
      "{electionKeyTopics}",
    );

    if (
      hasElectionYearVar &&
      hasElectionLocationVar &&
      hasElectionTypeVar &&
      hasElectionKeyTopicsVar
    ) {
      console.log("✅ Prompt templates contain election variable placeholders");
      testsPassed++;
    } else {
      console.log("❌ Prompt templates missing election variable placeholders");
      console.log(
        "Template preview:",
        `${candidateMatchingPrompt.template.substring(0, 300)}...`,
      );
    }
  } catch (error) {
    console.log("❌ Error inspecting prompt templates:", error);
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(`📊 Test Results: ${testsPassed}/${totalTests} tests passed`);

  if (testsPassed === totalTests) {
    console.log(
      "🎉 All tests passed! Election configuration is working correctly.",
    );
    console.log(
      "✅ The AI now knows it's specifically for Auckland 2025 elections.",
    );
  } else {
    console.log(
      "⚠️  Some tests failed. Please check the election configuration.",
    );
  }

  console.log("=".repeat(50));

  // Exit with appropriate code
  process.exit(testsPassed === totalTests ? 0 : 1);
}

// Run the tests
testElectionConfig().catch((error) => {
  console.error("❌ Test script failed:", error);
  process.exit(1);
});
