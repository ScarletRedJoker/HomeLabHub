/**
 * Authentication Provider Component
 * 
 * This module provides a global authentication context for the entire application.
 * It manages user authentication state, login/logout operations, and admin permissions
 * through Discord OAuth integration.
 * 
 * Key Features:
 * - Centralized authentication state management
 * - Discord OAuth login flow
 * - Admin permission checking based on Discord server roles
 * - User session management with automatic refetching
 * - Toast notifications for auth events
 * 
 * @module AuthProvider
 */

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useAuth, AuthUser } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

/**
 * Shape of the authentication context provided to all child components
 * 
 * @interface AuthContextType
 * @property {AuthUser | null} user - Current authenticated user or null if not logged in
 * @property {boolean} isAuthenticated - Whether a user is currently authenticated
 * @property {boolean} isAdmin - Whether the current user has admin privileges
 * @property {boolean} isLoading - Whether auth state is being determined
 * @property {Function} login - Initiates Discord OAuth login flow
 * @property {Function} logout - Logs out user and clears session
 */
interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

// Create context with undefined default to enforce provider usage
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider Component
 * 
 * Wraps the application to provide authentication state and methods to all components.
 * Uses React Query (via useAuth hook) for server-state management and automatic refetching.
 * 
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components that will have access to auth context
 * @returns {JSX.Element} Provider component wrapping children
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { user, isAuthenticated, isAdmin, isLoading, logout, refetch } = useAuth();

  useEffect(() => {
    console.log('[AuthProvider] Auth state:', {
      isAuthenticated,
      isAdmin,
      isLoading,
      username: user?.username,
      userId: user?.id
    });
  }, [isAuthenticated, isAdmin, isLoading, user]);

  /**
   * Initiates Discord OAuth login flow
   * Redirects user to Discord authorization page
   */
  const login = () => {
    window.location.href = '/auth/discord';
  };

  /**
   * Handles user logout
   * Calls the logout endpoint, clears session, and shows success notification
   */
  const handleLogout = async () => {
    await logout();
    toast({
      title: 'Logged out',
      description: 'You have been successfully logged out',
    });
  };

  /**
   * Convert user to safe type (AuthUser | null)
   * 
   * Why: useAuth returns `AuthUser | undefined` during initial load, but our context
   * uses `AuthUser | null` for semantic clarity (undefined = loading, null = not authenticated).
   * This conversion ensures type safety while providing a clearer API to consumers.
   */
  const safeUser: AuthUser | null = user === undefined ? null : user;

  return (
    <AuthContext.Provider
      value={{
        user: safeUser,
        isAuthenticated,
        isAdmin,
        isLoading,
        login,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access authentication context
 * 
 * Must be used within an AuthProvider component tree.
 * Throws an error if used outside of AuthProvider to catch misuse early.
 * 
 * @returns {AuthContextType} Authentication context with user state and methods
 * @throws {Error} If used outside of AuthProvider
 * 
 * @example
 * function MyComponent() {
 *   const { user, isAuthenticated, login, logout } = useAuthContext();
 *   
 *   if (!isAuthenticated) {
 *     return <button onClick={login}>Login</button>;
 *   }
 *   
 *   return <div>Welcome, {user.username}!</div>;
 * }
 */
export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}