import { removeReminderCron } from "../../reminder/reminder-cron.ts";

function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

try {
  const result = await removeReminderCron();
  printJson({
    ok: true,
    action: "removed",
    mode: "os-level",
    title: result.title,
  });
  process.exit(0);
} catch (error) {
  printJson({
    ok: false,
    action: "removed",
    code: "runtime_error",
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}
