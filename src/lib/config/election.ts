// Single source of truth for which election the running app is configured to
// help with. Switching elections is intentionally a code edit (not runtime
// config), but the data model in src/lib/db/schema.ts is fully generic so
// the same code can drive any election whose data has been loaded.
export interface ElectionConfig {
  /** Stable ID, also used as `elections.id` in the DB. */
  id: string;
  /** Long human-readable name. */
  name: string;
  country: string;
  /** Optional region inside the country (e.g. 'Auckland'). */
  region?: string;
  year: number;
  /** Election scope: 'local', 'national', 'regional', ... */
  type: string;
  /** Voting system. Drives UI affordances (e.g. 'mmp' shows two votes). */
  votingSystem: "fpp" | "stv" | "mmp" | "other";
  /** What kinds of seats voters cast a ballot for. */
  seatTypes: Array<"mayor" | "ward" | "councillor" | "electorate" | "list">;
  /**
   * The user-facing label for "the seat I live in". Used in prompts and the
   * onboarding dropdown. e.g. 'ward' for Auckland 2025, 'electorate' for NZ.
   */
  seatLabel: string;
  /** Plural form of seatLabel for UI copy. */
  seatLabelPlural: string;
  keyTopics: string[];
  description: string;
  // === Legacy fields (kept for back-compat with prompts that still reference
  // them); prefer the structured fields above.
  location: string;
}

export const AUCKLAND_2025: ElectionConfig = {
  id: "auckland-2025",
  name: "Auckland Council Elections 2025",
  country: "NZ",
  region: "Auckland",
  year: 2025,
  type: "Local Council Elections",
  votingSystem: "stv",
  seatTypes: ["mayor", "ward", "councillor"],
  seatLabel: "ward",
  seatLabelPlural: "wards",
  keyTopics: [
    "Housing",
    "Transport",
    "Environment",
    "Economy",
    "Infrastructure",
    "Community Services",
  ],
  description:
    "Auckland Council local elections for mayor and ward representatives",
  location: "Auckland, New Zealand",
};

export const NZ_2026: ElectionConfig = {
  id: "nz-2026",
  name: "New Zealand 2026 General Election",
  country: "NZ",
  year: 2026,
  type: "General Election",
  votingSystem: "mmp",
  seatTypes: ["electorate", "list"],
  seatLabel: "electorate",
  seatLabelPlural: "electorates",
  keyTopics: [
    "Cost of living",
    "Housing",
    "Health",
    "Climate",
    "Treaty of Waitangi",
    "Crime",
    "Education",
    "Transport",
  ],
  description:
    "New Zealand 2026 General Election — party vote + electorate vote (MMP)",
  location: "New Zealand",
};

// Active election. To switch, change this line and re-run the scraper /
// migration for the new election.
export const electionConfig: ElectionConfig = AUCKLAND_2025;
