# Cron Job Management

This skill allows you to manage scheduled tasks in this Discord channel using dedicated cron tools.

## What is Cron?

Cron is a time-based job scheduler. You can schedule tasks to run automatically at specific times or intervals. Each Discord channel has its own isolated cron configuration stored in `~/.claude/channels/{channelId}/cron.yaml`.

## Available Tools

You have access to four cron management tools:

1. **cron_list_jobs** - List all scheduled jobs for this channel
2. **cron_add_job** - Add a new scheduled job
3. **cron_update_job** - Update an existing job's schedule or task
4. **cron_remove_job** - Remove a job by name

## Cron Schedule Format

Cron schedules use 5 fields: `minute hour day month weekday`

Examples:
- `0 9 * * *` - Every day at 9 AM
- `0 9 * * 1-5` - Weekdays at 9 AM
- `*/15 * * * *` - Every 15 minutes
- `0 0 * * 0` - Every Sunday at midnight
- `0 12 1 * *` - First day of each month at noon

Special characters:
- `*` - Any value
- `*/N` - Every N units
- `N-M` - Range from N to M
- `N,M,O` - Specific values N, M, and O

## Managing Cron Jobs

### List Jobs
Use the `cron_list_jobs` tool to see all scheduled jobs for this channel. No parameters needed.

### Add a Job
Use the `cron_add_job` tool with:
- `name`: Unique job identifier (string)
- `schedule`: Cron schedule expression (5 fields)
- `task`: Description of what to do when triggered
- `oneTime`: (optional) Set to `true` for one-time jobs that auto-remove after running

**Important**: Always use `cron_list_jobs` first to check for duplicate names.

### Update a Job
Use the `cron_update_job` tool with:
- `name`: Name of the job to update (required)
- `schedule`: New schedule (optional, leave empty to keep current)
- `task`: New task description (optional, leave empty to keep current)
- `oneTime`: New one-time flag (optional, leave empty to keep current)

### Remove a Job
Use the `cron_remove_job` tool with:
- `name`: Name of the job to remove

## How Cron Jobs Work

When a scheduled time arrives:
1. The bot executes the task in this channel
2. You (Claude) receive the task description as a prompt
3. You perform the requested action
4. The conversation can continue in that thread
5. One-time jobs are automatically removed after execution

## Example Usage

**User**: "Remind me every Monday at 9 AM to review pull requests"

**You should**:
1. Use `cron_list_jobs` to check existing jobs
2. Use `cron_add_job` with:
   - name: "pr-review-reminder"
   - schedule: "0 9 * * 1"
   - task: "Remind the team to review open pull requests"
   - oneTime: false
3. Confirm to the user

## Important Notes

- **Always use the cron tools** - Never read/write cron files directly
- The tools automatically validate cron schedules
- The tools handle duplicate checking and error handling
- Each channel has its own isolated cron configuration
- Use descriptive job names and clear task descriptions
