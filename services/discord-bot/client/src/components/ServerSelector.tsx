import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/components/AuthProvider';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Server, Plus, RefreshCw, Users, Crown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import OnboardingFlow from '@/components/OnboardingFlow';

interface ServerInfo {
  id: string;
  name: string;
  icon?: string;
  owner?: boolean;
}

interface AvailableServersResponse {
  availableServers: ServerInfo[];
  userAdminGuilds: { id: string; name: string }[];
  botGuilds: { id: string; name: string }[];
}

interface ServerSelectorProps {
  selectedServerId?: string | null;
  onServerSelect: (serverId: string | null) => void;
}

export default function ServerSelector({ selectedServerId, onServerSelect }: ServerSelectorProps) {
  const { user, isLoading: authLoading } = useAuthContext();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const queryClient = useQueryClient();

  // Fetch available servers dynamically from the API
  // Initialize query even during auth loading to prevent staleness
  const { 
    data: serverData, 
    isLoading: queryLoading, 
    error 
  } = useQuery<AvailableServersResponse>({
    queryKey: ['/api/auth/available-servers'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/auth/available-servers');
      return await response.json();
    },
    enabled: !!user?.isAdmin, // Only fetch if user is admin
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Show loading state while auth is loading
  if (authLoading) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-discord-text" />
          <span className="text-sm text-discord-text font-medium">Server:</span>
        </div>
        <Button 
          variant="outline" 
          disabled
          className="bg-discord-dark border-discord-sidebar text-white"
        >
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          Loading...
        </Button>
      </div>
    );
  }

  // Only return null after we're sure auth is complete and user is not admin
  if (!user || !user.isAdmin) {
    return null;
  }

  const availableServers: ServerInfo[] = serverData?.availableServers || [];

  // Find currently selected server details
  const selectedServer = selectedServerId 
    ? availableServers.find(server => server.id === selectedServerId)
    : null;

  const handleRestartOnboarding = () => {
    setShowOnboarding(true);
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    // Invalidate and refetch available servers instead of full page reload
    queryClient.invalidateQueries({ queryKey: ['/api/auth/available-servers'] });
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-discord-text" />
          <span className="text-sm text-discord-text font-medium">Server:</span>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              className="bg-discord-dark border-discord-sidebar text-white hover:bg-discord-sidebar"
            >
              <div className="flex items-center gap-2">
                {selectedServer ? (
                  <>
                    {selectedServer.icon ? (
                      <img 
                        src={`https://cdn.discordapp.com/icons/${selectedServer.id}/${selectedServer.icon}.png`}
                        alt={selectedServer.name}
                        className="w-4 h-4 rounded-full"
                      />
                    ) : (
                      <Users className="h-4 w-4" />
                    )}
                    <span>{selectedServer.name}</span>
                  </>
                ) : (
                  <>
                    <Server className="h-4 w-4" />
                    <span>All Servers</span>
                  </>
                )}
                <ChevronDown className="h-4 w-4" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          
          <DropdownMenuContent className="w-64 bg-discord-sidebar border-discord-dark">
            <DropdownMenuItem 
              onClick={() => onServerSelect(null)}
              className="text-white hover:bg-discord-dark cursor-pointer"
            >
              <Server className="h-4 w-4 mr-2" />
              All Servers
              {!selectedServerId && (
                <Badge variant="secondary" className="ml-auto text-xs">Selected</Badge>
              )}
            </DropdownMenuItem>
            
            <DropdownMenuSeparator className="bg-discord-dark" />
            
            {queryLoading ? (
              <div className="px-2 py-3 text-sm text-discord-muted text-center">
                <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1" />
                Loading servers...
              </div>
            ) : error ? (
              <div className="px-2 py-3 text-sm text-red-400 text-center">
                <RefreshCw className="h-4 w-4 mx-auto mb-1" />
                Failed to load servers
              </div>
            ) : availableServers.length > 0 ? (
              availableServers.map((server) => (
                <DropdownMenuItem 
                  key={server.id}
                  onClick={() => onServerSelect(server.id)}
                  className="text-white hover:bg-discord-dark cursor-pointer"
                >
                  <div className="flex items-center gap-2 flex-1">
                    {server.icon ? (
                      <img 
                        src={`https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png`}
                        alt={server.name}
                        className="w-4 h-4 rounded-full"
                      />
                    ) : (
                      <Users className="h-4 w-4" />
                    )}
                    <span className="truncate">{server.name}</span>
                    {server.owner && (
                      <Crown className="h-3 w-3 text-yellow-500" />
                    )}
                  </div>
                  {selectedServerId === server.id && (
                    <Badge variant="secondary" className="text-xs">Selected</Badge>
                  )}
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2 py-3 text-sm text-discord-muted text-center">
                No available servers
              </div>
            )}
            
            <DropdownMenuSeparator className="bg-discord-dark" />
            
            <DropdownMenuItem 
              onClick={handleRestartOnboarding}
              className="text-discord-blue hover:bg-discord-dark cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add More Servers
            </DropdownMenuItem>
            
            <DropdownMenuItem 
              onClick={handleRestartOnboarding}
              className="text-discord-muted hover:bg-discord-dark cursor-pointer"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Restart Setup
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Onboarding Modal */}
      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent className="max-w-2xl bg-discord-sidebar border-discord-dark">
          <DialogHeader>
            <DialogTitle className="text-white">Server Setup</DialogTitle>
            <DialogDescription className="text-discord-muted">
              Configure your Discord server to start using the ticket system.
            </DialogDescription>
          </DialogHeader>
          <OnboardingFlow onComplete={handleOnboardingComplete} />
        </DialogContent>
      </Dialog>
    </>
  );
}