// Identity resolution (spec 010).
//
// Maps a scraped person/party (name + electorate) to a stored id. During the
// spec-002 migration candidate identity spans both the legacy `candidates`
// table (integer id, stringified) and the generic `people`/`candidacies`
// model, so the index is built by the caller and passed in. Unmatched records
// are *reported*, never silently dropped.

export interface CandidateIdentity {
  /** Id to store in evidence_sources.candidateId. */
  id: string;
  name: string;
  /** Ward / electorate, used to disambiguate same-named candidates. */
  district?: string;
}

export interface PartyIdentity {
  /** Id to store in evidence_sources.partyId. */
  id: string;
  name: string;
}

export interface IdentityIndex {
  candidates: CandidateIdentity[];
  parties: PartyIdentity[];
}

export interface ResolveInput {
  candidateName?: string;
  partyName?: string;
  district?: string;
}

export interface ResolveResult {
  candidateId?: string;
  partyId?: string;
  /** True when at least one of the requested identities resolved. */
  matched: boolean;
}

/**
 * Normalize a name for comparison: uppercase, strip accents/punctuation,
 * collapse whitespace, and reorder "LAST, First" → "FIRST LAST" so the two
 * common formats compare equal.
 */
export function normalizeName(name: string): string {
  let s = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const comma = s.indexOf(",");
  if (comma !== -1) {
    const last = s.slice(0, comma);
    const first = s.slice(comma + 1);
    s = `${first} ${last}`;
  }
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDistrict(d?: string): string {
  if (!d) return "";
  return d
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\b(WARD|ELECTORATE|LOCAL BOARD|SUBDIVISION)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build fast lookup maps once per run. */
export class IdentityResolver {
  private candidatesByName = new Map<string, CandidateIdentity[]>();
  private partiesByName = new Map<string, PartyIdentity>();

  constructor(index: IdentityIndex) {
    for (const c of index.candidates) {
      const key = normalizeName(c.name);
      const list = this.candidatesByName.get(key) ?? [];
      list.push(c);
      this.candidatesByName.set(key, list);
    }
    for (const p of index.parties) {
      this.partiesByName.set(normalizeName(p.name), p);
    }
  }

  resolve(input: ResolveInput): ResolveResult {
    let candidateId: string | undefined;
    let partyId: string | undefined;

    if (input.candidateName) {
      const matches = this.candidatesByName.get(
        normalizeName(input.candidateName),
      );
      if (matches && matches.length === 1) {
        candidateId = matches[0].id;
      } else if (matches && matches.length > 1) {
        // Disambiguate same-named candidates by district.
        const wanted = normalizeDistrict(input.district);
        const byDistrict = matches.find(
          (m) => normalizeDistrict(m.district) === wanted,
        );
        if (byDistrict) candidateId = byDistrict.id;
      }
    }

    if (input.partyName) {
      partyId = this.partiesByName.get(normalizeName(input.partyName))?.id;
    }

    const requested = Boolean(input.candidateName) || Boolean(input.partyName);
    const resolvedAny = Boolean(candidateId) || Boolean(partyId);
    return { candidateId, partyId, matched: requested && resolvedAny };
  }
}
