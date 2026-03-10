import * as fs from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpError } from "../helpers.js";
import { shutdownDaemon } from "../../lib/bridge-singleton.js";
import { closeCachedBridge, isBridgeCached } from "./rpc.js";
import { PATHS } from "../../lib/paths.js";
import { loadConfig, redactConfig } from "../../lib/config.js";

export function registerDaemonTools(server: McpServer): void {
  server.tool(
    "jaw_status",
    "Check the current status of the JAW.id bridge — whether the daemon is running, " +
      "the bridge connection is active, and what configuration is in use.",
    {},
    async () => {
      try {
        let daemonRunning = false;
        let daemonPid: number | null = null;

        try {
          if (fs.existsSync(PATHS.bridge)) {
            const info = JSON.parse(fs.readFileSync(PATHS.bridge, "utf-8"));
            daemonPid = info.pid;
            // Check if process is alive
            process.kill(info.pid, 0);
            daemonRunning = true;
          }
        } catch {
          daemonRunning = false;
        }

        const config = redactConfig(loadConfig());

        const status = {
          daemon: daemonRunning
            ? { running: true, pid: daemonPid }
            : { running: false },
          bridgeConnection: isBridgeCached() ? "connected" : "disconnected",
          config,
        };

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(status, null, 2) },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    },
  );

  server.tool(
    "jaw_disconnect",
    "Stop the background bridge daemon and close the browser session. " +
      "Call this when you are done making wallet requests to clean up resources.",
    {},
    async () => {
      try {
        closeCachedBridge();
        await shutdownDaemon();
        return {
          content: [
            {
              type: "text" as const,
              text: "Bridge daemon stopped and browser session closed.",
            },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    },
  );
}