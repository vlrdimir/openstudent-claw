import type { ElearningSessionCookies } from "../../utils/parse-elearning-cookies.ts";
import { formatJakartaLocalDate } from "../../utils/jakarta-time.ts";
import { BSI_BASE_URL } from "../shared/config/constants.ts";
import { bsiDocumentHeaders } from "../shared/http/default-headers.ts";
import { bsiFetchTls } from "../shared/http/tls-fetch.ts";

export const DEFAULT_REKAP_SIDE_PAGE_LENGTH = 16;

const REKAP_SIDE_DATATABLE_COLUMNS: readonly { data: string; name: string }[] =
  [
    { data: "0", name: "nomer" },
    { data: "status_hadir", name: "status_hadir" },
    { data: "tgl_ajar_masuk", name: "tgl_ajar_masuk" },
    { data: "nm_mtk", name: "nm_mtk" },
    { data: "pertemuan", name: "pertemuan" },
    { data: "berita_acara", name: "berita_acara" },
    { data: "rangkuman", name: "rangkuman" },
  ];

function elearningCookieHeader(c: ElearningSessionCookies): string {
  return [`XSRF-TOKEN=${c.xsrfToken}`, `mybest_session=${c.sessionToken}`].join(
    "; ",
  );
}

function buildRekapSideQuery(
  draw: number,
  start: number,
  length: number,
  orderColumn: number,
  orderDir: "asc" | "desc",
): string {
  const p = new URLSearchParams();
  p.set("draw", String(draw));
  REKAP_SIDE_DATATABLE_COLUMNS.forEach((col, i) => {
    p.set(`columns[${i}][data]`, col.data);
    p.set(`columns[${i}][name]`, col.name);
    p.set(`columns[${i}][searchable]`, "true");
    p.set(`columns[${i}][orderable]`, "true");
    p.set(`columns[${i}][search][value]`, "");
    p.set(`columns[${i}][search][regex]`, "false");
  });
  p.set("order[0][column]", String(orderColumn));
  p.set("order[0][dir]", orderDir);
  p.set("start", String(start));
  p.set("length", String(length));
  p.set("search[value]", "");
  p.set("search[regex]", "false");
  p.set("_", String(Date.now()));
  return p.toString();
}

export type RekapAbsenSideRow = Record<string, unknown>;

export type RekapAbsenSideResponse = {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: RekapAbsenSideRow[];
};

export type FetchRekapAbsenSideOptions = {
  start?: number;
  length?: number;
  draw?: number;
  orderColumn?: number;
  orderDir?: "asc" | "desc";
};

export async function fetchRekapAbsenSide(
  cookies: ElearningSessionCookies,
  absenPathToken: string,
  options?: FetchRekapAbsenSideOptions,
): Promise<RekapAbsenSideResponse> {
  const start = options?.start ?? 0;
  const length = options?.length ?? DEFAULT_REKAP_SIDE_PAGE_LENGTH;
  const draw = options?.draw ?? 1;
  const orderColumn = options?.orderColumn ?? 0;
  const orderDir = options?.orderDir ?? "asc";

  const qs = buildRekapSideQuery(draw, start, length, orderColumn, orderDir);
  const url = `${BSI_BASE_URL}/rekap-side/${absenPathToken}?${qs}`;
  const referer = `${BSI_BASE_URL}/absen-mhs/${absenPathToken}`;

  const res = await fetch(url, {
    ...bsiFetchTls(),
    method: "GET",
    headers: {
      ...bsiDocumentHeaders(elearningCookieHeader(cookies)),
      accept: "application/json, text/javascript, */*; q=0.01",
      "x-requested-with": "XMLHttpRequest",
      referer,
    },
    redirect: "follow" as const,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `fetch rekap-side: HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("fetch rekap-side: respons bukan JSON");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("data" in parsed) ||
    !Array.isArray((parsed as RekapAbsenSideResponse).data)
  ) {
    throw new Error("fetch rekap-side: bentuk JSON tidak dikenali");
  }

  const o = parsed as Record<string, unknown>;
  return {
    draw: Number(o.draw ?? 0),
    recordsTotal: Number(o.recordsTotal ?? 0),
    recordsFiltered: Number(o.recordsFiltered ?? 0),
    data: o.data as RekapAbsenSideRow[],
  };
}

export function tanggalHariIniLokal(now: Date = new Date()): string {
  return formatJakartaLocalDate(now);
}

export function filterRekapSideDataHariIni(
  rekap: RekapAbsenSideResponse,
  tanggalYyyyMmDd: string,
): RekapAbsenSideResponse {
  const data = rekap.data.filter(
    (row) => String(row.tgl_ajar_masuk ?? "") === tanggalYyyyMmDd,
  );
  return {
    ...rekap,
    recordsFiltered: data.length,
    data,
  };
}

function stripHtmlRingkas(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type KlasifikasiKehadiranBaris =
  | "hadir"
  | "tidak_hadir"
  | "tidak_diketahui";

export function kehadiranDariStatusHtml(
  statusHadir: unknown,
): KlasifikasiKehadiranBaris {
  if (typeof statusHadir !== "string") return "tidak_diketahui";
  const t = stripHtmlRingkas(statusHadir);
  if (!t) return "tidak_diketahui";
  if (/tidak\s*hadir|tidak\s*masuk|\bth\b|alpa|alpha|izin|sakit|bolos/i.test(t))
    return "tidak_hadir";
  if (/\bhadir\b/i.test(t)) return "hadir";
  return "tidak_diketahui";
}

export function barisRekapMenyatakanHadir(statusHadir: unknown): boolean {
  return kehadiranDariStatusHtml(statusHadir) === "hadir";
}

export function hitungRingkasanKehadiranDariBaris(data: RekapAbsenSideRow[]): {
  hadir: number;
  tidakHadir: number;
  tidakDiketahui: number;
  totalBaris: number;
} {
  const acc = { hadir: 0, tidakHadir: 0, tidakDiketahui: 0 };
  data.forEach((row) => {
    const k = kehadiranDariStatusHtml(row.status_hadir);
    if (k === "hadir") acc.hadir += 1;
    else if (k === "tidak_hadir") acc.tidakHadir += 1;
    else acc.tidakDiketahui += 1;
  });
  return { ...acc, totalBaris: data.length };
}

export function hitungRingkasanKehadiranRekap(rekap: RekapAbsenSideResponse): {
  hadir: number;
  tidakHadir: number;
  tidakDiketahui: number;
  totalBaris: number;
} {
  return hitungRingkasanKehadiranDariBaris(rekap.data);
}

export function winrateKehadiran(
  hadir: number,
  tidakHadir: number,
): number | null {
  const n = hadir + tidakHadir;
  if (n <= 0) return null;
  return Math.round((hadir / n) * 10000) / 100;
}

export function rekapSudahHadirPadaTanggal(
  rekap: RekapAbsenSideResponse,
  tanggalYyyyMmDd: string,
): boolean {
  return rekap.data.some(
    (row) =>
      String(row.tgl_ajar_masuk ?? "") === tanggalYyyyMmDd &&
      barisRekapMenyatakanHadir(row.status_hadir),
  );
}

const REKAP_FETCH_CAP = 500;

export async function fetchRekapAbsenAgregat(
  cookies: ElearningSessionCookies,
  absenPathToken: string,
): Promise<RekapAbsenSideResponse> {
  const first = await fetchRekapAbsenSide(cookies, absenPathToken);
  const total = first.recordsTotal;
  if (total <= first.data.length) return first;
  const len = Math.min(total, REKAP_FETCH_CAP);
  return fetchRekapAbsenSide(cookies, absenPathToken, {
    start: 0,
    length: len,
  });
}
