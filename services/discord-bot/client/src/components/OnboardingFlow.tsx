import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuthContext } from '@/components/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle, 
  Crown, 
  Users, 
  MessageSquare,
  Ticket,
  ArrowRight,
  ArrowLeft,
  Zap,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Server,
  Check
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface OnboardingFlowProps {
  onComplete: () => void;
}

interface SelectedServer {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
}

interface AvailableServersData {
  availableServers: SelectedServer[];
  userAdminGuilds: { id: string; name: string }[];
  botGuilds: { id: string; name: string }[];
}

interface BotInviteData {
  inviteURL: string;
  permissions: number;
  clientId: string;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedServers, setSelectedServers] = useState<SelectedServer[]>([]);
  const { user, isAdmin } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch bot invite URL
  const { data: inviteData } = useQuery<BotInviteData>({
    queryKey: ['/api/bot/invite-url'],
    staleTime: Infinity,
  });

  // Fetch available servers (intersection of user admin guilds and bot guilds)
  const { 
    data: availableServersData, 
    isLoading: isLoadingServers, 
    error: serversError,
    refetch: refetchServers
  } = useQuery<AvailableServersData>({
    queryKey: ['/api/auth/available-servers'],
    enabled: isAdmin && currentStep >= 2,
    retry: 3,
    staleTime: 5 * 60 * 1000,
  });

  // Auto-select all available servers when they're loaded
  useEffect(() => {
    if (availableServersData?.availableServers && availableServersData.availableServers.length > 0) {
      // Only auto-select if user hasn't manually selected any servers yet
      if (selectedServers.length === 0) {
        console.log('[OnboardingFlow] Auto-selecting all available servers:', availableServersData.availableServers.length);
        setSelectedServers(availableServersData.availableServers);
      }
    }
  }, [availableServersData?.availableServers]);

  // Auto-refresh server list when user returns from OAuth flow
  useEffect(() => {
    if (!isAdmin || currentStep < 2) return;

    const handleWindowFocus = () => {
      console.log('[OnboardingFlow] Window focused - refreshing server list');
      refetchServers();
    };

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isAdmin, currentStep, refetchServers]);

  // Complete onboarding mutation
  const completeOnboardingMutation = useMutation({
    mutationFn: async (serversToConnect?: SelectedServer[]) => {
      const servers = serversToConnect || selectedServers;
      console.log('[OnboardingFlow] Completing onboarding with servers:', servers.map(s => s.name));
      return apiRequest('POST', '/api/auth/complete-onboarding', {
        selectedServers: servers.map(s => s.id)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({
        title: 'Welcome!',
        description: 'You\'re all set up and ready to use the ticket system.',
      });
      onComplete();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Setup failed: ${error}`,
        variant: 'destructive',
      });
    }
  });

  const handleServerToggle = (server: SelectedServer) => {
    setSelectedServers(prev => {
      const exists = prev.find(s => s.id === server.id);
      if (exists) {
        return prev.filter(s => s.id !== server.id);
      } else {
        return [...prev, server];
      }
    });
  };

  const handleNext = () => {
    setCurrentStep(prev => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSkipToEnd = () => {
    // If there are available servers and none selected, auto-select all before completing
    if (availableServersData?.availableServers && availableServersData.availableServers.length > 0 && selectedServers.length === 0) {
      console.log('[OnboardingFlow] Skip clicked with available servers - auto-selecting all servers');
      const allServers = availableServersData.availableServers;
      setSelectedServers(allServers);
      completeOnboardingMutation.mutate(allServers);
    } else {
      completeOnboardingMutation.mutate(undefined);
    }
  };

  const handleComplete = () => {
    // Ensure we have at least some servers selected if available
    if (availableServersData?.availableServers && availableServersData.availableServers.length > 0 && selectedServers.length === 0) {
      console.log('[OnboardingFlow] Complete clicked with no servers selected - auto-selecting all');
      const allServers = availableServersData.availableServers;
      setSelectedServers(allServers);
      completeOnboardingMutation.mutate(allServers);
    } else {
      completeOnboardingMutation.mutate(undefined);
    }
  };

  const totalSteps = isAdmin ? 4 : 2;

  // Step 1: Welcome
  const renderWelcomeStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="text-center space-y-3 sm:space-y-4">
        <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-discord-blue to-purple-600 rounded-full flex items-center justify-center">
          <Ticket className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
        </div>
        
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Welcome{user?.username ? `, ${user.username}` : ''}!
          </h1>
          <p className="text-discord-text text-base sm:text-lg">
            Let's get you set up with the ticket system
          </p>
        </div>
      </div>

      <div className="bg-discord-dark rounded-lg p-4 sm:p-5 space-y-4">
        <h3 className="font-medium text-white text-base sm:text-lg">What you can do:</h3>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <MessageSquare className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-white font-medium">Create Support Tickets</p>
              <p className="text-discord-muted text-sm">Submit and track your support requests</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <CheckCircle className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-white font-medium">Real-Time Updates</p>
              <p className="text-discord-muted text-sm">Get instant notifications on ticket status</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <Users className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-white font-medium">Direct Communication</p>
              <p className="text-discord-muted text-sm">Chat with support staff in real-time</p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-yellow-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Crown className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-white font-medium">Admin Dashboard</p>
                <p className="text-discord-muted text-sm">Manage tickets across your Discord servers</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <Alert className="bg-purple-900/20 border-purple-500/20">
          <Crown className="h-4 w-4 text-purple-400" />
          <AlertDescription className="text-purple-300 text-sm">
            You have admin permissions! The next steps will help you connect your Discord servers.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  // Step 2: Bot Invitation Status
  const renderBotInviteStep = () => {
    const hasAdminServers = (availableServersData?.userAdminGuilds?.length || 0) > 0;
    const hasBotServers = (availableServersData?.botGuilds?.length || 0) > 0;
    const hasAvailableServers = (availableServersData?.availableServers?.length || 0) > 0;

    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white">Bot Setup</h2>
          <p className="text-discord-muted">
            Add the bot to your Discord servers to get started
          </p>
        </div>

        {isLoadingServers ? (
          <Card className="bg-discord-dark border-discord-sidebar" data-testid="card-loading">
            <CardContent className="p-8 text-center space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin text-discord-blue mx-auto" />
              <p className="text-discord-text">Checking your servers...</p>
            </CardContent>
          </Card>
        ) : serversError ? (
          <Card className="bg-red-900/20 border-red-500/20" data-testid="card-error">
            <CardContent className="p-6 space-y-4">
              <div className="text-center space-y-2">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
                <p className="text-red-400 font-medium">Failed to load server information</p>
                <p className="text-discord-muted text-sm">You can continue anyway or try again</p>
              </div>
              <Button 
                onClick={() => refetchServers()}
                variant="outline"
                className="w-full border-red-500/20 hover:bg-red-900/10 text-red-400"
                data-testid="button-retry"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Server Status Cards */}
            <div className="grid grid-cols-2 gap-4">
              <Card className={`${hasAdminServers ? 'bg-green-900/20 border-green-500/20' : 'bg-discord-dark border-discord-sidebar'}`} data-testid="card-admin-status">
                <CardContent className="p-4 text-center">
                  <div className={`w-10 h-10 ${hasAdminServers ? 'bg-green-600' : 'bg-discord-sidebar'} rounded-full flex items-center justify-center mx-auto mb-2`}>
                    {hasAdminServers ? (
                      <Check className="h-5 w-5 text-white" />
                    ) : (
                      <Crown className="h-5 w-5 text-discord-muted" />
                    )}
                  </div>
                  <p className="text-white font-medium text-sm mb-1">Admin Servers</p>
                  <p className={`text-2xl font-bold ${hasAdminServers ? 'text-green-400' : 'text-discord-muted'}`}>
                    {availableServersData?.userAdminGuilds?.length || 0}
                  </p>
                </CardContent>
              </Card>

              <Card className={`${hasBotServers ? 'bg-green-900/20 border-green-500/20' : 'bg-discord-dark border-discord-sidebar'}`} data-testid="card-bot-status">
                <CardContent className="p-4 text-center">
                  <div className={`w-10 h-10 ${hasBotServers ? 'bg-green-600' : 'bg-discord-sidebar'} rounded-full flex items-center justify-center mx-auto mb-2`}>
                    {hasBotServers ? (
                      <Check className="h-5 w-5 text-white" />
                    ) : (
                      <Server className="h-5 w-5 text-discord-muted" />
                    )}
                  </div>
                  <p className="text-white font-medium text-sm mb-1">Bot Present</p>
                  <p className={`text-2xl font-bold ${hasBotServers ? 'text-green-400' : 'text-discord-muted'}`}>
                    {availableServersData?.botGuilds?.length || 0}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Bot Invite Section */}
            {hasAdminServers && !hasBotServers && inviteData?.inviteURL && (
              <Alert className="bg-blue-900/20 border-blue-500/20" data-testid="alert-invite-needed">
                <Zap className="h-4 w-4 text-blue-400" />
                <AlertDescription className="text-blue-300">
                  <p className="font-medium mb-2">Ready to invite the bot!</p>
                  <p className="text-sm text-blue-300/80 mb-3">
                    Click the button below to add the bot to your Discord servers. The bot needs to be added to at least one of your admin servers.
                  </p>
                  <Button 
                    onClick={() => window.open(inviteData.inviteURL, '_blank')}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    data-testid="button-invite-bot"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Invite Bot to Discord
                  </Button>
                  <p className="text-xs text-blue-300/60 mt-2">
                    After inviting the bot, click "Refresh Status" below to continue
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {!hasAdminServers && inviteData?.inviteURL && (
              <Alert className="bg-yellow-900/20 border-yellow-500/20" data-testid="alert-no-admin">
                <AlertCircle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-300">
                  <p className="font-medium mb-2">No admin servers found</p>
                  <p className="text-sm text-yellow-300/80 mb-3">
                    You need administrator permissions in at least one Discord server to use admin features. You can still invite the bot or continue to use the basic ticket system.
                  </p>
                  <Button 
                    onClick={() => window.open(inviteData.inviteURL, '_blank')}
                    variant="outline"
                    className="w-full border-yellow-500/20 hover:bg-yellow-900/10 text-yellow-300"
                    data-testid="button-invite-bot-no-admin"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Invite Bot Anyway
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {hasAvailableServers && (
              <Alert className="bg-green-900/20 border-green-500/20" data-testid="alert-ready">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-300">
                  <p className="font-medium">Great! Bot is ready</p>
                  <p className="text-sm text-green-300/80">
                    The bot is present in {availableServersData?.availableServers?.length} server(s) where you have admin permissions.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* Refresh Button */}
            <Button 
              onClick={() => refetchServers()}
              variant="outline"
              className="w-full border-discord-sidebar hover:bg-discord-sidebar"
              data-testid="button-refresh-status"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Status
            </Button>

            {/* Server Lists */}
            {(hasAdminServers || hasBotServers) && (
              <details className="bg-discord-dark rounded-lg p-4">
                <summary className="cursor-pointer text-discord-text text-sm font-medium">
                  View Server Details
                </summary>
                <div className="mt-4 space-y-3 text-sm">
                  {hasAdminServers && (
                    <div>
                      <p className="text-discord-muted mb-2">Your admin servers:</p>
                      <div className="pl-3 space-y-1">
                        {availableServersData?.userAdminGuilds?.map(g => (
                          <p key={g.id} className="text-white">• {g.name}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {hasBotServers && (
                    <div>
                      <p className="text-discord-muted mb-2">Bot present in:</p>
                      <div className="pl-3 space-y-1">
                        {availableServersData?.botGuilds?.map(g => (
                          <p key={g.id} className="text-white">• {g.name}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    );
  };

  // Step 3: Server Selection
  const renderServerSelectionStep = () => {
    const availableServers = availableServersData?.availableServers || [];

    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white">Select Servers</h2>
          <p className="text-discord-muted">
            Choose which servers you want to manage from this dashboard
          </p>
        </div>

        {isLoadingServers ? (
          <Card className="bg-discord-dark border-discord-sidebar" data-testid="card-loading-servers">
            <CardContent className="p-8 text-center space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin text-discord-blue mx-auto" />
              <p className="text-discord-text">Loading servers...</p>
            </CardContent>
          </Card>
        ) : availableServers.length > 0 ? (
          <div className="space-y-4">
            <div className="space-y-3">
              {availableServers.map((server) => (
                <Card 
                  key={server.id}
                  className={`cursor-pointer transition-all ${
                    selectedServers.find(s => s.id === server.id)
                      ? 'bg-discord-blue/20 border-discord-blue'
                      : 'bg-discord-dark border-discord-sidebar hover:bg-discord-sidebar'
                  }`}
                  onClick={() => handleServerToggle(server)}
                  data-testid={`card-server-${server.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-discord-blue rounded-full flex items-center justify-center">
                          {server.icon ? (
                            <img 
                              src={`https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png`}
                              alt={server.name}
                              className="w-10 h-10 rounded-full"
                            />
                          ) : (
                            <Users className="h-5 w-5 text-white" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-medium text-white">{server.name}</h3>
                          <div className="flex items-center space-x-2 mt-1">
                            {server.owner && (
                              <Badge variant="secondary" className="text-xs" data-testid={`badge-owner-${server.id}`}>
                                <Crown className="h-3 w-3 mr-1" />
                                Owner
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              Admin
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        {selectedServers.find(s => s.id === server.id) && (
                          <CheckCircle className="h-5 w-5 text-green-500" data-testid={`icon-selected-${server.id}`} />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {selectedServers.length > 0 && (
              <Alert className="bg-green-900/20 border-green-500/20" data-testid="alert-selection-summary">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-300 text-sm">
                  Selected {selectedServers.length} server{selectedServers.length !== 1 ? 's' : ''} to manage
                </AlertDescription>
              </Alert>
            )}

            <Alert className="bg-blue-900/20 border-blue-500/20">
              <AlertCircle className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-300 text-sm">
                You can select multiple servers or skip this step. You can always change this later in settings.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <Card className="bg-discord-dark border-discord-sidebar" data-testid="card-no-servers">
            <CardContent className="p-8 text-center space-y-4">
              <Zap className="h-12 w-12 text-discord-muted mx-auto" />
              <div>
                <p className="text-white font-medium mb-2">No servers available</p>
                <p className="text-discord-muted text-sm">
                  Make sure the bot is added to servers where you have admin permissions
                </p>
              </div>
              <Button 
                onClick={handleBack}
                variant="outline"
                className="border-discord-sidebar hover:bg-discord-sidebar h-11 w-full sm:w-auto"
                data-testid="button-back-to-invite"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Bot Setup
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // Step 4: Complete
  const renderCompleteStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="text-center space-y-3 sm:space-y-4">
        <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-green-600 to-emerald-600 rounded-full flex items-center justify-center">
          <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
        </div>
        
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            You're All Set!
          </h1>
          <p className="text-discord-text text-base sm:text-lg">
            Your ticket system is ready to use
          </p>
        </div>
      </div>

      <Card className="bg-discord-dark border-discord-sidebar">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <h3 className="font-medium text-white text-base sm:text-lg">Setup Summary</h3>
          
          <div className="space-y-3 text-sm">
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-medium">Account Connected</p>
                <p className="text-discord-muted">Logged in as {user?.username}</p>
              </div>
            </div>

            {isAdmin && (
              <>
                {selectedServers.length > 0 ? (
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white font-medium">Servers Connected</p>
                      <p className="text-discord-muted">
                        Managing {selectedServers.length} server{selectedServers.length !== 1 ? 's' : ''}:
                      </p>
                      <div className="mt-1 pl-3">
                        {selectedServers.map(s => (
                          <p key={s.id} className="text-discord-text text-xs">• {s.name}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white font-medium">No Servers Selected</p>
                      <p className="text-discord-muted">You can add servers later in settings</p>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-medium">Ready to Use</p>
                <p className="text-discord-muted">You can now create and manage tickets</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Alert className="bg-blue-900/20 border-blue-500/20">
        <Zap className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300 text-sm">
          You can change these settings anytime from the Settings page
        </AlertDescription>
      </Alert>
    </div>
  );

  // Main render with step navigation
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" data-testid="modal-onboarding">
      <div className="bg-discord-sidebar rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header with progress */}
        <div className="p-4 sm:p-6 border-b border-discord-dark">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white">
                {currentStep === 1 && 'Welcome'}
                {currentStep === 2 && 'Bot Setup'}
                {currentStep === 3 && 'Server Selection'}
                {currentStep === 4 && 'Complete'}
              </h1>
              <p className="text-discord-muted text-xs sm:text-sm">
                Step {currentStep} of {totalSteps}
              </p>
            </div>
            {isAdmin && (
              <Badge variant="secondary" className="bg-purple-600/20 text-purple-400 border-purple-600/20">
                <Crown className="h-3 w-3 mr-1" />
                Admin
              </Badge>
            )}
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-discord-dark rounded-full h-2">
            <div 
              className="bg-discord-blue h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              data-testid="progress-bar"
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          {currentStep === 1 && renderWelcomeStep()}
          {currentStep === 2 && isAdmin && renderBotInviteStep()}
          {currentStep === 3 && isAdmin && renderServerSelectionStep()}
          {currentStep === 4 && renderCompleteStep()}
          {currentStep === 2 && !isAdmin && renderCompleteStep()}
        </div>

        {/* Footer with navigation */}
        <div className="p-4 sm:p-6 border-t border-discord-dark">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="order-2 sm:order-1">
              {currentStep > 1 && currentStep < totalSteps && (
                <Button 
                  variant="outline" 
                  onClick={handleBack}
                  className="border-discord-sidebar hover:bg-discord-sidebar h-11 w-full sm:w-auto"
                  data-testid="button-back"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 order-1 sm:order-2">
              {currentStep < totalSteps && currentStep > 1 && (
                <Button 
                  variant="outline"
                  onClick={handleSkipToEnd}
                  disabled={completeOnboardingMutation.isPending}
                  className="border-discord-sidebar hover:bg-discord-sidebar h-11 w-full sm:w-auto"
                  data-testid="button-skip"
                >
                  Skip Setup
                </Button>
              )}
              
              {currentStep < totalSteps ? (
                <Button 
                  onClick={handleNext}
                  className="bg-discord-blue hover:bg-blue-600 h-11 w-full sm:w-auto"
                  data-testid="button-next"
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button 
                  onClick={handleComplete}
                  disabled={completeOnboardingMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 h-11 w-full sm:w-auto"
                  data-testid="button-complete"
                >
                  {completeOnboardingMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Completing...
                    </>
                  ) : (
                    <>
                      Complete Setup
                      <CheckCircle className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
