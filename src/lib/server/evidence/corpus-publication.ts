import { and, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { corpusRevisions, evidencePassages } from "@/lib/db/schema";
import {
  type CorpusPublicationDraft,
  publishCorpusRevision,
} from "@/lib/evidence/corpus-publication";

/**
 * Atomically replaces the accepted revision for one corpus key.
 *
 * The partial unique index on accepted revisions is the durable invariant;
 * this transaction ensures callers never observe the predecessor superseded
 * without the complete replacement revision and all of its passages.
 */
export async function publishCorpusRevisionTransaction<
  TSchema extends Record<string, unknown>,
>(db: LibSQLDatabase<TSchema>, draft: CorpusPublicationDraft) {
  const publication = publishCorpusRevision(draft);

  return db.transaction(async (tx) => {
    await tx
      .update(corpusRevisions)
      .set({ status: "superseded" })
      .where(
        and(
          eq(corpusRevisions.corpusKey, publication.revision.corpusKey),
          eq(corpusRevisions.status, "accepted"),
        ),
      );
    await tx.insert(corpusRevisions).values(publication.revision);
    await tx.insert(evidencePassages).values(publication.passages);

    return publication;
  });
}
