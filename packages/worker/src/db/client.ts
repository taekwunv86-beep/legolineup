import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.js";
import type { Env } from "../env.js";

export const getDb = (env: Env) => drizzle(env.DB, { schema });

export type DbClient = ReturnType<typeof getDb>;
