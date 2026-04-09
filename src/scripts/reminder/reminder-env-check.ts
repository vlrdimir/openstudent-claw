import { validateReminderEnv } from "../../reminder/reminder-env.ts";

type CliScope = "poll-real" | "poll-fake" | "cron-register";

function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

function parseScope(argv: string[]): CliScope | null {
  if (argv.length === 0) return "cron-register";
  if (argv.length === 2 && argv[0] === "--scope") {
    const scope = argv[1];
    if (
      scope === "poll-real" ||
      scope === "poll-fake" ||
      scope === "cron-register"
    ) {
      return scope;
    }
  }

  return null;
}

const scope = parseScope(Bun.argv.slice(2));

if (!scope) {
  printJson({
    ok: false,
    code: "parse_error",
    error:
      "Argumen tidak valid. Gunakan tanpa argumen atau --scope <poll-real|poll-fake|cron-register>.",
  });
  process.exit(1);
}

const result = validateReminderEnv(scope, process.env);

if (!result.ok) {
  printJson({
    ok: false,
    code: "env_validation_failed",
    scope,
    error: result.error,
    fields: result.fields,
  });
  process.exit(1);
}

printJson({
  ok: true,
  scope,
});
process.exit(0);
