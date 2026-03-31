import { bsiLogin } from "../../lib/elearning/index.ts";

const username = process.env.BSI_USERNAME ?? Bun.argv[2] ?? "";
const password = process.env.BSI_PASSWORD ?? Bun.argv[3] ?? "";

if (!username || !password) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        error:
          "Set BSI_USERNAME dan BSI_PASSWORD di .env atau: bun src/scripts/students/login.ts <username> <password>",
        code: "parse_error" as const,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const result = await bsiLogin({ username, password });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
