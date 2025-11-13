/**
 * Server Context Provider
 * 
 * Manages the currently selected Discord server for multi-server support.
 * Tracks which server's tickets and data should be displayed to the user.
 * 
 * Features:
 * - Server selection state management
 * - Automatic validation against user's connected servers
 * - Server name lookup from user's admin guilds
 * - Auto-reset on user change or loss of access
 * - Server-specific vs global view tracking
 * 
 * @module ServerContext
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuthContext } from '@/components/AuthProvider';

/**
 * Shape of the server context
 * 
 * @interface ServerContextType
 * @property {string | null} selectedServerId - Discord server ID currently selected (null = all servers)
 * @property {Function} setSelectedServerId - Function to change selected server
 * @property {string | null} selectedServerName - Human-readable name of selected server
 * @property {boolean} isServerSpecific - True if viewing a specific server (not global view)
 */
interface ServerContextType {
  selectedServerId: string | null;
  setSelectedServerId: (serverId: string | null) => void;
  selectedServerName: string | null;
  isServerSpecific: boolean;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

/**
 * Props for ServerProvider component
 */
interface ServerProviderProps {
  children: React.ReactNode;
}

/**
 * ServerProvider Component
 * 
 * Provides server selection state to all child components.
 * Automatically validates and resets selection when user changes or loses access.
 * 
 * @param {ServerProviderProps} props - Component props
 * @returns {JSX.Element} Provider component wrapping children
 */
export function ServerProvider({ children }: ServerProviderProps) {
  const { user } = useAuthContext();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  /**
   * Derive server name from selected ID
   * 
   * Why useMemo:
   * - Lookup is performed against user's adminGuilds array
   * - Prevents unnecessary re-lookups when other state changes
   * - Only recomputes when selectedServerId or adminGuilds changes
   */
  const selectedServerName = React.useMemo(() => {
    if (!selectedServerId || !user?.adminGuilds) return null;
    const server = user.adminGuilds.find(guild => guild.id === selectedServerId);
    return server?.name || null;
  }, [selectedServerId, user?.adminGuilds]);

  /**
   * Validate and reset server selection on user/access changes
   * 
   * Why this effect is necessary:
   * 1. User logs out → clear selection (user becomes null)
   * 2. User loses access to server → clear selection (not in connectedServers)
   * 3. User switches accounts → clear selection (new user object)
   * 
   * This prevents showing data from servers user no longer has access to.
   */
  useEffect(() => {
    // Clear selection if user logged out or has no connected servers
    if (!user || !user.connectedServers || user.connectedServers.length === 0) {
      setSelectedServerId(null);
      return;
    }

    /**
     * Validate current selection against user's connected servers
     * 
     * Why this check:
     * - User permissions can change (removed from server, role changed)
     * - Bot might be removed from server
     * - connectedServers is updated on each login with current access
     */
    if (selectedServerId && !user.connectedServers.includes(selectedServerId)) {
      setSelectedServerId(null);
    }
  }, [user, selectedServerId]);

  /**
   * Helper flag for components to check if viewing a specific server
   * vs. viewing data from all servers (global view)
   */
  const isServerSpecific = selectedServerId !== null;

  const value: ServerContextType = {
    selectedServerId,
    setSelectedServerId,
    selectedServerName,
    isServerSpecific,
  };

  return (
    <ServerContext.Provider value={value}>
      {children}
    </ServerContext.Provider>
  );
}

/**
 * Hook to access server context
 * 
 * Provides access to selected server state and controls.
 * Must be used within a ServerProvider component tree.
 * 
 * @returns {ServerContextType} Server context with selected server and controls
 * @throws {Error} If used outside of ServerProvider
 * 
 * @example
 * function ServerSelector() {
 *   const { selectedServerId, setSelectedServerId, selectedServerName } = useServerContext();
 *   
 *   return (
 *     <div>
 *       Current: {selectedServerName || "All Servers"}
 *       <button onClick={() => setSelectedServerId("123...")}>
 *         Switch Server
 *       </button>
 *     </div>
 *   );
 * }
 */
export function useServerContext() {
  const context = useContext(ServerContext);
  if (context === undefined) {
    throw new Error('useServerContext must be used within a ServerProvider');
  }
  return context;
}