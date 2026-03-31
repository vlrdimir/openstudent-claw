import { absenMasukAction } from "../../lib/elearning/jadwal/index.ts";
import { loadStudentElearningCookies } from "../../lib/utils/_session.ts";

function pesanAbsenDilewati(reason: string, rekap: boolean | null): string {
  if (reason !== "sudah_absen") {
    return reason === "kuliah_sudah_selesai"
      ? "Perkuliahan sudah selesai (tombol Sudah Selesai); absen masuk tidak lagi tersedia."
      : "Belum mulai kuliah.";
  }
  if (rekap === true) return "Sudah hadir menurut rekap hari ini.";
  if (rekap === null)
    return "Sudah absen (halaman); rekap hari ini tidak tersedia.";
  return "Sudah absen (halaman; rekap belum menandai hadir untuk tanggal ini).";
}

const token = (process.env.BSI_ABSEN_TOKEN ?? Bun.argv[2] ?? "").trim();

if (!token) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        error:
          "Butuh token path absen-mhs. Set BSI_ABSEN_TOKEN atau: bun src/scripts/students/absen-masuk.ts <absenPathToken>",
        code: "parse_error" as const,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const cookies = await loadStudentElearningCookies();
if (!cookies) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        error:
          "Session tidak ada. Set BSI_XSRF_TOKEN + BSI_SESSION_TOKEN atau BSI_USERNAME + session di DB.",
        code: "no_session" as const,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

try {
  const result = await absenMasukAction(cookies, { absenPathToken: token });

  if (!result.ok) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: result.error,
          status: result.status,
          code: result.code ?? "absen_failed",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  if ("skipped" in result && result.skipped) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: result.reason,
          cek: result.cek,
          message: pesanAbsenDilewati(
            result.reason,
            result.cek.rekapSudahHadirHariIni,
          ),
        },
        null,
        2,
      ),
    );
  } else if ("status" in result) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "post_mhs_absen",
          status: result.status,
          location: result.location,
          message:
            "POST /mhs-absen berhasil; server mengembalikan redirect (ikut Location untuk URL akhir).",
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      JSON.stringify(
        { ok: true, warning: "bentuk hasil tidak dikenali", result },
        null,
        2,
      ),
    );
  }

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
