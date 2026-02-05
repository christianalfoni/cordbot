import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGuilds } from '../useGuilds';
import { MockContext } from '../../context/context.mock';
import { AppContextProvider } from '../../context/AppContextProvider';
import type { Guild, GuildStatus, GuildLogs } from '../../context/types';

describe('useGuilds', () => {
  let mockContext: MockContext;

  beforeEach(() => {
    mockContext = new MockContext();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppContextProvider context={mockContext}>{children}</AppContextProvider>
  );

  it('should start with empty guilds when userId is null', () => {
    const { result } = renderHook(() => useGuilds(null), { wrapper });

    expect(result.current.guilds).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isListening).toBe(false);
  });

  it('should watch user guilds when userId is provided', async () => {
    const mockGuilds: Guild[] = [
      {
        id: 'guild1',
        guildName: 'Test Guild',
        guildIcon: null,
        status: 'active',
        tier: 'free',
        subscriptionId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        memoryContextSize: 10000,
      },
    ];

    mockContext.watchUserGuilds.mockImplementation((userId, listener) => {
      expect(userId).toBe('user123');
      listener(mockGuilds);
      return () => {};
    });

    const { result } = renderHook(() => useGuilds('user123'), { wrapper });

    await waitFor(() => {
      expect(result.current.isListening).toBe(false);
    });

    expect(result.current.guilds).toEqual(mockGuilds);
    expect(mockContext.watchUserGuilds).toHaveBeenCalledWith('user123', expect.any(Function));
  });

  it('should get guild status', async () => {
    const mockStatus: GuildStatus = {
      status: 'running',
      state: 'active',
      region: 'us-east',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      events: [],
    };

    mockContext.getGuildStatus.mockResolvedValue(mockStatus);

    const { result } = renderHook(() => useGuilds('user123'), { wrapper });

    const status = await result.current.getStatus('guild1');

    expect(status).toEqual(mockStatus);
    expect(mockContext.getGuildStatus).toHaveBeenCalledWith('guild1');
  });

  it('should get guild logs', async () => {
    const mockLogs: GuildLogs = {
      message: 'Bot started',
      cliCommand: 'fly logs',
      machineCommand: 'fly machine logs',
    };

    mockContext.getGuildLogs.mockResolvedValue(mockLogs);

    const { result } = renderHook(() => useGuilds('user123'), { wrapper });

    const logs = await result.current.getLogs('guild1');

    expect(logs).toEqual(mockLogs);
    expect(mockContext.getGuildLogs).toHaveBeenCalledWith('guild1');
  });

  it('should restart guild', async () => {
    mockContext.restartGuild.mockResolvedValue();

    const { result } = renderHook(() => useGuilds('user123'), { wrapper });

    await result.current.restartGuild('guild1');

    expect(mockContext.restartGuild).toHaveBeenCalledWith('guild1');
  });

  it('should deploy update', async () => {
    mockContext.deployGuildUpdate.mockResolvedValue();

    const { result } = renderHook(() => useGuilds('user123'), { wrapper });

    await result.current.deployUpdate('guild1', 'v1.0.0');

    expect(mockContext.deployGuildUpdate).toHaveBeenCalledWith('guild1', 'v1.0.0');
  });

  it('should deprovision guild', async () => {
    mockContext.deprovisionGuild.mockResolvedValue();

    const { result } = renderHook(() => useGuilds('user123'), { wrapper });

    await result.current.deprovisionGuild('guild1');

    expect(mockContext.deprovisionGuild).toHaveBeenCalledWith('guild1');
  });

  it('should handle errors in guild operations', async () => {
    const errorMessage = 'Failed to restart';
    mockContext.restartGuild.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useGuilds('user123'), { wrapper });

    await expect(result.current.restartGuild('guild1')).rejects.toThrow(errorMessage);

    await waitFor(() => {
      expect(result.current.error).toBe(errorMessage);
    });
  });

  it('should cleanup listener on unmount', () => {
    const unsubscribe = vi.fn();
    mockContext.watchUserGuilds.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useGuilds('user123'), { wrapper });

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
