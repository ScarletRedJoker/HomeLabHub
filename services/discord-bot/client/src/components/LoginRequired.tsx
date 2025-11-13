/**
 * Authentication Guard Component
 * 
 * A higher-order component that protects routes and pages from unauthorized access.
 * Displays appropriate UI states for loading, unauthenticated, and unauthorized users.
 * 
 * Features:
 * - Loading state with spinner during auth check
 * - Login prompt for unauthenticated users
 * - Admin-only protection with proper error messaging
 * - Discord-branded login button with SVG icon
 * 
 * @module LoginRequired
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthContext } from './AuthProvider';
import { Loader2 } from 'lucide-react';

/**
 * Props for the LoginRequired component
 * 
 * @interface LoginRequiredProps
 * @property {React.ReactNode} children - Content to display if user is authenticated (and admin if required)
 * @property {boolean} [adminOnly] - If true, requires user to have admin privileges (defaults to false)
 */
interface LoginRequiredProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}

/**
 * LoginRequired Component
 * 
 * Conditionally renders children based on authentication state.
 * Shows different UI states for loading, unauthenticated, and unauthorized users.
 * 
 * Flow:
 * 1. While loading: Show spinner with "Checking authentication..." message
 * 2. If not authenticated: Show login card with Discord OAuth button
 * 3. If authenticated but adminOnly=true and not admin: Show access denied message
 * 4. Otherwise: Render children (the protected content)
 * 
 * @param {LoginRequiredProps} props - Component props
 * @returns {JSX.Element} Appropriate UI based on authentication state
 * 
 * @example
 * // Protect a page for any authenticated user
 * <LoginRequired>
 *   <DashboardShell />
 * </LoginRequired>
 * 
 * @example
 * // Protect a page for admins only
 * <LoginRequired adminOnly={true}>
 *   <Settings />
 * </LoginRequired>
 */
export function LoginRequired({ children, adminOnly = false }: LoginRequiredProps) {
  const { isAuthenticated, isAdmin, isLoading, login } = useAuthContext();

  /**
   * Loading State
   * Shows a centered spinner while auth state is being determined.
   * Prevents flashing of login screen during initial page load.
   */
  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg">Checking authentication...</span>
      </div>
    );
  }

  /**
   * Unauthenticated State
   * Shows a login card with Discord OAuth button.
   * Includes helpful messaging and Discord branding.
   */
  if (!isAuthenticated) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Login Required</CardTitle>
            <CardDescription>
              You need to be logged in to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4">
              This area is restricted to authenticated users only. Please login with your Discord account to continue.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={login} className="w-full">
              <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36">
                <path
                  fill="currentColor"
                  d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"
                />
              </svg>
              Login with Discord
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  /**
   * Unauthorized State (Admin Required)
   * Shows access denied message when user is authenticated but lacks admin privileges.
   * Only triggers when adminOnly prop is true and user is not an admin.
   */
  if (adminOnly && !isAdmin) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>
              You don't have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">
              This area is restricted to Discord server administrators only. If you believe you should have access,
              please contact the server owner.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /**
   * Authorized State
   * User is authenticated (and admin if required), so render the protected content.
   */
  return <>{children}</>;
}