import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const candidates = sqliteTable('candidates', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  party: text('party'),
  ward: text('ward').notNull(),
  bio: text('bio'),
  policies: text('policies', { mode: 'json' }).$type<string[]>(),
  email: text('email'),
  phone: text('phone'),
  photo_url: text('photo_url'),
  website: text('website'),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  nameWardUnique: uniqueIndex('name_ward_unique').on(table.name, table.ward),
}));

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