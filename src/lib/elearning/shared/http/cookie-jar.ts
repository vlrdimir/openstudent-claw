export type CookieJar = Map<string, string>;

export function jarToHeader(jar: CookieJar): string {
  if (jar.size === 0) return "";
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function applySetCookieHeaders(headers: Headers, jar: CookieJar): void {
  const lines =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const fallback = headers.get("set-cookie");
  let all: string[];
  if (lines.length > 0) {
    all = lines;
  } else if (fallback) {
    all = [fallback];
  } else {
    all = [];
  }
  all.forEach((line) => {
    const segment = line.split(";")[0]?.trim();
    if (!segment) return;
    const i = segment.indexOf("=");
    if (i <= 0) return;
    jar.set(segment.slice(0, i).trim(), segment.slice(i + 1).trim());
  });
}

export function createCookieJar(): CookieJar {
  return new Map();
}
