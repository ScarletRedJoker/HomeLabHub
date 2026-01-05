import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerContext } from '@/contexts/ServerContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  Sparkles,
  Users,
  Shield,
  Star,
  Radio,
  Ticket,
  Coins,
  Zap
} from 'lucide-react';

interface FeatureConfig {
  id: string;
  name: string;
  description: string;
  status: 'configured' | 'not_configured' | 'partial';
  tab: string;
}

interface OnboardingStatusData {
  features: FeatureConfig[];
  summary: {
    configured: number;
    partial: number;
    notConfigured: number;
    total: number;
    completionPercentage: number;
  };
}

interface OnboardingChecklistProps {
  onNavigateToTab?: (tab: string) => void;
}

const featureIcons: Record<string, React.ReactNode> = {
  welcome: <Users className="h-4 w-4" />,
  moderation: <Shield className="h-4 w-4" />,
  leveling: <Star className="h-4 w-4" />,
  streams: <Radio className="h-4 w-4" />,
  tickets: <Ticket className="h-4 w-4" />,
  economy: <Coins className="h-4 w-4" />,
  starboard: <Sparkles className="h-4 w-4" />
};

export default function OnboardingChecklist({ onNavigateToTab }: OnboardingChecklistProps) {
  const { selectedServerId } = useServerContext();
  const [isOpen, setIsOpen] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  const { data: onboardingStatus, isLoading, error } = useQuery<OnboardingStatusData>({
    queryKey: [`/api/servers/${selectedServerId}/onboarding-status`],
    enabled: !!selectedServerId && !isDismissed,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const dismissedServers = JSON.parse(localStorage.getItem('dismissedOnboardingServers') || '{}');
    if (selectedServerId && dismissedServers[selectedServerId]) {
      const dismissedAt = new Date(dismissedServers[selectedServerId]);
      const hoursSinceDismissed = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceDismissed < 24) {
        setIsDismissed(true);
      } else {
        const updated = { ...dismissedServers };
        delete updated[selectedServerId];
        localStorage.setItem('dismissedOnboardingServers', JSON.stringify(updated));
        setIsDismissed(false);
      }
    } else {
      setIsDismissed(false);
    }
  }, [selectedServerId]);

  const handleDismiss = () => {
    if (selectedServerId) {
      const dismissedServers = JSON.parse(localStorage.getItem('dismissedOnboardingServers') || '{}');
      dismissedServers[selectedServerId] = new Date().toISOString();
      localStorage.setItem('dismissedOnboardingServers', JSON.stringify(dismissedServers));
    }
    setIsDismissed(true);
  };

  const handleConfigureFeature = (featureId: string, fallbackTab: string) => {
    if (onNavigateToTab) {
      // Use featureId for consistent navigation mapping in DashboardShell
      // Falls back to tab value if featureId is not recognized
      onNavigateToTab(featureId || fallbackTab);
    }
  };

  const getStatusIcon = (status: FeatureConfig['status']) => {
    switch (status) {
      case 'configured':
        return <CheckCircle2 className="h-5 w-5 text-green-400" />;
      case 'partial':
        return <AlertCircle className="h-5 w-5 text-yellow-400" />;
      case 'not_configured':
        return <XCircle className="h-5 w-5 text-discord-muted" />;
    }
  };

  const getStatusBadge = (status: FeatureConfig['status']) => {
    switch (status) {
      case 'configured':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Configured</Badge>;
      case 'partial':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Partial</Badge>;
      case 'not_configured':
        return <Badge className="bg-discord-dark text-discord-muted border-discord-dark">Not Set Up</Badge>;
    }
  };

  if (!selectedServerId || isDismissed) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-discord-sidebar via-discord-sidebar to-discord-bg border-discord-blue/30 shadow-lg shadow-discord-blue/10 mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-discord-blue/20 rounded-lg">
              <Zap className="h-5 w-5 text-discord-blue" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                Setup Progress
              </CardTitle>
              <p className="text-sm text-discord-muted mt-0.5">Loading configuration status...</p>
            </div>
          </div>
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-discord-blue"></div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-gradient-to-br from-discord-sidebar via-discord-sidebar to-discord-bg border-yellow-500/30 shadow-lg shadow-yellow-500/10 mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-white">Setup Progress</CardTitle>
                <p className="text-sm text-yellow-400 mt-0.5">
                  Unable to load configuration status. You can still configure features manually.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="h-8 w-8 text-discord-muted hover:text-white hover:bg-discord-dark"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (!onboardingStatus) {
    return null;
  }

  const { features, summary } = onboardingStatus;

  if (summary.completionPercentage === 100) {
    return null;
  }

  const unconfiguredFeatures = features.filter(f => f.status !== 'configured');
  const configuredFeatures = features.filter(f => f.status === 'configured');

  return (
    <Card className="bg-gradient-to-br from-discord-sidebar via-discord-sidebar to-discord-bg border-discord-blue/30 shadow-lg shadow-discord-blue/10 mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-discord-blue/20 rounded-lg">
                <Zap className="h-5 w-5 text-discord-blue" />
              </div>
              <div>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  Setup Progress
                  <Badge className="bg-discord-blue/20 text-discord-blue border-discord-blue/30 text-xs">
                    {summary.completionPercentage}%
                  </Badge>
                </CardTitle>
                <p className="text-sm text-discord-muted mt-0.5">
                  {summary.configured} of {summary.total} features configured
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDismiss}
                className="h-8 w-8 text-discord-muted hover:text-white hover:bg-discord-dark"
              >
                <X className="h-4 w-4" />
              </Button>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-discord-muted hover:text-white hover:bg-discord-dark"
                >
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <Progress 
            value={summary.completionPercentage} 
            className="h-2 mt-3 bg-discord-dark"
          />
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {unconfiguredFeatures.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-discord-muted mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Needs Setup ({unconfiguredFeatures.length})
                </h4>
                <div className="space-y-2">
                  {unconfiguredFeatures.map((feature) => (
                    <div
                      key={feature.id}
                      className="flex items-center justify-between p-3 bg-discord-dark/50 rounded-lg border border-discord-dark hover:border-discord-blue/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(feature.status)}
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-discord-sidebar rounded-md">
                            {featureIcons[feature.id]}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-white">{feature.name}</p>
                            <p className="text-xs text-discord-muted">{feature.description}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(feature.status)}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConfigureFeature(feature.id, feature.tab)}
                          className="border-discord-blue text-discord-blue hover:bg-discord-blue hover:text-white h-8 text-xs"
                        >
                          Configure
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {configuredFeatures.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-discord-muted mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  Configured ({configuredFeatures.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {configuredFeatures.map((feature) => (
                    <div
                      key={feature.id}
                      className="flex items-center gap-2 p-2 bg-green-500/10 rounded-lg border border-green-500/20"
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                      <span className="p-1 bg-discord-sidebar/50 rounded">
                        {featureIcons[feature.id]}
                      </span>
                      <span className="text-sm text-green-400 truncate">{feature.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
