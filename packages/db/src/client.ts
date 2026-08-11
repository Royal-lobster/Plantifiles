import { type AnyD1Database, drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.js";

export function createDb(client: AnyD1Database) {
	return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
