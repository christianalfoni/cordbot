import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildSystemPrompt } from '../prompts/base-system-prompt.js';

describe('System Prompt Assembly', () => {
  describe('buildSystemPrompt integration', () => {
    it('should assemble complete system prompt with all components', () => {
      const serverDescription = 'A friendly community for TypeScript developers';
      const channelName = 'help';
      const channelTopic = 'Ask your TypeScript questions here';

      const systemPrompt = buildSystemPrompt({
        serverDescription,
        channelName,
        channelTopic,
      });

      // Verify server description is at the top
      expect(systemPrompt).toContain('# Server Context');
      expect(systemPrompt).toContain(serverDescription);

      // Verify channel context is included
      expect(systemPrompt).toContain('## Current Channel');
      expect(systemPrompt).toContain(`You are currently in the **#${channelName}** channel`);
      expect(systemPrompt).toContain(`**Channel Topic:** ${channelTopic}`);

      // Verify base instructions are included
      expect(systemPrompt).toContain('# CordBot - Discord Community Assistant');
      expect(systemPrompt).toContain('## Your Core Capabilities');
      expect(systemPrompt).toContain('## Communication Style');
      expect(systemPrompt).toContain('## Discord Markdown Guidelines');

      // Verify blockquote warning is present
      expect(systemPrompt).toContain('Do NOT use blockquotes');
      expect(systemPrompt).toContain('Discord\'s copy-paste functionality has bugs');
    });

    it('should work without server description', () => {
      const channelName = 'general';
      const channelTopic = 'General discussion';

      const systemPrompt = buildSystemPrompt({
        channelName,
        channelTopic,
      });

      // Should not have server context section
      expect(systemPrompt).not.toContain('# Server Context');

      // Should still have channel context
      expect(systemPrompt).toContain(`**#${channelName}**`);
      expect(systemPrompt).toContain(channelTopic);

      // Should have all base sections
      expect(systemPrompt).toContain('# CordBot - Discord Community Assistant');
      expect(systemPrompt).toContain('## Discord Markdown Guidelines');
    });

    it('should work without channel topic', () => {
      const serverDescription = 'Gaming community';
      const channelName = 'off-topic';

      const systemPrompt = buildSystemPrompt({
        serverDescription,
        channelName,
      });

      // Should have server context
      expect(systemPrompt).toContain('# Server Context');
      expect(systemPrompt).toContain(serverDescription);

      // Should have channel name but no topic line
      expect(systemPrompt).toContain(`**#${channelName}**`);
      expect(systemPrompt).not.toContain('**Channel Topic:**');
    });

    it('should work with minimal data (just channel name)', () => {
      const channelName = 'random';

      const systemPrompt = buildSystemPrompt({
        channelName,
      });

      // Should have basic structure
      expect(systemPrompt).toContain('# CordBot - Discord Community Assistant');
      expect(systemPrompt).toContain(`**#${channelName}**`);
      expect(systemPrompt).toContain('## Your Core Capabilities');
      expect(systemPrompt).toContain('## Discord Markdown Guidelines');

      // Should not have optional sections
      expect(systemPrompt).not.toContain('# Server Context');
      expect(systemPrompt).not.toContain('**Channel Topic:**');
    });
  });

  describe('CLAUDE.md topic extraction', () => {
    it('should extract topic from minimal CLAUDE.md format', () => {
      const claudeMdContent = `# Channel: #announcements

## Channel Topic

Important server updates and announcements`;

      const topicMatch = claudeMdContent.match(/## Channel Topic\s*\n+([^\n#]+)/);
      const channelTopic = topicMatch?.[1]?.trim();

      expect(channelTopic).toBe('Important server updates and announcements');
    });

    it('should handle CLAUDE.md with no topic', () => {
      const claudeMdContent = `# Channel: #random

## Channel Topic

_No topic set_`;

      const topicMatch = claudeMdContent.match(/## Channel Topic\s*\n+([^\n#]+)/);
      const channelTopic = topicMatch?.[1]?.trim();

      // Should extract "_No topic set_" but we filter it out
      expect(channelTopic).toBe('_No topic set_');
    });

    it('should handle multiline topics', () => {
      const claudeMdContent = `# Channel: #rules

## Channel Topic

Please read the rules carefully before participating.
Be respectful to everyone!

## Some Other Section`;

      const topicMatch = claudeMdContent.match(/## Channel Topic\s*\n+([^\n#]+)/);
      const channelTopic = topicMatch?.[1]?.trim();

      // Should only capture first line
      expect(channelTopic).toBe('Please read the rules carefully before participating.');
    });
  });

  describe('SERVER_DESCRIPTION.md extraction', () => {
    it('should extract description content, skipping header', () => {
      const serverDescContent = `# Server Description

This is a community for TypeScript developers to learn and share knowledge.`;

      const description = serverDescContent.replace(/^# Server Description\s*\n+/, '').trim();

      expect(description).toBe('This is a community for TypeScript developers to learn and share knowledge.');
      expect(description).not.toContain('# Server Description');
    });

    it('should handle empty description', () => {
      const serverDescContent = `# Server Description

_No server description set_`;

      const description = serverDescContent.replace(/^# Server Description\s*\n+/, '').trim();

      expect(description).toBe('_No server description set_');
    });
  });

  describe('Prompt content verification', () => {
    it('should contain all required Discord tool descriptions', () => {
      const systemPrompt = buildSystemPrompt({
        channelName: 'general',
      });

      const requiredTools = [
        'discord_list_channels',
        'discord_send_message',
        'discord_create_channel',
        'discord_delete_channel',
        'discord_list_members',
        'discord_get_member',
        'discord_kick_member',
        'discord_ban_member',
        'discord_list_roles',
        'discord_assign_role',
        'discord_remove_role',
        'discord_create_role',
        'discord_create_event',
        'discord_list_events',
        'discord_get_event',
        'discord_delete_event',
        'discord_create_poll',
        'discord_get_poll_results',
        'discord_create_forum_channel',
        'discord_list_forum_posts',
        'discord_create_forum_post',
        'discord_delete_forum_post',
      ];

      for (const tool of requiredTools) {
        expect(systemPrompt).toContain(tool);
      }
    });

    it('should contain markdown formatting guidelines', () => {
      const systemPrompt = buildSystemPrompt({
        channelName: 'general',
      });

      const guidelines = [
        'Code blocks',
        '**Bold** and *italic*',
        'Lists (bullets and numbered)',
        'Headers',
        'Tables',
      ];

      for (const guideline of guidelines) {
        expect(systemPrompt).toContain(guideline);
      }
    });

    it('should emphasize the blockquote warning', () => {
      const systemPrompt = buildSystemPrompt({
        channelName: 'general',
      });

      expect(systemPrompt).toContain('**IMPORTANT:**');
      expect(systemPrompt).toContain('Do NOT use blockquotes');
      expect(systemPrompt).toContain('Only use blockquotes for actual quoted text');
      expect(systemPrompt).toContain('users need to easily copy your responses');
    });
  });
});
