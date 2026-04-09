import { fileURLToPath } from "node:url";

const POLL_SCRIPT_PATH = fileURLToPath(
  new URL("./reminder-poll.ts", import.meta.url),
);
const ENV_FILE_PATH = fileURLToPath(new URL("../../../.env", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

async function resolvePollCommand(): Promise<string[]> {
  const command = [process.execPath];

  if (await Bun.file(ENV_FILE_PATH).exists()) {
    command.push(`--env-file=${ENV_FILE_PATH}`);
  }

  command.push(POLL_SCRIPT_PATH);

  return command;
}

export default {
  async scheduled(controller: Bun.CronController) {
    const command = await resolvePollCommand();

    console.log(
      JSON.stringify(
        {
          source: "reminder-cron-worker",
          event: "scheduled_start",
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
          command: command.join(" "),
        },
        null,
        2,
      ),
    );

    const subprocess = Bun.spawn(command, {
      cwd: REPO_ROOT,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stdoutText, stderrText] = await Promise.all([
      subprocess.exited,
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
    ]);

    if (stdoutText.trim()) {
      process.stdout.write(
        stdoutText.endsWith("\n") ? stdoutText : `${stdoutText}\n`,
      );
    }

    if (stderrText.trim()) {
      process.stderr.write(
        stderrText.endsWith("\n") ? stderrText : `${stderrText}\n`,
      );
    }

    if (exitCode !== 0) {
      throw new Error(`Reminder poll exited with code ${exitCode}`);
    }
  },
};
