#!/usr/bin/env node
import { copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Copy root README.md to bot package for npm publishing
const rootReadme = resolve(__dirname, '../../../README.md');
const packageReadme = resolve(__dirname, '../README.md');

try {
  copyFileSync(rootReadme, packageReadme);
  console.log('✓ Copied root README.md to package');
} catch (error) {
  console.error('✗ Failed to copy README.md:', error.message);
  process.exit(1);
}
