# Gmail: Send Email

Send emails from your Gmail account via Discord.

## Tool Name

`gmail_send_email`

## What It Does

Composes and sends an email using the user's authenticated Gmail account. This tool allows you to send emails directly from Discord conversations.

## Parameters

- `to`: Recipient email address (required)
- `subject`: Email subject line (required)
- `body`: Email body content - plain text or HTML (required)
- `cc` (optional): CC recipients (comma-separated email addresses)
- `bcc` (optional): BCC recipients (comma-separated email addresses)

## Authentication

- Requires Gmail OAuth connection via cordbot.io
- User must have connected their Gmail account to the bot
- Emails send from the authenticated user's Gmail account
- If not authenticated, you'll receive an error

## Usage Examples

### Example 1: Simple Email

User: "Send an email to john@example.com saying hello"

You should:
1. Use gmail_send_email with:
   - to: "john@example.com"
   - subject: "Hello"
   - body: "Hello! Just reaching out to say hi."
2. Confirm email was sent successfully

### Example 2: Professional Email

User: "Email the team about tomorrow's meeting"

You should:
1. Ask for team email address if not provided
2. Compose professional message with appropriate subject
3. Use gmail_send_email with:
   - to: "team@company.com"
   - subject: "Tomorrow's Meeting Reminder"
   - body: Professional meeting reminder with details
4. Confirm sent

### Example 3: Email with CC

User: "Send an email to alice@example.com, cc bob@example.com about the project update"

You should:
1. Compose clear project update message
2. Use gmail_send_email with:
   - to: "alice@example.com"
   - cc: "bob@example.com"
   - subject: "Project Update"
   - body: Detailed project update information
3. Confirm sent to both recipients

### Example 4: HTML Email

User: "Send a formatted email to sarah@example.com with a list of action items"

You should:
1. Create well-formatted HTML content
2. Use gmail_send_email with:
   - to: "sarah@example.com"
   - subject: "Action Items"
   - body: HTML with proper formatting (lists, bold, etc.)
3. Confirm sent

## Best Practices

1. **Always verify recipients**: Confirm email addresses are correct before sending
2. **Clear subjects**: Use descriptive subject lines
3. **Professional tone**: Maintain appropriate tone for email context
4. **Confirm before sending**: Let user review important emails before sending
5. **Error handling**: Check for authentication errors and guide user to connect Gmail if needed
6. **Privacy**: Be cautious with sensitive information in emails

## Important Notes

- Emails send from the authenticated user's Gmail account
- Sent emails will appear in the user's Gmail Sent folder
- Check for valid email address format before calling the tool
- If user is not authenticated, provide link to cordbot.io for OAuth setup
- Respect email etiquette and anti-spam guidelines

## Error Handling

If the tool returns an error:
- **Authentication error**: User needs to connect Gmail at cordbot.io
- **Invalid email**: Check email address format
- **Rate limit**: Gmail has sending limits, suggest waiting or reducing volume
- **Network error**: Retry or suggest checking connection

## Common Patterns

### Quick message
```
User: "Email jane@example.com that I'm running late"
→ Send brief, clear message about being delayed
```

### Formal email
```
User: "Send a professional email to client@company.com about the proposal"
→ Compose formal business email with proper structure
```

### Email with attachment reference
```
User: "Email the file report.pdf to team@company.com"
→ Note: This tool sends email body only. Mention attachment in body and suggest sharing file separately
```

## Tips

- Always confirm successful send with clear message
- Include relevant details in confirmation (recipient, subject)
- For important emails, offer to let user review before sending
- If user asks to "email someone", ask for email address if not provided
- Keep email bodies clear, well-formatted, and appropriate for context
