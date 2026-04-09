# Reminder Cron Runbook

`src/scripts/reminder/reminder-poll.ts` is a **one-shot CLI**. It checks one account, evaluates today's active classes, prints one JSON payload to stdout, then exits. This repository treats scheduling as an **OS concern**, so reminder cadence is registered through Bun's **OS-level** cron API, not through a long-running in-process daemon.

## How it works

The scheduler flow is:

1. Register a host-level cron job once with `bun src/scripts/reminder/reminder-cron-register.ts`
2. Bun stores the schedule in the host OS scheduler
3. The OS later invokes `src/scripts/reminder/reminder-cron-worker.ts`
4. The worker runs the existing one-shot poll command
5. The poll command prints its normal JSON result and exits

Because this is **OS-level cron**, you do **not** need `screen`, `tmux`, or a long-running container just to keep the scheduler alive.

## Prerequisites

- Linux host with `crontab` available in `PATH`
- Repository `.env` file present at the repo root
- Bun installed on the host where you register the cron job
- Existing DB/account/session setup if you rely on stored account and session lookup

If `crontab` is missing, registration fails early with a clear error.

## Required environment

The reminder poll is single-account and Telegram-only.

- `BSI_USERNAME` is required. The poll resolves exactly one account from this username, and the dedupe key depends on that account id.
- `TELEGRAM_BOT_TOKEN` is required for real sends.
- `TELEGRAM_CHAT_ID` is required for real sends.
- Session access must come from one of these sources:
  - `BSI_XSRF_TOKEN` and `BSI_SESSION_TOKEN`, or
  - an existing stored session for the same `BSI_USERNAME` account in the database.
- `TURSO_URL` is required because the reminder flow resolves the account from the database.

If you rely on the stored account and session path, the account plus session rows must already exist in the database.

Optional scheduler-specific environment:

- `REMINDER_CRON_SCHEDULE` — cron expression passed to `Bun.cron(...)`. Default `* * * * *`.
- `REMINDER_CRON_TITLE` — unique Bun cron title. Default `reminder-poll`.
- `REMINDER_CRON_WORKER` — override the worker module path registered with Bun. Default `src/scripts/reminder/reminder-cron-worker.ts`.

## Validate environment before scheduling

Validate the environment explicitly before running a real poll or registering cron:

```bash
bun src/scripts/reminder/reminder-env-check.ts --scope cron-register
```

Available scopes:

- `cron-register` — validate env needed to register the OS-level Bun cron and later run the real reminder poll. This is the default.
- `poll-real` — validate env needed for one real poll run.
- `poll-fake` — validate env needed for dry-run polling without real Telegram delivery.

## Register the OS-level Bun cron job

Register the reminder job once:

```bash
bun src/scripts/reminder/reminder-cron-register.ts
```

Default registration values:

- title: `reminder-poll`
- schedule: `* * * * *`

The register command validates the reminder env contract first, then ensures the repository `.env` file exists because the OS-level cron worker depends on that file when it later executes from host cron.

## List registered Bun cron jobs

On Linux, list the registered Bun cron jobs with:

```bash
bun src/scripts/reminder/reminder-cron-list.ts
```

This script parses `crontab -l` and extracts Bun's `# bun-cron:` markers.

## Remove the registered job

Remove the registered reminder cron job with:

```bash
bun src/scripts/reminder/reminder-cron-remove.ts
```

This removes the job by Bun cron title, which defaults to `reminder-poll`.

## Worker behavior

The registered worker is `src/scripts/reminder/reminder-cron-worker.ts`.

When the OS scheduler fires it, the worker launches:

```bash
bun --env-file=/absolute/path/to/.env /absolute/path/to/src/scripts/reminder/reminder-poll.ts
```

if the repository `.env` file exists. Using absolute paths keeps the run independent from cron's default working directory.

## One-shot poll command

Run a single polling cycle directly with:

```bash
bun src/scripts/reminder/reminder-poll.ts
```

This command is safe to run every minute because the poller is one-shot and reminder delivery is deduped after a successful send.

## Dry run and fixtures

Use `--dry-run` to exercise the polling flow without a real Telegram delivery:

```bash
bun src/scripts/reminder/reminder-poll.ts --dry-run
```

Use `--now <ISO8601 with timezone>` for deterministic time-based verification:

```bash
bun src/scripts/reminder/reminder-poll.ts --dry-run --now 2026-04-08T07:30:00+07:00
```

Use `--fixture <scenario>` for deterministic command-level verification without real BSI or Telegram.

Available scenarios:

- `eligible-send`
- `already-attended-skip`
- `duplicate-poll-skip`
- `invalid-config-failure`
- `send-failure-retry`

Examples:

```bash
# eligible send
bun src/scripts/reminder/reminder-poll.ts --fixture eligible-send

# already attended skip
bun src/scripts/reminder/reminder-poll.ts --fixture already-attended-skip

# duplicate poll skip across two runs
bun src/scripts/reminder/reminder-poll.ts --fixture duplicate-poll-skip --fixture-state-file /tmp/reminder-duplicate.json
bun src/scripts/reminder/reminder-poll.ts --fixture duplicate-poll-skip --fixture-state-file /tmp/reminder-duplicate.json

# invalid Telegram config failure
bun src/scripts/reminder/reminder-poll.ts --fixture invalid-config-failure

# send failure then retry
bun src/scripts/reminder/reminder-poll.ts --fixture send-failure-retry --fixture-state-file /tmp/reminder-retry.json
bun src/scripts/reminder/reminder-poll.ts --fixture send-failure-retry --fixture-state-file /tmp/reminder-retry.json
```

If both fixture mode and `--dry-run` are used, `--dry-run` still keeps the Telegram send mode fake.

## Polling rules

- Single-account scope only. The poller reads one username from `BSI_USERNAME` and does not fan out across multiple accounts.
- Telegram-only scope only. There is no other delivery channel in this CLI.
- Start-only behavior. A reminder is eligible only after the class has started.
- No end-of-class or repeated reminder stages. If the class is already finished, the item is skipped.
- Already attended items are skipped.

The per-class skip reasons in JSON include `class_not_started`, `class_finished`, `already_attended`, and `already_reminded`.

## Dedupe behavior

The dedupe contract is one reminder per `(accountId, courseNameSnapshot, courseTimeSnapshot, attendanceDateLocal)` after a delivery is marked `sent`.

That means a later poll on the same local attendance date skips the item with `already_reminded` once the earlier send has been recorded as sent.

## Failure behavior

Fatal operator errors return `ok: false` and exit non-zero. This includes missing `BSI_USERNAME`, a missing account row for that username, missing session access, invalid Telegram config, or a fatal failure while fetching today's active schedule.

Per-item failures do not abort the whole polling cycle. The run can still return `ok: true` with item entries marked `failed` in `items[]`, for example when a status check fails, Telegram send fails for one class, or reminder-delivery store updates fail for one class.

Operators should treat stdout JSON as the primary contract. The top-level `ok` and `counts` fields tell you whether the run failed fatally or completed with mixed item results.
