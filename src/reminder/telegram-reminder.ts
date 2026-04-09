export type TelegramReminderPayload = {
  courseName: string;
  courseTime: string;
  attendanceDateLocal: string;
  absenPathToken: string;
};

export type TelegramReminderConfig = {
  botToken: string;
  chatId: string;
};

export type TelegramReminderConfigErrorCode =
  | "telegram_config_invalid"
  | "telegram_env_missing";

export type TelegramReminderConfigResult =
  | {
      ok: true;
      value: TelegramReminderConfig;
    }
  | {
      ok: false;
      error: string;
      code: TelegramReminderConfigErrorCode;
      missing: ("TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHAT_ID")[];
    };

export type TelegramReminderMode = "real" | "fake";

export type TelegramReminderSendResult =
  | {
      ok: true;
      mode: TelegramReminderMode;
      chatId: string;
      text: string;
      response: unknown;
    }
  | ({
      ok: false;
      mode: TelegramReminderMode;
      text: string;
    } & (
      | {
          code: TelegramReminderConfigErrorCode;
          error: string;
          missing: ("TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHAT_ID")[];
        }
      | {
          code: "telegram_send_failed" | "telegram_api_error";
          error: string;
          status?: number;
          response?: unknown;
        }
    ));

export type TelegramReminderTransportRequest = {
  url: string;
  body: URLSearchParams;
};

export type TelegramReminderTransportResponse = {
  ok: boolean;
  status: number;
  json: unknown;
};

export type TelegramReminderTransport = (
  request: TelegramReminderTransportRequest,
) => Promise<TelegramReminderTransportResponse>;

const TELEGRAM_PARSE_MODE = "HTML";
const FAKE_CHAT_ID = "fake-telegram-chat";

function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatTelegramReminderMessage(
  payload: TelegramReminderPayload,
): string {
  return [
    "<b>Reminder absen masuk</b>",
    "Status: absen masuk <b>sudah dimulai</b>.",
    "Pengingat: kamu <b>belum tercatat hadir</b> untuk sesi ini.",
    `Mata kuliah: <b>${escapeTelegramHtml(payload.courseName)}</b>`,
    `Jam: <code>${escapeTelegramHtml(payload.courseTime)}</code>`,
    `Tanggal: <code>${escapeTelegramHtml(payload.attendanceDateLocal)}</code>`,
    `Absen token: <code>${escapeTelegramHtml(payload.absenPathToken)}</code>`,
  ].join("\n");
}

export function readTelegramReminderConfig(
  env: Record<string, string | undefined> = process.env,
): TelegramReminderConfigResult {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  const missing: ("TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHAT_ID")[] = [];

  if (!botToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!chatId) missing.push("TELEGRAM_CHAT_ID");

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Telegram config tidak lengkap: ${missing.join(", ")}`,
      code:
        missing.length === 2
          ? "telegram_config_invalid"
          : "telegram_env_missing",
      missing,
    };
  }

  return {
    ok: true,
    value: {
      botToken: botToken as string,
      chatId: chatId as string,
    },
  };
}

async function defaultTelegramReminderTransport(
  request: TelegramReminderTransportRequest,
): Promise<TelegramReminderTransportResponse> {
  const response = await fetch(request.url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: request.body,
  });

  const json = (await response.json().catch(() => null)) as unknown;

  return {
    ok: response.ok,
    status: response.status,
    json,
  };
}

export async function sendTelegramReminder(input: {
  reminder: TelegramReminderPayload;
  mode?: TelegramReminderMode;
  env?: Record<string, string | undefined>;
  transport?: TelegramReminderTransport;
}): Promise<TelegramReminderSendResult> {
  const mode = input.mode ?? "real";
  const text = formatTelegramReminderMessage(input.reminder);

  if (mode === "fake") {
    return {
      ok: true,
      mode,
      chatId: input.env?.TELEGRAM_CHAT_ID?.trim() || FAKE_CHAT_ID,
      text,
      response: {
        ok: true,
        result: {
          mode: "fake",
          delivered: false,
        },
      },
    };
  }

  const config = readTelegramReminderConfig(input.env);
  if (!config.ok) {
    return {
      ok: false,
      mode,
      text,
      error: config.error,
      code: config.code,
      missing: config.missing,
    };
  }

  const transport = input.transport ?? defaultTelegramReminderTransport;
  const url = `https://api.telegram.org/bot${config.value.botToken}/sendMessage`;
  const body = new URLSearchParams({
    chat_id: config.value.chatId,
    text,
    parse_mode: TELEGRAM_PARSE_MODE,
    disable_web_page_preview: "true",
  });

  try {
    const response = await transport({ url, body });

    if (!response.ok) {
      return {
        ok: false,
        mode,
        text,
        code: "telegram_send_failed",
        error: `Telegram sendMessage gagal dengan HTTP ${response.status}`,
        status: response.status,
        response: response.json,
      };
    }

    const apiOk =
      typeof response.json === "object" &&
      response.json !== null &&
      "ok" in response.json &&
      response.json.ok === true;

    if (!apiOk) {
      return {
        ok: false,
        mode,
        text,
        code: "telegram_api_error",
        error: "Telegram sendMessage mengembalikan ok=false",
        status: response.status,
        response: response.json,
      };
    }

    return {
      ok: true,
      mode,
      chatId: config.value.chatId,
      text,
      response: response.json,
    };
  } catch (error) {
    return {
      ok: false,
      mode,
      text,
      code: "telegram_send_failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
