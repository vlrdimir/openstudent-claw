import { registerReminderCron } from "../../reminder/reminder-cron.ts";

function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

try {
  const result = await registerReminderCron();
  printJson({
    ok: true,
    action: "registered",
    mode: "os-level",
    title: result.title,
    schedule: result.schedule,
    workerScriptPath: result.workerScriptPath,
  });
  process.exit(0);
} catch (error) {
  printJson({
    ok: false,
    action: "registered",
    code: "runtime_error",
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}
