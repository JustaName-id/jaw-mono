import { BaseCommand } from '../base-command.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

export default class Version extends BaseCommand {
  static override description = 'Show the CLI version';
  static override aliases = ['-v'];
  static override flags = {};

  async run(): Promise<void> {
    this.log(`@jaw.id/cli/${pkg.version}`);
  }
}
