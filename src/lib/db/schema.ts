import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const candidates = sqliteTable('candidates', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  party: text('party'),
  ward: text('ward').notNull(),
  candidate_statement: text('candidate_statement'),
  key_positions: text('key_positions', { mode: 'json' }).$type<Record<string, string>>(),
  why: text('why'),
  key_skills: text('key_skills'),
  top_issues: text('top_issues'),
  supporting_links: text('supporting_links', { mode: 'json' }).$type<string[]>(),
  photo_url: text('photo_url'),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const parties = sqliteTable('parties', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  platformData: text('platform_data', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const appSettings = sqliteTable('app_settings', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value', { mode: 'json' }),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Zod schemas for validation
export const insertCandidateSchema = createInsertSchema(candidates);
export const selectCandidateSchema = createSelectSchema(candidates);
export const insertPartySchema = createInsertSchema(parties);
export const selectPartySchema = createSelectSchema(parties);
export const insertAppSettingSchema = createInsertSchema(appSettings);
export const selectAppSettingSchema = createSelectSchema(appSettings);

// Types are automatically inferred from the schema
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;