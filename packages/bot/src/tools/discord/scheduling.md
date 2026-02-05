# Scheduling & State Management Skill

Schedule automated tasks and use files as "scratch pads" to maintain state between recurring task executions.

## Overview

The bot can run scheduled tasks automatically using cron syntax. Each channel has a `cron.yaml` file that defines scheduled jobs. **Crucially, you can use regular files in the channel's folder to store state between task executions.**

## Cron Configuration

Scheduled tasks are defined in the channel's `cron.yaml` file:

```yaml
jobs:
  - name: daily-report
    schedule: "0 9 * * *"  # Every day at 9 AM
    task: Generate and send the daily activity report

  - name: weekly-cleanup
    schedule: "0 0 * * 0"  # Every Sunday at midnight
    task: Archive old threads and clean up completed tasks

  - name: reminder
    schedule: "0 */4 * * *"  # Every 4 hours
    task: Check reminders.json and send any due reminders

  - name: one-time-announcement
    schedule: "0 14 * * 1"  # Monday at 2 PM
    task: Announce the new feature launch
    oneTime: true  # Automatically removed after execution

  - name: poll-results
    schedule: "0 14 10 2 *"  # Feb 10 at 2 PM
    responseThreadId: "123456789"  # Send final message to this thread
    oneTime: true
    task: Get poll results and analyze
```

## File-Based State Management

**This is the key feature**: Use regular files to maintain state between scheduled task executions.

### Why Use Files for State?

- **Persistence**: State survives bot restarts
- **Debuggable**: You can inspect state files directly
- **Simple**: No database needed
- **Flexible**: Use JSON, YAML, plain text, or any format
- **Accessible**: Both scheduled tasks and regular messages can read/write

### State File Patterns

#### 1. Counter/Tracker Pattern

Track counts, IDs, or sequences:

```yaml
# cron.yaml
jobs:
  - name: daily-stats
    schedule: "0 23 * * *"
    task: |
      Read stats.json (or create if missing).
      Increment the day counter.
      Record today's message count.
      Write updated stats back to stats.json.
      Send a summary to the channel.
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

```yaml
# cron.yaml
jobs:
  - name: process-reminders
    schedule: "*/15 * * * *"  # Every 15 minutes
    task: |
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
    },
    {
      "id": "rem_002",
      "message": "Submit weekly report",
      "dueTime": "2026-02-06T17:00:00Z",
      "userId": "987654321"
    }
  ]
}
```

#### 3. Checkpoint Pattern

Track progress through a list or process:

```yaml
# cron.yaml
jobs:
  - name: daily-review
    schedule: "0 10 * * *"
    task: |
      Read review-progress.json.
      Get the next user from the reviewQueue starting at currentIndex.
      Send them their daily review prompt.
      Increment currentIndex (wrap around if at end).
      Write updated progress back to review-progress.json.
```

```json
// review-progress.json (state file)
{
  "reviewQueue": ["user1", "user2", "user3", "user4"],
  "currentIndex": 2,
  "lastReviewDate": "2026-02-05"
}
```

#### 4. Cache Pattern

Store computed data temporarily:

```yaml
# cron.yaml
jobs:
  - name: update-leaderboard
    schedule: "0 */6 * * *"  # Every 6 hours
    task: |
      Fetch latest activity data from Discord.
      Calculate user rankings.
      Write results to leaderboard-cache.json.
      Send top 10 to announcements channel.
```

```json
// leaderboard-cache.json (state file)
{
  "updated": "2026-02-05T18:00:00Z",
  "rankings": [
    {"userId": "123", "username": "Alice", "score": 1520},
    {"userId": "456", "username": "Bob", "score": 1340}
  ]
}
```

#### 5. History Pattern

Maintain a rolling history:

```yaml
# cron.yaml
jobs:
  - name: sentiment-tracker
    schedule: "0 0 * * *"  # Daily at midnight
    task: |
      Read sentiment-history.json.
      Calculate today's sentiment score from messages.
      Append today's score to history array.
      Keep only last 30 days (trim older entries).
      Write updated history to sentiment-history.json.
      If trend is negative for 3+ days, alert moderators.
```

```json
// sentiment-history.json (state file)
{
  "history": [
    {"date": "2026-02-03", "score": 0.75},
    {"date": "2026-02-04", "score": 0.68},
    {"date": "2026-02-05", "score": 0.71}
  ]
}
```

## Cron Schedule Syntax

Standard cron format: `minute hour day month weekday`

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday = 0)
│ │ │ │ │
* * * * *
```

### Common Patterns

```yaml
# Every minute
schedule: "* * * * *"

# Every hour at minute 0
schedule: "0 * * * *"

# Every day at 9:30 AM
schedule: "30 9 * * *"

# Every Monday at 10 AM
schedule: "0 10 * * 1"

# Every 15 minutes
schedule: "*/15 * * * *"

# Twice daily (9 AM and 9 PM)
schedule: "0 9,21 * * *"

# Weekdays at 8 AM
schedule: "0 8 * * 1-5"

# First day of every month at midnight
schedule: "0 0 1 * *"

# Every Sunday at 11 PM
schedule: "0 23 * * 0"
```

## Best Practices

### State File Management

1. **Initialize State**
   ```yaml
   task: |
     Check if state.json exists.
     If not, create it with default values.
     Then proceed with task logic.
   ```

2. **Atomic Updates**
   ```yaml
   task: |
     Read entire state file.
     Make all changes in memory.
     Write complete updated state back.
   ```

3. **Error Handling**
   ```yaml
   task: |
     Try to read state.json.
     If file is corrupted or missing, log error and use defaults.
     Continue with task using default values.
   ```

4. **Validation**
   ```yaml
   task: |
     Read state file.
     Validate structure and required fields.
     If invalid, report issue and recreate with defaults.
   ```

### Scheduling Strategy

1. **Frequency**
   - Don't over-schedule: More than every 5 minutes is usually excessive
   - Consider time zones: Users may be in different zones
   - Avoid peak hours: Don't spam channels during active times

2. **Task Naming**
   - Use descriptive names: `weekly-report` not `job1`
   - Include frequency: `hourly-check`, `daily-summary`
   - Be consistent: Use same naming pattern across jobs

3. **Task Descriptions**
   - Be explicit about reading/writing state files
   - Specify what the task should do step-by-step
   - Include error handling instructions

4. **One-Time Tasks**
   - Use `oneTime: true` for tasks that should only run once
   - Good for announcements, migrations, or scheduled events
   - Automatically removed from cron.yaml after execution

### State File Organization

1. **Naming Conventions**
   - Purpose-based: `reminders.json`, `stats.json`, `cache.json`
   - Avoid generic names: Use `leaderboard.json` not `data.json`
   - Use extensions: `.json` for JSON, `.yaml` for YAML, `.txt` for text

2. **File Location**
   - All state files go in the channel's folder
   - Same directory as `cron.yaml` and `CLAUDE.md`
   - Easy to find and manage

3. **Documentation**
   - Document state file structure in `CLAUDE.md`
   - Explain what each field means
   - Include example values

## Advanced Patterns

### Coordinated Tasks

Multiple tasks sharing state:

```yaml
jobs:
  - name: collect-data
    schedule: "*/10 * * * *"  # Every 10 minutes
    task: |
      Read pending-items.json.
      Check for new items from source.
      Add new items to the pending list.
      Write updated pending-items.json.

  - name: process-data
    schedule: "0 * * * *"  # Every hour
    task: |
      Read pending-items.json.
      Process all pending items.
      Clear the pending list.
      Write updated statistics to stats.json.
      Write empty pending list to pending-items.json.
```

### Conditional Execution

Tasks that check state before acting:

```yaml
jobs:
  - name: smart-reminder
    schedule: "0 9 * * *"  # Daily at 9 AM
    task: |
      Read reminder-config.json.
      Check if reminderEnabled is true.
      Check if daysSinceLastReminder >= reminderInterval.
      If conditions met, send reminder and update lastReminderDate.
      If not, skip silently.
      Write updated config back.
```

### State Migration

Updating state structure over time:

```yaml
jobs:
  - name: migrate-state-v2
    schedule: "0 0 * * *"
    task: |
      Read state.json.
      Check if version field exists and equals "2.0".
      If version is "1.0" or missing, migrate to v2 format.
      Add new required fields with defaults.
      Set version to "2.0".
      Write migrated state back.
    oneTime: true
```

## Debugging Tips

1. **Check State Files**
   - Read state files directly to see current values
   - Verify JSON/YAML is valid
   - Look for unexpected data

2. **Test Tasks Manually**
   ```
   Execute the task from cron.yaml manually to test it before scheduling
   ```

3. **Add Logging**
   ```yaml
   task: |
     Read state.json.
     Log current state values for debugging.
     Perform task logic.
     Log updated state before writing.
     Write state.json.
   ```

4. **Validate Schedules**
   - Use online cron validators
   - Test with frequent schedules first (every 5 minutes)
   - Scale back to target frequency after testing

## Example: Complete Reminder System

```yaml
# cron.yaml
jobs:
  - name: check-reminders
    schedule: "*/5 * * * *"  # Every 5 minutes
    task: |
      Read reminders.json (create with empty array if missing).
      Get current time.
      Find all reminders where dueTime <= current time.
      For each due reminder:
        - Send reminder message mentioning the user
        - Mark as sent
      Remove sent reminders from array.
      Write updated reminders.json.
```

```json
// reminders.json (initial state)
{
  "reminders": []
}
```

**Adding reminders** (via regular message):
```
Add a reminder for @user "Submit report" in 2 hours
```

Bot reads `reminders.json`, adds new reminder with calculated `dueTime`, writes file back.

**Scheduled execution**:
The cron job runs every 5 minutes, checks for due reminders, sends them, and cleans up.

## Thread-Aware Scheduled Tasks

**New Feature:** Cron jobs can send their final message to a specific thread instead of the channel!

### Problem
```
User in Thread #123: "Create a poll about meeting times"
Bot: Creates poll, schedules result check
[2 days later]
Cron job: Results ready... but WHERE to send them?
```

### Solution: Use `responseThreadId` Field

```yaml
jobs:
  - name: poll-results
    schedule: "0 14 10 2 *"
    responseThreadId: "123456789"  # ← Send to this thread
    oneTime: true
    task: Get poll results and analyze
```

**How it works:**
- ✅ If `responseThreadId` is set → Final message goes to that thread
- ✅ If not set → Final message goes to the channel (default behavior)
- ✅ Preserves conversation context when responding in threads

### Example: Poll Created in Thread

**User in Thread #planning:**
```
Create a poll about meeting times, check results in 48 hours
```

**Bot creates cron.yaml entry:**
```yaml
jobs:
  - name: meeting-poll-results
    schedule: "30 14 12 2 *"  # 48 hours from now
    responseThreadId: "planning-thread-id"  # ← Original thread
    oneTime: true
    task: |
      Get results from poll message 999888777.
      Announce winner and create calendar event.
```

**Result:** When the cron job runs, the final message appears in Thread #planning where the request originated!

### Benefits
1. **Context Preservation** - Results appear where user asked
2. **Conversation Continuity** - Feels like bot "remembers" and follows up
3. **Better UX** - User doesn't have to hunt for results
4. **No Extra State** - Thread ID stored directly in cron.yaml

### Complete Workflow Example

**Step 1: User requests in thread**
```
User in Thread #support: "Fetch the latest sales data and summarize it"
```

**Step 2: Bot creates one-time cron job**
```yaml
# Bot adds to cron.yaml
jobs:
  - name: fetch-sales-data
    schedule: "45 15 5 2 *"  # 10 minutes from now
    responseThreadId: "support-thread-id"  # ← Goes back to this thread
    oneTime: true
    task: |
      Fetch sales data from https://api.example.com/sales.
      Summarize key metrics and trends.
```

**Step 3: Bot confirms**
```
Bot in Thread #support: "✅ I'll fetch the data and get back to you here in ~10 minutes"
```

**Step 4: Cron job executes**
```
[10 minutes later]
Bot in Thread #support: "📊 Sales Data Summary
- Total: $45,320
- Growth: +12% vs last week
..."
```

**Context preserved!** The response appears in the same thread where it was requested.

## Integration with Regular Messages

State files can be used by both scheduled tasks AND regular user messages:

```
User: "Show me the current stats"
Bot: Reads stats.json and displays the current values

User: "Reset the counter"
Bot: Reads stats.json, sets counter to 0, writes back

[5 minutes later, scheduled task runs]
Bot: Reads stats.json, increments counter, writes back
```

This makes state files a powerful bridge between scheduled automation and interactive commands.

## Requirements

- Each channel has its own `cron.yaml` file
- Changes to `cron.yaml` are detected automatically (no restart needed)
- State files persist across bot restarts
- Scheduled tasks have access to all bot tools (Discord, file operations, etc.)
