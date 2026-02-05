import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '..', 'src', 'tools', 'discord');
const distDir = path.join(__dirname, '..', 'dist', 'tools', 'discord');

// Ensure the destination directory exists
fs.mkdirSync(distDir, { recursive: true });

// Copy all .md files
const files = fs.readdirSync(srcDir);
const mdFiles = files.filter(file => file.endsWith('.md'));

console.log(`Copying ${mdFiles.length} skill files...`);

for (const file of mdFiles) {
  const srcPath = path.join(srcDir, file);
  const distPath = path.join(distDir, file);

  fs.copyFileSync(srcPath, distPath);
  console.log(`  ✓ Copied ${file}`);
}

console.log('✅ Skill files copied successfully');
