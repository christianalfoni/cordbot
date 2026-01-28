import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface InitResult {
  claudeDir: string;
  configPath: string;
  dbPath: string;
  sessionsDir: string;
  isFirstRun: boolean;
}

export function initializeClaudeFolder(cwd: string): InitResult {
  const claudeDir = path.join(cwd, '.claude');
  const configPath = path.join(claudeDir, 'config.json');
  const dbPath = path.join(claudeDir, 'mappings.db');
  const sessionsDir = path.join(claudeDir, 'sessions');

  const isFirstRun = !fs.existsSync(claudeDir);

  // Create .claude directory if it doesn't exist
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    console.log('📁 Created .claude directory');
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

  // Initialize SQLite database
  initializeDatabase(dbPath);

  // Create root CLAUDE.md if it doesn't exist
  ensureRootClaudeMd(cwd);

  return {
    claudeDir,
    configPath,
    dbPath,
    sessionsDir,
    isFirstRun,
  };
}

function initializeDatabase(dbPath: string): void {
  const db = new Database(dbPath);

  // Create session_mappings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_mappings (
      discord_thread_id TEXT PRIMARY KEY,
      discord_channel_id TEXT NOT NULL,
      discord_message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      working_directory TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'archived'))
    );

    CREATE INDEX IF NOT EXISTS idx_session_id ON session_mappings(session_id);
    CREATE INDEX IF NOT EXISTS idx_channel_id ON session_mappings(discord_channel_id);
  `);

  db.close();

  console.log('🗄️  Initialized database');
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
