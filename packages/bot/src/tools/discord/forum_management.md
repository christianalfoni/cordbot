# Forum Management Skill

Manage Discord forum channels and posts for organized discussions.

## Available Tools

This skill provides access to Discord forum tools:

- **discord_create_forum_channel** - Create new forum channels with custom tags
- **discord_create_forum_post** - Create new forum posts (threads) in forum channels
- **discord_list_forum_posts** - List existing posts in a forum channel
- **discord_delete_forum_post** - Delete forum posts (requires permission)

## Usage Examples

### Creating Forum Channels

Forums are ideal for organized, topic-based discussions:

```
Create a forum channel called "feature-requests" with topic "Submit and discuss new feature ideas" and tags: enhancement, bug, question, discussion
```

Options:
- Custom tags for categorizing posts
- Optional topic/description
- Posts automatically create threads

### Creating Forum Posts

Start new discussions in a forum:

```
Create a forum post in the feature-requests channel titled "Add dark mode support" with message "We should add a dark mode option to reduce eye strain" and tag it as "enhancement"
```

Posts create threaded conversations that:
- Keep discussions organized
- Allow reactions and voting
- Can be tagged for easy filtering

### Listing Forum Posts

See all active discussions:

```
List all posts in the feature-requests forum
```

Returns:
- Post titles and IDs
- Applied tags
- Creation dates
- Author information

### Deleting Forum Posts

Remove inappropriate or outdated posts:

```
Delete forum post with ID 123456789
```

⚠️ **Warning**: Deleting posts removes the entire thread and all replies.

## Best Practices

1. **Forum Organization**
   - Create separate forums for different topics (bugs, features, support)
   - Use clear, specific forum names and descriptions

2. **Tag Strategy**
   - Keep tags simple and consistent
   - Use 3-7 tags per forum for categorization
   - Common tags: bug, feature, question, solved, in-progress

3. **Post Guidelines**
   - Encourage descriptive titles
   - Use tags to categorize from the start
   - Pin important posts for visibility

4. **Moderation**
   - Regularly review and close resolved discussions
   - Move off-topic posts to appropriate forums
   - Archive outdated information

## Forum vs Regular Channels

**Use Forums When:**
- Topics need separate threaded discussions
- Long-term searchable conversations
- Community Q&A or support
- Feature requests and bug reports

**Use Regular Channels When:**
- Real-time quick conversations
- General chat and social interaction
- Time-sensitive announcements

## Requirements

- **Create Forum**: Manage Channels or Administrator permission
- **Create Posts**: Send Messages in forum channel
- **Delete Posts**: Manage Messages or Administrator permission
