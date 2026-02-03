import type {
  Message as DiscordMessage,
  TextChannel as DiscordTextChannel,
  ThreadChannel as DiscordThreadChannel,
  User as DiscordUser,
  GuildMember as DiscordGuildMember,
  Role as DiscordRole,
  Channel as DiscordChannel,
  Guild as DiscordGuild,
  ButtonInteraction as DiscordButtonInteraction,
  GuildScheduledEvent as DiscordGuildScheduledEvent,
  ForumChannel as DiscordForumChannel,
  AnyThreadChannel as DiscordAnyThreadChannel,
  Poll as DiscordPoll,
} from 'discord.js';

// Message types
export interface IMessage {
  id: string;
  content: string;
  channelId: string;
  guildId?: string;
  authorId: string;
  author: IUser;
  createdTimestamp: number;

  edit(content: string | { content?: string; embeds?: any[] }): Promise<IMessage>;
  delete(): Promise<void>;
  reply(content: string | { content?: string; components?: any[] }): Promise<IMessage>;

  // Access to underlying Discord.js message for advanced operations
  _raw?: DiscordMessage;
}

// User types
export interface IUser {
  id: string;
  username: string;
  bot: boolean;
  discriminator: string;

  _raw?: DiscordUser;
}

// Member types
export interface IMember {
  id: string;
  user: IUser;
  nickname: string | null;
  roles: IRole[];
  joinedTimestamp: number | null;

  kick(reason?: string): Promise<void>;
  ban(options?: { reason?: string; deleteMessageSeconds?: number }): Promise<void>;
  timeout(duration: number, reason?: string): Promise<void>;

  _raw?: DiscordGuildMember;
}

// Role types
export interface IRole {
  id: string;
  name: string;
  color: number;
  position: number;
  permissions: bigint;
  mentionable: boolean;

  _raw?: DiscordRole;
}

// Channel types
export enum ChannelType {
  GuildText = 0,
  GuildVoice = 2,
  GuildCategory = 4,
  GuildAnnouncement = 5,
  AnnouncementThread = 10,
  PublicThread = 11,
  PrivateThread = 12,
  GuildForum = 15,
}

export interface IChannel {
  id: string;
  name: string;
  type: ChannelType;
  guildId: string;

  // Type guards
  isTextChannel(): this is ITextChannel;
  isThreadChannel(): this is IThreadChannel;
  isForumChannel(): this is IForumChannel;

  _raw?: any; // Allow any Discord channel type
}

export interface ITextChannel extends IChannel {
  topic: string | null;

  send(content: string | { content?: string; embeds?: any[]; files?: any[] }): Promise<IMessage>;
  bulkDelete(messages: number | string[]): Promise<void>;
  setTopic(topic: string): Promise<ITextChannel>;

  _raw?: DiscordTextChannel;
}

export interface IThreadChannel extends IChannel {
  parentId: string | null;
  ownerId: string | null;
  archived: boolean;
  locked: boolean;

  send(content: string | { content?: string; embeds?: any[]; files?: any[] }): Promise<IMessage>;
  setArchived(archived: boolean): Promise<IThreadChannel>;
  setLocked(locked: boolean): Promise<IThreadChannel>;

  _raw?: DiscordThreadChannel | DiscordAnyThreadChannel;
}

export interface IForumChannel extends IChannel {
  availableTags: IForumTag[];

  threads: {
    create(options: {
      name: string;
      message: { content: string };
      appliedTags?: string[];
    }): Promise<IThreadChannel>;
  };

  _raw?: DiscordForumChannel;
}

export interface IForumTag {
  id: string;
  name: string;
  moderated: boolean;
  emoji: { id: string | null; name: string | null } | null;
}

// Guild types
export interface IGuild {
  id: string;
  name: string;

  channels: {
    fetch(id: string): Promise<DiscordChannel | null>;
    cache: Map<string, DiscordChannel>;
  };

  members: {
    fetch(id: string): Promise<DiscordGuildMember>;
    cache: Map<string, DiscordGuildMember>;
  };

  roles: {
    create(options: { name: string; color?: number; permissions?: bigint }): Promise<DiscordRole>;
    cache: Map<string, DiscordRole>;
  };

  _raw?: DiscordGuild;
}

// Event types
export interface IGuildScheduledEvent {
  id: string;
  name: string;
  description: string | null;
  scheduledStartTimestamp: number | null;
  scheduledEndTimestamp: number | null;
  status: number;
  entityType: number;

  delete(): Promise<void>;

  _raw?: DiscordGuildScheduledEvent;
}

// Poll types
export interface IPoll {
  question: { text: string };
  answers: Array<{
    answerId: number;
    pollMedia: { text: string };
  }>;

  _raw?: DiscordPoll;
}

// Interaction types
export interface IButtonInteraction {
  customId: string;
  user: IUser;
  channelId: string;
  guildId?: string;
  message: IMessage;

  reply(content: string | { content?: string; ephemeral?: boolean }): Promise<void>;
  update(content: { content?: string; components?: any[] }): Promise<void>;
  deferUpdate(): Promise<void>;

  _raw?: DiscordButtonInteraction;
}

// Message options
export interface MessageOptions {
  embeds?: any[];
  components?: any[];
  files?: any[];
}

// Event handlers
export type MessageHandler = (message: IMessage) => void | Promise<void>;
export type ChannelCreateHandler = (channel: IChannel) => void | Promise<void>;
export type ChannelDeleteHandler = (channel: IChannel) => void | Promise<void>;
export type ChannelUpdateHandler = (oldChannel: IChannel, newChannel: IChannel) => void | Promise<void>;
export type InteractionCreateHandler = (interaction: IButtonInteraction) => void | Promise<void>;
export type ErrorHandler = (error: Error) => void | Promise<void>;
export type WarnHandler = (warning: string) => void | Promise<void>;

/**
 * Discord adapter interface - abstracts Discord.js operations
 */
export interface IDiscordAdapter {
  // Connection
  login(token: string): Promise<void>;
  isReady(): boolean;
  getUser(): IUser | null;

  // Message operations
  sendMessage(channelId: string, content: string | MessageOptions): Promise<IMessage>;
  editMessage(messageId: string, channelId: string, content: string): Promise<IMessage>;
  deleteMessage(messageId: string, channelId: string): Promise<void>;

  // Channel operations
  getChannel(channelId: string): Promise<ITextChannel | IThreadChannel | IForumChannel | null>;
  listChannels(guildId: string): Promise<IChannel[]>;
  createChannel(guildId: string, name: string, type: ChannelType, options?: {
    parent?: string;
    topic?: string;
  }): Promise<ITextChannel>;
  deleteChannel(channelId: string): Promise<void>;

  // Thread operations
  createThread(channelId: string, name: string, options?: {
    autoArchiveDuration?: number;
    reason?: string;
  }): Promise<IThreadChannel>;

  // Forum operations
  createForumPost(channelId: string, options: {
    name: string;
    message: string;
    appliedTags?: string[];
  }): Promise<IThreadChannel>;
  deleteForumPost(threadId: string): Promise<void>;

  // Member operations
  getMember(guildId: string, userId: string): Promise<IMember>;
  listMembers(guildId: string): Promise<IMember[]>;
  kickMember(guildId: string, userId: string, reason?: string): Promise<void>;
  banMember(guildId: string, userId: string, options?: { reason?: string; deleteMessageSeconds?: number }): Promise<void>;

  // Role operations
  getRole(guildId: string, roleId: string): Promise<IRole | null>;
  listRoles(guildId: string): Promise<IRole[]>;
  createRole(guildId: string, options: { name: string; color?: number; permissions?: bigint }): Promise<IRole>;
  assignRole(guildId: string, userId: string, roleId: string): Promise<void>;
  removeRole(guildId: string, userId: string, roleId: string): Promise<void>;

  // Event operations
  createEvent(guildId: string, options: {
    name: string;
    description: string;
    scheduledStartTime: Date;
    scheduledEndTime: Date;
    entityType: number;
    privacyLevel: number;
  }): Promise<IGuildScheduledEvent>;
  getEvent(guildId: string, eventId: string): Promise<IGuildScheduledEvent | null>;
  listEvents(guildId: string): Promise<IGuildScheduledEvent[]>;
  deleteEvent(guildId: string, eventId: string): Promise<void>;

  // Poll operations
  getPollResults(channelId: string, messageId: string): Promise<{
    question: string;
    answers: Array<{ text: string; voteCount: number }>;
  } | null>;

  // Guild operations
  getGuild(guildId: string): Promise<IGuild | null>;

  // Raw client access (for tools that need Discord.js types)
  getRawClient(): any;

  // Event handlers
  on(event: 'messageCreate', handler: MessageHandler): void;
  on(event: 'channelCreate', handler: ChannelCreateHandler): void;
  on(event: 'channelDelete', handler: ChannelDeleteHandler): void;
  on(event: 'channelUpdate', handler: ChannelUpdateHandler): void;
  on(event: 'interactionCreate', handler: InteractionCreateHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(event: 'warn', handler: WarnHandler): void;

  off(event: 'messageCreate', handler: MessageHandler): void;
  off(event: 'channelCreate', handler: ChannelCreateHandler): void;
  off(event: 'channelDelete', handler: ChannelDeleteHandler): void;
  off(event: 'channelUpdate', handler: ChannelUpdateHandler): void;
  off(event: 'interactionCreate', handler: InteractionCreateHandler): void;
  off(event: 'error', handler: ErrorHandler): void;
  off(event: 'warn', handler: WarnHandler): void;
}
