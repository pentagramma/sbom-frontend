const { spawn } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { loadEnvConfig } = require("@next/env");

const projectDir = process.cwd();
const command = process.argv[2];
const forwardedArgs = process.argv.slice(3);
const nextBinary = require.resolve("next/dist/bin/next");

loadEnvConfig(projectDir);

function readPortFromDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  const contents = readFileSync(filePath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const match = trimmedLine.match(/^PORT\s*=\s*(.*)$/);

    if (!match) {
      continue;
    }

    let value = match[1].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    return value;
  }

  return null;
}

const port = readPortFromDotEnv(path.join(projectDir, ".env")) ?? process.env.PORT ?? "3000";

const child = spawn(process.execPath, [nextBinary, command, "-p", port, ...forwardedArgs], {
  env: {
    ...process.env,
    PORT: port
  },
  stdio: "inherit"
});

child.on("exit", (exitCode) => {
  process.exit(exitCode ?? 0);
});
