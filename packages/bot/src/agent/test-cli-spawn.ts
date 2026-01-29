#!/usr/bin/env node
/**
 * Test script to debug Claude CLI spawning issues
 * Run this on fly.io to see why Claude CLI is failing
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';

console.log('🔍 Testing Claude CLI spawning\n');

// 1. Check environment
console.log('Environment:');
console.log(`  CWD: ${process.cwd()}`);
console.log(`  NODE_VERSION: ${process.version}`);
console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ Not set'}`);
console.log(`  PATH: ${process.env.PATH}\n`);

// 2. Check if Claude CLI exists
console.log('Checking Claude CLI:');
const claudePaths = [
  '/usr/local/bin/claude',
  '/usr/bin/claude',
  'claude'
];

for (const path of claudePaths) {
  if (existsSync(path)) {
    console.log(`  ✓ Found: ${path}`);
  }
}
console.log('');

// 3. Try to spawn Claude CLI exactly as SDK does
console.log('Spawning Claude CLI subprocess...\n');

const child = spawn('claude', ['--version'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (data) => {
  stdout += data.toString();
  console.log(`📤 stdout: ${data.toString().trim()}`);
});

child.stderr.on('data', (data) => {
  stderr += data.toString();
  console.error(`📤 stderr: ${data.toString().trim()}`);
});

child.on('error', (error) => {
  console.error(`\n❌ Spawn error: ${error.message}`);
  console.error(`   Code: ${(error as any).code}`);
  console.error(`   This usually means the command was not found`);
});

child.on('exit', (code, signal) => {
  console.log(`\n✋ Process exited`);
  console.log(`   Code: ${code}`);
  console.log(`   Signal: ${signal}`);
  console.log(`   stdout: ${stdout || '(empty)'}`);
  console.log(`   stderr: ${stderr || '(empty)'}`);

  if (code === 1) {
    console.log('\n🔍 Exit code 1 - this matches your error!');
    console.log('   But no output captured. The process failed before writing anything.');
  }

  process.exit(code || 0);
});

// Timeout after 5 seconds
setTimeout(() => {
  console.error('\n⏱️  Timeout - killing process');
  child.kill();
  process.exit(1);
}, 5000);
