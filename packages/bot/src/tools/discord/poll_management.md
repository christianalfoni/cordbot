# Poll Management Skill

Create and manage Discord polls in your server.

## Available Tools

This skill provides access to Discord poll tools:

- **discord_create_poll** - Create a new poll in any channel
- **discord_get_poll_results** - Get current results of an active or ended poll

## Usage Examples

### Creating a Poll

Create polls with 2-10 answer options:

```
Create a poll in the general channel asking "What should we work on next week?" with options: Bug fixes, New features, Documentation, Testing
```

Options:
- Set duration in hours (default: 24)
- Enable multiselect to allow multiple answers
- Polls automatically show vote counts and percentages

### Getting Poll Results

Check the current state of any poll:

```
Get the results for poll message ID 123456789 in the announcements channel
```

Results include:
- Current vote counts for each option
- Percentage distribution
- Total number of voters
- Poll status (active or ended)

## Best Practices

1. **Clear Questions** - Make poll questions specific and unambiguous
2. **Reasonable Options** - Keep answer options concise (2-10 options)
3. **Appropriate Duration** - Choose duration based on urgency:
   - Quick decisions: 1-4 hours
   - Team feedback: 24-48 hours
   - Community votes: 3-7 days
4. **Channel Selection** - Post polls in appropriate channels where the target audience is active

## Requirements

- Bot must have permission to send messages in the target channel
- Creating polls requires Manage Messages or Administrator permission
