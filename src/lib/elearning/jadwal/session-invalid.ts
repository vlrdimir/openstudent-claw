import { BSI_LOGIN_PATH } from "../shared/config/constants.ts";
import { looksLikeBsiLoginPageHtml } from "../login/parse/login-form.ts";

const SESSION_INVALID_CODE = "session_invalid";

function isLoginPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "").toLowerCase() || "/";
  return normalized === BSI_LOGIN_PATH || normalized.endsWith(BSI_LOGIN_PATH);
}

function responseResolvedToLogin(response: Response): boolean {
  if (!response.url) return false;

  try {
    return isLoginPath(new URL(response.url).pathname);
  } catch {
    return false;
  }
}

export class ElearningSessionInvalidError extends Error {
  readonly code = SESSION_INVALID_CODE;

  constructor(
    message = "Session e-learning tidak valid atau sudah kedaluwarsa.",
  ) {
    super(message);
    this.name = "ElearningSessionInvalidError";
  }
}

export function isElearningSessionInvalidError(
  error: unknown,
): error is ElearningSessionInvalidError {
  return (
    error instanceof ElearningSessionInvalidError ||
    (error instanceof Error &&
      "code" in error &&
      error.code === SESSION_INVALID_CODE)
  );
}

export function assertAuthenticatedElearningDocument(input: {
  response: Response;
  html: string;
  context: string;
}): void {
  if (
    responseResolvedToLogin(input.response) ||
    looksLikeBsiLoginPageHtml(input.html)
  ) {
    throw new ElearningSessionInvalidError(
      `${input.context}: session e-learning tidak valid atau sudah kedaluwarsa (halaman login terdeteksi).`,
    );
  }
}
