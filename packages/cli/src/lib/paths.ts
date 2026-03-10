import * as path from "node:path";
import * as os from "node:os";

const JAW_DIR = path.join(os.homedir(), ".jaw");

export const PATHS = {
  root: JAW_DIR,
  config: path.join(JAW_DIR, "config.json"),
  session: path.join(JAW_DIR, "session.json"),
  bridge: path.join(JAW_DIR, "bridge.json"),
  daemonLog: path.join(JAW_DIR, "daemon.log"),
} as const;
