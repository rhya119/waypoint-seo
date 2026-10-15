import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const exec = promisify(execFile);
export function createClaudeCodeStatus() {
  let cached:
    | {
        installed: boolean;
        loggedIn: boolean;
        subscription: string | null;
        authMethod: string | null;
      }
    | undefined;
  let checked = 0;
  return async () => {
    if (cached && Date.now() - checked < 60000) return cached;
    const local = join(
      homedir(),
      ".local",
      "bin",
      process.platform === "win32" ? "claude.exe" : "claude",
    );
    const executable = existsSync(local) ? local : "claude";
    try {
      const result = await exec(executable, ["auth", "status", "--json"], {
        timeout: 5000,
        maxBuffer: 64000,
        windowsHide: true,
      });
      const data = JSON.parse(result.stdout);
      cached = {
        installed: true,
        loggedIn: data.loggedIn === true,
        subscription: ["pro", "max", "team", "enterprise"].includes(
          data.subscriptionType,
        )
          ? data.subscriptionType
          : null,
        authMethod: data.authMethod === "claude.ai" ? "claude.ai" : "other",
      };
    } catch (error) {
      cached = {
        installed: (error as { code?: string }).code !== "ENOENT",
        loggedIn: false,
        subscription: null,
        authMethod: null,
      };
    }
    checked = Date.now();
    return cached;
  };
}
