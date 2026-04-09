import { runSingleAccountReminderPoll } from "../../reminder/reminder-poll.ts";
import {
  buildReminderPollFixture,
  listReminderPollFixtureScenarios,
  type ReminderPollFixtureScenarioName,
} from "../../reminder/reminder-poll-fixture.ts";
import { validateReminderEnv } from "../../reminder/reminder-env.ts";

type CliParseResult =
  | {
      ok: true;
      value: {
        dryRun: boolean;
        now?: Date;
        fixture?: ReminderPollFixtureScenarioName;
        fixtureStateFile?: string;
      };
    }
  | {
      ok: false;
      error: string;
      code: "parse_error";
    };

function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

function parseIso8601(value: string): Date | null {
  const trimmed = value.trim();
  const iso8601WithOffset =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

  if (!iso8601WithOffset.test(trimmed)) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function parseArgs(argv: string[]): CliParseResult {
  let dryRun = false;
  let now: Date | undefined;
  let fixture: ReminderPollFixtureScenarioName | undefined;
  let fixtureStateFile: string | undefined;
  const knownFixtures = new Set(listReminderPollFixtureScenarios());

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--now") {
      const rawValue = argv[index + 1];
      if (!rawValue) {
        return {
          ok: false,
          code: "parse_error",
          error:
            "Butuh nilai setelah --now. Gunakan ISO8601 lengkap, mis. 2026-04-08T07:30:00+07:00.",
        };
      }

      const parsed = parseIso8601(rawValue);
      if (!parsed) {
        return {
          ok: false,
          code: "parse_error",
          error:
            "Nilai --now harus ISO8601 deterministik dengan zona waktu, mis. 2026-04-08T07:30:00+07:00 atau 2026-04-08T00:30:00Z.",
        };
      }

      now = parsed;
      index += 1;
    } else if (arg === "--fixture") {
      const rawValue = argv[index + 1]?.trim();
      if (!rawValue) {
        return {
          ok: false,
          code: "parse_error",
          error:
            "Butuh nilai setelah --fixture. Gunakan salah satu scenario fixture yang didokumentasikan.",
        };
      }

      if (!knownFixtures.has(rawValue as ReminderPollFixtureScenarioName)) {
        return {
          ok: false,
          code: "parse_error",
          error: `Fixture tidak dikenali. Pilihan valid: ${Array.from(knownFixtures).join(", ")}.`,
        };
      }

      fixture = rawValue as ReminderPollFixtureScenarioName;
      index += 1;
    } else if (arg === "--fixture-state-file") {
      const rawValue = argv[index + 1]?.trim();
      if (!rawValue) {
        return {
          ok: false,
          code: "parse_error",
          error:
            "Butuh nilai setelah --fixture-state-file. Berikan path file JSON yang bisa ditulis.",
        };
      }

      fixtureStateFile = rawValue;
      index += 1;
    } else {
      return {
        ok: false,
        code: "parse_error",
        error:
          "Argumen tidak dikenali. Gunakan hanya --dry-run, --now <ISO8601>, --fixture <scenario>, dan/atau --fixture-state-file <path>.",
      };
    }
  }

  if (fixtureStateFile && !fixture) {
    return {
      ok: false,
      code: "parse_error",
      error:
        "--fixture-state-file hanya valid jika --fixture <scenario> juga diberikan.",
    };
  }

  return {
    ok: true,
    value: {
      dryRun,
      now,
      fixture,
      fixtureStateFile,
    },
  };
}

const parsedArgs = parseArgs(Bun.argv.slice(2));

if (!parsedArgs.ok) {
  printJson({
    ok: false,
    error: parsedArgs.error,
    code: parsedArgs.code,
  });
  process.exit(1);
}

try {
  const fixture = parsedArgs.value.fixture
    ? await buildReminderPollFixture({
        scenario: parsedArgs.value.fixture,
        now: parsedArgs.value.now,
        stateFile: parsedArgs.value.fixtureStateFile,
      })
    : null;

  if (!fixture) {
    const envValidation = validateReminderEnv(
      parsedArgs.value.dryRun ? "poll-fake" : "poll-real",
      process.env,
    );

    if (!envValidation.ok) {
      printJson({
        ok: false,
        code: "env_validation_failed" as const,
        error: envValidation.error,
        fields: envValidation.fields,
      });
      process.exit(1);
    }
  }

  const result = await runSingleAccountReminderPoll({
    ...(fixture?.runInput ?? {}),
    mode: parsedArgs.value.dryRun ? "fake" : (fixture?.runInput.mode ?? "real"),
    now: parsedArgs.value.now ?? fixture?.runInput.now,
  });

  printJson(
    fixture
      ? {
          ...result,
          fixture: fixture.metadata,
        }
      : result,
  );
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  printJson({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    code: "runtime_error" as const,
  });
  process.exit(1);
}
