---
name: document_workflow
description: Collaborative document editing workflow. Use when users share Word documents for review, editing, or collaboration. Converts documents to markdown for editing, then back to docx format.
---

# Document Workflow Skill

Work collaboratively on Word documents through an iterative markdown-based workflow.

## How It Works

### 1. Document Upload → Markdown Conversion

When users upload `.docx` files to Discord:
- **Automatic conversion** - Documents are automatically converted to markdown
- **Content embedded** - The markdown content is included in your context
- **File saved** - Original `.docx` and converted markdown saved to workspace

You can immediately read and discuss the document content without any additional tools.

### 2. Iterative Editing in Markdown

Edit documents by working directly with markdown files in the workspace:
- **Read files** - Use standard file reading to view current content
- **Edit files** - Make changes using file editing tools
- **Multiple iterations** - Users can review and request changes

**Example workflow:**
```
User: "Update the executive summary to be more concise"
→ Read the markdown file
→ Edit the relevant section
→ Explain changes made
```

### 3. Preview with Workspace Access

Let users preview your changes before converting back:

**Command:** `/workspace`
```
User can run /workspace command in Discord to get a link to the full workspace
```

This generates a temporary URL (expires in 1 hour) where users can browse the entire cordbot workspace in their browser, including all markdown files and documents.

**Benefits:**
- Browse the entire workspace
- View all files and their current state
- Real-time updates as you make changes
- No need to download anything

### 4. Convert Back to Word

When editing is complete, convert back to `.docx`:

**Tool:** `generate_docx`
```
Convert document.md to Word format
```

This creates a professional `.docx` file with proper formatting:
- Heading hierarchy preserved
- Bold, italic, lists formatted correctly
- Attached automatically to Discord message

## Complete Example Workflow

### User uploads: `Brand_Guide.docx`

**You see:**
```
[Files attached:
- Brand_Guide.docx (document, converted to markdown below)

Document: Brand_Guide.docx
---markdown
# Brand Guide

## Vision
We create sustainable solutions...
---
]
```

**You respond:**
```
I've reviewed your brand guide. Here are my suggested improvements:

1. Executive Summary - Make it more concise
2. Vision Statement - Add concrete examples
3. Target Audience - Expand the persona descriptions

Would you like me to make these changes?
```

**User:** "Yes, please update it"

**You:**
1. Edit `Brand_Guide.md` in the workspace
2. Make the improvements
3. Tell user: "I've updated the document. You can preview it using the /workspace command in Discord"

**User:** "Looks great! Can I have the Word version?"

**You:**
1. Generate docx: `generate_docx Brand_Guide.md`
2. File automatically attached to message
3. User downloads polished `.docx` file

## Available Tools

### File Editing (Built-in)
- **Read files** - View markdown content
- **Edit files** - Make changes to markdown
- **Write files** - Create new documents

### Document Tools
- **/workspace** (Discord command) - Users can get a link to browse the entire workspace
- **generate_docx** - Convert markdown to Word format
- **shareFile** - Attach any file to Discord message

## Best Practices

### 1. Always Preview Major Changes
```
Before: "I've updated the document. Here's the docx."
Better: "I've updated the document. You can preview it with /workspace. If approved, I'll generate the Word version."
```

### 2. Explain Changes Clearly
```
I've made the following changes to Brand_Guide.md:
- Line 15: Made vision statement more concise (was 3 sentences, now 1)
- Line 42: Added target audience persona "Tech-Savvy Professional"
- Line 78: Reorganized pricing section for clarity
```

### 3. Work Iteratively
- Make changes in small, reviewable chunks
- Users can preview changes anytime with /workspace command
- Only convert to docx when finalized

### 4. Preserve Formatting
When editing markdown, maintain:
- Heading hierarchy (`#`, `##`, `###`)
- Blank lines between sections
- Proper list formatting (`-` or `1.`)
- Bold (`**text**`) and italic (`*text*`)

### 5. Track Versions
```
# Version History
- v1: Initial draft (2024-01-15)
- v2: Updated vision statement per feedback (2024-01-16)
- v3: Added target audience section (2024-01-17)
```

## Workflow Patterns

### Pattern 1: Review & Light Edits
1. User uploads docx
2. You review and suggest improvements
3. Make edits to markdown
4. Generate docx → done

### Pattern 2: Collaborative Iteration
1. User uploads docx
2. You propose changes
3. User uses /workspace to preview
4. User reviews → requests more changes
5. Edit again → user refreshes workspace view
6. Repeat until approved
7. Generate final docx

### Pattern 3: From Scratch
1. User: "Create a project proposal"
2. You create markdown in workspace
3. User uses /workspace to review
4. Iterate based on feedback
5. Generate docx when complete

## Technical Details

### Supported Formats

**Input (automatic conversion):**
- `.docx` - Microsoft Word documents
- Converted to markdown on upload

**Output (via tools):**
- `.docx` - Professional Word format via `generate_docx`
- `.md` - Viewable via `/workspace` command (users can browse all workspace files)

### Markdown → Word Conversion

Powered by **Pandoc** for professional quality:
- ✅ Proper heading styles (Heading 1, Heading 2, etc.)
- ✅ Body text formatting
- ✅ Bold, italic, code
- ✅ Bulleted and numbered lists
- ✅ Tables
- ✅ Blockquotes

### Workspace Access

Users can run the `/workspace` Discord command to get a link:
- **Expiration:** 1 hour (extended on activity)
- **Access:** Anyone with the link
- **Scope:** Browse the entire cordbot workspace folder
- **Real-time:** Changes you make are visible immediately
- **Format:** `https://your-bot.fly.dev/workspace/[token]`

## Limitations

### Not Supported
- **PDF files** - Cannot be converted to markdown automatically
- **Complex formatting** - Some advanced Word features (text boxes, shapes, SmartArt) may not convert perfectly
- **Embedded media** - Images in docx are noted but not automatically included

### Workarounds
- **PDFs** - Ask user to convert to docx first
- **Complex docs** - Note which parts need manual formatting in Word after export
- **Images** - Users can add them back to the final docx

## Quick Reference

```bash
# When user uploads .docx
→ Automatically converted, content in your context
→ Ready to read and discuss immediately

# For users to preview workspace
User runs: /workspace
→ Returns: https://bot.com/workspace/abc123
→ Expires: 1 hour (extended on activity)
→ Shows entire cordbot workspace with real-time updates

# To generate Word document
generate_docx <filename.md>
→ Creates: filename.docx
→ Automatically attached to Discord

# To share any file
shareFile <filepath>
→ Attaches file to Discord message
```

## When to Use This Skill

✅ **Use for:**
- Word document review and editing
- Collaborative writing projects
- Document formatting and structure improvements
- Iterative content refinement

❌ **Don't use for:**
- Quick text messages (no need for documents)
- Code files (use regular file editing)
- Spreadsheets (not supported)

## Pro Tips

1. **Markdown is your workspace** - All editing happens in markdown for clean version control
2. **Workspace access is always available** - Users can check progress anytime with /workspace
3. **docx is final output** - Only convert when ready for distribution
4. **Keep originals** - Both `.docx` and `.md` stay in workspace for reference
5. **Suggest workflows** - If user uploads docx, proactively suggest the iterate-preview-finalize workflow
