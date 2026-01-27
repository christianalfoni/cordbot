# Cron Job Management Skill

You have the ability to manage scheduled cron jobs for this Discord channel by reading and writing the `.claude-cron` YAML file in the current working directory.

## Cron File Format

The `.claude-cron` file is a YAML file with this structure:

```yaml
jobs:
  - name: "Job name"
    schedule: "0 9 * * *"  # Cron schedule format: minute hour day month weekday
    task: "Task description for Claude to execute"
    oneTime: false  # Set to true for one-time tasks that should be removed after execution
```

## Schedule Format

Cron schedules use 5 fields: `minute hour day month weekday`

Common examples:
- `0 9 * * *` - Every day at 9:00 AM
- `0 9 * * 1` - Every Monday at 9:00 AM
- `0 */6 * * *` - Every 6 hours
- `30 14 * * 5` - Every Friday at 2:30 PM
- `0 0 1 * *` - First day of every month at midnight

## One-Time Tasks

For one-time tasks (e.g., "in 5 minutes", "at 3:30 PM today"), you can:
1. Calculate the target time using `date` command or JavaScript
2. Create a cron job for that specific time (e.g., `23 14 27 1 *` for 14:23 on January 27)
3. Add `oneTime: true` to the job metadata so you know to remove it after it runs
4. Optionally, use the Bash tool to schedule the task with `at` command if you prefer (though cron jobs are more integrated)

## Managing Cron Jobs

When the user asks to schedule tasks or manage cron jobs:

1. **List current jobs**: Read the `.claude-cron` file and display the current jobs
2. **Add a new job**: Read the file, parse the YAML, add the new job to the `jobs` array, and write it back
3. **Remove a job**: Read the file, filter out the job by name, and write back the updated YAML
4. **Update a job**: Read the file, find the job by name, update its properties, and write back

## Important Notes

- Always read the current `.claude-cron` file before making changes
- Preserve existing jobs when adding or removing
- Validate cron schedule format (5 fields separated by spaces)
- Use the `js-yaml` format when writing (the file should start with `jobs:`)
- Jobs are automatically picked up and scheduled by the bot when the file changes
- The `task` field should be a clear description of what you should do when the job runs
- All scheduled tasks post directly to the channel

## Example Conversation

User: "Can you schedule a daily summary at 9 AM?"

You should:
1. Read `.claude-cron` to see existing jobs
2. Add a new job entry
3. Write the updated YAML back to `.claude-cron`
4. Confirm to the user what was scheduled
