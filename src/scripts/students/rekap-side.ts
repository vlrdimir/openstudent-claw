import {
  fetchMataKuliahAktifHariIni,
  fetchMataKuliahJadwal,
  fetchRekapAbsenAgregat,
  fetchRekapAbsenSide,
  filterRekapSideDataHariIni,
  hitungRingkasanKehadiranRekap,
  tanggalHariIniLokal,
  type RekapAbsenSideResponse,
} from "../../lib/elearning/jadwal/index.ts";
import { loadStudentElearningCookies } from "../../lib/utils/_session.ts";
import type { ElearningSessionCookies } from "../../lib/utils/parse-elearning-cookies.ts";

const rekapSemuaBaris =
  Bun.argv.includes("--all") ||
  Bun.argv.includes("--semua") ||
  Bun.argv.includes("-a");
const filterHariIni =
  Bun.argv.includes("--hari-ini") || Bun.argv.includes("--hariini");

const dariJadwal = Bun.argv.includes("--dari-jadwal");
const jadwalSemua =
  Bun.argv.includes("--jadwal-semua") || Bun.argv.includes("--semua-mk");
const jadwalHariIni =
  Bun.argv.includes("--jadwal-hari-ini") || Bun.argv.includes("--mk-hari-ini");

function pickAbsenPathToken(): string {
  const idx = Bun.argv.indexOf("--absenPathToken");
  if (idx !== -1 && Bun.argv[idx + 1]) {
    return Bun.argv[idx + 1]!.trim();
  }
  const env =
    process.env.BSI_REKAP_TOKEN?.trim() ?? process.env.BSI_ABSEN_TOKEN?.trim();
  if (env) return env;
  const dariArgv = [...Bun.argv].reverse().find((a) => {
    if (a.startsWith("-")) return false;
    if (a.endsWith(".ts")) return false;
    if (a === "bun") return false;
    if (a.includes("rekap-side")) return false;
    return a.length > 40;
  });
  return dariArgv?.trim() ?? "";
}

async function ambilRekapMentah(
  cookies: ElearningSessionCookies,
  absenPathToken: string,
): Promise<RekapAbsenSideResponse> {
  const perluSemuaBaris = rekapSemuaBaris || filterHariIni;
  if (perluSemuaBaris) {
    return fetchRekapAbsenAgregat(cookies, absenPathToken);
  }
  return fetchRekapAbsenSide(cookies, absenPathToken);
}

function terapkanFilterHariIni(
  rekap: RekapAbsenSideResponse,
  now: Date,
): RekapAbsenSideResponse {
  const tgl = tanggalHariIniLokal(now);
  return filterRekapSideDataHariIni(rekap, tgl);
}

const cookies = await loadStudentElearningCookies();
if (!cookies) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        error:
          "Session tidak ada. Set BSI_XSRF_TOKEN + BSI_SESSION_TOKEN, atau BSI_USERNAME + session di DB.",
        code: "no_session" as const,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const token = pickAbsenPathToken();
const now = new Date();

try {
  if (dariJadwal) {
    if (!jadwalSemua && !jadwalHariIni) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error:
              "Dengan --dari-jadwal, tambahkan --jadwal-semua (semua MK dari /sch) atau --jadwal-hari-ini (MK hari ini saja).",
            code: "parse_error" as const,
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    const items = jadwalSemua
      ? await fetchMataKuliahJadwal(cookies)
      : await fetchMataKuliahAktifHariIni(cookies, now);

    const rows = await Promise.all(
      items.map(async (item) => {
        try {
          let rekap = await ambilRekapMentah(cookies, item.absenPathToken);
          if (filterHariIni) {
            rekap = terapkanFilterHariIni(rekap, now);
          }
          return {
            ok: true as const,
            nama: item.nama,
            kodeMtk: item.kodeMtk,
            absenPathToken: item.absenPathToken,
            rekap,
            ringkasan: hitungRingkasanKehadiranRekap(rekap),
          };
        } catch (e) {
          return {
            ok: false as const,
            nama: item.nama,
            kodeMtk: item.kodeMtk,
            absenPathToken: item.absenPathToken,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "dari_jadwal" as const,
          jadwal: jadwalSemua ? "semua_mk" : "hari_ini",
          opsi: {
            semuaBarisEndpoint: rekapSemuaBaris || filterHariIni,
            filterDataTanggal: filterHariIni ? tanggalHariIniLokal(now) : null,
          },
          count: rows.length,
          items: rows,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  if (!token) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error:
            "Butuh --absenPathToken <token> (atau env BSI_REKAP_TOKEN), atau pakai --dari-jadwal dengan --jadwal-semua / --jadwal-hari-ini.",
          code: "parse_error" as const,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  let rekap = await ambilRekapMentah(cookies, token);
  if (filterHariIni) {
    rekap = terapkanFilterHariIni(rekap, now);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "satu_matkul" as const,
        absenPathToken: token,
        opsi: {
          semuaBarisEndpoint: rekapSemuaBaris || filterHariIni,
          filterDataTanggal: filterHariIni ? tanggalHariIniLokal(now) : null,
        },
        ringkasan: hitungRingkasanKehadiranRekap(rekap),
        rekap,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (e) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: "fetch_error" as const,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
