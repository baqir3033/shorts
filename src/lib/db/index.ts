import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

export { schema };
