import { fileURLToPath } from "node:url";
import { validateReminderEnv } from "./reminder-env.ts";

type ReminderCronEnvironment = Record<string, string | undefined>;

type ReminderCronConfig = {
  schedule: string;
  title: string;
  workerScriptPath: string;
};

export type ReminderCronListItem = {
  title: string;
  schedule: string;
  command: string;
};

const DEFAULT_CRON_SCHEDULE = "* * * * *";
const DEFAULT_CRON_TITLE = "reminder-poll";
const WORKER_SCRIPT_PATH = fileURLToPath(
  new URL("../scripts/reminder/reminder-cron-worker.ts", import.meta.url),
);
const REMINDER_ENV_FILE_PATH = fileURLToPath(
  new URL("../../.env", import.meta.url),
);

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeCronPlatformError(error: unknown): Error {
  const message = toErrorMessage(error);

  if (message.toLowerCase().includes("crontab not found")) {
    return new Error(
      "crontab tidak ditemukan di PATH. Install cron/crontab di host Linux terlebih dulu sebelum memakai Bun.cron OS-level.",
    );
  }

  if (message.includes('Executable not found in $PATH: "crontab"')) {
    return new Error(
      "Binary crontab tidak tersedia di PATH. Listing Bun cron di Linux butuh paket cron/crontab terpasang.",
    );
  }

  return error instanceof Error ? error : new Error(message);
}

function parseCronSchedule(value: string | undefined): string {
  const schedule = value?.trim() || DEFAULT_CRON_SCHEDULE;
  const parsed = Bun.cron.parse(schedule);

  if (!parsed) {
    throw new Error(
      `Jadwal cron tidak valid atau tidak punya next run: ${schedule}`,
    );
  }

  return schedule;
}

function parseCronTitle(value: string | undefined): string {
  const title = value?.trim() || DEFAULT_CRON_TITLE;

  if (!/^[A-Za-z0-9_-]+$/.test(title)) {
    throw new Error(
      `REMINDER_CRON_TITLE hanya boleh berisi huruf, angka, underscore, atau hyphen. Diterima: ${title}`,
    );
  }

  return title;
}

export async function readReminderCronConfig(
  env: ReminderCronEnvironment = process.env,
): Promise<ReminderCronConfig> {
  return {
    schedule: parseCronSchedule(env.REMINDER_CRON_SCHEDULE),
    title: parseCronTitle(env.REMINDER_CRON_TITLE),
    workerScriptPath: env.REMINDER_CRON_WORKER?.trim() || WORKER_SCRIPT_PATH,
  };
}

async function readCrontabLines(): Promise<string[]> {
  if (process.platform !== "linux") {
    throw new Error(
      "Listing Bun cron registrations saat ini hanya diimplementasikan untuk Linux/crontab.",
    );
  }

  const subprocess = Bun.spawn(["crontab", "-l"], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  const [exitCode, stdoutText, stderrText] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);

  if (exitCode === 0) {
    return stdoutText.split(/\r?\n/);
  }

  if (exitCode === 1 && stderrText.toLowerCase().includes("no crontab")) {
    return [];
  }

  throw new Error(
    stderrText.trim() || `crontab -l gagal dengan exit code ${exitCode}`,
  );
}

export async function registerReminderCron(
  env: ReminderCronEnvironment = process.env,
): Promise<ReminderCronConfig> {
  const envValidation = validateReminderEnv("cron-register", env);
  if (!envValidation.ok) {
    throw new Error(envValidation.error);
  }

  if (!(await Bun.file(REMINDER_ENV_FILE_PATH).exists())) {
    throw new Error(
      `.env tidak ditemukan di ${REMINDER_ENV_FILE_PATH}. Worker Bun.cron OS-level membutuhkan file ini agar poll berjalan konsisten dari cron host.`,
    );
  }

  const config = await readReminderCronConfig(env);
  try {
    await Bun.cron(config.workerScriptPath, config.schedule, config.title);
  } catch (error) {
    throw normalizeCronPlatformError(error);
  }
  return config;
}

export async function removeReminderCron(
  env: ReminderCronEnvironment = process.env,
): Promise<{ title: string }> {
  const config = await readReminderCronConfig(env);
  await Bun.cron.remove(config.title);
  return { title: config.title };
}

export async function listReminderCrons(): Promise<ReminderCronListItem[]> {
  const lines = await readCrontabLines().catch((error) => {
    throw normalizeCronPlatformError(error);
  });
  const results: ReminderCronListItem[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line?.startsWith("# bun-cron:")) continue;

    const title = line.slice("# bun-cron:".length).trim();
    const command = lines[index + 1]?.trim() || "";
    const schedule = command.split(/\s+/).slice(0, 5).join(" ");

    results.push({
      title,
      schedule,
      command,
    });
  }

  return results;
}
