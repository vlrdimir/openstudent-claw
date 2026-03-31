# openstudent-claw

This repository contains the BSI Student automation logic and is designed to run as a managed skill within the OpenClaw framework.

## Quick Start (Docker)

The project uses Docker to provide a consistent environment with OpenClaw and Bun pre-installed.

### 1. Configure Environment

Create or update your Turso database credentials in a `.env` file (or pass them directly to compose):

```bash
TURSO_URL=libsql://your-db.turso.io
TURSO_TOKEN=your-token
```

### 2. Start the Gateway

Launch the OpenClaw gateway using Docker Compose. The repository is mounted as a volume, and the `bsi_students` skill is automatically mirrored into the OpenClaw workspace at startup.

```bash
docker compose up -d
```

**Gateway Mode Fix:** If startup logs show `gateway.mode=local (current: unset)` and the gateway fails to start, run:

```bash
docker exec -it openstudent-claw-openclaw openclaw config set gateway.mode local
```

**Note:** If you modify the startup script in `docker/openclaw-entrypoint.sh`, you must rebuild the image to apply changes:

```bash
docker compose up -d --build --force-recreate openclaw
```

### 3. Authenticate with OpenAI Codex

This setup uses OpenAI Codex for model operations. Authenticate using the OAuth flow:

```bash
docker exec -it openstudent-claw-openclaw openclaw models auth login --provider openai-codex
```

Follow the interactive prompts to complete the browser-based authentication.

If `openclaw models status` still shows a different default model (like Anthropic), set Codex as the default:

```bash
docker exec -it openstudent-claw-openclaw openclaw models set openai-codex/gpt-5.4
```

### 4. Verify Setup

Check the status of your models and skills:

```bash
# Check model connectivity
docker exec -it openstudent-claw-openclaw openclaw models status

# List available skills (verify 'bsi_students' is present)
docker exec -it openstudent-claw-openclaw openclaw skills list
```

## Repository Structure

- `src/lib/`: Core logic for BSI integration, parsing, and database access.
- `src/scripts/students/`: CLI entry points for student-specific tasks (login, schedule, etc.).
- `SKILL.md`: Definition for the `bsi_students` OpenClaw skill.
- `.agents/skills/`: Additional specialized skills available to the agent.
- `docker/`: Container configuration and entrypoint logic.

## Skill Integration

At container startup, the entrypoint script mirrors the repository into the OpenClaw workspace at `/home/node/.openclaw/workspace/skills/bsi_students`. It automatically runs `bun install` within that mirrored directory to ensure all dependencies are ready for use by the agent.

## Telegram Bot Setup

To use the Telegram channel, add it via the OpenClaw CLI. This stores the configuration in the persistent OpenClaw volume:

```bash
docker compose run --rm openclaw openclaw channels add --channel telegram --token "<TELEGRAM_BOT_TOKEN>"
```

### 2. Pair with the Bot

After adding the channel, message your bot on Telegram. OpenClaw will generate a pairing code and wait for approval. To approve the connection, run:

```bash
docker exec -it openstudent-claw-openclaw openclaw pairing approve telegram <PAIRING_CODE>
```

Example: `docker exec -it openstudent-claw-openclaw openclaw pairing approve telegram xxxx`

### 3. Verify Telegram Setup

After adding and pairing the channel, verify that it's correctly configured and active:

```bash
# List all channels to see the Telegram entry
docker exec -it openstudent-claw-openclaw openclaw channels list

# Check the status of the Telegram channel
docker exec -it openstudent-claw-openclaw openclaw channels status --channel telegram --probe

# View logs to ensure there are no connection errors
docker exec -it openstudent-claw-openclaw openclaw channels logs --channel telegram
```
