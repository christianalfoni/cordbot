---
name: scheduling
description: Schedule automated tasks using natural language or cron syntax. Use for one-time tasks ("tomorrow at 9pm") or recurring tasks (daily, weekly). Maintain state between executions using files.
---

# Scheduling & State Management Skill

Schedule automated tasks using natural language time expressions or cron syntax. Tasks can run once or repeatedly, with full timezone support.

## Overview

The bot supports two types of scheduled tasks:

1. **One-Time Schedules**: Natural language like "tomorrow at 9pm", "in 10 minutes", "next Monday at 3pm"
2. **Recurring Schedules**: Cron expressions like "0 9 * * *" (daily at 9am) with timezone support

**State Management**: Use regular files in the channel's folder to maintain state between task executions.

## One-Time Schedules (Natural Language)

Use `schedule_one_time` for tasks that should run once at a specific time.

### Examples

```
"Send a reminder in 10 minutes"
→ schedule_one_time({
    naturalTime: "in 10 minutes",
    timezone: "America/New_York",
    task: "Send the reminder: Team meeting starts soon!"
  })

"Post the announcement tomorrow at 9pm"
→ schedule_one_time({
    naturalTime: "tomorrow at 9pm",
    timezone: "America/Los_Angeles",
    task: "Post the product launch announcement"
  })

"Check poll results next Monday at 3pm"
→ schedule_one_time({
    naturalTime: "next Monday at 3pm",
    timezone: "Europe/London",
    task: "Get poll results from message 123456 and announce winner"
  })
```

### Natural Language Formats

The bot understands many natural time expressions:
- `"in 10 minutes"`, `"in 2 hours"`, `"in 30 seconds"`
- `"tomorrow at 9pm"`, `"next Monday at 3pm"`
- `"December 25th at noon"`, `"Friday at 5:30pm"`
- `"in 2 days"`, `"next week"`

### Timezones

**Always specify the user's timezone** when scheduling tasks. Use IANA timezone identifiers:
- US: `"America/New_York"`, `"America/Los_Angeles"`, `"America/Chicago"`
- Europe: `"Europe/London"`, `"Europe/Paris"`, `"Europe/Berlin"`
- Asia: `"Asia/Tokyo"`, `"Asia/Singapore"`, `"Asia/Dubai"`
- Other: `"Australia/Sydney"`, `"UTC"`

### Reply in Thread

Use `replyInThread: true` to send the scheduled task's result back to the current thread:

```
User in Thread #planning: "Remind me about the meeting in 30 minutes"

schedule_one_time({
  naturalTime: "in 30 minutes",
  timezone: "America/New_York",
  task: "Send meeting reminder",
  replyInThread: true  // ← Result will appear in this thread
})
```

## Recurring Schedules (Cron Expressions)

Use `schedule_recurring` for tasks that repeat on a schedule.

### Examples

```
"Post daily standup reminder at 9am"
→ schedule_recurring({
    name: "daily-standup",
    cronExpression: "0 9 * * *",
    timezone: "America/New_York",
    task: "Post the daily standup reminder"
  })

"Weekly report every Monday at 10am"
→ schedule_recurring({
    name: "weekly-report",
    cronExpression: "0 10 * * 1",
    timezone: "Europe/London",
    task: "Generate and send the weekly activity report"
  })

"Check for updates every 30 minutes"
→ schedule_recurring({
    name: "update-checker",
    cronExpression: "*/30 * * * *",
    timezone: "UTC",
    task: "Check for new updates and notify if found"
  })
```

### Cron Expression Format

Standard 5-field cron format: `minute hour day month weekday`

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday = 0)
│ │ │ │ │
* * * * *
```

### Common Cron Patterns

```
Every minute:              * * * * *
Every hour at :00:         0 * * * *
Every day at 9:30am:       30 9 * * *
Every Monday at 10am:      0 10 * * 1
Every 15 minutes:          */15 * * * *
Twice daily (9am & 9pm):   0 9,21 * * *
Weekdays at 8am:           0 8 * * 1-5
First of month at midnight: 0 0 1 * *
Every Sunday at 11pm:      0 23 * * 0
```

### Timezone Support

**Critical**: Recurring schedules run in the specified timezone. A job scheduled for "9am EST" will execute at 9am Eastern Time, accounting for DST changes automatically.

```
schedule_recurring({
  name: "morning-briefing",
  cronExpression: "0 9 * * *",  // 9:00 AM
  timezone: "America/New_York",  // Eastern Time (handles DST)
  task: "Post morning briefing"
})
```

## Managing Scheduled Tasks

### List Schedules

```
schedule_list()  // All schedules in this channel
schedule_list({ type: "onetime" })  // Only one-time schedules
schedule_list({ type: "recurring" })  // Only recurring schedules
```

### Remove Schedules

```
// Remove one-time schedule by ID
schedule_remove({ identifier: "job_1707234567890" })

// Remove recurring schedule by name
schedule_remove({ identifier: "daily-standup" })
```

## File-Based State Management

**Key Feature**: Use regular files to maintain state between scheduled task executions.

### Why Use Files for State?

- **Persistence**: State survives bot restarts
- **Debuggable**: Inspect state files directly
- **Simple**: No database needed
- **Flexible**: Use JSON, YAML, plain text
- **Accessible**: Both scheduled tasks and user messages can read/write

### State File Patterns

#### 1. Counter/Tracker Pattern

Track counts, IDs, or sequences:

```
Recurring task: daily-stats
Schedule: "0 23 * * *" (11pm daily)
Task: |
  Read stats.json (create with defaults if missing).
  Increment the day counter.
  Record today's message count.
  Write updated stats back to stats.json.
  Send summary to channel.
```

```json
// stats.json (state file)
{
  "daysActive": 42,
  "totalMessages": 1523,
  "lastUpdate": "2026-02-05T23:00:00Z"
}
```

#### 2. Queue Pattern

Track items to process:

```
Recurring task: process-reminders
Schedule: "*/15 * * * *" (every 15 minutes)
Task: |
  Read reminders.json.
  Check for reminders with dueTime <= now.
  Send reminder messages for due items.
  Remove processed reminders from the list.
  Write updated reminders.json.
```

```json
// reminders.json (state file)
{
  "reminders": [
    {
      "id": "rem_001",
      "message": "Team meeting in 10 minutes",
      "dueTime": "2026-02-06T14:50:00Z",
      "userId": "123456789"
    }
  ]
}
```

#### 3. Checkpoint Pattern

Track progress through a list:

```
Recurring task: daily-review
Schedule: "0 10 * * *" (10am daily)
Task: |
  Read review-progress.json.
  Get next user from reviewQueue at currentIndex.
  Send their daily review prompt.
  Increment currentIndex (wrap if at end).
  Write updated progress.
```

```json
// review-progress.json (state file)
{
  "reviewQueue": ["user1", "user2", "user3"],
  "currentIndex": 2,
  "lastReviewDate": "2026-02-05"
}
```

#### 4. Cache Pattern

Store computed data temporarily:

```
Recurring task: update-leaderboard
Schedule: "0 */6 * * *" (every 6 hours)
Task: |
  Fetch latest activity data.
  Calculate user rankings.
  Write to leaderboard-cache.json.
  Post top 10 to channel.
```

```json
// leaderboard-cache.json (state file)
{
  "updated": "2026-02-05T18:00:00Z",
  "rankings": [
    {"userId": "123", "username": "Alice", "score": 1520}
  ]
}
```

## Best Practices

### Scheduling Strategy

1. **Choose the Right Type**
   - Use **one-time** for: reminders, specific announcements, poll results
   - Use **recurring** for: reports, monitoring, cleanup tasks

2. **Frequency Guidelines**
   - Avoid excessive scheduling (< 5 minutes unless necessary)
   - Consider timezone when scheduling user-facing tasks
   - Don't spam channels during peak activity

3. **Task Naming** (recurring only)
   - Use descriptive names: `weekly-report` not `job1`
   - Include frequency: `hourly-check`, `daily-summary`
   - Be consistent across tasks

4. **Thread Awareness**
   - Use `replyInThread: true` when creating from threads
   - Results appear where user asked
   - Better conversation continuity

### State File Management

1. **Initialize State**
   ```
   Task: |
     Check if state.json exists.
     If not, create with default values.
     Then proceed with task logic.
   ```

2. **Atomic Updates**
   ```
   Task: |
     Read entire state file.
     Make all changes in memory.
     Write complete updated state back.
   ```

3. **Error Handling**
   ```
   Task: |
     Try to read state.json.
     If corrupted or missing, log error and use defaults.
     Continue with defaults.
   ```

4. **Validation**
   ```
   Task: |
     Read state file.
     Validate structure and required fields.
     If invalid, recreate with defaults and report issue.
   ```

### State File Organization

1. **Naming Conventions**
   - Purpose-based: `reminders.json`, `stats.json`
   - Avoid generic names: Use `leaderboard.json` not `data.json`
   - Use extensions: `.json`, `.yaml`, `.txt`

2. **File Location**
   - All state files go in the channel's folder
   - Same directory as `CLAUDE.md`
   - Easy to find and manage

3. **Documentation**
   - Document state file structure in `CLAUDE.md`
   - Explain what each field means
   - Include example values

## Advanced Patterns

### Coordinated Tasks

Multiple recurring tasks sharing state:

```
Task 1: collect-data
Schedule: "*/10 * * * *" (every 10 minutes)
Task: |
  Read pending-items.json.
  Check for new items from source.
  Add to pending list.
  Write updated pending-items.json.

Task 2: process-data
Schedule: "0 * * * *" (every hour)
Task: |
  Read pending-items.json.
  Process all pending items.
  Write statistics to stats.json.
  Clear pending list in pending-items.json.
```

### Conditional Execution

Tasks that check state before acting:

```
Task: smart-reminder
Schedule: "0 9 * * *" (daily 9am)
Task: |
  Read reminder-config.json.
  Check if reminderEnabled is true.
  Check if daysSinceLastReminder >= reminderInterval.
  If conditions met, send reminder and update lastReminderDate.
  If not, skip silently.
  Write updated config.
```

## Complete Example: Reminder System

### User Interaction

```
User: "Remind me about the team meeting in 2 hours"

Bot creates one-time schedule:
schedule_one_time({
  naturalTime: "in 2 hours",
  timezone: "America/New_York",
  task: "Send reminder: Team meeting starts soon!",
  replyInThread: true  // If in a thread
})

Bot: "✅ I'll remind you in 2 hours (4:30 PM EST)"
```

### Recurring Reminder Check

```
Setup recurring task:
schedule_recurring({
  name: "check-reminders",
  cronExpression: "*/5 * * * *",  // Every 5 minutes
  timezone: "UTC",
  task: |
    Read reminders.json (create empty if missing).
    Get current time.
    Find all reminders where dueTime <= now.
    For each due reminder:
      - Send reminder message mentioning user
      - Mark as sent
    Remove sent reminders from array.
    Write updated reminders.json.
})
```

### State File

```json
// reminders.json
{
  "reminders": [
    {
      "id": "rem_001",
      "userId": "123456789",
      "message": "Team meeting starts soon!",
      "dueTime": "2026-02-07T16:30:00Z",
      "threadId": "thread_789"
    }
  ]
}
```

## Debugging Tips

1. **List Current Schedules**
   ```
   schedule_list()  // See all active schedules
   ```

2. **Check State Files**
   ```
   Read state files directly to verify values
   Check JSON/YAML is valid
   Look for unexpected data
   ```

3. **Test Tasks Manually**
   ```
   Execute the task description manually before scheduling
   Verify it works as expected
   ```

4. **Add Logging to Tasks**
   ```
   Task: |
     Log "Starting task X"
     Read state.json
     Log "Current state: " + JSON.stringify(state)
     Perform logic
     Log "Updated state: " + JSON.stringify(state)
     Write state.json
     Log "Task X completed"
   ```

5. **Validate Schedules**
   - Test with frequent schedules first (every 5 minutes)
   - Verify timezone is correct
   - Scale back to target frequency after testing

## Integration with User Messages

State files can be accessed by both scheduled tasks AND regular user messages:

```
User: "Show me the current stats"
Bot: Reads stats.json and displays values

User: "Reset the counter"
Bot: Reads stats.json, sets counter to 0, writes back

[Scheduled task runs later]
Bot: Reads stats.json, increments counter, writes back
```

This makes state files a powerful bridge between scheduled automation and interactive commands.

## Migration from V1

**Breaking Change**: The old cron.yaml format is no longer supported. V1 schedules will not execute.

**To migrate:**
1. List your old V1 jobs
2. Recreate using `schedule_one_time` or `schedule_recurring`
3. Old `cron.yaml` file is not deleted, but is ignored

## Summary

- **One-Time**: Use `schedule_one_time` with natural language ("tomorrow at 9pm")
- **Recurring**: Use `schedule_recurring` with cron expressions ("0 9 * * *")
- **Timezones**: Always specify IANA timezone identifiers
- **Thread Reply**: Use `replyInThread: true` for context preservation
- **State**: Use JSON/YAML files for persistence between executions
- **Management**: Use `schedule_list` and `schedule_remove` to manage schedules
