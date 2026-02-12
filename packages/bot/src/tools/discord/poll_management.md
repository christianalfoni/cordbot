---
name: poll_management
description: Create and manage Discord polls. Use when creating polls, getting poll results, or managing server polls.
---

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
- Set duration in hours (default: 24, minimum: 1)
- Enable multiselect to allow multiple answers
- Polls automatically show vote counts and percentages

**IMPORTANT: Discord enforces a minimum poll duration of 1 hour**

Duration must be at least 1 hour. Values less than 1 will return an error.

**Duration Examples:**
- 1 hour → `duration: 1`
- 4 hours → `duration: 4`
- 24 hours → `duration: 24`
- 2 days → `duration: 48`
- 1 week → `duration: 168`

**Note:** Poll duration (how long it stays open) is separate from when you check results. You can schedule a cron job to check a 24-hour poll after just 30 minutes to see intermediate results.

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
3. **Appropriate Duration** - Choose duration based on urgency (minimum 1 hour):
   - Quick decisions: 1-4 hours
   - Team feedback: 24-48 hours (1-2 days)
   - Community votes: 72-168 hours (3-7 days)
4. **Channel Selection** - Post polls in appropriate channels where the target audience is active

## Automating Poll Result Announcements

Use one-time scheduled tasks to automatically check and announce poll results exactly when they end.

### Pattern: Create Poll + One-Time Cron Job

Instead of tracking polls in a separate file, **create a one-time cron job** when you create the poll:

**User Request (in Thread #planning):**
```
Create a poll asking "Preferred meeting time?" with options: 9 AM, 2 PM, 5 PM.
Run for 48 hours, then announce results here and schedule the winning time.
```

**Bot Actions:**

**1. Create the poll**
```
Use discord_create_poll to create poll in target channel.
Note the poll message ID (e.g., 123456789).
Calculate end time: current time + 48 hours = 2026-02-12T14:30:00Z
```

**2. Create one-time schedule (if in a thread)**

Use `schedule_one_time` with `replyInThread: true` to send results back to the thread:

```
schedule_one_time({
  naturalTime: "in 48 hours",
  timezone: "America/New_York",  # Use appropriate timezone
  task: "Get results from poll message 123456789 in channel #general. Find the option with most votes. Create recurring calendar event for that time. Reply with results and event details.",
  replyInThread: true  # ← Automatically captures thread ID!
})
```

This creates in cron_v2.yaml:
```yaml
oneTimeJobs:
  - id: job_1707234567890
    naturalTime: "in 48 hours"
    targetTime: "2026-02-12T14:30:00.000Z"
    timezone: "America/New_York"
    threadId: "planning-thread-id"  # ← Automatically set!
    task: |
      Get results from poll message 123456789 in channel #general.
      Find the option with most votes.
      Create recurring calendar event for that time.
      Reply with results and event details.
    channelId: "channel-123"
    createdAt: "2026-02-10T14:30:00.000Z"
```

**3. Reply to user**
```
Bot in Thread #planning: "✅ Poll created! I'll check back here with results in 48 hours."
```

### Benefits Over Separate Tracker

**Why this is better:**
1. ✅ **No extra state file** - cron_v2.yaml is the tracker
2. ✅ **Precise timing** - Runs exactly when poll ends, not "every 6 hours"
3. ✅ **Task-specific logic** - Each poll can have custom follow-up actions
4. ✅ **Self-documenting** - Reading cron_v2.yaml shows all pending polls
5. ✅ **Auto-cleanup** - One-time schedules remove themselves after running
6. ✅ **Thread-aware** - Task knows where to send results

### Complete Example Workflow

**Day 1: User asks in Thread #planning-discussion**
```
User in Thread: Create a poll in #team-chat asking "Preferred meeting time?"
with options: 9 AM, 2 PM, 5 PM, duration 48 hours. Then analyze and schedule the meeting.

Bot in Thread:
1. Creates poll in #team-chat (messageId: 999888777)
2. Creates one-time schedule for 48 hours from now:

   schedule_one_time({
     naturalTime: "in 48 hours",
     timezone: "America/New_York",
     task: "Get results from poll 999888777. Send results to current thread with winner. Create calendar event for winning time and reply with details.",
     replyInThread: true
   })

3. Replies: "✅ Poll created! I'll analyze results here in 48 hours."
```

**Day 3: Automated follow-up (48 hours later, exactly)**
```
One-time scheduled task runs:
1. Gets results using discord_get_poll_results
2. Sends to Thread #planning-discussion:
   "📊 Poll Results: Preferred meeting time?

   1. **9 AM**: 5 votes (25%)
   2. **2 PM**: 12 votes (60%)  ← Winner!
   3. **5 PM**: 3 votes (15%)

   Total voters: 20

   ✅ Creating recurring meeting for 2 PM..."

3. Creates calendar event
4. Schedule auto-removes itself from cron_v2.yaml
```

**Context Preserved!** The results and actions appear in the same thread where the user originally asked.

### Advanced: Custom Follow-Up Actions

Each poll can have its own custom logic based on results:

**Example 1: Decision-based workflow**
```
schedule_one_time({
  naturalTime: "February 10th at 5pm",
  timezone: "America/New_York",
  task: `Get results from poll "Should we deploy v2.0?"

  If "Yes" wins:
    - Create deployment checklist
    - Notify DevOps team
    - Schedule deployment for tomorrow

  If "No" wins:
    - Ask what concerns need addressing
    - Schedule follow-up discussion

  Send summary to thread #releases`,
  replyInThread: true
})
```

**Example 2: Multi-step automation**
```
schedule_one_time({
  naturalTime: "February 15th at 9am",
  timezone: "UTC",
  task: `Get results from "Q1 Feature Priority" poll.

  Take top 3 features by votes.

  For each feature:
    - Create GitHub issue
    - Add to project board
    - Assign to appropriate team

  Send project board link to thread #planning`,
  replyInThread: true
})
```

**Example 3: Conditional scheduling**
```
schedule_one_time({
  naturalTime: "February 8th at 2pm",
  timezone: "Europe/London",
  task: `Get poll results for meeting time.

  Based on winning time slot:
    - Create recurring calendar event
    - Send invites to all poll voters
    - Create reminder 24h before first meeting

  Reply in thread #team with calendar link`,
  replyInThread: true
})
```

## Requirements

- Bot must have permission to send messages in the target channel
- Creating polls requires Manage Messages or Administrator permission
- Scheduled result checking requires read access to poll messages
