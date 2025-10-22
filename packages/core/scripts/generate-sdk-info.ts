#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// This script is run from the package root
const packageJsonPath = join(process.cwd(), 'package.json');
const sdkInfoPath = join(process.cwd(), 'src', 'sdk-info.ts');

try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

  const content = `// This file is auto-generated. Do not edit manually.
// Run 'npm run generate-sdk-info' to regenerate.

export const SDK_VERSION = '${packageJson.version}';
export const SDK_NAME = '${packageJson.name}';
`;

  writeFileSync(sdkInfoPath, content, 'utf-8');
  console.log('✓ sdk-info.ts generated successfully');
} catch (error) {
  console.error('Failed to generate sdk-info.ts:', error);
  process.exit(1);
}