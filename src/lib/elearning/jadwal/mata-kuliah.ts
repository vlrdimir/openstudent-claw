import type { ElearningSessionCookies } from "../../utils/parse-elearning-cookies.ts";
import { BSI_BASE_URL } from "../shared/config/constants.ts";
import { bsiDocumentHeaders, bsiFetchTls } from "../shared/http/index.ts";
import {
  filterMataKuliahAktifHariIni,
  hariIniNama,
  parseJadwalHariJam,
  parseMataKuliahFromSchHtml,
  type MataKuliahJadwalItem,
} from "./parse/index.ts";
import {
  fetchRekapAbsenAgregat,
  rekapSudahHadirPadaTanggal,
  tanggalHariIniLokal,
} from "./rekap-side.ts";

const SCH_URL = `${BSI_BASE_URL}/sch`;

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

export async function fetchMataKuliahJadwal(
  cookies: ElearningSessionCookies,
): Promise<MataKuliahJadwalItem[]> {
  const res = await fetch(
    SCH_URL,
    bsiAuthenticatedGetInit(cookies, {
      referer: `${BSI_BASE_URL}/user/dashboard`,
    }),
  );
  const html = await res.text();
  if (!res.ok) throw new Error(`fetch jadwal (/sch): HTTP ${res.status}`);
  return parseMataKuliahFromSchHtml(html);
}

export async function fetchMataKuliahAktifHariIni(
  cookies: ElearningSessionCookies,
  now?: Date,
): Promise<MataKuliahJadwalItem[]> {
  const all = await fetchMataKuliahJadwal(cookies);
  return filterMataKuliahAktifHariIni(all, now);
}

export type MataKuliahJadwalItemRekap = MataKuliahJadwalItem & {
  rekapSudahHadirHariIni: boolean | null;
};

export async function enrichMataKuliahRekapHadirHariIni(
  cookies: ElearningSessionCookies,
  items: MataKuliahJadwalItem[],
  now?: Date,
): Promise<MataKuliahJadwalItemRekap[]> {
  const tgl = tanggalHariIniLokal(now ?? new Date());
  return Promise.all(
    items.map(async (item) => {
      try {
        const rekap = await fetchRekapAbsenAgregat(
          cookies,
          item.absenPathToken,
        );
        return {
          ...item,
          rekapSudahHadirHariIni: rekapSudahHadirPadaTanggal(rekap, tgl),
        };
      } catch {
        return { ...item, rekapSudahHadirHariIni: null };
      }
    }),
  );
}

export async function fetchMataKuliahAktifHariIniDenganRekap(
  cookies: ElearningSessionCookies,
  now?: Date,
): Promise<MataKuliahJadwalItemRekap[]> {
  const items = await fetchMataKuliahAktifHariIni(cookies, now);
  return enrichMataKuliahRekapHadirHariIni(cookies, items, now);
}

export type { MataKuliahJadwalItem };
export {
  filterMataKuliahAktifHariIni,
  hariIniNama,
  parseJadwalHariJam,
  parseMataKuliahFromSchHtml,
};
