import {
  fetchAbsenStatus,
  fetchMataKuliahAktifHariIni,
  fetchMataKuliahJadwal,
  fetchRekapAbsenAgregat,
  hitungRingkasanKehadiranRekap,
  winrateKehadiran,
} from "../../lib/elearning/jadwal/index.ts";
import { loadStudentElearningCookies } from "../../lib/utils/_session.ts";

const semua = Bun.argv.includes("--semua") || Bun.argv.includes("-a");
const tanpaAbsen =
  Bun.argv.includes("--tanpa-absen") || Bun.argv.includes("--no-absen");
const winrate =
  Bun.argv.includes("--winrate") || Bun.argv.includes("--ringkasan-kehadiran");

const cookies = await loadStudentElearningCookies();
if (!cookies) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        error:
          "Session tidak ada. Set BSI_XSRF_TOKEN + BSI_SESSION_TOKEN, atau login via Turso: BSI_USERNAME harus punya session di DB (jalankan login.ts dulu).",
        code: "no_session" as const,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

try {
  if (winrate) {
    const items = await fetchMataKuliahJadwal(cookies);
    const perMatkul = await Promise.all(
      items.map(async (item) => {
        try {
          const rekap = await fetchRekapAbsenAgregat(
            cookies,
            item.absenPathToken,
          );
          const ringkas = hitungRingkasanKehadiranRekap(rekap);
          const basis = ringkas.hadir + ringkas.tidakHadir;
          const wr = winrateKehadiran(ringkas.hadir, ringkas.tidakHadir);
          return {
            ok: true as const,
            nama: item.nama,
            kodeMtk: item.kodeMtk,
            kodeDosen: item.kodeDosen,
            absenPathToken: item.absenPathToken,
            recordsTotal: rekap.recordsTotal,
            absenMasuk: ringkas.hadir,
            tidakHadir: ringkas.tidakHadir,
            tidakDiketahui: ringkas.tidakDiketahui,
            pertemuanTerkunci: basis,
            winrate: wr,
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

    const agregat = perMatkul.reduce(
      (acc, r) => {
        if (!r.ok) return acc;
        return {
          okCount: acc.okCount + 1,
          totalMasuk: acc.totalMasuk + r.absenMasuk,
          totalTidak: acc.totalTidak + r.tidakHadir,
        };
      },
      { okCount: 0, totalMasuk: 0, totalTidak: 0 },
    );

    const ringkasanGlobal = {
      mataKuliahBerhasil: agregat.okCount,
      mataKuliahGagal: perMatkul.length - agregat.okCount,
      absenMasuk: agregat.totalMasuk,
      tidakHadir: agregat.totalTidak,
      pertemuanDenganStatusJelas: agregat.totalMasuk + agregat.totalTidak,
      winrate: winrateKehadiran(agregat.totalMasuk, agregat.totalTidak),
    };

    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "winrate" as const,
          sumberJadwal: "semua_dari_sch",
          matkul: perMatkul,
          ringkasanGlobal,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const items = semua
    ? await fetchMataKuliahJadwal(cookies)
    : await fetchMataKuliahAktifHariIni(cookies);

  const enriched = tanpaAbsen
    ? items.map((item) => ({ ...item, absen: null }))
    : await Promise.all(
        items.map(async (item) => {
          try {
            const { info, cek } = await fetchAbsenStatus(
              cookies,
              item.absenPathToken,
            );
            return {
              ...item,
              absen: {
                ok: true as const,
                cek,
                info: {
                  absenPathToken: info.absenPathToken,
                  kuliahBelumDimulai: info.kuliahBelumDimulai,
                  kuliahSudahSelesai: info.kuliahSudahSelesai,
                  bisaAbsenMasuk: info.bisaAbsenMasuk,
                  rekapSudahHadirHariIni: cek.rekapSudahHadirHariIni,
                  formAbsenMasuk: info.formAbsenMasuk,
                  tiles: info.tiles,
                },
              },
            };
          } catch (e) {
            return {
              ...item,
              absen: {
                ok: false as const,
                error: e instanceof Error ? e.message : String(e),
              },
            };
          }
        }),
      );

  console.log(
    JSON.stringify(
      {
        ok: true,
        filter: semua ? "semua" : "hari_ini",
        absenStatus: tanpaAbsen ? "skipped" : "included",
        count: enriched.length,
        items: enriched,
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
