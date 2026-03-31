# AGENTS.md — openstudent-claw

Panduan untuk agen / kontributor agar struktur kode tetap konsisten dengan desain proyek.

## Prinsip umum

- **Library di `src/lib/`** memuat logika, HTTP ke BSI, parsing, dan akses DB (Turso/Drizzle).
- **Skrip di `src/scripts/`** tipis: baca env/argv, panggil library, cetak JSON ke stdout, `process.exit` sesuai sukses/gagal.
- Impor pakai path relatif dengan ekstensi **`.ts`** (selaras `tsconfig` / Bun).
- Layer DB (`account-store`, `session-store`, `db/`) tidak menerima instance DB dari luar: selalu **`getDb()`** di dalam fungsi.

---

## `src/scripts/students/`

Entry point CLI per domain mahasiswa (login, jadwal, dll.).

**Konvensi:**

| Hal        | Aturan                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| Lokasi     | Satu perhatian ≈ satu file, mis. `login.ts` untuk alur login.                                                         |
| Impor      | Dari `../../lib/elearning/index.ts` atau modul `src/lib` lain yang relevan — jangan duplikasi fetch/parsing di skrip. |
| Kredensial | `process.env` (mis. `BSI_USERNAME`, `BSI_PASSWORD`) dengan fallback `Bun.argv[2]` / `[3]` bila perlu.                 |
| Output     | `JSON.stringify(..., null, 2)` ke **stdout**; pesan bantuan/error validasi sama format JSON bila memungkinkan.        |
| Exit code  | `0` sukses, non-zero jika gagal (validasi, login gagal, dll.).                                                        |

**Contoh pola:** lihat `login.ts` — validasi input awal, panggil `bsiLogin`, log hasil, exit.

---

## `src/lib/elearning/`

Modul integrasi **e-learning BSI** (`elearning.bsi.ac.id`). Struktur saat ini memakai pola **feature + internal shared implementation**:

```
src/lib/elearning/
├── index.ts                # Barrel publik — re-export API stabil
├── config/                 # Compatibility surface (re-export dari shared/config)
│   ├── index.ts
│   └── constants.ts
├── http/                   # Compatibility surface (re-export dari shared/http)
│   ├── index.ts
│   ├── cookie-jar.ts
│   ├── default-headers.ts
│   ├── tls-fetch.ts
│   └── fetch-login-page.ts
├── shared/                 # Implementasi internal reusable lintas fitur
│   ├── config/
│   │   ├── index.ts
│   │   └── constants.ts
│   └── http/
│       ├── index.ts
│       ├── cookie-jar.ts
│       ├── default-headers.ts
│       ├── tls-fetch.ts
│       └── fetch-login-page.ts
├── login/
│   ├── index.ts
│   ├── bsi-login.ts
│   └── parse/
│       ├── login-form.ts
│       └── index.ts
└── jadwal/
    ├── index.ts
    ├── absen.ts
    ├── mata-kuliah.ts
    ├── rekap-side.ts      # GET /rekap-side/:absenPathToken (DataTables JSON; status_hadir di data[])
    └── parse/
        ├── absen-page.ts
        ├── jadwal-sch.ts
        └── index.ts
```

**Aturan layering:**

1. **`shared/`** adalah implementasi internal reusable (source of truth teknis).
2. **`config/` + `http/`** di root `elearning` adalah **surface canonical untuk import antar modul elearning** (via re-export), agar boundary stabil dan tidak menyebar direct import ke `shared/`.
3. **`login/`** berisi orkestrasi autentikasi (`bsi-login.ts`) + parser spesifik di `login/parse/` (contoh: `login-form.ts`).
4. **`jadwal/`** memakai file domain level atas (`absen.ts`, `mata-kuliah.ts`, `rekap-side.ts`) dan parser di `jadwal/parse/`. **`rekap-side`**: GET **`/rekap-side/:absenPathToken`** dengan query ala DataTables server-side; parameter **`length` default 16**; header **`Referer`** = halaman **`/absen-mhs/:absenPathToken`** yang sama. **`status_hadir`** pada baris `data[]` biasanya berupa HTML (mis. tombol "Hadir").
5. **Barrel `elearning/index.ts`** hanya export API yang stabil untuk konsumsi luar (`scripts`/modul lain), jangan export util internal mentah.

**Impor silang dalam `elearning`:**

- Dari feature (`login/`, `jadwal/`) ke transport/konstanta: gunakan `../http/...` dan `../config/...`.
- Hindari import langsung ke `../shared/...` dari feature kecuali untuk kebutuhan internal yang sangat spesifik dan disepakati.
- Cookie parsing respons (`Set-Cookie`) tetap di `src/lib/http/parse-elearning-cookies.ts` (shared global), bukan diduplikasi di `elearning`.

**TLS:** variabel lingkungan tetap di `http/tls-fetch.ts` (`BSI_TLS_INSECURE`, `NODE_TLS_REJECT_UNAUTHORIZED`).

---
