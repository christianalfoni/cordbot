import {
  Client,
  TextChannel,
  ThreadChannel,
  ForumChannel,
  Message,
  User,
  GuildMember,
  Role,
  Channel,
  Guild,
  ButtonInteraction,
  ChatInputCommandInteraction,
  GuildScheduledEvent,
  ChannelType as DiscordChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  AttachmentBuilder,
} from 'discord.js';
import type {
  IDiscordAdapter,
  IMessage,
  IUser,
  IMember,
  IRole,
  IChannel,
  ITextChannel,
  IThreadChannel,
  IForumChannel,
  IGuild,
  IGuildScheduledEvent,
  IButtonInteraction,
  IChatInputCommandInteraction,
  IForumTag,
  IAttachment,
  ISendMessageOptions,
  ChannelType,
  MessageOptions,
  MessageHandler,
  ChannelCreateHandler,
  ChannelDeleteHandler,
  ChannelUpdateHandler,
  InteractionCreateHandler,
  ErrorHandler,
  WarnHandler,
} from '../../interfaces/discord.js';

/**
 * Helper to convert IAttachment to Discord.js AttachmentBuilder
 */
function convertAttachments(attachments?: IAttachment[]): AttachmentBuilder[] {
  if (!attachments) return [];

  return attachments.map(att => {
    if (att.buffer) {
      return new AttachmentBuilder(att.buffer, {
        name: att.name,
        description: att.description,
      });
    } else if (att.filePath) {
      return new AttachmentBuilder(att.filePath, {
        name: att.name,
        description: att.description,
      });
    } else {
      throw new Error('Attachment must have either buffer or filePath');
    }
  });
}

/**
 * Wrapper classes that implement our interfaces
 */
class DiscordMessage implements IMessage {
  constructor(private msg: Message) {}

  /**
   * Internal method to get the underlying Discord.js message
   * Only for use within the implementation layer
   */
  _getUnderlyingMessage(): Message {
    return this.msg;
  }

  get id() { return this.msg.id; }
  get content() { return this.msg.content; }
  get channelId() { return this.msg.channelId; }
  get guildId() { return this.msg.guildId ?? undefined; }
  get authorId() { return this.msg.author.id; }
  get author(): IUser { return new DiscordUser(this.msg.author); }
  get createdTimestamp() { return this.msg.createdTimestamp; }
  get createdAt() { return this.msg.createdAt; }
  get type() { return this.msg.type; }

  get client() {
    return {
      user: this.msg.client.user ? new DiscordUser(this.msg.client.user) : null,
    };
  }

  get attachments(): Map<string, import('../../interfaces/discord.js').IMessageAttachment> {
    const attachments = new Map();
    this.msg.attachments.forEach((att, id) => {
      attachments.set(id, {
        id: att.id,
        url: att.url,
        name: att.name,
        size: att.size,
        contentType: att.contentType ?? undefined,
      });
    });
    return attachments;
  }

  get reference(): import('../../interfaces/discord.js').IMessageReference | null {
    if (!this.msg.reference) return null;
    return {
      messageId: this.msg.reference.messageId ?? '',
      channelId: this.msg.reference.channelId,
      guildId: this.msg.reference.guildId,
    };
  }

  get member(): IMember | null {
    if (!this.msg.member) return null;
    return new DiscordMember(this.msg.member);
  }

  get mentions(): { users: IUser[]; has(userId: string): boolean } {
    const msg = this.msg;
    return {
      users: Array.from(msg.mentions.users.values()).map(u => new DiscordUser(u)),
      has(userId: string): boolean {
        return msg.mentions.has(userId);
      },
    };
  }

  get embeds(): import('../../interfaces/discord.js').IMessageEmbed[] {
    return this.msg.embeds.map(embed => ({
      title: embed.title ?? undefined,
      description: embed.description ?? undefined,
      url: embed.url ?? undefined,
      color: embed.color ?? undefined,
    }));
  }

  get channel(): ITextChannel | IThreadChannel {
    const ch = this.msg.channel;
    if (ch instanceof ThreadChannel) {
      return new DiscordThreadChannelWrapper(ch);
    } else if (ch instanceof TextChannel) {
      return new DiscordTextChannelWrapper(ch);
    } else {
      throw new Error('Message channel is not a text or thread channel');
    }
  }

  async edit(content: string | ISendMessageOptions): Promise<IMessage> {
    if (typeof content === 'string') {
      const edited = await this.msg.edit(content);
      return new DiscordMessage(edited);
    } else {
      const edited = await this.msg.edit({
        content: content.content,
        embeds: content.embeds,
        files: convertAttachments(content.files),
        components: content.components,
      });
      return new DiscordMessage(edited);
    }
  }

  async delete(): Promise<void> {
    await this.msg.delete();
  }

  async reply(content: string | ISendMessageOptions): Promise<IMessage> {
    if (typeof content === 'string') {
      const reply = await this.msg.reply(content);
      return new DiscordMessage(reply);
    } else {
      const reply = await this.msg.reply({
        content: content.content,
        embeds: content.embeds,
        files: convertAttachments(content.files),
        components: content.components,
      });
      return new DiscordMessage(reply);
    }
  }
}

class DiscordUser implements IUser {
  constructor(private user: User) {}

  get id() { return this.user.id; }
  get username() { return this.user.username; }
  get bot() { return this.user.bot; }
  get discriminator() { return this.user.discriminator; }
}

class DiscordMember implements IMember {
  constructor(private member: GuildMember) {}

  get id() { return this.member.id; }
  get user(): IUser { return new DiscordUser(this.member.user); }
  get nickname() { return this.member.nickname; }
  get displayName() { return this.member.displayName; }
  get roles(): IRole[] {
    return this.member.roles.cache.map(role => new DiscordRole(role));
  }
  get joinedTimestamp() { return this.member.joinedTimestamp; }

  async kick(reason?: string): Promise<void> {
    await this.member.kick(reason);
  }

  async ban(options?: { reason?: string; deleteMessageSeconds?: number }): Promise<void> {
    await this.member.ban(options);
  }

  async timeout(duration: number, reason?: string): Promise<void> {
    await this.member.timeout(duration, reason);
  }
}

class DiscordRole implements IRole {
  constructor(private role: Role) {}

  get id() { return this.role.id; }
  get name() { return this.role.name; }
  get color() { return this.role.color; }
  get position() { return this.role.position; }
  get permissions() { return this.role.permissions.bitfield; }
  get mentionable() { return this.role.mentionable; }
}

class DiscordTextChannelWrapper implements ITextChannel {
  constructor(private channel: TextChannel) {}

  get id() { return this.channel.id; }
  get name() { return this.channel.name; }
  get type() { return this.channel.type as unknown as ChannelType; }
  get guildId() { return this.channel.guildId; }
  get topic() { return this.channel.topic; }

  get threads() {
    const channel = this.channel;
    return {
      async create(options: {
        name: string;
        autoArchiveDuration?: number;
        reason?: string;
        startMessage?: IMessage;
      }): Promise<IThreadChannel> {
        // Extract underlying Discord.js message if provided
        let discordMessage: Message | undefined;
        if (options.startMessage && options.startMessage instanceof DiscordMessage) {
          discordMessage = options.startMessage._getUnderlyingMessage();
        }

        const thread = await channel.threads.create({
          name: options.name,
          autoArchiveDuration: options.autoArchiveDuration,
          reason: options.reason,
          startMessage: discordMessage,
        });
        return new DiscordThreadChannelWrapper(thread);
      },
    };
  }

  isTextChannel(): this is ITextChannel { return true; }
  isThreadChannel(): this is IThreadChannel { return false; }
  isThread(): this is IThreadChannel { return false; }
  isForumChannel(): this is IForumChannel { return false; }

  async send(content: string | ISendMessageOptions): Promise<IMessage> {
    if (typeof content === 'string') {
      const msg = await this.channel.send(content);
      return new DiscordMessage(msg);
    } else {
      const msg = await this.channel.send({
        content: content.content,
        embeds: content.embeds,
        files: convertAttachments(content.files),
        components: content.components,
      });
      return new DiscordMessage(msg);
    }
  }

  async bulkDelete(messages: number | string[]): Promise<void> {
    await this.channel.bulkDelete(messages);
  }

  async setTopic(topic: string): Promise<ITextChannel> {
    await this.channel.setTopic(topic);
    return this;
  }
}

class DiscordThreadChannelWrapper implements IThreadChannel {
  constructor(private channel: ThreadChannel) {}

  get id() { return this.channel.id; }
  get name() { return this.channel.name; }
  get type() { return this.channel.type as unknown as ChannelType; }
  get guildId() { return this.channel.guildId; }
  get parentId() { return this.channel.parentId; }
  get ownerId() { return this.channel.ownerId; }
  get archived() { return this.channel.archived ?? false; }
  get locked() { return this.channel.locked ?? false; }

  isTextChannel(): this is ITextChannel { return false; }
  isThreadChannel(): this is IThreadChannel { return true; }
  isThread(): this is IThreadChannel { return true; }
  isForumChannel(): this is IForumChannel { return false; }

  async send(content: string | ISendMessageOptions): Promise<IMessage> {
    if (typeof content === 'string') {
      const msg = await this.channel.send(content);
      return new DiscordMessage(msg);
    } else {
      const msg = await this.channel.send({
        content: content.content,
        embeds: content.embeds,
        files: convertAttachments(content.files),
        components: content.components,
      });
      return new DiscordMessage(msg);
    }
  }

  async setArchived(archived: boolean): Promise<IThreadChannel> {
    await this.channel.setArchived(archived);
    return this;
  }

  async setLocked(locked: boolean): Promise<IThreadChannel> {
    await this.channel.setLocked(locked);
    return this;
  }

  async setName(name: string): Promise<IThreadChannel> {
    await this.channel.setName(name);
    return this;
  }
}

class DiscordForumChannelWrapper implements IForumChannel {
  constructor(private channel: ForumChannel) {}

  get id() { return this.channel.id; }
  get name() { return this.channel.name; }
  get type() { return this.channel.type as unknown as ChannelType; }
  get guildId() { return this.channel.guildId; }
  get availableTags(): IForumTag[] {
    return this.channel.availableTags.map(tag => ({
      id: tag.id,
      name: tag.name,
      moderated: tag.moderated,
      emoji: tag.emoji,
    }));
  }

  isTextChannel(): this is ITextChannel { return false; }
  isThreadChannel(): this is IThreadChannel { return false; }
  isThread(): this is IThreadChannel { return false; }
  isForumChannel(): this is IForumChannel { return true; }

  get threads() {
    return {
      create: async (options: {
        name: string;
        message: { content: string };
        appliedTags?: string[];
      }): Promise<IThreadChannel> => {
        const thread = await this.channel.threads.create(options);
        return new DiscordThreadChannelWrapper(thread);
      },
    };
  }
}

class DiscordGuildWrapper implements IGuild {
  constructor(private guild: Guild) {}

  get id() { return this.guild.id; }
  get name() { return this.guild.name; }
  get description() { return this.guild.description; }
  get channels() { return this.guild.channels; }
  get members() { return this.guild.members; }
  get roles() { return this.guild.roles; }
}

class DiscordGuildScheduledEventWrapper implements IGuildScheduledEvent {
  constructor(private event: GuildScheduledEvent) {}

  get id() { return this.event.id; }
  get name() { return this.event.name; }
  get description() { return this.event.description; }
  get scheduledStartTimestamp() { return this.event.scheduledStartTimestamp; }
  get scheduledEndTimestamp() { return this.event.scheduledEndTimestamp; }
  get status() { return this.event.status; }
  get entityType() { return this.event.entityType; }

  async delete(): Promise<void> {
    await this.event.delete();
  }
}

class DiscordButtonInteractionWrapper implements IButtonInteraction {
  constructor(private interaction: ButtonInteraction) {}

  get customId() { return this.interaction.customId; }
  get user(): IUser { return new DiscordUser(this.interaction.user); }
  get channelId() { return this.interaction.channelId; }
  get guildId() { return this.interaction.guildId ?? undefined; }
  get message(): IMessage { return new DiscordMessage(this.interaction.message); }

  async reply(content: string | { content?: string; ephemeral?: boolean }): Promise<void> {
    await this.interaction.reply(content);
  }

  async update(content: { content?: string; components?: any[] }): Promise<void> {
    await this.interaction.update(content);
  }

  async deferUpdate(): Promise<void> {
    await this.interaction.deferUpdate();
  }

  async editReply(content: { content?: string; components?: any[] }): Promise<void> {
    await this.interaction.editReply(content);
  }
}

class DiscordChatInputCommandInteractionWrapper implements IChatInputCommandInteraction {
  constructor(private interaction: ChatInputCommandInteraction) {}

  get commandName() { return this.interaction.commandName; }
  get user(): IUser { return new DiscordUser(this.interaction.user); }
  get channelId() { return this.interaction.channelId; }
  get guildId() { return this.interaction.guildId ?? undefined; }

  async reply(content: string | { content?: string; ephemeral?: boolean }): Promise<void> {
    await this.interaction.reply(content);
  }

  async deferReply(options?: { ephemeral?: boolean }): Promise<void> {
    await this.interaction.deferReply(options);
  }

  async editReply(content: string | { content?: string }): Promise<void> {
    await this.interaction.editReply(content);
  }

  get _raw() { return this.interaction; }
}

/**
 * Discord.js adapter implementation
 */
export class DiscordJsAdapter implements IDiscordAdapter {
  constructor(private client: Client) {}

  // Connection
  async login(token: string): Promise<void> {
    await this.client.login(token);
  }

  isReady(): boolean {
    return this.client.isReady();
  }

  getUser(): IUser | null {
    return this.client.user ? new DiscordUser(this.client.user) : null;
  }

  destroy(): void {
    this.client.destroy();
  }

  // Message operations
  async sendMessage(channelId: string, content: string | MessageOptions): Promise<IMessage> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || (!channel.isTextBased())) {
      throw new Error(`Channel ${channelId} not found or not text-based`);
    }

    const msg = await (channel as TextChannel | ThreadChannel).send(content);
    return new DiscordMessage(msg);
  }

  async editMessage(messageId: string, channelId: string, content: string): Promise<IMessage> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${channelId} not found or not text-based`);
    }

    const msg = await (channel as TextChannel | ThreadChannel).messages.fetch(messageId);
    const edited = await msg.edit(content);
    return new DiscordMessage(edited);
  }

  async deleteMessage(messageId: string, channelId: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${channelId} not found or not text-based`);
    }

    const msg = await (channel as TextChannel | ThreadChannel).messages.fetch(messageId);
    await msg.delete();
  }

  // Channel operations
  async getChannel(channelId: string): Promise<ITextChannel | IThreadChannel | IForumChannel | null> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel) return null;

    if (channel instanceof TextChannel) {
      return new DiscordTextChannelWrapper(channel);
    } else if (channel instanceof ThreadChannel) {
      return new DiscordThreadChannelWrapper(channel);
    } else if (channel instanceof ForumChannel) {
      return new DiscordForumChannelWrapper(channel);
    }

    return null;
  }

  async listChannels(guildId: string): Promise<IChannel[]> {
    const guild = await this.client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();

    return Array.from(channels.values())
      .filter(ch => ch !== null)
      .map(ch => {
        if (ch instanceof TextChannel) return new DiscordTextChannelWrapper(ch);
        if (ch instanceof ThreadChannel) return new DiscordThreadChannelWrapper(ch);
        if (ch instanceof ForumChannel) return new DiscordForumChannelWrapper(ch);
        // Generic channel wrapper for other types
        return {
          id: ch!.id,
          name: ch!.name ?? 'Unknown',
          type: ch!.type as unknown as ChannelType,
          guildId: ch!.guildId ?? guildId,
          isTextChannel: () => false,
          isThreadChannel: () => false,
          isThread: () => false,
          isForumChannel: () => false,
        } as IChannel;
      });
  }

  async createChannel(guildId: string, name: string, type: ChannelType, options?: {
    parent?: string;
    topic?: string;
  }): Promise<ITextChannel> {
    const guild = await this.client.guilds.fetch(guildId);

    // Create the channel with explicit type casting
    const channel = await guild.channels.create({
      name,
      type: type as any,
      parent: options?.parent,
      topic: options?.topic,
    } as any);

    if (!(channel instanceof TextChannel)) {
      throw new Error('Created channel is not a text channel');
    }

    return new DiscordTextChannelWrapper(channel);
  }

  async deleteChannel(channelId: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }
    await channel.delete();
  }

  // Thread operations
  async createThread(channelId: string, name: string, options?: {
    autoArchiveDuration?: number;
    reason?: string;
  }): Promise<IThreadChannel> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`Channel ${channelId} not found or not a text channel`);
    }

    const thread = await channel.threads.create({
      name,
      autoArchiveDuration: options?.autoArchiveDuration,
      reason: options?.reason,
    });

    return new DiscordThreadChannelWrapper(thread);
  }

  // Forum operations
  async createForumPost(channelId: string, options: {
    name: string;
    message: string;
    appliedTags?: string[];
  }): Promise<IThreadChannel> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof ForumChannel)) {
      throw new Error(`Channel ${channelId} not found or not a forum channel`);
    }

    const thread = await channel.threads.create({
      name: options.name,
      message: { content: options.message },
      appliedTags: options.appliedTags,
    });

    return new DiscordThreadChannelWrapper(thread);
  }

  async deleteForumPost(threadId: string): Promise<void> {
    const thread = await this.client.channels.fetch(threadId);
    if (!thread || !(thread instanceof ThreadChannel)) {
      throw new Error(`Thread ${threadId} not found`);
    }
    await thread.delete();
  }

  // Member operations
  async getMember(guildId: string, userId: string): Promise<IMember> {
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    return new DiscordMember(member);
  }

  async listMembers(guildId: string): Promise<IMember[]> {
    const guild = await this.client.guilds.fetch(guildId);
    const members = await guild.members.fetch();
    return Array.from(members.values()).map(m => new DiscordMember(m));
  }

  async kickMember(guildId: string, userId: string, reason?: string): Promise<void> {
    const member = await this.getMember(guildId, userId);
    await member.kick(reason);
  }

  async banMember(guildId: string, userId: string, options?: {
    reason?: string;
    deleteMessageSeconds?: number;
  }): Promise<void> {
    const guild = await this.client.guilds.fetch(guildId);
    await guild.members.ban(userId, {
      reason: options?.reason,
      deleteMessageSeconds: options?.deleteMessageSeconds,
    });
  }

  // Role operations
  async getRole(guildId: string, roleId: string): Promise<IRole | null> {
    const guild = await this.client.guilds.fetch(guildId);
    const role = await guild.roles.fetch(roleId);
    return role ? new DiscordRole(role) : null;
  }

  async listRoles(guildId: string): Promise<IRole[]> {
    const guild = await this.client.guilds.fetch(guildId);
    const roles = await guild.roles.fetch();
    return Array.from(roles.values()).map(r => new DiscordRole(r));
  }

  async createRole(guildId: string, options: {
    name: string;
    color?: number;
    permissions?: bigint;
  }): Promise<IRole> {
    const guild = await this.client.guilds.fetch(guildId);
    const role = await guild.roles.create(options);
    return new DiscordRole(role);
  }

  async assignRole(guildId: string, userId: string, roleId: string): Promise<void> {
    const role = await this.getRole(guildId, roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }
    // Fetch member directly from Discord client to access role operations
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.roles.add(roleId);
  }

  async removeRole(guildId: string, userId: string, roleId: string): Promise<void> {
    // Fetch member directly from Discord client to access role operations
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.roles.remove(roleId);
  }

  // Event operations
  async createEvent(guildId: string, options: {
    name: string;
    description: string;
    scheduledStartTime: Date;
    scheduledEndTime: Date;
    entityType: number;
    privacyLevel: number;
  }): Promise<IGuildScheduledEvent> {
    const guild = await this.client.guilds.fetch(guildId);
    const event = await guild.scheduledEvents.create({
      name: options.name,
      description: options.description,
      scheduledStartTime: options.scheduledStartTime,
      scheduledEndTime: options.scheduledEndTime,
      entityType: options.entityType as GuildScheduledEventEntityType,
      privacyLevel: options.privacyLevel as GuildScheduledEventPrivacyLevel,
      entityMetadata: { location: 'Discord' },
    });

    return new DiscordGuildScheduledEventWrapper(event);
  }

  async getEvent(guildId: string, eventId: string): Promise<IGuildScheduledEvent | null> {
    const guild = await this.client.guilds.fetch(guildId);
    try {
      const event = await guild.scheduledEvents.fetch(eventId);
      return event ? new DiscordGuildScheduledEventWrapper(event) : null;
    } catch {
      return null;
    }
  }

  async listEvents(guildId: string): Promise<IGuildScheduledEvent[]> {
    const guild = await this.client.guilds.fetch(guildId);
    const events = await guild.scheduledEvents.fetch();
    return Array.from(events.values()).map(e => new DiscordGuildScheduledEventWrapper(e));
  }

  async deleteEvent(guildId: string, eventId: string): Promise<void> {
    const event = await this.getEvent(guildId, eventId);
    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }
    await event.delete();
  }

  // Poll operations
  async getPollResults(channelId: string, messageId: string): Promise<{
    question: string;
    answers: Array<{ text: string; voteCount: number }>;
  } | null> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return null;
    }

    const message = await (channel as TextChannel | ThreadChannel).messages.fetch(messageId);
    if (!message.poll) {
      return null;
    }

    const answers = Array.from(message.poll.answers.values()).map(answer => ({
      text: answer.text ?? 'Unknown',
      voteCount: answer.voteCount ?? 0,
    }));

    return {
      question: message.poll.question.text || 'Unknown',
      answers,
    };
  }

  // Guild operations
  async getGuild(guildId: string): Promise<IGuild | null> {
    try {
      const guild = await this.client.guilds.fetch(guildId);
      return new DiscordGuildWrapper(guild);
    } catch {
      return null;
    }
  }

  // Event handlers
  on(event: 'messageCreate', handler: MessageHandler): void;
  on(event: 'channelCreate', handler: ChannelCreateHandler): void;
  on(event: 'channelDelete', handler: ChannelDeleteHandler): void;
  on(event: 'channelUpdate', handler: ChannelUpdateHandler): void;
  on(event: 'guildUpdate', handler: import('../../interfaces/discord.js').GuildUpdateHandler): void;
  on(event: 'interactionCreate', handler: InteractionCreateHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(event: 'warn', handler: WarnHandler): void;
  on(event: string, handler: any): void {
    if (event === 'messageCreate') {
      this.client.on('messageCreate', (msg: Message) => {
        handler(new DiscordMessage(msg));
      });
    } else if (event === 'channelCreate') {
      this.client.on('channelCreate', (ch: Channel) => {
        if (ch instanceof TextChannel) {
          handler(new DiscordTextChannelWrapper(ch));
        } else if (ch instanceof ThreadChannel) {
          handler(new DiscordThreadChannelWrapper(ch));
        } else if (ch instanceof ForumChannel) {
          handler(new DiscordForumChannelWrapper(ch));
        }
      });
    } else if (event === 'channelDelete') {
      this.client.on('channelDelete', (ch: Channel) => {
        if (ch instanceof TextChannel) {
          handler(new DiscordTextChannelWrapper(ch));
        } else if (ch instanceof ThreadChannel) {
          handler(new DiscordThreadChannelWrapper(ch));
        } else if (ch instanceof ForumChannel) {
          handler(new DiscordForumChannelWrapper(ch));
        }
      });
    } else if (event === 'channelUpdate') {
      this.client.on('channelUpdate', (oldCh: Channel, newCh: Channel) => {
        const wrapChannel = (ch: Channel) => {
          if (ch instanceof TextChannel) return new DiscordTextChannelWrapper(ch);
          if (ch instanceof ThreadChannel) return new DiscordThreadChannelWrapper(ch);
          if (ch instanceof ForumChannel) return new DiscordForumChannelWrapper(ch);
          return null;
        };

        const oldWrapped = wrapChannel(oldCh);
        const newWrapped = wrapChannel(newCh);

        if (oldWrapped && newWrapped) {
          handler(oldWrapped, newWrapped);
        }
      });
    } else if (event === 'guildUpdate') {
      this.client.on('guildUpdate', (oldGuild: Guild, newGuild: Guild) => {
        handler(new DiscordGuildWrapper(oldGuild), new DiscordGuildWrapper(newGuild));
      });
    } else if (event === 'interactionCreate') {
      this.client.on('interactionCreate', (interaction) => {
        if (interaction.isButton()) {
          handler(new DiscordButtonInteractionWrapper(interaction));
        } else if (interaction.isChatInputCommand()) {
          handler(new DiscordChatInputCommandInteractionWrapper(interaction));
        }
      });
    } else if (event === 'error') {
      this.client.on('error', (error: Error) => {
        handler(error);
      });
    } else if (event === 'warn') {
      this.client.on('warn', (warning: string) => {
        handler(warning);
      });
    }
  }

  off(event: 'messageCreate', handler: MessageHandler): void;
  off(event: 'channelCreate', handler: ChannelCreateHandler): void;
  off(event: 'channelDelete', handler: ChannelDeleteHandler): void;
  off(event: 'channelUpdate', handler: ChannelUpdateHandler): void;
  off(event: 'guildUpdate', handler: import('../../interfaces/discord.js').GuildUpdateHandler): void;
  off(event: 'interactionCreate', handler: InteractionCreateHandler): void;
  off(event: 'error', handler: ErrorHandler): void;
  off(event: 'warn', handler: WarnHandler): void;
  off(event: string, handler: any): void {
    // Discord.js doesn't provide a direct way to remove specific handlers
    // This is a limitation we'll document
    this.client.removeListener(event, handler);
  }
}
