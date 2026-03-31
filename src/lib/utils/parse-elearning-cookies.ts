export type ElearningSessionCookies = {
  xsrfToken: string;
  sessionToken: string;
  expiresAt?: Date;
};

const NAME_XSRF = "XSRF-TOKEN";
const NAME_SESSION = "mybest_session";

function parseOneSetCookie(
  line: string,
): { name: string; value: string; expires?: Date } | null {
  const segments = line
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const pair = segments[0];
  if (!pair) return null;
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  let value = pair.slice(eq + 1).trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    /* nilai cookie kadang sudah literal */
  }
  let expires: Date | undefined;
  segments.slice(1).forEach((attr) => {
    const low = attr.toLowerCase();
    if (low.startsWith("expires=")) {
      const d = new Date(attr.slice("expires=".length).trim());
      if (!Number.isNaN(d.getTime())) expires = d;
    }
  });
  return { name, value, expires };
}

function collectSetCookieLines(headers: Headers): string[] {
  const fn = headers.getSetCookie?.bind(headers);
  if (fn) return fn();
  const single = headers.get("set-cookie");
  if (!single) return [];
  return [single];
}

export function parseElearningCookiesFromResponse(
  response: Headers | Response,
): ElearningSessionCookies | null {
  const headers = response instanceof Response ? response.headers : response;
  const lines = collectSetCookieLines(headers);
  let xsrfToken: string | undefined;
  let sessionToken: string | undefined;
  let expiresAt: Date | undefined;

  lines.forEach((line) => {
    const parsed = parseOneSetCookie(line);
    if (!parsed) return;
    if (parsed.name === NAME_XSRF) xsrfToken = parsed.value;
    if (parsed.name === NAME_SESSION) sessionToken = parsed.value;
    if (parsed.expires && (!expiresAt || parsed.expires > expiresAt)) {
      expiresAt = parsed.expires;
    }
  });

  if (!xsrfToken || !sessionToken) return null;
  return { xsrfToken, sessionToken, expiresAt };
}
