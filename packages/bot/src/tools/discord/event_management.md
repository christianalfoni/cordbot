---
name: event_management
description: Create and manage Discord scheduled events. Use when creating events, managing event schedules, or organizing server activities.
---

# Event Management Skill

Schedule and manage Discord server events for coordinating activities and gatherings.

## Available Tools

This skill provides access to Discord event management tools:

- **discord_list_events** - List all scheduled events with start times and interest counts
- **discord_get_event** - Get detailed information about a specific event
- **discord_get_event_users** - See who's interested in an event
- **discord_create_event** - Schedule new server events (voice or external)
- **discord_delete_event** - Cancel scheduled events

## Usage Examples

### Listing Events

See all upcoming and active events:

```
List all scheduled events
```

Returns:
- Event names and descriptions
- Start times (with timezone support)
- Status (scheduled, active, completed, cancelled)
- Number of interested users

### Getting Event Details

View comprehensive information about an event:

```
Get details for event 123456789
```

Returns:
- Full description
- Location (voice channel or external URL)
- Start and end times
- Creator information
- Current status

### Creating Voice Channel Events

Schedule events in voice channels:

```
Create an event called "Weekly Team Meeting" with description "Discuss project progress and blockers" starting at 2026-02-10T15:00:00 in the Team Voice channel
```

Voice channel events:
- Must specify an existing voice channel by name
- Members can join directly from the event
- Shows active participant count

### Creating External Events

Schedule events outside Discord:

```
Create an external event called "Conference 2026" with description "Annual tech conference" starting at 2026-03-15T09:00:00 ending at 2026-03-15T17:00:00 at location "https://conference.example.com"
```

External events:
- Can link to websites, streaming platforms, or physical locations
- Great for conventions, meetups, or online streams
- Supports URL links in location field

### Checking Interested Users

See who plans to attend:

```
Get the list of users interested in event 123456789
```

Useful for:
- Planning capacity
- Following up with attendees
- Coordinating logistics

### Canceling Events

Remove events that are no longer happening:

```
Delete event 123456789
```

⚠️ **Note**: This cancels the event and removes it from the server. Interested users are not automatically notified.

## Best Practices

1. **Event Timing**
   - Always convert natural language dates to ISO 8601 format: YYYY-MM-DDTHH:MM:SS
   - Use the current date to calculate relative dates (e.g., "Thursday" means the next Thursday from today)
   - If no timezone is specified, assume UTC
   - Verify the calculated date is in the future before creating the event
   - Consider member timezones (Discord auto-converts times for display)
   - Schedule events at least 24 hours in advance for better attendance
   - Add end times for multi-hour events

2. **Descriptions**
   - Include clear agenda or purpose
   - Add any requirements (e.g., "Bring questions")
   - Include links to related resources
   - Mention special guests or topics

3. **Event Types**
   - **Voice Events**: Team meetings, gaming sessions, casual hangouts
   - **External Events**: Conferences, streams, IRL meetups, competitions

4. **Communication**
   - Announce events in relevant channels
   - Send reminders 24h and 1h before start
   - Update descriptions if plans change
   - Follow up after events with highlights

5. **Organization**
   - Use consistent naming (e.g., "Weekly Standup - Feb 10")
   - Create recurring events manually with clear naming
   - Clean up completed events regularly

## Event Workflow

1. **Planning**
   - Determine purpose and format
   - Choose date/time considering member availability
   - Select appropriate location (voice channel or external)

2. **Creation**
   - Create event with detailed description
   - Set accurate start/end times
   - Choose voice channel or external location

3. **Promotion**
   - Announce in relevant channels
   - Mention @role for target audience
   - Pin announcement for visibility

4. **Reminders**
   - 24 hours before: Final details and preparation
   - 1 hour before: "Starting soon" reminder
   - At start time: Launch event and welcome attendees

5. **Follow-up**
   - Thank attendees
   - Share recordings or notes if applicable
   - Gather feedback for future events

## Date Conversion Guidelines

When users provide natural language dates, **ALWAYS use Node.js** to calculate the correct date (consistent across all platforms):

### Required Node.js Commands

```bash
# Get current date and time
node -e "console.log(new Date().toISOString())"
# Output: 2026-02-06T14:30:00.000Z

# Get current day of week (0=Sunday, 6=Saturday)
node -e "console.log(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getUTCDay()])"
# Output: Friday

# Check day of week for a specific date
node -e "const d = new Date('2026-02-13'); console.log(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getUTCDay()])"
# Output: Friday

# Calculate date offsets
node -e "const d = new Date(); d.setUTCDate(d.getUTCDate() + 7); console.log(d.toISOString().split('T')[0])"  # +7 days
node -e "const d = new Date('2026-02-06'); d.setUTCDate(d.getUTCDate() + 7); console.log(d.toISOString().split('T')[0])"  # Specific date +7 days
```

### Conversion Process

1. **Get current date and day**:
   ```bash
   node -e "const d = new Date(); console.log(d.toISOString().split('T')[0], ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()])"
   ```

2. **Calculate target date**: Figure out which date matches the user's request

3. **Verify the day**:
   ```bash
   node -e "const d = new Date('2026-02-13'); console.log(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()])"
   ```

4. **Format as ISO 8601**: Combine date and time (e.g., `2026-02-13T20:00:00Z`)

**Conversion Examples** (assuming current date is 2026-02-06, which is Friday):

```bash
# "Thursday 20:00" → Next Thursday (Feb 12)
# Step 1: Calculate days until next Thursday (6 days from Friday)
node -e "const d = new Date('2026-02-06'); d.setUTCDate(d.getUTCDate() + 6); console.log(d.toISOString().split('T')[0])"
# Output: 2026-02-12
# Result: 2026-02-12T20:00:00Z

# "Friday at 3pm" → Today is Friday, so next Friday (Feb 13)
node -e "const d = new Date('2026-02-06'); d.setUTCDate(d.getUTCDate() + 7); console.log(d.toISOString().split('T')[0])"
# Output: 2026-02-13
# Result: 2026-02-13T15:00:00Z

# "Monday 10am" → Next Monday (Feb 9)
node -e "const d = new Date('2026-02-06'); d.setUTCDate(d.getUTCDate() + 3); console.log(d.toISOString().split('T')[0])"
# Output: 2026-02-09
# Result: 2026-02-09T10:00:00Z
```

**Important Rules**:
1. **ALWAYS use Node.js** - never guess dates mentally (Node.js works consistently across macOS, Linux, Windows)
2. If the day mentioned is today, assume user means **next week**
3. Always verify the calculated date is in the **future**
4. If no time is given, ask the user to specify a time

## Time Format Examples

```
2026-02-10T15:00:00  # 3 PM on Feb 10, 2026
2026-03-01T09:30:00  # 9:30 AM on March 1, 2026
2026-12-25T20:00:00  # 8 PM on Dec 25, 2026
```

Discord automatically displays times in each member's local timezone.

## Requirements

- **List/View Events**: View Channel permission
- **Create Event**: Manage Events or Administrator permission
- **Delete Event**: Manage Events or Administrator permission
- Voice channel events require the specified voice channel to exist
