import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../base-system-prompt.js';

describe('buildSystemPrompt', () => {
  it('should build basic prompt without optional data', () => {
    const prompt = buildSystemPrompt({
      channelName: 'general',
    });

    expect(prompt).toContain('# CordBot - Discord Community Assistant');
    expect(prompt).toContain('You are currently in the **#general** channel');
    expect(prompt).toContain('Your Core Capabilities');
    expect(prompt).toContain('Communication Style');
    expect(prompt).toContain('Your Role');
  });

  it('should inject server description when provided', () => {
    const prompt = buildSystemPrompt({
      channelName: 'general',
      serverDescription: 'This is a coding community focused on TypeScript',
    });

    expect(prompt).toContain('# Server Context');
    expect(prompt).toContain('This is a coding community focused on TypeScript');
  });

  it('should inject channel topic when provided', () => {
    const prompt = buildSystemPrompt({
      channelName: 'announcements',
      channelTopic: 'Important server announcements and updates',
    });

    expect(prompt).toContain('**Channel Topic:** Important server announcements and updates');
  });

  it('should inject both server description and channel topic', () => {
    const prompt = buildSystemPrompt({
      channelName: 'help',
      serverDescription: 'A community for learning web development',
      channelTopic: 'Ask your programming questions here',
    });

    expect(prompt).toContain('# Server Context');
    expect(prompt).toContain('A community for learning web development');
    expect(prompt).toContain('You are currently in the **#help** channel');
    expect(prompt).toContain('**Channel Topic:** Ask your programming questions here');
  });

  it('should include Discord markdown guidelines with blockquote warning', () => {
    const prompt = buildSystemPrompt({
      channelName: 'general',
    });

    expect(prompt).toContain('## Discord Markdown Guidelines');
    expect(prompt).toContain('Do NOT use blockquotes');
    expect(prompt).toContain('Discord\'s copy-paste functionality has bugs with blockquotes');
    expect(prompt).toContain('Code blocks');
    expect(prompt).toContain('**Bold** and *italic*');
  });

  it('should include all core capabilities sections', () => {
    const prompt = buildSystemPrompt({
      channelName: 'general',
    });

    expect(prompt).toContain('1. Community Understanding');
    expect(prompt).toContain('2. Discord Server Management');
    expect(prompt).toContain('3. Workspace & Files');
    expect(prompt).toContain('4. Scheduled Tasks');
    expect(prompt).toContain('5. Research & Information');
  });

  it('should include Discord tool descriptions', () => {
    const prompt = buildSystemPrompt({
      channelName: 'general',
    });

    expect(prompt).toContain('discord_list_channels');
    expect(prompt).toContain('discord_send_message');
    expect(prompt).toContain('discord_create_poll');
    expect(prompt).toContain('discord_create_event');
    expect(prompt).toContain('discord_list_members');
  });

  it('should include permission system description', () => {
    const prompt = buildSystemPrompt({
      channelName: 'general',
    });

    expect(prompt).toContain('Permission System');
    expect(prompt).toContain('You\'ll always ask for approval before:');
    expect(prompt).toContain('Creating or deleting channels');
    expect(prompt).toContain('Kicking or banning members');
  });

  it('should not include topic section when topic is undefined', () => {
    const prompt = buildSystemPrompt({
      channelName: 'random',
      channelTopic: undefined,
    });

    expect(prompt).not.toContain('**Channel Topic:**');
  });

  it('should maintain correct structure with all sections in order', () => {
    const prompt = buildSystemPrompt({
      channelName: 'general',
      serverDescription: 'Test server',
      channelTopic: 'Test topic',
    });

    const sections = [
      '# Server Context',
      '# CordBot - Discord Community Assistant',
      '## Current Channel',
      '## Your Core Capabilities',
      '### 1. Community Understanding',
      '### 2. Discord Server Management',
      '### 3. Workspace & Files',
      '### 4. Scheduled Tasks',
      '### 5. Research & Information',
      '## Communication Style',
      '## Discord Markdown Guidelines',
      '## Your Role',
    ];

    // Verify sections appear in order
    let lastIndex = -1;
    for (const section of sections) {
      const index = prompt.indexOf(section);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });
});
