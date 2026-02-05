# Discord Integration Test Cases

This document contains test cases for the Discord bot integration with Claude. Use these messages to verify functionality.

## 🚀 Quick Start Tests

Run these first to verify basic functionality:

1. **Basic Response**: `Hi @Bot!` → Should respond with greeting
2. **Permission System**: `Create a channel called "test"` → Should show permission buttons
3. **Quick Approve**: Click "Approve" within 1 second → Should succeed
4. **Slow Approve**: Create another channel, wait 6+ seconds, click "Approve" → Should show helpful error
5. **List Data**: `Show me all channels` → Should list channels

---

## 🟢 Basic Conversation

### Simple Greeting
```
Hi Cord!
```
**Expected**: Bot responds with a greeting

### Question
```
What's the weather like today?
```
**Expected**: Bot responds (may say it doesn't have real-time weather data)

### Multi-turn Conversation
```
1. What's your favorite color?
2. Why do you like that color?
```
**Expected**: Bot maintains context across messages

---

## 🔵 Channel Management

### Create Text Channel
```
Create a channel called "gaming"
```
**Expected**:
- Permission request with Approve/Deny buttons
- After approval: Channel is created
- Bot confirms: "✅ Created text channel: #gaming"

### Create Voice Channel
```
Create a voice channel named "voice-chat"
```
**Expected**: Voice channel created after permission approval

### Create Channel with Topic
```
Create a channel called "announcements" with topic "Important server updates"
```
**Expected**: Channel created with description

### List Channels
```
Show me all channels in this server
```
**Expected**: Bot lists all channels

### Delete Channel (High Permission)
```
Delete the #gaming channel
```
**Expected**:
- Permission request (high-risk operation)
- Channel deleted after approval

---

## 🟣 Role Management

### Create Role
```
Create a role called "Moderator" with color blue
```
**Expected**: Role created after permission

### List Roles
```
What roles exist in this server?
```
**Expected**: Bot lists all roles

### Assign Role
```
Give @username the Moderator role
```
**Expected**:
- Permission request
- Role assigned to user

### Remove Role
```
Remove the Moderator role from @username
```
**Expected**: Role removed from user

---

## 🟡 Member Management

### List Members
```
Show me all members in this server
```
**Expected**: Bot lists members (may paginate for large servers)

### Get Member Info
```
Tell me about @username
```
**Expected**: Bot shows member details (roles, join date, etc.)

### Kick Member (High Permission)
```
Kick @spammer from the server for violating rules
```
**Expected**:
- High-risk permission request
- Member kicked after approval

### Ban Member (High Permission)
```
Ban @troll permanently for harassment
```
**Expected**:
- High-risk permission request
- Member banned after approval

---

## 🟠 Events & Scheduling

### List Events
```
What events are scheduled?
```
**Expected**: Bot lists upcoming server events

### Create Event
```
Create an event called "Game Night" on Friday at 8 PM
```
**Expected**:
- Permission request
- Event created

### Get Event Details
```
Tell me about the "Game Night" event
```
**Expected**: Event details (time, description, attendees)

### Get Event Attendees
```
Who's going to Game Night?
```
**Expected**: List of users who marked "interested"

### Delete Event
```
Cancel the Game Night event
```
**Expected**: Event deleted after permission

---

## 🔴 Polls

### Create Simple Poll
```
Create a poll asking "What game should we play tonight?" with options "Minecraft", "Valorant", "Among Us"
```
**Expected**:
- Permission request
- Poll created with voting buttons

### Get Poll Results
```
Show me the results of the game poll
```
**Expected**: Vote counts for each option

---

## 🟤 Forum Channels

### Create Forum Channel
```
Create a forum channel called "bug-reports" with tags "bug", "feature-request", "question"
```
**Expected**: Forum channel created with tags

### List Forum Posts
```
Show me posts in #bug-reports
```
**Expected**: List of forum threads

### Create Forum Post
```
Create a post in #bug-reports titled "Login button not working" with content "When I click login, nothing happens" and tag it as "bug"
```
**Expected**: Forum post created

### Delete Forum Post
```
Delete the post titled "Login button not working"
```
**Expected**: Post deleted after permission

---

## ⚡ Permission System Testing

### Quick Click Test (Testing 3-second timeout)
```
Create a channel called "test-quick"
```
**Action**: Click "Approve" IMMEDIATELY (within 1 second)
**Expected**: ✅ Success - Channel created

### Slow Click Test
```
Create a channel called "test-slow"
```
**Action**: Wait 5-10 seconds before clicking "Approve"
**Expected**: ❌ Error message: "The permission button took too long to process (>3 seconds)..."

### Deny Permission
```
Create a channel called "test-deny"
```
**Action**: Click "Deny"
**Expected**: ❌ "Permission denied"

### Multiple Permission Requests
```
1. Create a channel called "test-1"
2. (Without clicking anything) Create a channel called "test-2"
```
**Expected**: Two separate permission requests, each must be handled independently

---

## 🔄 Context & Memory

### Thread Context
```
[In a thread]
1. What color did I say earlier?
2. (Create new thread) What color did I say earlier?
```
**Expected**:
- First message recalls from thread history
- Second message doesn't know (new thread)

### File Attachment
```
(Upload a text file) Can you read this file and summarize it?
```
**Expected**: Bot downloads file and processes it

### Multiple Users in Thread
```
User A: My favorite color is blue
User B: Mine is red
User A: @Bot what's my favorite color?
```
**Expected**: Bot correctly identifies User A's preference

---

## 🚨 Error Handling

### Invalid Channel Name
```
Create a channel called "Test Channel!" (with special characters)
```
**Expected**: Either creates with sanitized name or explains limitation

### Non-existent Channel
```
Delete the channel #this-doesnt-exist
```
**Expected**: Error: "Channel not found"

### Non-existent User
```
Give @nonexistentuser the Moderator role
```
**Expected**: Error: "User not found"

### Insufficient Bot Permissions
```
(In a server where bot lacks permissions)
Create a channel called "test"
```
**Expected**: Error explaining bot lacks Discord permissions

### Permission Request Expired
```
Create a channel called "test-expired"
```
**Action**: Wait until "⚠️ This permission request has already been handled or expired" appears
**Expected**: Graceful error handling, option to retry

---

## 🎯 Advanced Scenarios

### Complex Multi-step Request
```
Create a channel called "team-alpha", then create a role called "Team Alpha Member" with color green, then assign that role to @username
```
**Expected**:
- Multiple permission requests (one per operation)
- All operations complete in sequence

### Conditional Logic
```
If there's no channel called "general", create one
```
**Expected**: Bot checks for channel existence first

### Information Gathering
```
Give me a summary of this server: how many members, what channels exist, what roles are there
```
**Expected**: Bot uses multiple read-only tools to gather info

### Cron Job Testing
```
(Edit CLAUDE.md to add):
---cron---
0 9 * * * Send a message to #general saying "Good morning team!"
----------
```
**Expected**: Message sent at 9 AM daily

---

## 🐛 Known Edge Cases

### Rapid Fire Messages
```
(Send 5 messages quickly)
1. Hi
2. Create channel test-1
3. Create channel test-2
4. List channels
5. Thanks
```
**Expected**: No crashes, all messages processed in order

### Long Message
```
(Send a message with 1500+ characters)
```
**Expected**: Bot handles long input without truncation errors

### Unicode & Emoji
```
Create a channel called "café-☕"
```
**Expected**: Handles unicode characters properly

### Mention Without Content
```
@Bot
```
**Expected**: Bot responds asking how it can help

### Permission Request Race Condition
```
Create a channel called "race-test"
```
**Action**: Have 2 users click "Approve" at the exact same time
**Expected**: Only one click registers, second gets "already handled"

---

## 📊 Performance Testing

### Concurrent Operations
```
(Have 3 users simultaneously ask):
User 1: Create channel "test-concurrent-1"
User 2: Create channel "test-concurrent-2"
User 3: List all channels
```
**Expected**: All operations succeed without conflicts

### Heavy Load
```
List all members (in a server with 1000+ members)
```
**Expected**: Bot handles pagination properly, doesn't timeout

---

## ✅ Validation Checklist

After running tests, verify:

- [ ] All permission requests show within 2 seconds
- [ ] Clicking "Approve" within 1 second always works
- [ ] Clicking after 5+ seconds shows helpful error message
- [ ] Error messages are clear and actionable
- [ ] Bot maintains context within threads
- [ ] Bot doesn't respond to messages without mentions (in channels)
- [ ] Bot responds to all messages in threads
- [ ] Memory system captures conversation history
- [ ] Cron jobs execute at scheduled times
- [ ] No crashes or unhandled errors
- [ ] Button clicks are processed correctly
- [ ] Multiple permission requests don't interfere with each other

---

## 🔍 Debugging Tips

If something goes wrong:

1. **Check bot logs** for error messages
2. **Verify bot permissions** in Discord server settings
3. **Check CLAUDE.md** exists for each channel
4. **Monitor event loop** for congestion (>3s defer failures)
5. **Test in development** before production

---

## 📝 Notes

- **Permission timeout**: 3 seconds from button click to defer
- **Permission expiry**: 5 minutes to click button before request expires
- **Thread context**: Maintained per thread, not shared between threads
- **Channel mention filter**: Bot only responds to mentions in channels, all messages in threads
- **Memory system**: Stores conversation history in `memory.jsonl` per channel
