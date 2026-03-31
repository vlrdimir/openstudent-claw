import { BSI_LOGIN_URL } from "../config/constants.ts";
import {
  type CookieJar,
  applySetCookieHeaders,
  jarToHeader,
} from "./cookie-jar.ts";
import { bsiDocumentHeaders } from "./default-headers.ts";
import { bsiFetchTls } from "./tls-fetch.ts";

export async function fetchLoginPageHtml(jar: CookieJar): Promise<string> {
  const res = await fetch(BSI_LOGIN_URL, {
    ...bsiFetchTls(),
    method: "GET",
    headers: bsiDocumentHeaders(jarToHeader(jar) || undefined),
    redirect: "follow",
  });
  applySetCookieHeaders(res.headers, jar);
  return res.text();
}
