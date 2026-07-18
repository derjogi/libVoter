import { z } from "zod";

export const SHARED_RELATIONSHIP_CATEGORIES = [
  "aligned",
  "partially-aligned",
  "unclear",
  "partially-opposed",
  "opposed",
] as const;

export const sharedRelationshipCategorySchema = z.enum(
  SHARED_RELATIONSHIP_CATEGORIES,
);

export type SharedRelationshipCategory = z.infer<
  typeof sharedRelationshipCategorySchema
>;
