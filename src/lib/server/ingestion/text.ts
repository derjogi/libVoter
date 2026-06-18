// HTML/text cleaning for adapters (spec 010).
//
// Adapters call htmlToText() to turn scraped HTML into the clean full text we
// persist in evidence_sources.content. Kept dependency-free (regex based, no
// jsdom) so it is fast and trivially golden-testable.

const BLOCK_TAGS =
  /<\/(?:p|div|section|article|li|ul|ol|h[1-6]|tr|table|br|header|footer)>/gi;
const SELF_CLOSING_BREAKS = /<br\s*\/?>/gi;
const SCRIPT_STYLE = /<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAGS = /<[^>]+>/g;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
};

/** Decode the small set of HTML entities scrapers actually hit. */
export function decodeEntities(input: string): string {
  let out = input.replace(
    /&(?:nbsp|amp|lt|gt|quot|apos|mdash|ndash|hellip|#39);/gi,
    (m) => ENTITIES[m.toLowerCase()] ?? ENTITIES[m] ?? m,
  );
  // Numeric entities (decimal + hex).
  out = out.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, h) =>
    String.fromCodePoint(parseInt(h, 16)),
  );
  return out;
}

/** Collapse runs of whitespace, trim each line, drop blank lines. */
export function normalizeWhitespace(input: string): string {
  return input
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v\u00a0]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/** Convert an HTML fragment/document into clean, readable plain text. */
export function htmlToText(html: string): string {
  let s = html.replace(SCRIPT_STYLE, " ");
  s = s.replace(SELF_CLOSING_BREAKS, "\n");
  s = s.replace(BLOCK_TAGS, "\n");
  s = s.replace(TAGS, "");
  s = decodeEntities(s);
  return normalizeWhitespace(s);
}
