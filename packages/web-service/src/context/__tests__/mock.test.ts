import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockContext } from '../context.mock';
import type { User, UserData } from '../types';

describe('MockContext', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = new MockContext();
  });

  it('should implement the AppContext interface', () => {
    // Verify all required methods exist
    expect(ctx.signInWithDiscord).toBeDefined();
    expect(ctx.signOut).toBeDefined();
    expect(ctx.watchAuthState).toBeDefined();
    expect(ctx.getCurrentUser).toBeDefined();
    expect(ctx.getUserData).toBeDefined();
    expect(ctx.watchUserData).toBeDefined();
    expect(ctx.updateUserData).toBeDefined();
    expect(ctx.watchUserGuilds).toBeDefined();
    expect(ctx.getGuildStatus).toBeDefined();
    expect(ctx.getGuildLogs).toBeDefined();
    expect(ctx.restartGuild).toBeDefined();
    expect(ctx.deployGuildUpdate).toBeDefined();
    expect(ctx.deprovisionGuild).toBeDefined();
    expect(ctx.getSubscription).toBeDefined();
    expect(ctx.watchSubscription).toBeDefined();
    expect(ctx.createGuildSubscription).toBeDefined();
    expect(ctx.createBillingPortal).toBeDefined();
    expect(ctx.processDiscordOAuth).toBeDefined();
    expect(ctx.initiateGmailOAuth).toBeDefined();
    expect(ctx.exchangeGmailToken).toBeDefined();
    expect(ctx.disconnectGmail).toBeDefined();
    expect(ctx.logger).toBeDefined();
    expect(ctx.getCurrentTime).toBeDefined();
    expect(ctx.generateOAuthState).toBeDefined();
    expect(ctx.parseOAuthState).toBeDefined();
    expect(ctx.openExternalUrl).toBeDefined();
  });

  it('should return mock values for utility functions', () => {
    const time = ctx.getCurrentTime();
    expect(time).toEqual(new Date('2024-01-01T00:00:00Z'));

    const state = ctx.generateOAuthState({ foo: 'bar' });
    expect(state).toBe(btoa(JSON.stringify({ foo: 'bar' })));

    const parsed = ctx.parseOAuthState(state);
    expect(parsed).toEqual({ foo: 'bar' });
  });

  it('should allow mocking return values', async () => {
    const mockUser: User = {
      id: 'user123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null,
    };

    ctx.signInWithDiscord.mockResolvedValue(mockUser);

    const result = await ctx.signInWithDiscord();
    expect(result).toEqual(mockUser);
    expect(ctx.signInWithDiscord).toHaveBeenCalledTimes(1);
  });

  it('should allow mocking watch functions', () => {
    const unsubscribe = vi.fn();
    ctx.watchAuthState.mockReturnValue(unsubscribe);

    const listener = vi.fn();
    const unsub = ctx.watchAuthState(listener);

    expect(ctx.watchAuthState).toHaveBeenCalledWith(listener);
    expect(unsub).toBe(unsubscribe);
  });

  it('should track logger calls', () => {
    ctx.logger.info('test message', { foo: 'bar' });
    ctx.logger.error('error message', new Error('test error'));
    ctx.logger.warn('warning message');

    expect(ctx.logger.info).toHaveBeenCalledWith('test message', { foo: 'bar' });
    expect(ctx.logger.error).toHaveBeenCalledWith('error message', new Error('test error'));
    expect(ctx.logger.warn).toHaveBeenCalledWith('warning message');
  });

  it('should reset all mocks', () => {
    ctx.signInWithDiscord.mockResolvedValue({
      id: 'user123',
      email: 'test@example.com',
      displayName: 'Test',
      photoURL: null,
    });

    ctx.reset();

    // After reset, mock should not have previous setup
    expect(ctx.signInWithDiscord).not.toHaveBeenCalled();
  });

  it('should handle user data operations', async () => {
    const mockUserData: UserData = {
      id: 'user123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null,
      createdAt: '2024-01-01T00:00:00Z',
      lastLoginAt: '2024-01-01T00:00:00Z',
    };

    ctx.getUserData.mockResolvedValue(mockUserData);
    ctx.updateUserData.mockResolvedValue();

    const userData = await ctx.getUserData('user123');
    expect(userData).toEqual(mockUserData);

    await ctx.updateUserData('user123', { displayName: 'Updated Name' });
    expect(ctx.updateUserData).toHaveBeenCalledWith('user123', { displayName: 'Updated Name' });
  });
});
