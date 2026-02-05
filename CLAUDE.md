# Cordbot Monorepo Development Guide

This is a pnpm monorepo containing three packages that work together to provide Discord bot functionality.

## Packages

- **packages/bot**: Discord bot powered by Claude Agent SDK
- **packages/web-service**: Web service for authentication and bot management UI
- **packages/functions**: Firebase Functions for backend services (OAuth, Stripe webhooks, etc.)

## Architecture

Each package follows the **Context Interface Pattern** for dependency injection and testability. See individual package `CLAUDE.md` files for detailed architecture documentation:

- `packages/bot/CLAUDE.md` - Bot architecture with `IBotContext` interface
- `packages/functions/CLAUDE.md` - Firebase Functions with `FunctionContext` interface
- `packages/web-service/CLAUDE.md` - Web service with React Context and `AppContext` interface

## Development Workflow

### Running the Development Environment

```bash
# Install dependencies
pnpm install

# Run bot in development mode
pnpm dev:bot

# Run web service in development mode
pnpm dev:web
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter bot build
pnpm --filter @cordbot/web-service build
pnpm --filter @cordbot/functions build
```

### Type Checking

**IMPORTANT: Always run type checking after making code changes.**

```bash
# Type check all packages
pnpm typecheck

# Type check specific package
pnpm --filter bot typecheck
pnpm --filter @cordbot/web-service typecheck
pnpm --filter @cordbot/functions typecheck
```

The `typecheck` script runs `tsc --noEmit` which validates TypeScript types without emitting output files. This catches type errors faster than running a full build.

### Testing

```bash
# Run tests for all packages
pnpm test

# Run tests for specific package
pnpm --filter bot test
pnpm --filter @cordbot/web-service test
pnpm --filter @cordbot/functions test
```

## Type Safety Best Practices

### Common Type Errors and Solutions

1. **Type vs Interface Confusion**

   When you see errors like "Type 'X' is not assignable to type 'Y'", check if you're confusing:
   - An interface (e.g., `GuildStatus` as an object type)
   - A string literal union (e.g., `'pending' | 'active' | 'error'`)

   Solution: Remove incorrect type casts and let TypeScript infer the correct type.

   ```typescript
   // BAD
   status: 'provisioning' as GuildStatus  // If GuildStatus is an interface

   // GOOD
   status: 'provisioning'  // Let TypeScript infer the string literal type
   ```

2. **Type Casting Guidelines**

   - NEVER use type casting in application/business logic code
   - ONLY use type casting in context implementations when converting from external library types
   - Trust the interfaces - if the interface says it returns `User`, it returns `User`

3. **Context Interface Pattern**

   All packages use the Context Interface Pattern:
   - Application logic never imports external dependencies directly
   - Context interfaces define capabilities (e.g., `IFirestore`, `IDiscordAdapter`)
   - Context implementations wrap external libraries
   - Mock contexts are used for testing

## Pre-commit Checklist

Before committing or deploying code, always:

1. Run `pnpm typecheck` to verify all TypeScript types are correct
2. Run `pnpm test` to ensure tests pass
3. Check build logs for any compilation warnings or errors

## Common Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev:bot              # Start bot in watch mode
pnpm dev:web              # Start web service dev server

# Building
pnpm build                # Build all packages
pnpm build:functions      # Build only functions package

# Type Checking (run this after making changes!)
pnpm typecheck            # Check types in all packages

# Testing
pnpm test                 # Run tests in all packages

# Package-specific commands
pnpm --filter bot <command>
pnpm --filter @cordbot/web-service <command>
pnpm --filter @cordbot/functions <command>
```

## Deployment

### Web Service (Vercel)

The web service automatically deploys via Vercel when pushed to the main branch. The build command runs both `tsc` (type checking) and `vite build`.

If deployment fails with TypeScript errors:
1. Run `pnpm --filter @cordbot/web-service typecheck` locally
2. Fix all type errors
3. Commit and push

### Firebase Functions

```bash
# Build and deploy functions
pnpm build:functions
cd packages/functions
firebase deploy --only functions
```

### Bot

The bot is deployed as a standalone application. Follow deployment instructions in `packages/bot/README.md`.

## Troubleshooting

### TypeScript Errors in CI/CD

If your build fails with TypeScript errors:

1. Pull latest changes and run `pnpm install`
2. Run `pnpm typecheck` to reproduce the error locally
3. Check for:
   - Incorrect type casts
   - Missing type definitions
   - Interface vs type confusion
4. Fix errors and verify with `pnpm typecheck` before pushing

### Build Errors vs Type Errors

- `pnpm typecheck` - Checks types only (fast, no output)
- `pnpm build` - Full compilation (slower, generates output)

Use `typecheck` during development for faster feedback. Use `build` before deployment to ensure everything compiles correctly.

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [pnpm Workspace Documentation](https://pnpm.io/workspaces)
- Package-specific CLAUDE.md files for architecture details
