import fs from 'fs';
import path from 'path';
import os from 'os';
import { ToolManifest } from '../service/types.js';

export interface ToolSkill {
  domain: string;
  toolName: string;
  sourcePath: string;
}

/**
 * Discover tool skills from enabled tools in manifest
 * Looks for {toolName}.md files alongside {toolName}.ts
 */
export function discoverToolSkills(
  manifest: ToolManifest,
  toolsDir: string
): ToolSkill[] {
  const skills: ToolSkill[] = [];

  // Iterate through enabled domains in manifest
  for (const [domain, toolNames] of Object.entries(manifest.toolsConfig)) {
    const domainPath = path.join(toolsDir, domain);
    if (!fs.existsSync(domainPath)) continue;

    // Check each enabled tool for a skill file
    for (const toolName of toolNames) {
      const skillPath = path.join(domainPath, `${toolName}.md`);
      if (fs.existsSync(skillPath)) {
        skills.push({
          domain,
          toolName,
          sourcePath: skillPath,
        });
      }
    }
  }

  return skills;
}

/**
 * Install tool skills to global skills directory
 * Each skill gets its own subdirectory: ~/.claude/skills/{domain}_{toolName}/SKILL.md
 */
export function installGlobalSkills(skills: ToolSkill[]): void {
  const homeDir = os.homedir(); // /workspace (set via ENV HOME=/workspace)
  const globalSkillsDir = path.join(homeDir, '.claude', 'skills');

  fs.mkdirSync(globalSkillsDir, { recursive: true });

  for (const skill of skills) {
    // Create subdirectory: .claude/skills/{domain}_{toolName}/
    const skillSubdir = path.join(globalSkillsDir, `${skill.domain}_${skill.toolName}`);
    fs.mkdirSync(skillSubdir, { recursive: true });

    const destPath = path.join(skillSubdir, 'SKILL.md');

    // Always copy to ensure latest version
    fs.copyFileSync(skill.sourcePath, destPath);
    console.log(`🔧 Installed ${skill.domain}_${skill.toolName}/SKILL.md to global skills`);
  }
}
