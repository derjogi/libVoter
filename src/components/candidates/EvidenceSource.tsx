import { ExternalLink } from "lucide-react";
import type { Source } from "@/types";

export function isSafeCitationUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function EvidenceSource({
  source,
  titleClassName,
  iconClassName,
}: {
  source: Source;
  titleClassName: string;
  iconClassName: string;
}) {
  const content = (
    <>
      <span className={titleClassName}>
        {source.title}
        {isSafeCitationUrl(source.url) && (
          <ExternalLink aria-hidden="true" className={iconClassName} />
        )}
      </span>
      {source.excerpt && (
        <p className="mt-2 text-sm text-muted-foreground">{source.excerpt}</p>
      )}
    </>
  );
  const className = "block rounded-lg border p-3";

  return isSafeCitationUrl(source.url) ? (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} cursor-pointer transition-colors hover:bg-muted`}
    >
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}
