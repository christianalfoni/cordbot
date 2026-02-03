# Testing Firebase Functions

This document explains how to test the Firebase Functions using the Context Interface Pattern with vitest.

## Overview

The testing setup follows the architecture principles in `CLAUDE.md`:

- **Mock Context** (`context.mock.ts`) - Provides test doubles for all external dependencies
- **Test Files** (`*.test.ts`) - Unit tests for service classes
- **No Firebase Emulators** - Tests run entirely in-memory with mocks

## Running Tests

```bash
# Run all tests once
pnpm test -- --run

# Run tests in watch mode (auto-reruns on file changes)
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage
```

## Test Structure

### Mock Context (`context.mock.ts`)

The mock context provides test doubles for all external dependencies:

```typescript
import { MockFunctionContext, createMockResponse } from './context.mock.js';

// Create a new mock context for each test
const ctx = new MockFunctionContext();

// All methods are vitest mocks that can be spied on:
ctx.firestore.getBot.mockResolvedValueOnce(mockBot);
ctx.http.fetch.mockResolvedValueOnce(createMockResponse({ ok: true, data: {...} }));
ctx.secrets.setSecret('API_KEY', 'test-key');

// Verify calls:
expect(ctx.firestore.updateBot).toHaveBeenCalledWith('user123', 'bot456', {...});
expect(ctx.logger.info).toHaveBeenCalledWith('Processing request', {...});
```

### Writing Tests

Tests follow this pattern:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { YourService } from './your-service.js';
import { MockFunctionContext, createMockResponse } from '../context.mock.js';

describe('YourService', () => {
  let ctx: MockFunctionContext;
  let service: YourService;

  beforeEach(() => {
    ctx = new MockFunctionContext();
    service = new YourService(ctx);

    // Set up secrets
    ctx.secrets.setSecret('API_KEY', 'test-key');
  });

  it('should do something', async () => {
    // Arrange - set up mocks
    ctx.http.fetch.mockResolvedValueOnce(
      createMockResponse({ ok: true, data: { result: 'success' } })
    );

    // Act - call the service method
    const result = await service.doSomething({ param: 'value' });

    // Assert - verify behavior
    expect(result).toEqual({ success: true });
    expect(ctx.http.fetch).toHaveBeenCalledWith('https://api.example.com', ...);
    expect(ctx.logger.info).toHaveBeenCalledWith('Operation completed');
  });
});
```

## Mock Helpers

### `createMockResponse(options)`

Helper to create mock HTTP responses:

```typescript
// Success response
createMockResponse({
  ok: true,
  data: { result: 'success' },
});

// Error response
createMockResponse({
  ok: false,
  status: 400,
  statusText: 'Bad Request',
  data: { error: 'Invalid input' },
});
```

### Mock Secrets

```typescript
// Set a secret
ctx.secrets.setSecret('API_KEY', 'test-value');

// Secret will be available in service
service.doSomething(); // calls ctx.secrets.getSecret('API_KEY') -> 'test-value'
```

### Mock Time

```typescript
// Current time is mocked to a fixed date
ctx.getCurrentTime(); // Returns new Date('2024-01-01T00:00:00Z')

// You can override it for specific tests
ctx.getCurrentTime = vi.fn(() => new Date('2025-12-31T23:59:59Z'));
```

## Testing Guidelines

### ✅ DO

- **Test business logic**, not Firebase infrastructure
- **Mock all external dependencies** (Firestore, HTTP, secrets)
- **Verify calls and side effects** using `toHaveBeenCalledWith`
- **Test both success and error paths**
- **Keep tests isolated** - use `beforeEach` to reset mocks
- **Test edge cases** (missing data, expired tokens, etc.)

### ❌ DON'T

- **Don't test Firebase Functions themselves** - test the service classes instead
- **Don't use real Firebase emulators** - tests should run entirely in-memory
- **Don't make real HTTP requests** - mock all external API calls
- **Don't share state between tests** - use `beforeEach` to create fresh instances

## Example Test Files

The following test files demonstrate best practices:

- `oauth-service.test.ts` - OAuth token exchange with Google APIs
- `bot-manifest-service.test.ts` - Querying bots and building manifests
- `token-refresh-service.test.ts` - Refreshing expired OAuth tokens
- `discord-oauth-service.test.ts` - Discord OAuth flow
- `guild-provisioning-service.test.ts` - Fly.io provisioning with HTTP mocks

## Coverage

Run tests with coverage to see which code paths are tested:

```bash
pnpm test:coverage
```

Coverage reports are generated in `coverage/` directory.

## Debugging Tests

### Run a single test file:

```bash
pnpm test -- src/services/oauth-service.test.ts --run
```

### Run a single test by name:

```bash
pnpm test -- -t "should exchange Gmail token successfully" --run
```

### Use `console.log` in tests:

```typescript
it('should do something', async () => {
  const result = await service.doSomething();
  console.log('Result:', result);
  expect(result).toBeTruthy();
});
```

### Inspect mock calls:

```typescript
// See all calls to a mock
console.log(ctx.firestore.updateBot.mock.calls);

// See first call arguments
console.log(ctx.firestore.updateBot.mock.calls[0]);
```

## Benefits of This Approach

1. **Fast** - Tests run in milliseconds without network I/O
2. **Reliable** - No flaky tests from external dependencies
3. **Cost-effective** - No Firebase Functions or API calls triggered
4. **Easy to write** - Mock context provides simple test doubles
5. **Good coverage** - Can test all code paths including error cases
6. **Type-safe** - Full TypeScript support with correct types

## Next Steps

To add tests for a new service:

1. Create `your-service.test.ts` in the same directory as the service
2. Import `MockFunctionContext` and `createMockResponse`
3. Follow the pattern from existing test files
4. Run `pnpm test` to verify tests pass
5. Check coverage with `pnpm test:coverage`

## Troubleshooting

### Tests don't run

Make sure dependencies are installed:

```bash
pnpm install
```

### Mock not working

Verify you're calling `mockResolvedValueOnce` (for single call) or `mockResolvedValue` (for all calls):

```typescript
// Wrong - missing mock implementation
ctx.http.fetch.mockResolvedValueOnce();

// Right - returns a value
ctx.http.fetch.mockResolvedValueOnce(createMockResponse({ ok: true, data: {} }));
```

### Assertion fails unexpectedly

Use `console.log` to inspect what was actually called:

```typescript
console.log(ctx.firestore.updateBot.mock.calls);
expect(ctx.firestore.updateBot).toHaveBeenCalledWith(...);
```
