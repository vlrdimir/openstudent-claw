import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createTursoClient, readTursoEnvFromProcess } from "./client.ts";
import * as schema from "./schema/index.ts";

export type StudentDb = LibSQLDatabase<typeof schema>;

let dbSingleton: StudentDb | undefined;

export function getDb(): StudentDb {
  dbSingleton ??= drizzle(createTursoClient(readTursoEnvFromProcess()), {
    schema,
  });
  return dbSingleton;
}

export function createDbFromUrl(url: string, authToken?: string): StudentDb {
  const client = createTursoClient({ url, authToken });
  return drizzle(client, { schema });
}

export { createTursoClient, readTursoEnvFromProcess } from "./client.ts";
export * from "./schema/index.ts";
