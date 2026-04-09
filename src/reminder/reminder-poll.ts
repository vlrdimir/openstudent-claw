import { getAccountByUsername, type AccountRow } from "../lib/account-store.ts";
import {
  fetchAbsenStatus,
  fetchMataKuliahAktifHariIni,
  type CekAbsenStatus,
  type MataKuliahJadwalItem,
} from "../lib/elearning/jadwal/index.ts";
import {
  claimPendingReminderDelivery,
  getReminderDeliveryByDedupeKey,
  markReminderDeliveryFailed,
  markReminderDeliverySent,
  type ReminderDeliveryRow,
} from "./reminder-delivery-store.ts";
import {
  readTelegramReminderConfig,
  sendTelegramReminder,
  type TelegramReminderMode,
  type TelegramReminderSendResult,
  type TelegramReminderTransport,
} from "./telegram-reminder.ts";
import { loadStudentElearningCookies } from "../lib/utils/_session.ts";
import type { ElearningSessionCookies } from "../lib/utils/parse-elearning-cookies.ts";
import {
  formatJakartaLocalDate,
  formatJakartaLocalDateTime,
} from "../lib/utils/jakarta-time.ts";
import { isElearningSessionInvalidError } from "../lib/elearning/jadwal/session-invalid.ts";
import { bsiLogin } from "../lib/elearning/index.ts";
import type { BsiLoginFailureJson } from "../lib/elearning/login/bsi-login.ts";

type ReminderPollEnvironment = Record<string, string | undefined>;

type ReminderPollSkipReason =
  | "already_attended"
  | "already_reminded"
  | "class_finished"
  | "class_not_started"
  | "delivery_in_progress";

type ReminderPollFailureReason =
  | "delivery_lookup_failed"
  | "mark_failed_failed"
  | "mark_sent_failed"
  | "status_check_failed"
  | "telegram_api_error"
  | "telegram_config_invalid"
  | "telegram_env_missing"
  | "telegram_send_failed"
  | "upsert_pending_failed";

type ReminderPollFatalCode =
  | "account_not_found"
  | "active_schedule_fetch_failed"
  | "no_account_username"
  | "no_session"
  | "session_invalid"
  | "session_refresh_failed"
  | "telegram_config_invalid"
  | "telegram_env_missing";

type ReminderPollRefreshInfo = {
  attempted: true;
  retried: boolean;
  status: "succeeded" | "failed";
  error?: string;
  loginCode?: BsiLoginFailureJson["code"] | "missing_stored_password";
};

type ReminderPollDependencies = {
  getAccountByUsername?: typeof getAccountByUsername;
  loadStudentElearningCookies?: typeof loadStudentElearningCookies;
  fetchMataKuliahAktifHariIni?: typeof fetchMataKuliahAktifHariIni;
  fetchAbsenStatus?: typeof fetchAbsenStatus;
  bsiLogin?: typeof bsiLogin;
  getReminderDeliveryByDedupeKey?: typeof getReminderDeliveryByDedupeKey;
  claimPendingReminderDelivery?: typeof claimPendingReminderDelivery;
  markReminderDeliverySent?: typeof markReminderDeliverySent;
  markReminderDeliveryFailed?: typeof markReminderDeliveryFailed;
  sendTelegramReminder?: typeof sendTelegramReminder;
};

export type ReminderPollItemResult = {
  absenPathToken: string;
  courseName: string;
  courseTime: string;
  attendanceDateLocal: string;
  eligible: boolean;
  status: "sent" | "failed" | "skipped";
  reason: "sent" | ReminderPollSkipReason | ReminderPollFailureReason;
  check: {
    kuliahSudahDimulai: boolean | null;
    kuliahSudahSelesai: boolean | null;
    rekapSudahHadirHariIni: boolean | null;
  };
  delivery: {
    priorStatus: ReminderDeliveryRow["status"] | null;
    finalStatus: ReminderDeliveryRow["status"] | null;
  };
  telegram: {
    mode: TelegramReminderMode;
    chatId: string | null;
  };
  error: string | null;
  sendResultCode?: string;
};

export type ReminderPollSuccessResult = {
  ok: true;
  mode: TelegramReminderMode;
  now: string;
  attendanceDateLocal: string;
  account: {
    id: number;
    username: string;
  };
  counts: {
    classesToday: number;
    checked: number;
    eligible: number;
    sent: number;
    failed: number;
    skipped: number;
  };
  items: ReminderPollItemResult[];
  refresh?: ReminderPollRefreshInfo;
};

export type ReminderPollFatalResult = {
  ok: false;
  code: ReminderPollFatalCode;
  error: string;
  mode: TelegramReminderMode;
  now: string;
  attendanceDateLocal: string;
  counts: {
    classesToday: 0;
    checked: 0;
    eligible: 0;
    sent: 0;
    failed: 0;
    skipped: 0;
  };
  items: [];
  refresh?: ReminderPollRefreshInfo;
};

export type ReminderPollResult =
  | ReminderPollSuccessResult
  | ReminderPollFatalResult;

export type RunReminderPollInput = {
  now?: Date;
  mode?: TelegramReminderMode;
  env?: ReminderPollEnvironment;
  transport?: TelegramReminderTransport;
  dependencies?: ReminderPollDependencies;
};

type ProcessClassReminderInput = {
  account: AccountRow;
  attendanceDateLocal: string;
  chatId: string;
  classItem: MataKuliahJadwalItem;
  cookies: ElearningSessionCookies;
  deps: ReminderPollDependencies;
  env: ReminderPollEnvironment;
  mode: TelegramReminderMode;
  now: Date;
  transport?: TelegramReminderTransport;
};

type RunReminderPollAttemptInput = {
  account: AccountRow;
  cookies: ElearningSessionCookies;
  deps: ReminderPollDependencies;
  env: ReminderPollEnvironment;
  mode: TelegramReminderMode;
  now: Date;
  transport?: TelegramReminderTransport;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getCourseTimeSnapshot(item: MataKuliahJadwalItem): string {
  if (item.jamMulai && item.jamSelesai) {
    return `${item.jamMulai}-${item.jamSelesai}`;
  }
  return item.jadwalTeks;
}

function buildZeroCounts() {
  return {
    classesToday: 0 as const,
    checked: 0 as const,
    eligible: 0 as const,
    sent: 0 as const,
    failed: 0 as const,
    skipped: 0 as const,
  };
}

function buildFatalResult(input: {
  code: ReminderPollFatalCode;
  error: string;
  mode: TelegramReminderMode;
  now: Date;
  refresh?: ReminderPollRefreshInfo;
}): ReminderPollFatalResult {
  return {
    ok: false,
    code: input.code,
    error: input.error,
    mode: input.mode,
    now: formatJakartaLocalDateTime(input.now),
    attendanceDateLocal: formatJakartaLocalDate(input.now),
    counts: buildZeroCounts(),
    items: [],
    refresh: input.refresh,
  };
}

function applyRefreshInfo<T extends ReminderPollResult>(
  result: T,
  refresh: ReminderPollRefreshInfo,
): T {
  return {
    ...result,
    refresh,
  };
}

function buildItemBase(
  item: MataKuliahJadwalItem,
  attendanceDateLocal: string,
  mode: TelegramReminderMode,
): Omit<ReminderPollItemResult, "eligible" | "status" | "reason" | "error"> {
  return {
    absenPathToken: item.absenPathToken,
    courseName: item.nama,
    courseTime: getCourseTimeSnapshot(item),
    attendanceDateLocal,
    check: {
      kuliahSudahDimulai: null,
      kuliahSudahSelesai: null,
      rekapSudahHadirHariIni: null,
    },
    delivery: {
      priorStatus: null,
      finalStatus: null,
    },
    telegram: {
      mode,
      chatId: null,
    },
    sendResultCode: undefined,
  };
}

function applyCheck(
  result: ReminderPollItemResult,
  cek: CekAbsenStatus,
): ReminderPollItemResult {
  return {
    ...result,
    check: {
      kuliahSudahDimulai: cek.kuliahSudahDimulai,
      kuliahSudahSelesai: cek.kuliahSudahSelesai,
      rekapSudahHadirHariIni: cek.rekapSudahHadirHariIni,
    },
  };
}

function getChatIdForMode(
  mode: TelegramReminderMode,
  env: ReminderPollEnvironment,
):
  | { ok: true; chatId: string }
  | {
      ok: false;
      code: "telegram_config_invalid" | "telegram_env_missing";
      error: string;
    } {
  if (mode === "fake") {
    return {
      ok: true,
      chatId: env.TELEGRAM_CHAT_ID?.trim() || "fake-telegram-chat",
    };
  }

  const config = readTelegramReminderConfig(env);
  if (!config.ok) {
    return {
      ok: false,
      code: config.code,
      error: config.error,
    };
  }

  return {
    ok: true,
    chatId: config.value.chatId,
  };
}

function countByStatus(items: ReminderPollItemResult[]) {
  return items.reduce(
    (acc, item) => {
      acc.checked += 1;
      if (item.eligible) acc.eligible += 1;
      if (item.status === "sent") acc.sent += 1;
      else if (item.status === "failed") acc.failed += 1;
      else acc.skipped += 1;
      return acc;
    },
    {
      checked: 0,
      eligible: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    },
  );
}

async function resolveAccount(
  env: ReminderPollEnvironment,
  deps: ReminderPollDependencies,
): Promise<AccountRow | undefined> {
  const username = env.BSI_USERNAME?.trim();
  if (!username) return undefined;
  return (deps.getAccountByUsername ?? getAccountByUsername)(username);
}

function buildSendFailureItem(input: {
  item: ReminderPollItemResult;
  sendResult: Extract<TelegramReminderSendResult, { ok: false }>;
  fallbackReason: ReminderPollFailureReason;
}): ReminderPollItemResult {
  const reason = input.sendResult.code ?? input.fallbackReason;
  return {
    ...input.item,
    status: "failed",
    reason:
      reason === "telegram_api_error" ||
      reason === "telegram_config_invalid" ||
      reason === "telegram_env_missing" ||
      reason === "telegram_send_failed"
        ? reason
        : input.fallbackReason,
    error: input.sendResult.error,
    sendResultCode: input.sendResult.code,
  };
}

function buildClaimSkippedItem(input: {
  result: ReminderPollItemResult;
  deliveryRow: ReminderDeliveryRow;
}): ReminderPollItemResult {
  return {
    ...input.result,
    eligible: false,
    status: "skipped",
    reason:
      input.deliveryRow.status === "sent"
        ? "already_reminded"
        : "delivery_in_progress",
    error: null,
    delivery: {
      ...input.result.delivery,
      finalStatus: input.deliveryRow.status,
    },
  };
}

async function processClassReminder(
  input: ProcessClassReminderInput,
): Promise<ReminderPollItemResult> {
  const itemBase = buildItemBase(
    input.classItem,
    input.attendanceDateLocal,
    input.mode,
  );
  const courseTimeSnapshot = getCourseTimeSnapshot(input.classItem);
  let result: ReminderPollItemResult = {
    ...itemBase,
    eligible: false,
    status: "failed",
    reason: "status_check_failed",
    error: null,
  };

  try {
    const { cek } = await (input.deps.fetchAbsenStatus ?? fetchAbsenStatus)(
      input.cookies,
      input.classItem.absenPathToken,
      input.now,
    );
    result = applyCheck(result, cek);
  } catch (error) {
    if (isElearningSessionInvalidError(error)) {
      throw error;
    }
    return {
      ...result,
      status: "failed",
      reason: "status_check_failed",
      error: toErrorMessage(error),
    };
  }

  let existingDelivery: ReminderDeliveryRow | undefined;
  try {
    existingDelivery = await (
      input.deps.getReminderDeliveryByDedupeKey ??
      getReminderDeliveryByDedupeKey
    )({
      accountId: input.account.id,
      courseNameSnapshot: input.classItem.nama,
      courseTimeSnapshot,
      attendanceDateLocal: input.attendanceDateLocal,
    });
    result = {
      ...result,
      delivery: {
        ...result.delivery,
        priorStatus: existingDelivery?.status ?? null,
        finalStatus: existingDelivery?.status ?? null,
      },
    };
  } catch (error) {
    return {
      ...result,
      status: "failed",
      reason: "delivery_lookup_failed",
      error: toErrorMessage(error),
    };
  }

  if (!result.check.kuliahSudahDimulai) {
    return {
      ...result,
      status: "skipped",
      reason: "class_not_started",
      error: null,
    };
  }

  if (result.check.kuliahSudahSelesai) {
    return {
      ...result,
      status: "skipped",
      reason: "class_finished",
      error: null,
    };
  }

  if (result.check.rekapSudahHadirHariIni === true) {
    return {
      ...result,
      status: "skipped",
      reason: "already_attended",
      error: null,
    };
  }

  if (existingDelivery?.status === "sent") {
    return {
      ...result,
      status: "skipped",
      reason: "already_reminded",
      error: null,
    };
  }

  result = {
    ...result,
    eligible: true,
    telegram: {
      ...result.telegram,
      chatId: input.chatId,
    },
  };

  let claimResult: Awaited<ReturnType<typeof claimPendingReminderDelivery>>;
  try {
    claimResult = await (
      input.deps.claimPendingReminderDelivery ?? claimPendingReminderDelivery
    )({
      accountId: input.account.id,
      courseNameSnapshot: input.classItem.nama,
      courseTimeSnapshot,
      absenPathToken: input.classItem.absenPathToken,
      attendanceDateLocal: input.attendanceDateLocal,
      telegramChatId: input.chatId,
    });
    result = {
      ...result,
      delivery: {
        ...result.delivery,
        finalStatus: claimResult.row.status,
      },
    };
  } catch (error) {
    return {
      ...result,
      status: "failed",
      reason: "upsert_pending_failed",
      error: toErrorMessage(error),
    };
  }

  if (!claimResult.claimed) {
    return buildClaimSkippedItem({
      result,
      deliveryRow: claimResult.row,
    });
  }

  const sendResult = await (
    input.deps.sendTelegramReminder ?? sendTelegramReminder
  )({
    reminder: {
      courseName: input.classItem.nama,
      courseTime: getCourseTimeSnapshot(input.classItem),
      attendanceDateLocal: input.attendanceDateLocal,
      absenPathToken: input.classItem.absenPathToken,
    },
    mode: input.mode,
    env: input.env,
    transport: input.transport,
  });

  if (!sendResult.ok) {
    const failedItem = buildSendFailureItem({
      item: result,
      sendResult,
      fallbackReason: "telegram_send_failed",
    });

    try {
      const failedRow = await (
        input.deps.markReminderDeliveryFailed ?? markReminderDeliveryFailed
      )({
        accountId: input.account.id,
        courseNameSnapshot: input.classItem.nama,
        courseTimeSnapshot,
        attendanceDateLocal: input.attendanceDateLocal,
        lastError: sendResult.error,
      });
      return {
        ...failedItem,
        delivery: {
          ...failedItem.delivery,
          finalStatus: failedRow.status,
        },
      };
    } catch (error) {
      return {
        ...failedItem,
        reason: "mark_failed_failed",
        error: `${failedItem.error ?? sendResult.error}; mark failed: ${toErrorMessage(error)}`,
      };
    }
  }

  try {
    const sentRow = await (
      input.deps.markReminderDeliverySent ?? markReminderDeliverySent
    )({
      accountId: input.account.id,
      courseNameSnapshot: input.classItem.nama,
      courseTimeSnapshot,
      attendanceDateLocal: input.attendanceDateLocal,
    });

    if (sentRow.status !== "sent") {
      return {
        ...result,
        status: "failed",
        reason: "mark_sent_failed",
        error: `Status akhir delivery tidak valid setelah mark sent: ${sentRow.status}`,
        delivery: {
          ...result.delivery,
          finalStatus: sentRow.status,
        },
      };
    }

    return {
      ...result,
      status: "sent",
      reason: "sent",
      error: null,
      telegram: {
        ...result.telegram,
        chatId: sendResult.chatId,
      },
      delivery: {
        ...result.delivery,
        finalStatus: sentRow.status,
      },
    };
  } catch (error) {
    return {
      ...result,
      status: "failed",
      reason: "mark_sent_failed",
      error: toErrorMessage(error),
      telegram: {
        ...result.telegram,
        chatId: sendResult.chatId,
      },
    };
  }
}

async function refreshReminderSession(input: {
  account: AccountRow;
  deps: ReminderPollDependencies;
}): Promise<
  | {
      ok: true;
      cookies: ElearningSessionCookies;
    }
  | {
      ok: false;
      error: string;
      loginCode?: BsiLoginFailureJson["code"] | "missing_stored_password";
    }
> {
  const password = input.account.password.trim();
  if (!password) {
    return {
      ok: false,
      error:
        "Refresh session gagal karena password akun tidak tersedia di penyimpanan.",
      loginCode: "missing_stored_password",
    };
  }

  const loginResult = await (input.deps.bsiLogin ?? bsiLogin)({
    username: input.account.username,
    password,
  });

  if (!loginResult.ok) {
    return {
      ok: false,
      error: loginResult.error,
      loginCode: loginResult.code,
    };
  }

  return {
    ok: true,
    cookies: loginResult.cookies,
  };
}

async function runReminderPollAttempt(
  input: RunReminderPollAttemptInput,
): Promise<ReminderPollResult> {
  const chatIdResult = getChatIdForMode(input.mode, input.env);
  if (!chatIdResult.ok) {
    return buildFatalResult({
      code: chatIdResult.code,
      error: chatIdResult.error,
      mode: input.mode,
      now: input.now,
    });
  }

  let todayClasses: MataKuliahJadwalItem[];
  try {
    todayClasses = await (
      input.deps.fetchMataKuliahAktifHariIni ?? fetchMataKuliahAktifHariIni
    )(input.cookies, input.now);
  } catch (error) {
    if (isElearningSessionInvalidError(error)) {
      return buildFatalResult({
        code: "session_invalid",
        error: toErrorMessage(error),
        mode: input.mode,
        now: input.now,
      });
    }
    return buildFatalResult({
      code: "active_schedule_fetch_failed",
      error: toErrorMessage(error),
      mode: input.mode,
      now: input.now,
    });
  }

  const attendanceDateLocal = formatJakartaLocalDate(input.now);
  let items: ReminderPollItemResult[];
  try {
    items = await Promise.all(
      todayClasses.map((classItem) =>
        processClassReminder({
          account: input.account,
          attendanceDateLocal,
          chatId: chatIdResult.chatId,
          classItem,
          cookies: input.cookies,
          deps: input.deps,
          env: input.env,
          mode: input.mode,
          now: input.now,
          transport: input.transport,
        }),
      ),
    );
  } catch (error) {
    if (isElearningSessionInvalidError(error)) {
      return buildFatalResult({
        code: "session_invalid",
        error: toErrorMessage(error),
        mode: input.mode,
        now: input.now,
      });
    }
    throw error;
  }
  const counts = countByStatus(items);

  return {
    ok: true,
    mode: input.mode,
    now: formatJakartaLocalDateTime(input.now),
    attendanceDateLocal,
    account: {
      id: input.account.id,
      username: input.account.username,
    },
    counts: {
      classesToday: todayClasses.length,
      checked: counts.checked,
      eligible: counts.eligible,
      sent: counts.sent,
      failed: counts.failed,
      skipped: counts.skipped,
    },
    items,
  };
}

export async function runSingleAccountReminderPoll(
  input: RunReminderPollInput = {},
): Promise<ReminderPollResult> {
  const now = input.now ?? new Date();
  const mode = input.mode ?? "real";
  const env = input.env ?? process.env;
  const deps = input.dependencies ?? {};

  const account = await resolveAccount(env, deps);
  if (!env.BSI_USERNAME?.trim()) {
    return buildFatalResult({
      code: "no_account_username",
      error:
        "BSI_USERNAME wajib tersedia untuk reminder single-account karena dedupe key membutuhkan accountId.",
      mode,
      now,
    });
  }
  if (!account) {
    return buildFatalResult({
      code: "account_not_found",
      error: `Account tidak ditemukan untuk username ${env.BSI_USERNAME?.trim()}.`,
      mode,
      now,
    });
  }

  const cookies = await (
    deps.loadStudentElearningCookies ?? loadStudentElearningCookies
  )();
  if (!cookies) {
    return buildFatalResult({
      code: "no_session",
      error:
        "Session tidak ada. Set BSI_XSRF_TOKEN + BSI_SESSION_TOKEN, atau pastikan BSI_USERNAME punya session tersimpan.",
      mode,
      now,
    });
  }

  const firstAttempt = await runReminderPollAttempt({
    account,
    cookies,
    deps,
    env,
    mode,
    now,
    transport: input.transport,
  });
  if (firstAttempt.ok || firstAttempt.code !== "session_invalid") {
    return firstAttempt;
  }

  const refreshResult = await refreshReminderSession({
    account,
    deps,
  });
  if (!refreshResult.ok) {
    return buildFatalResult({
      code: "session_refresh_failed",
      error: `session_invalid terdeteksi lalu refresh login gagal: ${refreshResult.error}`,
      mode,
      now,
      refresh: {
        attempted: true,
        retried: false,
        status: "failed",
        error: refreshResult.error,
        loginCode: refreshResult.loginCode,
      },
    });
  }

  return applyRefreshInfo(
    await runReminderPollAttempt({
      account,
      cookies: refreshResult.cookies,
      deps,
      env,
      mode,
      now,
      transport: input.transport,
    }),
    {
      attempted: true,
      retried: true,
      status: "succeeded",
    },
  );
}

export type {
  ReminderPollDependencies,
  ReminderPollEnvironment,
  ReminderPollFatalCode,
};
