import { upsertAccount } from "../../account-store.ts";
import {
  parseElearningCookiesFromResponse,
  type ElearningSessionCookies,
} from "../../utils/parse-elearning-cookies.ts";
import { storeSessionFromCookies } from "../../session-store.ts";
import {
  BSI_BASE_URL,
  BSI_CREDENTIALS_ERROR_TEXT,
  BSI_LOGIN_PATH,
  BSI_LOGIN_URL,
} from "../shared/config/constants.ts";
import {
  type CookieJar,
  applySetCookieHeaders,
  bsiDocumentHeaders,
  bsiFetchTls,
  fetchLoginPageHtml,
  jarToHeader,
} from "../shared/http/index.ts";
import {
  parseLoginFormHtml,
  parseLoginPageErrorMessage,
} from "./parse/login-form.ts";

export type BsiLoginInput = {
  username: string;
  password: string;
};

export type BsiLoginSuccessJson = {
  ok: true;
  cookies: ElearningSessionCookies;
  redirectLocation: string | null;
  accountId: number;
  sessionId: number;
};

export type BsiLoginFailureJson = {
  ok: false;
  error: string;
  code:
    | "invalid_credentials"
    | "bad_captcha"
    | "parse_error"
    | "http_error"
    | "unexpected_response"
    | "db_error";
};

export type BsiLoginResultJson = BsiLoginSuccessJson | BsiLoginFailureJson;

function isLoginPath(pathname: string): boolean {
  const n = pathname.replace(/\/$/, "").toLowerCase() || "/";
  return n === BSI_LOGIN_PATH || n.endsWith(BSI_LOGIN_PATH);
}

async function loadLoginErrorMessage(
  absoluteUrl: string,
  jar: CookieJar,
): Promise<string> {
  const res = await fetch(absoluteUrl, {
    ...bsiFetchTls(),
    method: "GET",
    headers: bsiDocumentHeaders(jarToHeader(jar) || undefined),
    redirect: "follow",
  });
  applySetCookieHeaders(res.headers, jar);
  const html = await res.text();
  return parseLoginPageErrorMessage(html) ?? BSI_CREDENTIALS_ERROR_TEXT;
}

export async function bsiLogin(
  input: BsiLoginInput,
): Promise<BsiLoginResultJson> {
  const jar: CookieJar = new Map();

  let html: string;
  try {
    html = await fetchLoginPageHtml(jar);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: "http_error",
    };
  }

  const parsed = parseLoginFormHtml(html);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error, code: "parse_error" };
  }

  const body = new URLSearchParams({
    _token: parsed.csrfToken,
    username: input.username,
    password: input.password,
    captcha_answer: String(parsed.captchaAnswer),
  });

  let postRes: Response;
  try {
    postRes = await fetch(BSI_LOGIN_URL, {
      ...bsiFetchTls(),
      method: "POST",
      headers: {
        ...bsiDocumentHeaders(jarToHeader(jar) || undefined),
        "content-type": "application/x-www-form-urlencoded",
        origin: BSI_BASE_URL,
        referer: BSI_LOGIN_URL,
      },
      body: body.toString(),
      redirect: "manual",
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: "http_error",
    };
  }

  applySetCookieHeaders(postRes.headers, jar);

  const locRaw =
    postRes.headers.get("Location") ?? postRes.headers.get("location");
  const { status } = postRes;

  if (status >= 300 && status < 400 && locRaw) {
    const nextUrl = new URL(locRaw, BSI_LOGIN_URL);
    if (isLoginPath(nextUrl.pathname)) {
      let errorText: string;
      try {
        errorText = await loadLoginErrorMessage(nextUrl.href, jar);
      } catch {
        errorText = BSI_CREDENTIALS_ERROR_TEXT;
      }
      return {
        ok: false,
        error: errorText,
        code: "invalid_credentials",
      };
    }

    const cookies = parseElearningCookiesFromResponse(postRes);
    if (!cookies) {
      return {
        ok: false,
        error: "Respons sukses tanpa cookie session yang diharapkan",
        code: "unexpected_response",
      };
    }

    try {
      const account = await upsertAccount({
        username: input.username,
        password: input.password,
      });
      const sessionRow = await storeSessionFromCookies(account.id, cookies);
      return {
        ok: true,
        cookies,
        redirectLocation: locRaw,
        accountId: account.id,
        sessionId: sessionRow.id,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: "db_error",
      };
    }
  }

  if (status === 200) {
    const text = await postRes.text();
    const inlineError = parseLoginPageErrorMessage(text);
    if (inlineError) {
      const creds =
        inlineError === BSI_CREDENTIALS_ERROR_TEXT ||
        inlineError.toLowerCase().includes("credentials");
      return {
        ok: false,
        error: inlineError,
        code: creds ? "invalid_credentials" : "bad_captcha",
      };
    }
  }

  return {
    ok: false,
    error: `Respons tidak diharapkan (HTTP ${status})`,
    code: "unexpected_response",
  };
}
