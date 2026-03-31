import { getAccountByUsername } from "../account-store.ts";
import type { ElearningSessionCookies } from "./parse-elearning-cookies.ts";
import { getLatestSessionForAccount } from "../session-store.ts";

export async function loadStudentElearningCookies(): Promise<ElearningSessionCookies | null> {
  const xsrf = process.env.BSI_XSRF_TOKEN?.trim();
  const sess = process.env.BSI_SESSION_TOKEN?.trim();
  if (xsrf && sess) {
    return { xsrfToken: xsrf, sessionToken: sess };
  }

  const user = process.env.BSI_USERNAME?.trim();
  if (!user) return null;

  const acc = await getAccountByUsername(user);
  if (!acc) return null;

  const row = await getLatestSessionForAccount(acc.id);
  if (!row) return null;

  return {
    xsrfToken: row.xsrfToken,
    sessionToken: row.sessionToken,
    expiresAt: row.expiresAt ?? undefined,
  };
}
