import { BaseCommand } from "../base-command.js";
import { shutdownDaemon } from "../lib/bridge-singleton.js";

export default class Disconnect extends BaseCommand {
  static override description =
    "Close the relay session and browser tab.";

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
      this.log("Relay session closed.");
    }
  }
}
