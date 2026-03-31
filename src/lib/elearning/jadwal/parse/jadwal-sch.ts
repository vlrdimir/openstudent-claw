import { BSI_BASE_URL } from "../../shared/config/constants.ts";

export type MataKuliahJadwalItem = {
  nama: string;
  jadwalTeks: string;
  hari: string | null;
  jamMulai: string | null;
  jamSelesai: string | null;
  kodeDosen: string | null;
  kodeMtk: string | null;
  sks: string | null;
  ruang: string | null;
  kelPraktek: string | null;
  kodeGabung: string | null;
  absenUrl: string;
  absenPathToken: string;
  urlDiskusi: string | null;
  urlLearning: string | null;
  urlAssignment: string | null;
};

const HARI_LIST = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

export function parseJadwalHariJam(jadwalTeks: string): {
  hari: string | null;
  jamMulai: string | null;
  jamSelesai: string | null;
} {
  const t = jadwalTeks.trim();
  const m = t.match(/^(.+?)\s*-\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/);
  if (!m) return { hari: null, jamMulai: null, jamSelesai: null };
  return {
    hari: m[1]?.trim() ?? null,
    jamMulai: m[2] ?? null,
    jamSelesai: m[3] ?? null,
  };
}

export function hariIniNama(now: Date = new Date()): string {
  return HARI_LIST[now.getDay()] ?? "Minggu";
}

export function filterMataKuliahAktifHariIni(
  items: MataKuliahJadwalItem[],
  now: Date = new Date(),
): MataKuliahJadwalItem[] {
  const h = hariIniNama(now);
  return items.filter((x) => x.hari === h);
}

function pickHref(html: string, pathPrefix: string): string | null {
  const re = new RegExp(
    `href="(https://elearning\\.bsi\\.ac\\.id${pathPrefix}[^"]+)"`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] ?? null;
}

function pickLabel(block: string, label: string): string | null {
  const re = new RegExp(`${label}\\s*:\\s*([^<]*)</h5>`, "i");
  const m = block.match(re);
  const v = m?.[1]?.replace(/&nbsp;/g, " ")?.trim();
  return v === "" ? null : (v ?? null);
}

function isiSatuPricingPlan(innerSetelahTag: string): string {
  let depth = 1;
  let i = 0;
  while (i < innerSetelahTag.length && depth > 0) {
    const o = innerSetelahTag.indexOf("<div", i);
    const c = innerSetelahTag.indexOf("</div>", i);
    if (c < 0) return innerSetelahTag;
    if (o >= 0 && o < c) {
      depth += 1;
      i = o + 4;
    } else {
      depth -= 1;
      i = c + 6;
    }
  }
  return innerSetelahTag.slice(0, i);
}

function splitPricingBlocks(html: string): string[] {
  const parts = html.split('<div class="pricing-plan">');
  parts.shift();
  return parts.map((p) => isiSatuPricingPlan(p));
}

export function parseMataKuliahFromSchHtml(
  html: string,
): MataKuliahJadwalItem[] {
  const blocks = splitPricingBlocks(html);
  return blocks.flatMap((block) => {
    const titleM = block.match(
      /<h6 class="[^"]*pricing-title[^"]*"[^>]*>([^<]+)<\/h6>/i,
    );
    const saveM = block.match(/<div class="pricing-save">([^<]+)<\/div>/i);
    const nama = titleM?.[1]?.trim() ?? "";
    const jadwalTeks = saveM?.[1]?.trim() ?? "";
    if (!nama) return [];

    const absenHrefM = block.match(
      /href="(https:\/\/elearning\.bsi\.ac\.id\/absen-mhs\/[^"]+)"/i,
    );
    if (!absenHrefM?.[1]) return [];

    const absenUrl = absenHrefM[1];
    const absenPathToken = absenUrl
      .replace(`${BSI_BASE_URL}/absen-mhs/`, "")
      .replace(/\/$/, "");
    const { hari, jamMulai, jamSelesai } = parseJadwalHariJam(jadwalTeks);

    return [
      {
        nama,
        jadwalTeks,
        hari,
        jamMulai,
        jamSelesai,
        kodeDosen: pickLabel(block, "Kode Dosen"),
        kodeMtk: pickLabel(block, "Kode MTK"),
        sks: pickLabel(block, "SKS"),
        ruang: pickLabel(block, "No Ruang"),
        kelPraktek: pickLabel(block, "Kel Praktek"),
        kodeGabung: pickLabel(block, "Kode Gabung"),
        absenUrl,
        absenPathToken,
        urlDiskusi: pickHref(block, "/form-diskusimhs/"),
        urlLearning: pickHref(block, "/learning/"),
        urlAssignment: pickHref(block, "/assignment/"),
      },
    ];
  });
}
