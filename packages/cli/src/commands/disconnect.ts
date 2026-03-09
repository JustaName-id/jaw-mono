import { BaseCommand } from "../base-command.js";
import { shutdownDaemon } from "../lib/bridge-singleton.js";

export default class Disconnect extends BaseCommand {
  static override description =
    "Stop the background bridge daemon and close the browser session.";

  static override examples = ["<%= config.bin %> disconnect"];

  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Disconnect);

    await shutdownDaemon();

    if (flags.output === "json") {
      this.outputResult({ success: true }, "json");
    } else {
      this.log("Bridge daemon stopped.");
    }
  }
}
