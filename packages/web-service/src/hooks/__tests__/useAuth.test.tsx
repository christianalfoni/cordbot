import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '../useAuth';
import { MockContext } from '../../context/context.mock';
import { AppContextProvider } from '../../context/AppContextProvider';
import type { User, UserData } from '../../context/types';

describe('useAuth', () => {
  let mockContext: MockContext;

  beforeEach(() => {
    mockContext = new MockContext();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppContextProvider context={mockContext}>{children}</AppContextProvider>
  );

  it('should start with loading state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBe(null);
    expect(result.current.userData).toBe(null);
  });

  it('should handle auth state changes', async () => {
    const mockUser: User = {
      id: 'user123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null,
    };

    const mockUserData: UserData = {
      id: 'user123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null,
      createdAt: '2024-01-01T00:00:00Z',
      lastLoginAt: '2024-01-01T00:00:00Z',
    };

    // Setup mock to call auth listener immediately
    mockContext.watchAuthState.mockImplementation((listener) => {
      listener(mockUser);
      return () => {};
    });

    // Setup mock to call user data listener
    mockContext.watchUserData.mockImplementation((userId, listener) => {
      expect(userId).toBe('user123');
      listener(mockUserData);
      return () => {};
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.userData).toEqual(mockUserData);
    expect(mockContext.watchAuthState).toHaveBeenCalledTimes(1);
    expect(mockContext.watchUserData).toHaveBeenCalledWith('user123', expect.any(Function));
  });

  it('should sign in with Discord', async () => {
    const mockUser: User = {
      id: 'user123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null,
    };

    mockContext.signInWithDiscord.mockResolvedValue(mockUser);

    const { result } = renderHook(() => useAuth(), { wrapper });

    const user = await result.current.signInWithDiscord();

    expect(user).toEqual(mockUser);
    expect(mockContext.signInWithDiscord).toHaveBeenCalledTimes(1);
  });

  it('should sign out', async () => {
    mockContext.signOut.mockResolvedValue();

    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.signOut();

    expect(mockContext.signOut).toHaveBeenCalledTimes(1);
  });

  it('should handle sign in errors', async () => {
    const errorMessage = 'Auth failed';
    mockContext.signInWithDiscord.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await expect(result.current.signInWithDiscord()).rejects.toThrow(errorMessage);
  });

  it('should handle sign out errors', async () => {
    const errorMessage = 'Sign out failed';
    mockContext.signOut.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await expect(result.current.signOut()).rejects.toThrow(errorMessage);
  });

  it('should cleanup listeners on unmount', () => {
    const unsubscribeAuth = vi.fn();
    const unsubscribeUserData = vi.fn();

    mockContext.watchAuthState.mockReturnValue(unsubscribeAuth);
    mockContext.watchUserData.mockReturnValue(unsubscribeUserData);

    const { unmount } = renderHook(() => useAuth(), { wrapper });

    unmount();

    expect(unsubscribeAuth).toHaveBeenCalled();
  });
});
