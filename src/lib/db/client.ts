import { createClient, type Client } from "@libsql/client";

export type TursoEnv = {
  url: string;
  authToken?: string;
};

export function readTursoEnvFromProcess(): TursoEnv {
  return {
    url: process.env.TURSO_URL ?? "",
    authToken: process.env.TURSO_TOKEN,
  };
}

export function createTursoClient(
  env: TursoEnv = readTursoEnvFromProcess(),
): Client {
  const { url, authToken } = env;
  if (!url) {
    throw new Error("TURSO_URL tidak ter-set (environment)");
  }
  return createClient({ url, authToken });
}
