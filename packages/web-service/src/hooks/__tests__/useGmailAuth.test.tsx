import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGmailAuth } from '../useGmailAuth';
import { MockContext } from '../../context/context.mock';
import { AppContextProvider } from '../../context/AppContextProvider';
import type { GmailAuthResult } from '../../context/types';

describe('useGmailAuth', () => {
  let mockContext: MockContext;

  beforeEach(() => {
    mockContext = new MockContext();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppContextProvider context={mockContext}>{children}</AppContextProvider>
  );

  it('should initiate OAuth when botId is provided', () => {
    mockContext.initiateGmailOAuth.mockImplementation(() => {});

    const { result } = renderHook(() => useGmailAuth('user123', 'bot123'), { wrapper });

    result.current.initiateOAuth();

    expect(mockContext.initiateGmailOAuth).toHaveBeenCalledWith('user123', 'bot123');
  });

  it('should set error when initiating OAuth without botId', async () => {
    const { result } = renderHook(() => useGmailAuth('user123'), { wrapper });

    result.current.initiateOAuth();

    await waitFor(() => {
      expect(result.current.error).toBe('Bot ID is required to connect Gmail');
    });
    expect(mockContext.initiateGmailOAuth).not.toHaveBeenCalled();
  });

  it('should exchange token successfully', async () => {
    const mockResult: GmailAuthResult = {
      success: true,
      email: 'test@gmail.com',
    };

    mockContext.exchangeGmailToken.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useGmailAuth('user123', 'bot123'), { wrapper });

    const exchangeResult = await result.current.exchangeToken('authcode123', 'bot123');

    expect(exchangeResult).toEqual(mockResult);
    expect(mockContext.exchangeGmailToken).toHaveBeenCalledWith(
      'authcode123',
      'user123',
      'bot123',
      expect.stringContaining('/auth/callback/gmail')
    );
  });

  it('should handle exchange token error', async () => {
    mockContext.exchangeGmailToken.mockRejectedValue(new Error('Exchange failed'));

    const { result } = renderHook(() => useGmailAuth('user123', 'bot123'), { wrapper });

    const exchangeResult = await result.current.exchangeToken('authcode123', 'bot123');

    await waitFor(() => {
      expect(exchangeResult).toEqual({
        success: false,
        error: 'Exchange failed',
      });
      expect(result.current.error).toBe('Exchange failed');
    });
  });

  it('should disconnect Gmail', async () => {
    mockContext.disconnectGmail.mockResolvedValue();

    const { result } = renderHook(() => useGmailAuth('user123', 'bot123'), { wrapper });

    await result.current.disconnect();

    expect(mockContext.disconnectGmail).toHaveBeenCalledWith('user123', 'bot123');
  });

  it('should set error when disconnecting without botId', async () => {
    const { result } = renderHook(() => useGmailAuth('user123'), { wrapper });

    await result.current.disconnect();

    await waitFor(() => {
      expect(result.current.error).toBe('Bot ID is required to disconnect Gmail');
    });
    expect(mockContext.disconnectGmail).not.toHaveBeenCalled();
  });

  it('should handle disconnect error', async () => {
    mockContext.disconnectGmail.mockRejectedValue(new Error('Disconnect failed'));

    const { result } = renderHook(() => useGmailAuth('user123', 'bot123'), { wrapper });

    await result.current.disconnect();

    await waitFor(() => {
      expect(result.current.error).toBe('Disconnect failed');
    });
  });

  it('should update isConnecting state during operations', async () => {
    mockContext.exchangeGmailToken.mockImplementation(() => {
      return new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100));
    });

    const { result } = renderHook(() => useGmailAuth('user123', 'bot123'), { wrapper });

    const promise = result.current.exchangeToken('code', 'bot123');

    await waitFor(() => {
      expect(result.current.isConnecting).toBe(true);
    });

    await promise;

    await waitFor(() => {
      expect(result.current.isConnecting).toBe(false);
    });
  });
});
