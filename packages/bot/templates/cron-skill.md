# Cron Job Management

This skill allows you to manage scheduled tasks in this Discord channel.

## What is Cron?

Cron is a time-based job scheduler. You can schedule tasks to run automatically at specific times or intervals.

## Cron File Format

The `.claude-cron` file in this channel's directory contains scheduled jobs in YAML format:

```yaml
jobs:
  - name: daily-standup
    schedule: "0 9 * * 1-5"  # 9 AM weekdays
    task: "Post a daily standup reminder"
    oneTime: false
```

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
Read the `.claude-cron` file to see all scheduled jobs.

### Add a Job
1. Read the `.claude-cron` file
2. Add a new job entry with:
   - `name`: Unique job identifier
   - `schedule`: Cron schedule expression
   - `task`: Description of what to do when triggered
   - `oneTime`: Set to `true` for one-time jobs (auto-removed after running)
3. Write the updated file back

### Remove a Job
1. Read the `.claude-cron` file
2. Remove the job entry with matching name
3. Write the updated file back

### Update a Job
1. Read the `.claude-cron` file
2. Modify the job's schedule or task
3. Write the updated file back

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
1. Read `.claude-cron`
2. Add a new job:
```yaml
jobs:
  - name: pr-review-reminder
    schedule: "0 9 * * 1"
    task: "Remind the team to review open pull requests"
    oneTime: false
```
3. Write the file back
4. Confirm to the user

## Important Notes

- Always validate cron schedules before adding them
- Use descriptive job names
- Make task descriptions clear and actionable
- Check for duplicate job names
- Test schedules are correct before confirming to users
