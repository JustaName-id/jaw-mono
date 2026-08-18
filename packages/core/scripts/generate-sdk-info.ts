#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// This script is run from the package root
const packageJsonPath = join(process.cwd(), 'package.json');
const sdkInfoPath = join(process.cwd(), 'src', 'sdk-info.ts');

try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

  // The `: string` annotations are load-bearing. Without them TypeScript infers
  // the string literal type, the version ends up inside the api-extractor
  // report, and every `chore(release): publish` bumps it without regenerating
  // the report. Since the release commit skips CI, that lands red on the next
  // unrelated PR that makes core affected.
  const content = `// This file is auto-generated. Do not edit manually.
// Run 'npm run generate-sdk-info' to regenerate.

/* eslint-disable @typescript-eslint/no-inferrable-types -- the annotations are
   load-bearing, see scripts/generate-sdk-info.ts */
export const SDK_VERSION: string = '${packageJson.version}';
export const SDK_NAME: string = '${packageJson.name}';
`;

  writeFileSync(sdkInfoPath, content, 'utf-8');
  console.log('✓ sdk-info.ts generated successfully');
} catch (error) {
  console.error('Failed to generate sdk-info.ts:', error);
  process.exit(1);
}
