# Channel Management Skill

Manage Discord channels including creating, listing, and deleting channels.

## Available Tools

This skill provides access to Discord channel management tools:

- **discord_list_channels** - List all channels in the server with types and IDs
- **discord_create_channel** - Create new text or voice channels
- **discord_delete_channel** - Delete existing channels (requires permission)

## Usage Examples

### Listing Channels

Get an overview of all channels in the server:

```
List all channels in the server
```

Returns channels sorted alphabetically with:
- Channel name
- Channel type (text, voice, announcement, etc.)
- Channel ID for use in other operations

### Creating Channels

Create text or voice channels:

```
Create a text channel called "project-updates" with topic "Weekly project status updates"
```

```
Create a voice channel called "Team Standup"
```

Options:
- Channel type: text (default) or voice
- Optional topic/description for text channels

### Deleting Channels

Remove channels that are no longer needed:

```
Delete the channel with ID 123456789
```

⚠️ **Warning**: Deleting channels is permanent and cannot be undone. All messages and history will be lost.

## Best Practices

1. **Naming Conventions** - Use clear, descriptive names with hyphens (e.g., "team-announcements")
2. **Organization** - Group related channels with prefixes (e.g., "dev-", "design-", "marketing-")
3. **Topics** - Always add descriptive topics to text channels to explain their purpose
4. **Cleanup** - Regularly review and delete unused channels to keep the server organized
5. **Permissions** - Consider channel-specific permissions when creating sensitive channels

## Requirements

- **List Channels**: View Channels permission
- **Create Channel**: Manage Channels or Administrator permission
- **Delete Channel**: Manage Channels or Administrator permission
