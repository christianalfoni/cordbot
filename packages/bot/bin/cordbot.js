#!/usr/bin/env node

// This file is the entry point for the CLI command
// It simply imports and runs the CLI module
import('../dist/cli.js').then(module => {
  module.run();
}).catch(err => {
  console.error('Failed to start cordbot:', err);
  process.exit(1);
});
