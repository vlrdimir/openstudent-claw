import { listReminderCrons } from "../../reminder/reminder-cron.ts";

function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

try {
  const items = await listReminderCrons();
  printJson({
    ok: true,
    action: "list",
    mode: "os-level",
    count: items.length,
    items,
  });
  process.exit(0);
} catch (error) {
  printJson({
    ok: false,
    action: "list",
    code: "runtime_error",
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}
