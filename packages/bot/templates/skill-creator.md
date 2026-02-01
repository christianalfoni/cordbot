# Skill Creator

This skill teaches you how to create custom skills for this Discord bot.

## What are Skills?

Skills are markdown instruction files that extend your capabilities. They teach you how to perform specific tasks or provide specialized knowledge. Skills are stored as `.md` files and are automatically discovered when the bot starts or when you create new ones.

## Where Skills Live

- **Global skills**: `~/.claude/skills/` - Available in all Discord channels
- **Skill format**: Each skill is in its own subdirectory with a `SKILL.md` file
  - Example: `~/.claude/skills/my-skill/SKILL.md`

## Skill File Format

Skills are markdown files with clear instructions and examples. Here's the basic structure:

```markdown
# Skill Name

Brief description of what this skill helps you do.

## Purpose

Explain what this skill is for and when to use it.

## Instructions

Step-by-step guidance on how to accomplish the task.

## Examples

Concrete examples showing the skill in action.

## Best Practices

Tips and guidelines for using this skill effectively.
```

## Creating a New Skill

When a user asks you to create a skill, follow these steps:

1. **Choose a descriptive name** (lowercase-with-hyphens)
2. **Create the directory**: `~/.claude/skills/{skill-name}/`
3. **Write the SKILL.md file** with clear instructions and examples
4. **Confirm** that the skill has been created

The skill will be available immediately in all channels.

## Example 1: Code Review Skill

Here's a complete example of a code review skill:

**File**: `~/.claude/skills/code-review/SKILL.md`

```markdown
# Code Review

This skill guides you through performing thorough code reviews.

## Purpose

Help users review code changes for quality, security, and best practices.

## Review Checklist

When reviewing code, check for:

1. **Correctness**: Does the code do what it's supposed to do?
2. **Security**: Are there any security vulnerabilities?
3. **Performance**: Are there obvious performance issues?
4. **Readability**: Is the code clear and well-documented?
5. **Testing**: Are there adequate tests?

## Process

1. Read the entire change first
2. Check for security issues (SQL injection, XSS, etc.)
3. Look for logic errors and edge cases
4. Verify error handling
5. Check for code duplication
6. Suggest improvements clearly

## Example Review

User: "Review this login function"

You should:
1. Analyze the authentication logic
2. Check for security issues (password handling, session management)
3. Verify input validation
4. Check error handling
5. Provide specific, actionable feedback

## Best Practices

- Be constructive and specific
- Explain WHY something should change
- Suggest alternatives, don't just criticize
- Prioritize security and correctness over style
```

## Example 2: Documentation Writer Skill

**File**: `~/.claude/skills/doc-writer/SKILL.md`

```markdown
# Documentation Writer

This skill helps you write clear, comprehensive documentation.

## Purpose

Create user-friendly documentation for code, APIs, and projects.

## Documentation Types

1. **README files**: Project overview, setup, usage
2. **API documentation**: Endpoints, parameters, examples
3. **Code comments**: Explain complex logic
4. **User guides**: Step-by-step instructions

## Structure for README Files

```markdown
# Project Name

Brief description

## Features

- Feature 1
- Feature 2

## Installation

Step-by-step setup instructions

## Usage

Code examples showing common use cases

## Configuration

Available options and how to configure them

## Contributing

How to contribute to the project
```

## Best Practices

- Start with a clear overview
- Include concrete examples
- Keep it up-to-date
- Use clear headings and structure
- Explain WHY, not just WHAT
```

## Example 3: Meeting Notes Skill

**File**: `~/.claude/skills/meeting-notes/SKILL.md`

```markdown
# Meeting Notes

This skill helps you create structured meeting notes.

## Purpose

Capture meeting discussions, decisions, and action items clearly.

## Meeting Notes Format

```markdown
# Meeting: [Topic]

**Date**: YYYY-MM-DD
**Attendees**: Person 1, Person 2, Person 3

## Agenda

1. Topic 1
2. Topic 2
3. Topic 3

## Discussion

### Topic 1

[Summary of discussion]

**Decision**: [What was decided]

### Topic 2

[Summary of discussion]

**Decision**: [What was decided]

## Action Items

- [ ] @Person1: Task description (Due: YYYY-MM-DD)
- [ ] @Person2: Task description (Due: YYYY-MM-DD)

## Next Steps

- Next meeting date
- Topics to cover
```

## When to Take Notes

- User says "take meeting notes"
- User says "summarize this discussion"
- During any meeting or planning conversation

## Best Practices

- Capture decisions clearly
- Assign action items to specific people
- Include due dates
- Summarize discussions concisely
- Focus on outcomes and next steps
```

## Best Practices for Creating Skills

1. **Be specific**: Clear, actionable instructions
2. **Include examples**: Show concrete use cases
3. **Keep it focused**: One skill, one purpose
4. **Use markdown formatting**: Headers, lists, code blocks
5. **Update as needed**: Skills can be edited at any time
6. **Test your skill**: Make sure the instructions are clear

## Skill Naming Conventions

- Use lowercase-with-hyphens
- Be descriptive: `code-review` not `review`
- Avoid spaces or special characters
- Keep names concise but clear

## Managing Skills

- **View all skills**: `ls ~/.claude/skills/`
- **Edit a skill**: Modify the SKILL.md file directly
- **Remove a skill**: Delete the skill subdirectory
- **Share skills**: Skills are in `~/.claude/` which persists across restarts

## Notes

- Skills are discovered automatically on bot startup
- New skills you create are available immediately
- Skills are global (available in all channels)
- Each skill lives in its own subdirectory with a SKILL.md file
