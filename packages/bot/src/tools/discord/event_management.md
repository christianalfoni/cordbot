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
   - Use ISO 8601 format for dates: YYYY-MM-DDTHH:MM:SS
   - Consider member timezones (Discord auto-converts times)
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
