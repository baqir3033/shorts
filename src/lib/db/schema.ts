import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("ready"),
  sourceBlobUrl: text("source_blob_url"),
  sourceBytes: bigint("source_bytes", { mode: "number" }),
  durationMs: integer("duration_ms"),
  probeJson: jsonb("probe_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const analyses = pgTable("analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  resultJson: jsonb("result_json"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const clipCandidates = pgTable("clip_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  score: integer("score"),
  reason: text("reason"),
  cropJson: jsonb("crop_json"),
});

export const editSpecs = pgTable("edit_specs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  variantName: text("variant_name").notNull().default("main"),
  version: integer("version").notNull().default(1),
  specJson: jsonb("spec_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const renders = pgTable("renders", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  variantName: text("variant_name").notNull().default("main"),
  status: text("status").notNull().default("pending"),
  outputBlobUrl: text("output_blob_url"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const reactionAssets = pgTable("reaction_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  blobUrl: text("blob_url"),
});

export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  templateJson: jsonb("template_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
