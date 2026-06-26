#!/usr/bin/env bun
// End-to-end health check for the currently configured election.
//
// Confirms the whole candidate pipeline is wired up: the structured roster in
// the DB (races → candidacies → parties), the active election config, and the
// RAG vector store (Chroma) — including a real retrieval through the same code
// path the app uses. Read-only; safe to run anytime.
//
// Usage:
//   bun run verify:setup

import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { electionConfig } from "../src/lib/config/election";
import {
  candidacies,
  electionParties,
  elections,
  people,
  races,
} from "../src/lib/db/schema";
import { db } from "../src/lib/server/db";
import { RAGQueryEngine } from "../src/lib/server/rag/query-engine";

const ID = electionConfig.id;
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  console.log(
    `\nVerifying setup for election: ${ID} (${electionConfig.name})\n`,
  );

  // --- 1. election + config ---
  console.log("Election & config:");
  const electionRow = await db
    .select()
    .from(elections)
    .where(eq(elections.id, ID));
  check("elections row exists", electionRow.length === 1);
  check(
    "voting system configured",
    !!electionConfig.votingSystem,
    electionConfig.votingSystem,
  );

  // --- 2. structured roster ---
  console.log("\nCandidate roster:");
  const userFacingKinds = electionConfig.seatTypes.filter(
    (k) => k !== "mayor" && k !== "list",
  );
  const seatRaces = await db
    .select({ id: races.id, district: races.district, name: races.name })
    .from(races)
    .where(and(eq(races.electionId, ID), inArray(races.kind, userFacingKinds)));
  check(
    `${electionConfig.seatLabelPlural} (races) present`,
    seatRaces.length > 0,
    `${seatRaces.length}`,
  );

  const allCand = await db
    .select({ id: candidacies.id, partyId: candidacies.partyId })
    .from(candidacies)
    .where(eq(candidacies.electionId, ID));
  check("candidacies present", allCand.length > 0, `${allCand.length}`);

  const partyRows = await db
    .select({ id: electionParties.id })
    .from(electionParties)
    .where(eq(electionParties.id, electionParties.id));
  check("parties present", partyRows.length > 0, `${partyRows.length}`);

  const sampleLeft = await db
    .select({ id: candidacies.id })
    .from(candidacies)
    .where(like(candidacies.id, `${ID}-candidacy-sample-%`));
  check(
    "no sample placeholders left",
    sampleLeft.length === 0,
    `${sampleLeft.length} found`,
  );

  const emptyRaces = (
    await Promise.all(
      seatRaces.map(async (r) => {
        const c = await db
          .select({ id: candidacies.id })
          .from(candidacies)
          .where(eq(candidacies.raceId, r.id))
          .limit(1);
        return c.length === 0 ? (r.district ?? r.name) : null;
      }),
    )
  ).filter(Boolean);
  check(
    "no empty seats in dropdown",
    emptyRaces.length === 0,
    emptyRaces.length ? `empty: ${emptyRaces.slice(0, 5).join(", ")}` : "",
  );

  // --- 3. end-to-end: load candidates for one real seat ---
  console.log("\nEnd-to-end seat lookup:");
  const sampleSeat = seatRaces[0];
  const seatName = sampleSeat?.district ?? sampleSeat?.name ?? "";
  const seatCandidates = await db
    .select({
      candidacyId: candidacies.id,
      name: people.name,
      party: electionParties.name,
      partyId: candidacies.partyId,
    })
    .from(candidacies)
    .innerJoin(races, eq(races.id, candidacies.raceId))
    .innerJoin(people, eq(people.id, candidacies.personId))
    .leftJoin(electionParties, eq(electionParties.id, candidacies.partyId))
    .where(
      and(eq(candidacies.electionId, ID), eq(races.id, sampleSeat?.id ?? "")),
    );
  check(
    `"${seatName}" returns candidates`,
    seatCandidates.length > 0,
    `${seatCandidates.length}: ${seatCandidates
      .map((c) => `${c.name} (${c.party ?? "Ind"})`)
      .slice(0, 4)
      .join(", ")}…`,
  );

  // --- 4. RAG vector store ---
  console.log("\nRAG / vector store:");
  const withParty = seatCandidates.find((c) => c.partyId);
  let ragOk = false;
  let ragDetail = "no party-affiliated candidate to test";
  if (withParty?.partyId) {
    try {
      const engine = new RAGQueryEngine();
      const ev = await engine.retrieveForCandidate(
        electionConfig.keyTopics.join(", "),
        "__verify_no_such_candidate__",
        withParty.partyId,
        ID,
      );
      const n = ev.party.length;
      ragOk = n > 0;
      ragDetail = `${n} party-evidence chunks for ${withParty.party}`;
    } catch (err) {
      ragDetail = `query failed: ${(err as Error).message}`;
    }
  }
  check("RAG retrieves party evidence", ragOk, ragDetail);

  // --- 5. independents (informational) ---
  const independents = await db
    .select({ id: candidacies.id })
    .from(candidacies)
    .where(and(eq(candidacies.electionId, ID), isNull(candidacies.partyId)));
  console.log(
    `\nℹ️  ${independents.length} independent candidates (no party → no party evidence; will score low). This is expected.`,
  );

  // --- summary ---
  console.log(
    `\n${failures === 0 ? "✅ All checks passed — setup looks good." : `❌ ${failures} check(s) failed — see above.`}\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("verify-setup failed:", err);
  process.exitCode = 1;
});
