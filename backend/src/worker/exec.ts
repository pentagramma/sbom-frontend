import { execFile } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  timeoutMs: number;
  cwd?: string;
}

// Thrown when a child process is killed for exceeding its own timeout, as
// opposed to failing on its own (non-zero exit, spawn error, etc.).
export class ExecTimeoutError extends Error {}

// Runs a command as a child process with its own hard timeout, independent of
// the BullMQ job timeout. If the timeout fires, the process is killed and
// the returned promise rejects with ExecTimeoutError.
export function runCommand(
  command: string,
  args: string[],
  opts: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    let timedOut = false;

    const child = execFile(
      command,
      args,
      { cwd: opts.cwd, maxBuffer: 100 * 1024 * 1024 },
      (error, stdout, stderr) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new ExecTimeoutError(`${command} timed out after ${opts.timeoutMs}ms`));
          return;
        }
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);
  });
}
