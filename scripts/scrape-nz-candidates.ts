#!/usr/bin/env bun
// Scrape real NZ 2026 electorate candidates from Wikipedia into the structured
// candidate model (`races` → `people` → `candidacies`, linked to
// `election_parties`). Spec 010 / step 2.
//
// Source: "Candidates in the 2026 New Zealand general election by electorate"
// (CC BY-SA). We pull the page wikitext via the official MediaWiki API and
// parse the `{{NZ election box ...}}` row templates — far more stable than
// scraping rendered HTML. Real candidate lists aren't published by the
// Electoral Commission yet, so this Wikipedia roster is the best available
// real data and replaces the placeholder "Sample X Candidate" rows.
//
// This writes the STRUCTURED roster only (who is standing where, for which
// party). Policy/evidence text is a separate pipeline (`bun run ingest:sources`
// + `embed-evidence`), which links party-level evidence by `party_id`.
//
// Idempotent: stable ids + upserts, so re-running just refreshes the roster.
// Use it whenever the Wikipedia page is updated.
//
// Usage:
//   bun run scrape:nz-candidates            # add/update from Wikipedia
//   bun run scrape:nz-candidates --prune    # also delete candidacies no longer listed
//   bun run scrape:nz-candidates --dry-run  # parse + report, write nothing

import { eq, inArray, like } from "drizzle-orm";
import { NZ_2026 } from "../src/lib/config/election";
import { NZ_2026_PARTIES } from "../src/lib/config/nz-parties";
import {
  candidacies,
  electionParties,
  elections,
  people,
  races,
} from "../src/lib/db/schema";
import { db } from "../src/lib/server/db";

const WIKI_PAGE =
  "Candidates_in_the_2026_New_Zealand_general_election_by_electorate";
const API_BASE = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "lib-voter-ingest/1.0 (GovHack demo; respectful)";
const ELECTION_ID = NZ_2026.id;

const DRY_RUN = process.argv.includes("--dry-run");
const PRUNE = process.argv.includes("--prune");

// --- helpers ---------------------------------------------------------------

/** Same slug rule used to seed election_parties / races so ids stay stable. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Lowercase + strip diacritics, for fuzzy party-name matching. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip wiki markup from a single-line field value. */
function cleanText(s: string): string {
  return s
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[\s\S]*?\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** First [[wiki link]] target in a candidate field → article URL, if any. */
function wikiLinkUrl(raw: string): string | undefined {
  const m = raw.match(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/);
  if (!m) return undefined;
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(m[1].trim().replace(/ /g, "_"))}`;
}

async function fetchWikitext(page: string): Promise<string> {
  const params = new URLSearchParams({
    format: "json",
    action: "parse",
    page,
    prop: "wikitext",
    formatversion: "2",
  });
  const res = await fetch(`${API_BASE}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`MediaWiki API ${res.status} for "${page}"`);
  const json = (await res.json()) as { parse?: { wikitext?: string } };
  const text = json.parse?.wikitext;
  if (!text) throw new Error("No wikitext in API response");
  return text;
}

// --- parsing ---------------------------------------------------------------

const CANDIDATE_TEMPLATE_TYPES = new Set([
  "candidate",
  "incumbent",
  "candidate list",
  "minor party candidate",
]);

interface ParsedCandidate {
  electorate: string;
  party: string; // raw wikitext party string
  name: string; // cleaned candidate name
  listRank: number | null;
  notes?: string;
  wikiUrl?: string;
}

/** Brace-aware scan for every {{NZ election box ...}} template block. */
function extractBoxes(
  text: string,
): { type: string; body: string; at: number }[] {
  const marker = "{{NZ election box ";
  const boxes: { type: string; body: string; at: number }[] = [];
  let i = text.indexOf(marker);
  while (i !== -1) {
    let depth = 0;
    let j = i;
    while (j < text.length) {
      if (text.startsWith("{{", j)) {
        depth++;
        j += 2;
      } else if (text.startsWith("}}", j)) {
        depth--;
        j += 2;
        if (depth === 0) break;
      } else {
        j++;
      }
    }
    const block = text.slice(i, j);
    const typeMatch = block
      .slice(marker.length)
      .match(/^([a-z ]+?)(?:\n|\||$)/);
    boxes.push({
      type: typeMatch ? typeMatch[1].trim() : "",
      body: block,
      at: i,
    });
    i = text.indexOf(marker, j);
  }
  return boxes;
}

function field(body: string, name: string): string | undefined {
  const m = body.match(new RegExp(`^\\s*\\|\\s*${name}\\s*=\\s*(.*)$`, "m"));
  return m ? m[1] : undefined;
}

function parsePage(text: string): ParsedCandidate[] {
  // Electorate headings (=== Name ===) with their offsets.
  const headings: { name: string; at: number }[] = [];
  for (const h of text.matchAll(/^===\s*(.+?)\s*===\s*$/gm)) {
    headings.push({ name: cleanText(h[1]), at: h.index ?? 0 });
  }

  const electorateFor = (offset: number): string | undefined => {
    let current: string | undefined;
    for (const hd of headings) {
      if (hd.at < offset) current = hd.name;
      else break;
    }
    return current;
  };

  const out: ParsedCandidate[] = [];
  for (const box of extractBoxes(text)) {
    if (!CANDIDATE_TEMPLATE_TYPES.has(box.type)) continue;
    const rawCandidate = field(box.body, "candidate");
    if (!rawCandidate) continue;
    const name = cleanText(rawCandidate);
    if (!name) continue;
    const electorate = electorateFor(box.at);
    if (!electorate) continue;
    const party = cleanText(field(box.body, "party") ?? "");
    const listStr = cleanText(field(box.body, "list") ?? "");
    const listRank = /^\d+$/.test(listStr) ? Number(listStr) : null;
    const notes = cleanText(field(box.body, "notes") ?? "") || undefined;
    out.push({
      electorate,
      party,
      name,
      listRank,
      notes,
      wikiUrl: wikiLinkUrl(rawCandidate),
    });
  }
  return out;
}

// --- party resolution ------------------------------------------------------

interface ResolvedParty {
  id: string | null; // null = independent (no party row)
  name: string;
}

const partyLookup = new Map<string, { id: string; name: string }>();
for (const p of NZ_2026_PARTIES) {
  const entry = { id: `${ELECTION_ID}-party-${slug(p.name)}`, name: p.name };
  partyLookup.set(normalize(p.name), entry);
  partyLookup.set(normalize(p.wikiTitle), entry);
}

const extraParties = new Map<string, string>(); // id -> display name (off-config)

function resolveParty(rawParty: string): ResolvedParty {
  const norm = normalize(rawParty);
  if (!norm || norm.includes("independent"))
    return { id: null, name: "Independent" };

  const known = partyLookup.get(norm);
  if (known) return known;

  // Off-config party (e.g. Alliance, Build the Nation): create a row so the
  // roster is complete. It just won't have party-policy evidence linked.
  const display = rawParty
    .replace(/\s*\(New Zealand political party\)/i, "")
    .trim();
  const id = `${ELECTION_ID}-party-${slug(display)}`;
  extraParties.set(id, display);
  return { id, name: display };
}

// --- main ------------------------------------------------------------------

async function main() {
  console.log(`Fetching ${WIKI_PAGE} from Wikipedia…`);
  const wikitext = await fetchWikitext(WIKI_PAGE);
  const parsed = parsePage(wikitext);
  console.log(`Parsed ${parsed.length} candidate rows.`);

  // Resolve parties up front so we can report coverage.
  const resolved = parsed.map((c) => ({
    ...c,
    resolvedParty: resolveParty(c.party),
  }));
  const electorates = [...new Set(resolved.map((c) => c.electorate))].sort();
  const independents = resolved.filter(
    (c) => c.resolvedParty.id === null,
  ).length;
  console.log(
    `Electorates: ${electorates.length} | parties off-config: ${extraParties.size} | independents: ${independents}`,
  );
  if (extraParties.size > 0) {
    console.log(
      "  Off-config parties (created):",
      [...extraParties.values()].join(", "),
    );
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: no writes. Sample:");
    for (const c of resolved.slice(0, 12)) {
      console.log(
        `  ${c.electorate}: ${c.name} (${c.resolvedParty.name}${c.listRank ? `, list #${c.listRank}` : ""})`,
      );
    }
    return;
  }

  const now = new Date();

  // 1. election row
  await db
    .insert(elections)
    .values({
      id: NZ_2026.id,
      name: NZ_2026.name,
      country: NZ_2026.country,
      region: NZ_2026.region,
      year: NZ_2026.year,
      type: NZ_2026.type,
      votingSystem: NZ_2026.votingSystem,
      keyTopics: NZ_2026.keyTopics,
      description: NZ_2026.description,
      createdAt: now,
    })
    .onConflictDoNothing();

  // 2. parties: canonical 13 + any off-config ones discovered.
  for (const p of NZ_2026_PARTIES) {
    await db
      .insert(electionParties)
      .values({
        id: `${ELECTION_ID}-party-${slug(p.name)}`,
        electionId: ELECTION_ID,
        name: p.name,
        createdAt: now,
      })
      .onConflictDoNothing();
  }
  for (const [id, name] of extraParties) {
    await db
      .insert(electionParties)
      .values({ id, electionId: ELECTION_ID, name, createdAt: now })
      .onConflictDoNothing();
  }

  // 3. electorate races
  for (const electorate of electorates) {
    await db
      .insert(races)
      .values({
        id: `${ELECTION_ID}-electorate-${slug(electorate)}`,
        electionId: ELECTION_ID,
        kind: "electorate",
        name: electorate,
        district: electorate,
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  // 4. people + candidacies
  const seenCandidacyIds: string[] = [];
  let inserted = 0;
  for (const c of resolved) {
    const personId = `${ELECTION_ID}-person-${slug(c.name)}`;
    const raceId = `${ELECTION_ID}-electorate-${slug(c.electorate)}`;
    const candidacyId = `${ELECTION_ID}-candidacy-${slug(c.name)}-${slug(c.electorate)}`;
    seenCandidacyIds.push(candidacyId);

    await db
      .insert(people)
      .values({
        id: personId,
        name: c.name,
        bio: c.notes ?? null,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: people.id,
        set: { name: c.name, bio: c.notes ?? null },
      });

    await db
      .insert(candidacies)
      .values({
        id: candidacyId,
        electionId: ELECTION_ID,
        raceId,
        personId,
        partyId: c.resolvedParty.id,
        listRank: c.listRank,
        supportingLinks: c.wikiUrl ? [c.wikiUrl] : null,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: candidacies.id,
        set: {
          raceId,
          partyId: c.resolvedParty.id,
          listRank: c.listRank,
          supportingLinks: c.wikiUrl ? [c.wikiUrl] : null,
        },
      });
    inserted++;
  }

  // 5. remove the old placeholder "Sample X Candidate" rows.
  const delSample = await db
    .delete(candidacies)
    .where(like(candidacies.id, `${ELECTION_ID}-candidacy-sample-%`))
    .returning({ id: candidacies.id });
  await db
    .delete(people)
    .where(like(people.id, `${ELECTION_ID}-person-sample-%`));

  // 5b. drop empty electorate races (e.g. old sample seats renamed under the
  //     2026 boundaries) so the seat dropdown only offers contested seats.
  //     The 'list' race is intentionally excluded.
  const electorateRaces = await db
    .select({ id: races.id })
    .from(races)
    .where(eq(races.electionId, ELECTION_ID));
  const liveRaceIds = new Set(
    electorates.map((e) => `${ELECTION_ID}-electorate-${slug(e)}`),
  );
  const emptyRaceIds = electorateRaces
    .map((r) => r.id)
    .filter(
      (id) =>
        id.startsWith(`${ELECTION_ID}-electorate-`) && !liveRaceIds.has(id),
    );
  let removedRaces = 0;
  if (emptyRaceIds.length > 0) {
    await db.delete(races).where(inArray(races.id, emptyRaceIds));
    removedRaces = emptyRaceIds.length;
  }

  // 6. optional prune of real candidacies no longer on the page.
  let pruned = 0;
  if (PRUNE) {
    const existing = await db
      .select({ id: candidacies.id })
      .from(candidacies)
      .where(eq(candidacies.electionId, ELECTION_ID));
    const seen = new Set(seenCandidacyIds);
    const stale = existing
      .map((r) => r.id)
      .filter(
        (id) =>
          !seen.has(id) && !id.startsWith(`${ELECTION_ID}-candidacy-sample-`),
      );
    if (stale.length > 0) {
      await db.delete(candidacies).where(inArray(candidacies.id, stale));
      pruned = stale.length;
    }
  }

  console.log(
    `\nDone. Upserted ${inserted} candidacies across ${electorates.length} electorates.`,
  );
  console.log(`  Removed ${delSample.length} sample placeholders.`);
  if (removedRaces > 0)
    console.log(`  Removed ${removedRaces} empty/renamed electorate races.`);
  if (PRUNE) console.log(`  Pruned ${pruned} stale candidacies.`);
  console.log(
    "\nNext: candidate ranking is live for these electorates. For policy evidence run:\n" +
      "  bun run ingest:sources --election nz-2026 --source nz-party-policy\n" +
      "  bun run scripts/embed-evidence.ts --repopulate",
  );
}

main().catch((err) => {
  console.error("scrape-nz-candidates failed:", err);
  process.exitCode = 1;
});
