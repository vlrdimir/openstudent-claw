---
name: bsi_students
description: Access BSI student features (login, class schedule, attendance) via Bun scripts.
---

# BSI Students Skill

Use this skill to manage BSI e-learning student activities, such as logging in, viewing today's or the full class schedule, and performing attendance check-ins.

This skill is mirrored into the OpenClaw workspace skill directory at startup at `/home/node/.openclaw/workspace/skills/bsi_students` with the minimal runnable project tree such as `SKILL.md`, `src/`, and key Bun/TypeScript config files when present.

All Bun script execution MUST run from the mirrored workspace skill directory: `/home/node/.openclaw/workspace/skills/bsi_students`.

## Execution Rules (Mandatory)

- MUST execute commands from `/home/node/.openclaw/workspace/skills/bsi_students`.
- MUST NOT execute commands from `/openstudent-claw`.
- MUST NOT copy this project to `/tmp` (or any temporary directory) and execute from there.

## Core Features

### 1. Student Login

Used for authentication and obtaining session cookies, which are stored for subsequent script usage.

**Usage:**

```bash
# Using environment variables
export BSI_USERNAME="your_nim"
export BSI_PASSWORD="your_password"
cd /home/node/.openclaw/workspace/skills/bsi_students && bun src/scripts/students/login.ts

# Or using CLI arguments
cd /home/node/.openclaw/workspace/skills/bsi_students && bun src/scripts/students/login.ts <username> <password>
```

### 2. Check Courses & Schedule

Used to view the list of courses. By default, it only displays active courses for today.

**Usage:**

```bash
# Check today's schedule (including attendance status)
cd /home/node/.openclaw/workspace/skills/bsi_students && bun src/scripts/students/mata-kuliah.ts

# Check ALL schedules for this semester (alias: -a)
cd /home/node/.openclaw/workspace/skills/bsi_students && bun src/scripts/students/mata-kuliah.ts --semua

# Check schedule without processing attendance status (alias: --no-absen)
cd /home/node/.openclaw/workspace/skills/bsi_students && bun src/scripts/students/mata-kuliah.ts --tanpa-absen
```

**Note:** This script requires an active session. If no session is found, run `login.ts` first.

### 3. Attendance Check-in

Used to perform attendance check-ins for the currently active course.

**Usage:**

```bash
# Using environment variable
export BSI_ABSEN_TOKEN="token_from_schedule"
cd /home/node/.openclaw/workspace/skills/bsi_students && bun src/scripts/students/absen-masuk.ts

# Or using CLI arguments
cd /home/node/.openclaw/workspace/skills/bsi_students && bun src/scripts/students/absen-masuk.ts <absenPathToken>
```

**Tip:** `absenPathToken` can be retrieved from the `mata-kuliah.ts` output under `item.absen.info.absenPathToken` or `item.absenPathToken`.

### 4. Attendance Recap

Used to view historical or today's attendance records for one or all courses.

**Usage:**

```bash
# Get ALL attendance history for a specific course
cd /home/node/.openclaw/workspace/skills/bsi_students && bun src/scripts/students/rekap-side.ts --absenPathToken 'eyJ...' --all

# Get ONLY today's attendance status for a specific course
cd /home/node/.openclaw/workspace/skills/bsi_students && bun src/scripts/students/rekap-side.ts --absenPathToken 'eyJ...' --hari-ini

# Get today's attendance status for ALL courses scheduled for today
cd /home/node/.openclaw/workspace/skills/bsi_students && bun src/scripts/students/rekap-side.ts --dari-jadwal --jadwal-hari-ini --hari-ini
```

**Response Data Structure:**

The `rekap` object follows the DataTables server-side response format:

- `draw`: Sequence number (integer).
- `recordsTotal`: Total records available.
- `recordsFiltered`: Total records after filtering.
- `data[]`: Array of objects representing each course meeting:
  - **Identity:** `id`, `kd_mtk`, `nm_mtk` (Course Name), `sks`, `kd_lokal` (Class Room Code), `detail_gabung` (Merged Classes).
  - **Schedule:** `tgl_ajar_masuk`, `hari_ajar_masuk`, `jam_masuk`, `tgl_ajar_keluar`, `jam_keluar`, `jam_t` (Time Slot).
  - **Meeting Details:** `pertemuan` (Meeting #), `no_ruang`, `berita_acara` (Meeting Topic), `rangkuman` (Meeting Summary Text), `file_ajar` (Material Filename).
  - **Lecturer:** `nip`, `kd_dosen`.
  - **Attendance:** `status_hadir` (HTML link/button, e.g., `<a ...>Hadir</a>`).

**Note:** The `--hari-ini` flag fetches full data and filters it to show only today's records.

## Environment Variables

- `BSI_USERNAME`: Student NIM for login.
- `BSI_PASSWORD`: E-learning password.
- `BSI_ABSEN_TOKEN`: Specific token for attendance check-in.

## General Workflow

1. Run `login.ts` to ensure a session is available.
2. Run `mata-kuliah.ts` to see courses available for attendance and retrieve their tokens.
3. Run `absen-masuk.ts <token>` to perform the check-in.
