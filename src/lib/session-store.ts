import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { studentSessions } from "./db/schema/index.ts";
import { getDb } from "./db/index.ts";
import type { ElearningSessionCookies } from "./utils/parse-elearning-cookies.ts";

export type StudentSessionRow = typeof studentSessions.$inferSelect;

export type StoreSessionInput = {
  accountId: number;
  xsrfToken: string;
  sessionToken: string;
  expiresAt?: Date | null;
};

export async function storeSession(
  input: StoreSessionInput,
): Promise<StudentSessionRow> {
  const db = getDb();
  const [row] = await db
    .insert(studentSessions)
    .values({
      accountId: input.accountId,
      xsrfToken: input.xsrfToken,
      sessionToken: input.sessionToken,
      expiresAt: input.expiresAt ?? null,
    })
    .onConflictDoUpdate({
      target: studentSessions.accountId,
      set: {
        xsrfToken: input.xsrfToken,
        sessionToken: input.sessionToken,
        expiresAt: input.expiresAt ?? null,
      },
    })
    .returning();
  if (!row) throw new Error("storeSession: upsert gagal");
  return row;
}

export async function storeSessionFromCookies(
  accountId: number,
  cookies: ElearningSessionCookies,
): Promise<StudentSessionRow> {
  return storeSession({
    accountId,
    xsrfToken: cookies.xsrfToken,
    sessionToken: cookies.sessionToken,
    expiresAt: cookies.expiresAt,
  });
}

export async function getLatestSessionForAccount(
  accountId: number,
): Promise<StudentSessionRow | undefined> {
  const db = getDb();
  return db.query.studentSessions.findFirst({
    where: eq(studentSessions.accountId, accountId),
    orderBy: [desc(studentSessions.createdAt)],
  });
}

export async function getValidSessionForAccount(
  accountId: number,
  asOf: Date = new Date(),
): Promise<StudentSessionRow | undefined> {
  const db = getDb();
  return db.query.studentSessions.findFirst({
    where: and(
      eq(studentSessions.accountId, accountId),
      or(
        isNull(studentSessions.expiresAt),
        gt(studentSessions.expiresAt, asOf),
      ),
    ),
    orderBy: [desc(studentSessions.createdAt)],
  });
}

export async function listSessionsForAccount(
  accountId: number,
  limit = 50,
): Promise<StudentSessionRow[]> {
  const db = getDb();
  return db.query.studentSessions.findMany({
    where: eq(studentSessions.accountId, accountId),
    orderBy: [desc(studentSessions.createdAt)],
    limit,
  });
}
