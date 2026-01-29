import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface InitResult {
  claudeDir: string;
  configPath: string;
  storageDir: string;
  sessionsDir: string;
  isFirstRun: boolean;
}

export function initializeClaudeFolder(cwd: string): InitResult {
  const claudeDir = path.join(cwd, '.claude');
  const configPath = path.join(claudeDir, 'config.json');
  const storageDir = path.join(claudeDir, 'storage');
  const sessionsDir = path.join(claudeDir, 'sessions');

  const isFirstRun = !fs.existsSync(claudeDir);

  // Create .claude directory if it doesn't exist
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    console.log('📁 Created .claude directory');
  }

  // Create storage directory (for session mappings)
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
    console.log('📁 Created storage directory');
  }

  // Create sessions directory
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
    console.log('📁 Created sessions directory');
  }

  // Initialize config.json if it doesn't exist
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      version: '1.0.0',
      created: new Date().toISOString(),
      lastStarted: new Date().toISOString(),
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    console.log('⚙️  Created config.json');
  } else {
    // Update lastStarted
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.lastStarted = new Date().toISOString();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  // Create root CLAUDE.md if it doesn't exist
  ensureRootClaudeMd(cwd);

  return {
    claudeDir,
    configPath,
    storageDir,
    sessionsDir,
    isFirstRun,
  };
}

function ensureRootClaudeMd(cwd: string): void {
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');

  if (!fs.existsSync(claudeMdPath)) {
    const templatePath = path.join(__dirname, '..', 'templates', 'root-CLAUDE.md.template');
    let template = fs.readFileSync(templatePath, 'utf-8');

    // Replace placeholders
    template = template.replace(/{{WORKING_DIRECTORY}}/g, cwd);

    fs.writeFileSync(claudeMdPath, template, 'utf-8');
    console.log('📄 Created root CLAUDE.md with Discord bot instructions');
  }
}
