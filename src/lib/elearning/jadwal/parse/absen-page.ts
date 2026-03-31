export type AbsenPageInfo = {
  csrfToken: string | null;
  absenPathToken: string;
  kuliahBelumDimulai: boolean;
  /** Tombol "Sudah Selesai" — jendela absen masuk biasanya sudah tertutup. */
  kuliahSudahSelesai: boolean;
  bisaAbsenMasuk: boolean;
  formAbsenMasuk: { pertemuan: string; id: string } | null;
  sudahAbsenMasuk: boolean;
  tiles: Record<string, string>;
};

export function parseInfoTiles(html: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re =
    /<div class="stats-detail">\s*<h5>([^<]*)<\/h5>\s*<p>([^<]+)<\/p>/g;
  let m = re.exec(html);
  while (m !== null) {
    const label = m[1];
    const key = m[2];
    if (label !== undefined && key !== undefined) {
      map[key.trim()] = label.trim();
    }
    m = re.exec(html);
  }
  return map;
}

export function parseAbsenPageHtml(
  html: string,
  absenPathToken: string,
): AbsenPageInfo {
  const meta = html.match(/<meta name="csrf-token" content="([^"]+)"/i);
  const csrfToken = meta?.[1] ?? null;

  const kuliahBelumDimulai = /btn-danger[^>]*>[\s\S]{0,80}?Belum Mulai/i.test(
    html,
  );

  const kuliahSudahSelesai =
    /<button[^>]*>[\s\S]{0,120}?Sudah\s+Selesai[\s\S]{0,40}?<\/button>/i.test(
      html,
    );

  const formM = html.match(
    /<form[^>]*action="\/mhs-absen"[^>]*>([\s\S]*?)<\/form>/i,
  );
  let formAbsenMasuk: { pertemuan: string; id: string } | null = null;
  let bisaAbsenMasuk = false;
  if (formM) {
    const body = formM[1];
    if (body && /Absen Masuk/i.test(body)) {
      const pert = body.match(/name="pertemuan"\s+value="([^"]+)"/);
      const id = body.match(/name="id"\s+value="([^"]+)"/);
      if (pert?.[1] && id?.[1]) {
        formAbsenMasuk = { pertemuan: pert[1], id: id[1] };
        bisaAbsenMasuk = true;
      }
    }
  }

  const tandaAbsenEksplisit =
    /Absen\s+Keluar/i.test(html) ||
    /Sudah\s+melakukan\s+absen\s+masuk/i.test(html) ||
    /sudah\s+absen/i.test(html);

  let sudahAbsenMasuk: boolean;
  if (kuliahBelumDimulai) {
    sudahAbsenMasuk = false;
  } else if (kuliahSudahSelesai) {
    sudahAbsenMasuk = tandaAbsenEksplisit;
  } else if (bisaAbsenMasuk) {
    sudahAbsenMasuk = false;
  } else {
    sudahAbsenMasuk = true;
  }

  if (tandaAbsenEksplisit && !kuliahBelumDimulai) sudahAbsenMasuk = true;
  if (bisaAbsenMasuk) sudahAbsenMasuk = false;

  return {
    csrfToken,
    absenPathToken,
    kuliahBelumDimulai,
    kuliahSudahSelesai,
    bisaAbsenMasuk,
    formAbsenMasuk,
    sudahAbsenMasuk,
    tiles: parseInfoTiles(html),
  };
}
