/**
 * Authentication Hook
 * 
 * Provides authentication state and methods using React Query for server state management.
 * Handles user session, admin status, and logout functionality.
 * 
 * Features:
 * - Automatic user data fetching and caching
 * - Graceful handling of unauthenticated state (returns null instead of error)
 * - Admin status derivation from Discord server permissions
 * - Logout with automatic cache invalidation
 * - TypeScript type safety for user data
 * 
 * @module useAuth
 */

import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';

/**
 * Authenticated user data structure
 * 
 * Represents a Discord user with additional application-specific fields.
 * Admin status is determined by Discord server permissions (ADMINISTRATOR or owner).
 * 
 * @interface AuthUser
 * @property {string} id - Discord user ID
 * @property {string} username - Discord username
 * @property {string} discriminator - Discord discriminator (e.g., "1234")
 * @property {string | null} avatar - Discord avatar hash or null
 * @property {boolean | null} isAdmin - Whether user has admin perms in any connected server
 * @property {boolean} [onboardingCompleted] - Whether user completed initial setup
 * @property {string} [firstLoginAt] - Timestamp of first login
 * @property {string} [lastSeenAt] - Timestamp of last activity
 * @property {Array} [adminGuilds] - Discord servers where user is admin
 * @property {string[]} [connectedServers] - Server IDs user has connected to the app
 * @property {boolean} [needsOnboarding] - Computed flag for onboarding flow
 */
export type AuthUser = {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  isAdmin: boolean | null;
  onboardingCompleted?: boolean;
  firstLoginAt?: string;
  lastSeenAt?: string;
  adminGuilds?: Array<{
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
  }>;
  connectedServers?: string[];
  needsOnboarding?: boolean;
};

/**
 * Hook to manage authentication state
 * 
 * Uses React Query to fetch and cache user data from /api/auth/me endpoint.
 * Returns null (instead of throwing error) when user is not authenticated,
 * making it easy to check auth status without error boundaries.
 * 
 * Query Configuration:
 * - on401: 'returnNull' - Returns null instead of error when unauthenticated
 * - retry: false - Don't retry failed auth checks (they're expected to fail for logged-out users)
 * 
 * @returns {Object} Authentication state and methods
 * @returns {AuthUser | null | undefined} user - Current user (undefined during load, null if not authenticated)
 * @returns {boolean} isAuthenticated - True if user is logged in
 * @returns {boolean} isAdmin - True if user has admin privileges
 * @returns {boolean} isLoading - True while fetching user data
 * @returns {Error | null} error - Error object if fetch failed
 * @returns {Function} refetch - Function to manually refetch user data
 * @returns {Function} logout - Function to log out user
 * 
 * @example
 * function MyComponent() {
 *   const { user, isAuthenticated, isAdmin, logout } = useAuth();
 *   
 *   if (!isAuthenticated) {
 *     return <LoginPrompt />;
 *   }
 *   
 *   return (
 *     <div>
 *       Welcome, {user.username}!
 *       {isAdmin && <AdminPanel />}
 *       <button onClick={logout}>Logout</button>
 *     </div>
 *   );
 * }
 */
export function useAuth() {
  /**
   * Fetch user data from the server
   * 
   * Why getQueryFn with on401: 'returnNull':
   * - Standard behavior would throw an error on 401 (unauthorized)
   * - We want to treat "not logged in" as a valid state, not an error
   * - This allows components to check `if (!user)` without error boundaries
   */
  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = useQuery<AuthUser | null>({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    retry: false, // Don't retry - a 401 is a definitive "not logged in"
  });

  // Derive authentication state from user data
  const isAuthenticated = !!user;
  
  /**
   * Admin status is explicitly checked as === true
   * 
   * Why strict equality:
   * - isAdmin can be null (not yet determined), false (not admin), or true (admin)
   * - We only want isAdmin to be true when explicitly set to true
   * - null or undefined should be treated as "not admin"
   */
  const isAdmin = user?.isAdmin === true;

  /**
   * Logout function
   * 
   * Flow:
   * 1. Call server logout endpoint to destroy session
   * 2. Refetch user data (will now return null/401)
   * 3. React Query cache is automatically updated
   * 4. Components re-render with unauthenticated state
   */
  const logout = async () => {
    try {
      await fetch('/auth/logout');
      // Refetch to update cache with null user
      await refetch();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return {
    user,
    isAuthenticated,
    isAdmin,
    isLoading,
    error,
    refetch,
    logout,
  };
}