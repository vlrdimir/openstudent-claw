import { eq } from "drizzle-orm";
import { accounts, studentSessions } from "./db/schema/index.ts";
import { getDb } from "./db/index.ts";

export type AccountRow = typeof accounts.$inferSelect;

export async function upsertAccount(input: {
  username: string;
  password: string;
}): Promise<AccountRow> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(accounts)
    .values({
      username: input.username,
      password: input.password,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: accounts.username,
      set: {
        password: input.password,
        updatedAt: now,
      },
    });

  const row = await db.query.accounts.findFirst({
    where: eq(accounts.username, input.username),
  });
  if (!row)
    throw new Error("upsertAccount: baris tidak ditemukan setelah insert");
  return row;
}

export async function getAccountByUsername(
  username: string,
): Promise<AccountRow | undefined> {
  const db = getDb();
  return db.query.accounts.findFirst({
    where: eq(accounts.username, username),
  });
}

export async function getAccountById(
  id: number,
): Promise<AccountRow | undefined> {
  const db = getDb();
  return db.query.accounts.findFirst({
    where: eq(accounts.id, id),
  });
}

export type AccountWithSessions = AccountRow & {
  sessions: (typeof studentSessions.$inferSelect)[];
};

export async function getAccountWithSessions(
  username: string,
): Promise<AccountWithSessions | undefined> {
  const db = getDb();
  return db.query.accounts.findFirst({
    where: eq(accounts.username, username),
    with: { sessions: true },
  });
}
