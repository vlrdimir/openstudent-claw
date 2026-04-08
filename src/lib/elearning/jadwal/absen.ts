import {
  mergeElearningSessionFromSetCookie,
  type ElearningSessionCookies,
} from "../../utils/parse-elearning-cookies.ts";
import { BSI_BASE_URL } from "../shared/config/constants.ts";
import { bsiDocumentHeaders, bsiFetchTls } from "../shared/http/index.ts";
import { parseAbsenPageHtml, type AbsenPageInfo } from "./parse/index.ts";
import {
  fetchRekapAbsenAgregat,
  rekapSudahHadirPadaTanggal,
  tanggalHariIniLokal,
} from "./rekap-side.ts";

function elearningCookieHeader(c: ElearningSessionCookies): string {
  return [`XSRF-TOKEN=${c.xsrfToken}`, `mybest_session=${c.sessionToken}`].join(
    "; ",
  );
}

function bsiAuthenticatedGetInit(
  cookies: ElearningSessionCookies,
  extraHeaders?: Record<string, string>,
) {
  return {
    ...bsiFetchTls(),
    method: "GET" as const,
    headers: {
      ...bsiDocumentHeaders(elearningCookieHeader(cookies)),
      ...extraHeaders,
    },
    redirect: "follow" as const,
  };
}

function bsiAuthenticatedPostFormInit(
  cookies: ElearningSessionCookies,
  body: string,
  referer: string,
  extraHeaders?: Record<string, string>,
) {
  return {
    ...bsiFetchTls(),
    method: "POST" as const,
    headers: {
      ...bsiDocumentHeaders(elearningCookieHeader(cookies)),
      "content-type": "application/x-www-form-urlencoded",
      origin: BSI_BASE_URL,
      referer,
      "x-xsrf-token": cookies.xsrfToken,
      ...extraHeaders,
    },
    body,
    redirect: "manual" as const,
  };
}

export type CekAbsenStatus = {
  kuliahSudahDimulai: boolean;
  kuliahSudahSelesai: boolean;
  bisaAbsenSekarang: boolean;
  rekapSudahHadirHariIni: boolean | null;
};

function sudahAbsenMenurutRekapAtauHalaman(
  info: AbsenPageInfo,
  rekapHadirHariIni: boolean | null,
): boolean {
  return (
    rekapHadirHariIni === true ||
    (rekapHadirHariIni === null && info.sudahAbsenMasuk)
  );
}

function buildCekAbsenStatus(
  info: AbsenPageInfo,
  rekapHadirHariIni: boolean | null,
): CekAbsenStatus {
  const kuliahSedangBerlangsung =
    !info.kuliahBelumDimulai && !info.kuliahSudahSelesai;
  const sudahAbsen = sudahAbsenMenurutRekapAtauHalaman(info, rekapHadirHariIni);
  return {
    kuliahSudahDimulai: kuliahSedangBerlangsung,
    kuliahSudahSelesai: info.kuliahSudahSelesai,
    rekapSudahHadirHariIni: rekapHadirHariIni,
    bisaAbsenSekarang:
      kuliahSedangBerlangsung && info.bisaAbsenMasuk && !sudahAbsen,
  };
}

export function cekStatusAbsen(info: AbsenPageInfo): CekAbsenStatus {
  return buildCekAbsenStatus(info, null);
}

async function fetchAbsenPageWithMergedCookies(
  cookies: ElearningSessionCookies,
  absenPathToken: string,
): Promise<{ info: AbsenPageInfo; cookies: ElearningSessionCookies }> {
  const url = `${BSI_BASE_URL}/absen-mhs/${absenPathToken}`;
  const res = await fetch(
    url,
    bsiAuthenticatedGetInit(cookies, { referer: `${BSI_BASE_URL}/sch` }),
  );
  const html = await res.text();
  if (!res.ok) throw new Error(`fetch halaman absen: HTTP ${res.status}`);
  const merged = mergeElearningSessionFromSetCookie(cookies, res.headers);
  return {
    info: parseAbsenPageHtml(html, absenPathToken),
    cookies: merged,
  };
}

export async function fetchAbsenPage(
  cookies: ElearningSessionCookies,
  absenPathToken: string,
): Promise<AbsenPageInfo> {
  const { info } = await fetchAbsenPageWithMergedCookies(
    cookies,
    absenPathToken,
  );
  return info;
}

export async function fetchAbsenStatus(
  cookies: ElearningSessionCookies,
  absenPathToken: string,
  now: Date = new Date(),
): Promise<{ info: AbsenPageInfo; cek: CekAbsenStatus }> {
  const tgl = tanggalHariIniLokal(now);
  const [info, rekap] = await Promise.all([
    fetchAbsenPage(cookies, absenPathToken),
    fetchRekapAbsenAgregat(cookies, absenPathToken).catch(() => null),
  ]);
  const rekapHadir: boolean | null = rekap
    ? rekapSudahHadirPadaTanggal(rekap, tgl)
    : null;
  const cek = buildCekAbsenStatus(info, rekapHadir);
  return { info, cek };
}

export type AbsenMasukActionResult =
  | { ok: true; status: number; location: string | null }
  | {
      ok: true;
      skipped: true;
      reason: "sudah_absen" | "kuliah_belum_mulai" | "kuliah_sudah_selesai";
      cek: CekAbsenStatus;
    }
  | { ok: false; status: number; error: string; code?: string };

export async function absenMasukAction(
  cookies: ElearningSessionCookies,
  input: {
    absenPathToken: string;
    page?: AbsenPageInfo;
  },
  now: Date = new Date(),
): Promise<AbsenMasukActionResult> {
  const tgl = tanggalHariIniLokal(now);
  let rekapHadir: boolean | null = null;
  try {
    const r = await fetchRekapAbsenAgregat(cookies, input.absenPathToken);
    rekapHadir = rekapSudahHadirPadaTanggal(r, tgl);
  } catch {
    rekapHadir = null;
  }
  let page: AbsenPageInfo;
  let cookiesForPost = cookies;
  if (input.page) {
    page = input.page;
  } else {
    const r = await fetchAbsenPageWithMergedCookies(
      cookies,
      input.absenPathToken,
    );
    page = r.info;
    cookiesForPost = r.cookies;
  }
  const cek = buildCekAbsenStatus(page, rekapHadir);

  if (page.kuliahBelumDimulai) {
    return { ok: true, skipped: true, reason: "kuliah_belum_mulai", cek };
  }

  if (page.kuliahSudahSelesai) {
    return { ok: true, skipped: true, reason: "kuliah_sudah_selesai", cek };
  }

  if (sudahAbsenMenurutRekapAtauHalaman(page, rekapHadir)) {
    return { ok: true, skipped: true, reason: "sudah_absen", cek };
  }

  if (!page.csrfToken || !page.formAbsenMasuk) {
    return {
      ok: false,
      status: 0,
      code: "form_tidak_tersedia",
      error:
        "Form absen masuk tidak ditemukan di HTML. Coba buka absen-mhs di browser; jika tampilan normal, laporkan cuplikan HTML.",
    };
  }

  const referer = `${BSI_BASE_URL}/absen-mhs/${input.absenPathToken}`;
  const body = new URLSearchParams({
    _token: page.csrfToken,
    pertemuan: page.formAbsenMasuk.pertemuan,
    id: page.formAbsenMasuk.id,
  });

  const res = await fetch(
    `${BSI_BASE_URL}/mhs-absen`,
    bsiAuthenticatedPostFormInit(cookiesForPost, body.toString(), referer),
  );

  const loc = res.headers.get("Location") ?? res.headers.get("location");
  if (res.status >= 300 && res.status < 400) {
    return { ok: true, status: res.status, location: loc };
  }

  const text = await res.text().catch(() => "");
  return {
    ok: false,
    status: res.status,
    error: text.slice(0, 500) || `HTTP ${res.status}`,
  };
}

export type { AbsenPageInfo };
