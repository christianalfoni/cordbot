---
name: role_management
description: Manage Discord roles and permissions. Use when creating roles, assigning roles to users, or managing server permissions.
---

# Role Management Skill

Manage Discord roles and role assignments for organizing server members.

## Available Tools

This skill provides access to Discord role management tools:

- **discord_list_roles** - List all roles in the server with member counts
- **discord_create_role** - Create new roles with custom names and colors
- **discord_assign_role** - Give a role to a member
- **discord_remove_role** - Remove a role from a member

## Usage Examples

### Listing Roles

Get an overview of all roles in the server:

```
List all roles in the server
```

Returns roles sorted by member count:
- Role name and color
- Number of members with the role
- Role ID for assignments

### Creating Roles

Create new roles for organizing members:

```
Create a role called "Contributors" with color #5865F2
```

Roles can be used for:
- Permission management
- Visual organization (colors)
- Mentioning groups
- Access control

### Assigning Roles

Give roles to members:

```
Assign the Contributors role to user 123456789 with reason "Contributed to project documentation"
```

Options:
- Optional reason for audit logs
- User must be a server member

### Removing Roles

Remove roles from members:

```
Remove the Contributors role from user 123456789
```

## Best Practices

1. **Role Hierarchy**
   - Organize roles by importance/permissions
   - Bot can only manage roles below its highest role
   - Admin roles should be at the top

2. **Naming Conventions**
   - Use clear, descriptive names
   - Consider prefixes for categories (@team-, @project-, @region-)
   - Avoid special characters that make mentions difficult

3. **Color Coding**
   - Use consistent color schemes
   - Staff roles: Red/Orange tones
   - Member roles: Blue/Green tones
   - Special roles: Purple/Pink tones

4. **Permission Strategy**
   - Start with minimal permissions
   - Grant permissions as needed
   - Regularly audit role permissions
   - Use role-specific channels for sensitive topics

5. **Assignment**
   - Document role purposes
   - Set clear criteria for role assignment
   - Keep role assignments updated
   - Track reason for assignments in audit log

## Common Role Patterns

**Staff Roles:**
- Moderator, Admin, Support Team
- Focus on moderation and management permissions

**Team Roles:**
- Developers, Designers, Content Creators
- Focus on project organization

**Member Roles:**
- New Member, Regular, Veteran
- Based on tenure or activity

**Interest Roles:**
- Game titles, topics, regions
- For organizing notifications and access

## Requirements

- **List Roles**: View Server permission
- **Create Role**: Manage Roles or Administrator permission
- **Assign/Remove Role**: Manage Roles or Administrator permission
- Bot's highest role must be above roles it manages
