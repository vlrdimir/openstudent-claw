import { z } from "zod";

type ReminderEnvSource = Record<string, string | undefined>;

type ReminderEnvValidationScope = "poll-real" | "poll-fake" | "cron-register";

type ReminderEnvValidationSuccess<T> = {
  ok: true;
  value: T;
};

type ReminderEnvValidationFailure = {
  ok: false;
  error: string;
  fields: Record<string, string[]>;
};

export type ReminderEnvValidationResult<T> =
  | ReminderEnvValidationSuccess<T>
  | ReminderEnvValidationFailure;

const emptyStringToUndefined = (value: unknown): unknown => {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const optionalTrimmedString = z.preprocess(
  emptyStringToUndefined,
  z.string().optional(),
);

const reminderEnvBaseSchema = z
  .object({
    BSI_USERNAME: optionalTrimmedString,
    BSI_XSRF_TOKEN: optionalTrimmedString,
    BSI_SESSION_TOKEN: optionalTrimmedString,
    TELEGRAM_BOT_TOKEN: optionalTrimmedString,
    TELEGRAM_CHAT_ID: optionalTrimmedString,
    TURSO_URL: optionalTrimmedString,
    TURSO_TOKEN: optionalTrimmedString,
    REMINDER_CRON_SCHEDULE: optionalTrimmedString,
    REMINDER_CRON_TITLE: optionalTrimmedString,
    REMINDER_CRON_WORKER: optionalTrimmedString,
  })
  .superRefine((env, ctx) => {
    const hasXsrf = Boolean(env.BSI_XSRF_TOKEN);
    const hasSession = Boolean(env.BSI_SESSION_TOKEN);

    if (hasXsrf !== hasSession) {
      if (!hasXsrf) {
        ctx.addIssue({
          code: "custom",
          path: ["BSI_XSRF_TOKEN"],
          message:
            "BSI_XSRF_TOKEN wajib ikut diisi jika BSI_SESSION_TOKEN dipakai.",
        });
      }

      if (!hasSession) {
        ctx.addIssue({
          code: "custom",
          path: ["BSI_SESSION_TOKEN"],
          message:
            "BSI_SESSION_TOKEN wajib ikut diisi jika BSI_XSRF_TOKEN dipakai.",
        });
      }
    }
  });

type ReminderEnvBase = z.infer<typeof reminderEnvBaseSchema>;

function requireField(
  env: ReminderEnvBase,
  ctx: z.RefinementCtx,
  key: keyof ReminderEnvBase,
  message: string,
): void {
  if (!env[key]) {
    ctx.addIssue({
      code: "custom",
      path: [key],
      message,
    });
  }
}

const reminderPollFakeSchema = reminderEnvBaseSchema.superRefine((env, ctx) => {
  requireField(
    env,
    ctx,
    "BSI_USERNAME",
    "BSI_USERNAME wajib tersedia untuk reminder poll single-account.",
  );
  requireField(
    env,
    ctx,
    "TURSO_URL",
    "TURSO_URL wajib tersedia karena reminder poll selalu resolve account dari database.",
  );
});

const reminderPollRealSchema = reminderPollFakeSchema.superRefine(
  (env, ctx) => {
    requireField(
      env,
      ctx,
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_BOT_TOKEN wajib tersedia untuk reminder mode real.",
    );
    requireField(
      env,
      ctx,
      "TELEGRAM_CHAT_ID",
      "TELEGRAM_CHAT_ID wajib tersedia untuk reminder mode real.",
    );
  },
);

const reminderCronRegisterSchema = reminderPollRealSchema.superRefine(
  (env, ctx) => {
    if (
      env.REMINDER_CRON_TITLE &&
      !/^[A-Za-z0-9_-]+$/.test(env.REMINDER_CRON_TITLE)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["REMINDER_CRON_TITLE"],
        message:
          "REMINDER_CRON_TITLE hanya boleh berisi huruf, angka, underscore, atau hyphen.",
      });
    }

    if (
      env.REMINDER_CRON_SCHEDULE &&
      !Bun.cron.parse(env.REMINDER_CRON_SCHEDULE)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["REMINDER_CRON_SCHEDULE"],
        message:
          "REMINDER_CRON_SCHEDULE tidak valid atau tidak punya jadwal jalan berikutnya.",
      });
    }
  },
);

function formatZodFailure(error: z.ZodError): ReminderEnvValidationFailure {
  const flattened = z.flattenError(error);
  const fields: Record<string, string[]> = {};

  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) {
      fields[field] = messages;
    }
  }

  const lines = [
    "Environment reminder tidak valid.",
    ...flattened.formErrors,
    ...Object.entries(fields).flatMap(([field, messages]) =>
      messages.map((message) => `${field}: ${message}`),
    ),
  ];

  return {
    ok: false,
    error: lines.join(" "),
    fields,
  };
}

export function validateReminderEnv(
  scope: ReminderEnvValidationScope,
  env: ReminderEnvSource = process.env,
): ReminderEnvValidationResult<ReminderEnvBase> {
  const schema =
    scope === "poll-real"
      ? reminderPollRealSchema
      : scope === "poll-fake"
        ? reminderPollFakeSchema
        : reminderCronRegisterSchema;

  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    return formatZodFailure(parsed.error);
  }

  return {
    ok: true,
    value: parsed.data,
  };
}
