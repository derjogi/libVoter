// robots.txt parsing + a caching guard (spec 010 compliance).
//
// Adapters consult the RobotsGuard before fetching a URL. Matching follows the
// common convention: the longest matching path rule wins, with `Allow` beating
// `Disallow` on an equal-length tie; `*` is a wildcard and `$` anchors the end.

export interface RobotsGroup {
  userAgents: string[];
  rules: Array<{ allow: boolean; path: string }>;
}

/** Parse robots.txt into user-agent groups with ordered allow/disallow rules. */
export function parseRobotsTxt(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
      }
      current.userAgents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      if (!current) {
        current = { userAgents: ["*"], rules: [] };
        groups.push(current);
      }
      current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function pathMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false; // empty Disallow allows everything
  const anchored = pattern.endsWith("$");
  const pat = anchored ? pattern.slice(0, -1) : pattern;
  const segments = pat.split("*");
  let pos = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "") continue;
    const found = path.indexOf(seg, pos);
    if (i === 0 && found !== 0) return false; // first segment must be a prefix
    if (found === -1) return false;
    pos = found + seg.length;
  }
  if (anchored) return pos === path.length;
  return true;
}

/** Effective length of a rule's pattern (for longest-match precedence). */
function ruleLength(pattern: string): number {
  return pattern.replace(/\*/g, "").replace(/\$$/, "").length;
}

function selectGroup(
  groups: RobotsGroup[],
  userAgent: string,
): RobotsGroup | null {
  const ua = userAgent.toLowerCase();
  let specific: RobotsGroup | null = null;
  let wildcard: RobotsGroup | null = null;
  for (const g of groups) {
    for (const agent of g.userAgents) {
      if (agent === "*") wildcard = g;
      else if (ua.includes(agent)) specific = g;
    }
  }
  return specific ?? wildcard;
}

/** Returns true if `userAgent` may fetch `path` under these rules. */
export function isAllowed(
  groups: RobotsGroup[],
  path: string,
  userAgent = "*",
): boolean {
  const group = selectGroup(groups, userAgent);
  if (!group) return true;

  let best: { allow: boolean; len: number } | null = null;
  for (const rule of group.rules) {
    if (!pathMatches(rule.path, path)) continue;
    const len = ruleLength(rule.path);
    if (
      !best ||
      len > best.len ||
      (len === best.len && rule.allow && !best.allow)
    ) {
      best = { allow: rule.allow, len };
    }
  }
  return best ? best.allow : true;
}

/** Caches robots.txt per origin and answers allow/deny for full URLs. */
export class RobotsGuard {
  private cache = new Map<string, RobotsGroup[]>();

  constructor(
    private readonly userAgent: string,
    private readonly fetcher: (url: string) => Promise<string> = defaultFetch,
  ) {}

  async allowed(targetUrl: string): Promise<boolean> {
    let origin: string;
    let path: string;
    try {
      const u = new URL(targetUrl);
      origin = u.origin;
      path = u.pathname + u.search;
    } catch {
      return true; // non-URL refs are not robots-governed
    }

    let groups = this.cache.get(origin);
    if (!groups) {
      try {
        const text = await this.fetcher(`${origin}/robots.txt`);
        groups = parseRobotsTxt(text);
      } catch {
        groups = []; // no robots.txt → allow
      }
      this.cache.set(origin, groups);
    }
    return isAllowed(groups, path, this.userAgent);
  }
}

async function defaultFetch(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`robots fetch ${res.status}`);
  return res.text();
}
