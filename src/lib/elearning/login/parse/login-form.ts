export type ParsedLoginForm = {
  csrfToken: string;
  captchaAnswer: number;
};

export type ParseLoginFormError = {
  error: string;
  code: "csrf_not_found" | "captcha_not_found" | "captcha_unsolved";
};

function extractCsrfToken(html: string): string | null {
  const m1 = html.match(/name="_token"\s+value="([^"]+)"/);
  if (m1?.[1]) return m1[1];
  const m2 = html.match(/value="([^"]+)"[^>]*name="_token"/);
  return m2?.[1] ?? null;
}

function extractCaptchaQuestion(html: string): string | null {
  const m = html.match(/id="captcha_question"[^>]*>([^<]+)</i);
  return m?.[1]?.trim() ?? null;
}

export function looksLikeBsiLoginPageHtml(html: string): boolean {
  return (
    extractCsrfToken(html) !== null && extractCaptchaQuestion(html) !== null
  );
}

export function solveCaptchaAddition(question: string): number | null {
  const m = question.match(/(\d+)\s*\+\s*(\d+)/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]);
}

export function parseLoginFormHtml(
  html: string,
): ParsedLoginForm | ParseLoginFormError {
  const csrfToken = extractCsrfToken(html);
  if (!csrfToken)
    return {
      error: "Token CSRF tidak ditemukan di halaman login",
      code: "csrf_not_found",
    };

  const question = extractCaptchaQuestion(html);
  if (!question)
    return {
      error: "Pertanyaan captcha tidak ditemukan",
      code: "captcha_not_found",
    };

  const captchaAnswer = solveCaptchaAddition(question);
  if (captchaAnswer === null) {
    return {
      error: `Tidak bisa menjawab captcha: ${question}`,
      code: "captcha_unsolved",
    };
  }

  return { csrfToken, captchaAnswer };
}

export function parseLoginPageErrorMessage(html: string): string | null {
  const m = html.match(
    /<div class="text-red-600 text-sm mb-2">\s*([^<]+?)\s*<\/div>/,
  );
  const t = m?.[1]?.trim();
  return t || null;
}
