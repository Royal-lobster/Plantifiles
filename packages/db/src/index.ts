import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client.js";

const globalForDb = globalThis as unknown as { db?: PrismaClient };
const connectionString = process.env.DATABASE_URL;

if (!connectionString) throw new Error("DATABASE_URL is required.");

export const db =
  globalForDb.db ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 15_000,
      keepAlive: true,
    }),
  });

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
