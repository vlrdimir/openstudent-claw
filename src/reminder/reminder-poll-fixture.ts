import type { AccountRow } from "../lib/account-store.ts";
import type {
  CekAbsenStatus,
  MataKuliahJadwalItem,
} from "../lib/elearning/jadwal/index.ts";
import type {
  ClaimPendingReminderDeliveryResult,
  ReminderDeliveryRow,
  ReminderDeliveryStatus,
} from "./reminder-delivery-store.ts";
import type {
  ReminderPollDependencies,
  ReminderPollEnvironment,
  RunReminderPollInput,
} from "./reminder-poll.ts";
import type {
  TelegramReminderMode,
  TelegramReminderPayload,
  TelegramReminderSendResult,
} from "./telegram-reminder.ts";
import type { ElearningSessionCookies } from "../lib/utils/parse-elearning-cookies.ts";
import { ElearningSessionInvalidError } from "../lib/elearning/jadwal/session-invalid.ts";

export type ReminderPollFixtureScenarioName =
  | "eligible-send"
  | "already-attended-skip"
  | "duplicate-poll-skip"
  | "invalid-config-failure"
  | "session-invalid-fatal"
  | "send-failure-retry";

type ReminderPollFixtureInput = {
  scenario: ReminderPollFixtureScenarioName;
  now?: Date;
  stateFile?: string;
  env?: ReminderPollEnvironment;
};

type ReminderPollFixtureMetadata = {
  enabled: true;
  scenario: ReminderPollFixtureScenarioName;
  stateFile: string | null;
  defaultNow: string;
};

type ReminderPollFixtureBuildResult = {
  runInput: RunReminderPollInput;
  metadata: ReminderPollFixtureMetadata;
};

type FixtureDeliveryState = {
  key: string;
  accountId: number;
  absenPathToken: string;
  attendanceDateLocal: string;
  courseNameSnapshot: string;
  courseTimeSnapshot: string;
  status: ReminderDeliveryStatus;
  telegramChatId: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
};

type ReminderPollFixtureState = {
  version: 1;
  deliveries: Record<string, FixtureDeliveryState>;
  sendAttempts: Record<string, number>;
  classTokenSequence: number;
};

const DEFAULT_NOW_ISO = "2026-04-08T07:30:00+07:00";
const DEFAULT_USERNAME = "fixture.student";
const DEFAULT_CHAT_ID = "fixture-chat";
const DEFAULT_BOT_TOKEN = "fixture-bot-token";

const FIXTURE_SESSION: ElearningSessionCookies = {
  xsrfToken: "fixture-xsrf-token",
  sessionToken: "fixture-session-token",
  expiresAt: new Date("2026-04-08T23:59:59+07:00"),
};

const FIXTURE_ACCOUNT: AccountRow = {
  id: 4242,
  username: DEFAULT_USERNAME,
  password: "fixture-password",
  createdAt: new Date("2026-04-01T00:00:00+07:00"),
  updatedAt: new Date("2026-04-01T00:00:00+07:00"),
};

const FIXTURE_CLASS: MataKuliahJadwalItem = {
  nama: "Pemrograman Terstruktur",
  jadwalTeks: "Rabu - 07:00 - 08:40",
  hari: "Rabu",
  jamMulai: "07:00",
  jamSelesai: "08:40",
  kodeDosen: "D1234",
  kodeMtk: "MTK4242",
  sks: "3",
  ruang: "E-Learning",
  kelPraktek: null,
  kodeGabung: "GAB-4242",
  absenUrl: "https://elearning.bsi.ac.id/absen-mhs/fake-absen-token",
  absenPathToken: "fake-absen-token",
  urlDiskusi: null,
  urlLearning: null,
  urlAssignment: null,
};

const FIXTURE_SCENARIOS: Record<
  ReminderPollFixtureScenarioName,
  {
    mode: TelegramReminderMode;
    status: CekAbsenStatus;
    requiresStateFile: boolean;
  }
> = {
  "eligible-send": {
    mode: "fake",
    status: {
      kuliahSudahDimulai: true,
      kuliahSudahSelesai: false,
      bisaAbsenSekarang: true,
      rekapSudahHadirHariIni: false,
    },
    requiresStateFile: false,
  },
  "already-attended-skip": {
    mode: "fake",
    status: {
      kuliahSudahDimulai: true,
      kuliahSudahSelesai: false,
      bisaAbsenSekarang: false,
      rekapSudahHadirHariIni: true,
    },
    requiresStateFile: false,
  },
  "duplicate-poll-skip": {
    mode: "fake",
    status: {
      kuliahSudahDimulai: true,
      kuliahSudahSelesai: false,
      bisaAbsenSekarang: true,
      rekapSudahHadirHariIni: false,
    },
    requiresStateFile: true,
  },
  "invalid-config-failure": {
    mode: "real",
    status: {
      kuliahSudahDimulai: true,
      kuliahSudahSelesai: false,
      bisaAbsenSekarang: true,
      rekapSudahHadirHariIni: false,
    },
    requiresStateFile: false,
  },
  "session-invalid-fatal": {
    mode: "fake",
    status: {
      kuliahSudahDimulai: true,
      kuliahSudahSelesai: false,
      bisaAbsenSekarang: false,
      rekapSudahHadirHariIni: false,
    },
    requiresStateFile: false,
  },
  "send-failure-retry": {
    mode: "fake",
    status: {
      kuliahSudahDimulai: true,
      kuliahSudahSelesai: false,
      bisaAbsenSekarang: true,
      rekapSudahHadirHariIni: false,
    },
    requiresStateFile: true,
  },
};

function cloneDefaultState(): ReminderPollFixtureState {
  return {
    version: 1,
    deliveries: {},
    sendAttempts: {},
    classTokenSequence: 0,
  };
}

function dedupeKey(input: {
  accountId: number;
  courseNameSnapshot: string;
  courseTimeSnapshot: string;
  attendanceDateLocal: string;
}): string {
  return `${input.accountId}:${input.courseNameSnapshot}:${input.courseTimeSnapshot}:${input.attendanceDateLocal}`;
}

function requireScenario(
  scenario: string,
): ReminderPollFixtureScenarioName | null {
  return scenario in FIXTURE_SCENARIOS
    ? (scenario as ReminderPollFixtureScenarioName)
    : null;
}

async function readState(
  stateFile: string | undefined,
): Promise<ReminderPollFixtureState> {
  if (!stateFile) return cloneDefaultState();

  const file = Bun.file(stateFile);
  if (!(await file.exists())) {
    return cloneDefaultState();
  }

  const raw = await file.text();
  if (!raw.trim()) {
    return cloneDefaultState();
  }

  const parsed = JSON.parse(raw) as Partial<ReminderPollFixtureState>;
  return {
    version: 1,
    deliveries: parsed.deliveries ?? {},
    sendAttempts: parsed.sendAttempts ?? {},
    classTokenSequence: parsed.classTokenSequence ?? 0,
  };
}

async function writeState(
  stateFile: string | undefined,
  state: ReminderPollFixtureState,
): Promise<void> {
  if (!stateFile) return;
  await Bun.write(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function toReminderDeliveryRow(
  delivery: FixtureDeliveryState,
): ReminderDeliveryRow {
  return {
    id: 0,
    accountId: delivery.accountId,
    absenPathToken: delivery.absenPathToken,
    attendanceDateLocal: delivery.attendanceDateLocal,
    courseNameSnapshot: delivery.courseNameSnapshot,
    courseTimeSnapshot: delivery.courseTimeSnapshot,
    status: delivery.status,
    telegramChatId: delivery.telegramChatId,
    sentAt: delivery.sentAt ? new Date(delivery.sentAt) : null,
    lastError: delivery.lastError,
    createdAt: new Date(delivery.createdAt),
    updatedAt: new Date(delivery.updatedAt),
  };
}

function buildFixtureEnv(
  scenario: ReminderPollFixtureScenarioName,
  env: ReminderPollEnvironment,
): ReminderPollEnvironment {
  const merged: ReminderPollEnvironment = {
    ...env,
    BSI_USERNAME: env.BSI_USERNAME?.trim() || DEFAULT_USERNAME,
    BSI_XSRF_TOKEN: env.BSI_XSRF_TOKEN?.trim() || FIXTURE_SESSION.xsrfToken,
    BSI_SESSION_TOKEN:
      env.BSI_SESSION_TOKEN?.trim() || FIXTURE_SESSION.sessionToken,
  };

  if (scenario === "invalid-config-failure") {
    delete merged.TELEGRAM_BOT_TOKEN;
    delete merged.TELEGRAM_CHAT_ID;
    return merged;
  }

  merged.TELEGRAM_BOT_TOKEN =
    env.TELEGRAM_BOT_TOKEN?.trim() || DEFAULT_BOT_TOKEN;
  merged.TELEGRAM_CHAT_ID = env.TELEGRAM_CHAT_ID?.trim() || DEFAULT_CHAT_ID;
  return merged;
}

async function sendFixtureTelegramReminder(input: {
  scenario: ReminderPollFixtureScenarioName;
  reminder: TelegramReminderPayload;
  mode?: TelegramReminderMode;
  env: ReminderPollEnvironment;
  stateFile?: string;
}): Promise<TelegramReminderSendResult> {
  const mode = input.mode ?? FIXTURE_SCENARIOS[input.scenario].mode;
  const chatId = input.env.TELEGRAM_CHAT_ID?.trim() || DEFAULT_CHAT_ID;
  const courseTimeSnapshot = `${FIXTURE_CLASS.jamMulai}-${FIXTURE_CLASS.jamSelesai}`;

  if (input.scenario === "send-failure-retry") {
    const key = dedupeKey({
      accountId: FIXTURE_ACCOUNT.id,
      courseNameSnapshot: FIXTURE_CLASS.nama,
      courseTimeSnapshot,
      attendanceDateLocal: input.reminder.attendanceDateLocal,
    });
    const state = await readState(input.stateFile);
    const attempts = (state.sendAttempts[key] ?? 0) + 1;
    state.sendAttempts[key] = attempts;
    await writeState(input.stateFile, state);

    if (attempts === 1) {
      return {
        ok: false,
        mode,
        text: `fixture send failure attempt ${attempts}`,
        code: "telegram_send_failed",
        error: "Fixture forced Telegram send failure on first attempt",
        status: 503,
        response: {
          ok: false,
          source: "fixture",
          attempt: attempts,
        },
      };
    }
  }

  return {
    ok: true,
    mode,
    chatId,
    text: `fixture send success for ${input.reminder.courseName}`,
    response: {
      ok: true,
      source: "fixture",
      scenario: input.scenario,
    },
  };
}

function buildClaimResult(
  row: ReminderDeliveryRow,
  claimed: boolean,
): ClaimPendingReminderDeliveryResult {
  return {
    row,
    claimed,
  };
}

function buildFixtureDependencies(input: {
  scenario: ReminderPollFixtureScenarioName;
  stateFile?: string;
  env: ReminderPollEnvironment;
}): ReminderPollDependencies {
  const { scenario, stateFile, env } = input;
  const scenarioConfig = FIXTURE_SCENARIOS[scenario];
  let memoryState = cloneDefaultState();

  async function getState(): Promise<ReminderPollFixtureState> {
    if (!stateFile) {
      return memoryState;
    }
    return readState(stateFile);
  }

  async function saveState(state: ReminderPollFixtureState): Promise<void> {
    if (!stateFile) {
      memoryState = state;
      return;
    }
    await writeState(stateFile, state);
  }

  async function getStoredDelivery(key: string) {
    const state = await getState();
    const delivery = state.deliveries[key];
    return delivery ? toReminderDeliveryRow(delivery) : undefined;
  }

  async function saveDelivery(next: FixtureDeliveryState) {
    const state = await getState();
    state.deliveries[next.key] = next;
    await saveState(state);
    return toReminderDeliveryRow(next);
  }

  return {
    getAccountByUsername: async (username) => {
      if (username !== (env.BSI_USERNAME?.trim() || DEFAULT_USERNAME)) {
        return undefined;
      }
      return {
        ...FIXTURE_ACCOUNT,
        username,
      };
    },
    loadStudentElearningCookies: async () => FIXTURE_SESSION,
    fetchMataKuliahAktifHariIni: async () => {
      if (scenario === "session-invalid-fatal") {
        throw new ElearningSessionInvalidError(
          "fetch jadwal (/sch): session e-learning tidak valid atau sudah kedaluwarsa (halaman login terdeteksi).",
        );
      }

      if (
        scenario === "duplicate-poll-skip" ||
        scenario === "send-failure-retry"
      ) {
        const state = await getState();
        state.classTokenSequence += 1;
        await saveState(state);
        const nextToken = `fake-absen-token-${state.classTokenSequence}`;

        return [
          {
            ...FIXTURE_CLASS,
            absenPathToken: nextToken,
            absenUrl: `https://elearning.bsi.ac.id/absen-mhs/${nextToken}`,
          },
        ];
      }

      return [FIXTURE_CLASS];
    },
    fetchAbsenStatus: async () => ({
      info: {
        csrfToken: null,
        absenPathToken: FIXTURE_CLASS.absenPathToken,
        kuliahBelumDimulai: !scenarioConfig.status.kuliahSudahDimulai,
        kuliahSudahSelesai: scenarioConfig.status.kuliahSudahSelesai,
        bisaAbsenMasuk: scenarioConfig.status.bisaAbsenSekarang,
        formAbsenMasuk: scenarioConfig.status.bisaAbsenSekarang
          ? {
              pertemuan: "1",
              id: "fixture-form-id",
            }
          : null,
        sudahAbsenMasuk: scenarioConfig.status.rekapSudahHadirHariIni === true,
        tiles: {},
      },
      cek: scenarioConfig.status,
    }),
    getReminderDeliveryByDedupeKey: async (inputKey) => {
      const key = dedupeKey(inputKey);
      return getStoredDelivery(key);
    },
    claimPendingReminderDelivery: async (payload) => {
      const key = dedupeKey(payload);
      const existing = await getStoredDelivery(key);
      const now = new Date().toISOString();

      if (!existing) {
        const row = await saveDelivery({
          key,
          accountId: payload.accountId,
          absenPathToken: payload.absenPathToken,
          attendanceDateLocal: payload.attendanceDateLocal,
          courseNameSnapshot: payload.courseNameSnapshot,
          courseTimeSnapshot: payload.courseTimeSnapshot,
          status: "pending",
          telegramChatId: payload.telegramChatId,
          lastError: null,
          createdAt: now,
          updatedAt: now,
          sentAt: null,
        });
        return buildClaimResult(row, true);
      }

      if (existing.status === "failed") {
        const row = await saveDelivery({
          key,
          accountId: existing.accountId,
          absenPathToken: existing.absenPathToken,
          attendanceDateLocal: existing.attendanceDateLocal,
          courseNameSnapshot: payload.courseNameSnapshot,
          courseTimeSnapshot: payload.courseTimeSnapshot,
          status: "pending",
          telegramChatId: payload.telegramChatId,
          lastError: null,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: now,
          sentAt: null,
        });
        return buildClaimResult(row, true);
      }

      return buildClaimResult(existing, false);
    },
    markReminderDeliveryFailed: async (payload) => {
      const key = dedupeKey(payload);
      const existing = await getStoredDelivery(key);
      if (!existing) {
        throw new Error("fixture markReminderDeliveryFailed: row not found");
      }
      if (existing.status !== "pending") {
        return existing;
      }

      const now = new Date().toISOString();
      return saveDelivery({
        key,
        accountId: existing.accountId,
        absenPathToken: existing.absenPathToken,
        attendanceDateLocal: existing.attendanceDateLocal,
        courseNameSnapshot: existing.courseNameSnapshot,
        courseTimeSnapshot: existing.courseTimeSnapshot,
        status: "failed",
        telegramChatId: existing.telegramChatId,
        lastError: payload.lastError,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: now,
        sentAt: existing.sentAt ? existing.sentAt.toISOString() : null,
      });
    },
    markReminderDeliverySent: async (payload) => {
      const key = dedupeKey(payload);
      const existing = await getStoredDelivery(key);
      if (!existing) {
        throw new Error("fixture markReminderDeliverySent: row not found");
      }
      if (existing.status !== "pending") {
        return existing;
      }

      const now = new Date().toISOString();
      return saveDelivery({
        key,
        accountId: existing.accountId,
        absenPathToken: existing.absenPathToken,
        attendanceDateLocal: existing.attendanceDateLocal,
        courseNameSnapshot: existing.courseNameSnapshot,
        courseTimeSnapshot: existing.courseTimeSnapshot,
        status: "sent",
        telegramChatId: existing.telegramChatId,
        lastError: null,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: now,
        sentAt: payload.sentAt?.toISOString() ?? now,
      });
    },
    sendTelegramReminder: async ({ reminder, mode }) =>
      sendFixtureTelegramReminder({
        scenario,
        reminder,
        mode,
        env,
        stateFile,
      }),
  };
}

export async function buildReminderPollFixture(
  input: ReminderPollFixtureInput,
): Promise<ReminderPollFixtureBuildResult> {
  const scenarioConfig = FIXTURE_SCENARIOS[input.scenario];
  if (!scenarioConfig) {
    throw new Error(`Fixture scenario tidak dikenali: ${input.scenario}`);
  }

  if (scenarioConfig.requiresStateFile && !input.stateFile) {
    throw new Error(
      `Fixture ${input.scenario} membutuhkan --fixture-state-file agar dedupe/retry bisa diverifikasi lintas command.`,
    );
  }

  const env = buildFixtureEnv(input.scenario, input.env ?? {});
  const now = input.now ?? new Date(DEFAULT_NOW_ISO);

  return {
    runInput: {
      now,
      mode: scenarioConfig.mode,
      env,
      dependencies: buildFixtureDependencies({
        scenario: input.scenario,
        stateFile: input.stateFile,
        env,
      }),
    },
    metadata: {
      enabled: true,
      scenario: input.scenario,
      stateFile: input.stateFile ?? null,
      defaultNow: DEFAULT_NOW_ISO,
    },
  };
}

export function listReminderPollFixtureScenarios(): ReminderPollFixtureScenarioName[] {
  return Object.keys(FIXTURE_SCENARIOS)
    .map((scenario) => requireScenario(scenario))
    .filter((scenario): scenario is ReminderPollFixtureScenarioName =>
      Boolean(scenario),
    );
}
