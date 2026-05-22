import {
  getUniqueWards,
  getCandidatesByWard,
  getMayorCandidates,
} from "./src/lib/actions/database";

async function testDatabaseFunctions() {
  console.log("Testing database functions...\n");

  try {
    // Test getUniqueWards
    console.log("1. Testing getUniqueWards...");
    const wardsResult = await getUniqueWards();
    if (wardsResult.success) {
      console.log("✅ getUniqueWards success:", wardsResult.data);
    } else {
      console.log("❌ getUniqueWards failed:", wardsResult.error);
    }

    // Test getMayorCandidates
    console.log("\n2. Testing getMayorCandidates...");
    const mayorsResult = await getMayorCandidates();
    if (mayorsResult.success && mayorsResult.data) {
      console.log(
        "✅ getMayorCandidates success:",
        mayorsResult.data.length,
        "candidates",
      );
      if (mayorsResult.data.length > 0) {
        console.log("First mayor candidate:", mayorsResult.data[0].name);
      }
    } else {
      console.log("❌ getMayorCandidates failed:", mayorsResult.error);
    }

    // Test getCandidatesByWard (using first ward if available)
    if (
      wardsResult.success &&
      wardsResult.data &&
      wardsResult.data.length > 0
    ) {
      const testWard = wardsResult.data[0];
      console.log(`\n3. Testing getCandidatesByWard for ward: ${testWard}...`);
      const wardCandidatesResult = await getCandidatesByWard(testWard);
      if (wardCandidatesResult.success && wardCandidatesResult.data) {
        console.log(
          `✅ getCandidatesByWard success: ${wardCandidatesResult.data.length} candidates in ${testWard}`,
        );
        if (wardCandidatesResult.data.length > 0) {
          console.log("First candidate:", wardCandidatesResult.data[0].name);
        }
      } else {
        console.log(
          "❌ getCandidatesByWard failed:",
          wardCandidatesResult.error,
        );
      }
    }
  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

testDatabaseFunctions();
