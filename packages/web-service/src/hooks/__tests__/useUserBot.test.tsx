import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useUserBot } from '../useUserBot';
import { MockContext } from '../../context/context.mock';
import { AppContextProvider } from '../../context/AppContextProvider';
import type { BotValidationResult } from '../../context/types';

describe('useUserBot', () => {
  let mockContext: MockContext;

  beforeEach(() => {
    mockContext = new MockContext();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppContextProvider context={mockContext}>{children}</AppContextProvider>
  );

  it('should validate token on mount if initialToken provided', async () => {
    const mockResult: BotValidationResult = {
      valid: true,
      bot: {
        id: 'bot123',
        username: 'TestBot',
        discriminator: '0001',
        avatar: null,
      },
      guilds: [
        {
          id: 'guild1',
          name: 'Test Guild',
          icon: null,
          owner: true,
          permissions: '8',
        },
      ],
    };

    mockContext.validateBotToken.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useUserBot('user123', 'token123'), { wrapper });

    await waitFor(() => {
      expect(result.current.validating).toBe(false);
    });

    expect(result.current.validationResult).toEqual(mockResult);
    expect(mockContext.validateBotToken).toHaveBeenCalledWith('token123');
  });

  it('should save bot token', async () => {
    mockContext.saveBotToken.mockResolvedValue();
    mockContext.validateBotToken.mockResolvedValue({ valid: true });

    const { result } = renderHook(() => useUserBot('user123'), { wrapper });

    const success = await result.current.saveToken('newtoken123');

    expect(success).toBe(true);
    expect(mockContext.saveBotToken).toHaveBeenCalledWith('user123', 'newtoken123');

    await waitFor(() => {
      expect(result.current.token).toBe('newtoken123');
    });
  });

  it('should save guild selection', async () => {
    mockContext.saveGuildSelection.mockResolvedValue();

    const { result } = renderHook(() => useUserBot('user123'), { wrapper });

    const success = await result.current.saveGuildSelection('guild123');

    expect(success).toBe(true);
    expect(mockContext.saveGuildSelection).toHaveBeenCalledWith('user123', 'guild123');
  });

  it('should clear token', async () => {
    mockContext.clearBotToken.mockResolvedValue();
    mockContext.validateBotToken.mockResolvedValue({ valid: true });

    const { result } = renderHook(() => useUserBot('user123', 'token123'), { wrapper });

    await waitFor(() => {
      expect(result.current.token).toBe('token123');
    });

    const success = await result.current.clearToken();

    expect(success).toBe(true);
    expect(mockContext.clearBotToken).toHaveBeenCalledWith('user123');

    await waitFor(() => {
      expect(result.current.token).toBeUndefined();
      expect(result.current.validationResult).toBeNull();
    });
  });

  it('should handle validation errors', async () => {
    mockContext.validateBotToken.mockRejectedValue(new Error('Invalid token'));

    const { result } = renderHook(() => useUserBot('user123', 'badtoken'), { wrapper });

    await waitFor(() => {
      expect(result.current.validating).toBe(false);
    });

    expect(result.current.validationResult).toEqual({
      valid: false,
      error: 'An error occurred while validating the token.',
    });
  });

  it('should handle save token errors', async () => {
    mockContext.saveBotToken.mockRejectedValue(new Error('Save failed'));

    const { result } = renderHook(() => useUserBot('user123'), { wrapper });

    const success = await result.current.saveToken('newtoken');

    expect(success).toBe(false);
  });

  it('should revalidate token', async () => {
    const mockResult: BotValidationResult = { valid: true };
    mockContext.validateBotToken.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useUserBot('user123', 'token123'), { wrapper });

    await waitFor(() => {
      expect(result.current.validating).toBe(false);
    });

    mockContext.validateBotToken.mockClear();
    mockContext.validateBotToken.mockResolvedValue(mockResult);

    result.current.revalidate();

    await waitFor(() => {
      expect(mockContext.validateBotToken).toHaveBeenCalledTimes(1);
    });
  });
});
