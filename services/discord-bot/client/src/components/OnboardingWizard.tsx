import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { 
  Sparkles,
  ArrowRight, 
  ArrowLeft,
  CheckCircle2,
  Shield,
  MessageSquare,
  Users,
  Ticket,
  Star,
  Gift,
  Zap,
  Settings,
  Gamepad2,
  Video,
  Briefcase,
  X,
  Clock,
  PartyPopper,
  Rocket,
  Check,
  AlertCircle
} from 'lucide-react';

interface OnboardingWizardProps {
  serverId: string;
  serverName: string;
  onComplete: () => void;
  onSkip: () => void;
}

interface OnboardingData {
  status: {
    id: number;
    serverId: string;
    isSkipped: boolean;
    isCompleted: boolean;
    currentStep: string;
    appliedTemplate: string | null;
  };
  completedSteps: string[];
  totalSteps: number;
  isComplete: boolean;
}

interface BotSettings {
  welcomeEnabled?: boolean;
  welcomeChannelId?: string;
  welcomeMessageTemplate?: string;
  xpEnabled?: boolean;
  autoModEnabled?: boolean;
  starboardEnabled?: boolean;
  loggingChannelId?: string;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

const STEPS = [
  { id: 'welcome', title: 'Welcome', icon: Sparkles },
  { id: 'features', title: 'Features', icon: Settings },
  { id: 'welcome_channel', title: 'Welcome Setup', icon: Users },
  { id: 'moderation', title: 'Moderation', icon: Shield },
  { id: 'templates', title: 'Quick Start', icon: Rocket },
  { id: 'complete', title: 'Complete', icon: PartyPopper },
];

const FEATURE_OPTIONS = [
  { id: 'tickets', name: 'Ticket System', icon: Ticket, description: 'Support ticket management' },
  { id: 'welcome', name: 'Welcome Messages', icon: Users, description: 'Greet new members' },
  { id: 'xp', name: 'XP & Levels', icon: Star, description: 'Gamification system' },
  { id: 'moderation', name: 'Auto Moderation', icon: Shield, description: 'Keep your server safe' },
  { id: 'starboard', name: 'Starboard', icon: Star, description: 'Highlight best messages' },
  { id: 'economy', name: 'Economy', icon: Gift, description: 'Virtual currency system' },
];

const TEMPLATES = [
  {
    id: 'gaming',
    name: 'Gaming Community',
    icon: Gamepad2,
    description: 'Perfect for gaming communities with XP, levels, and fun features',
    color: 'from-purple-500 to-indigo-600',
    features: ['XP & Levels', 'Welcome Messages', 'Starboard', 'Auto Moderation'],
  },
  {
    id: 'creator',
    name: 'Content Creator',
    icon: Video,
    description: 'Ideal for streamers and content creators with engagement tools',
    color: 'from-pink-500 to-rose-600',
    features: ['Welcome Messages', 'Starboard', 'Boost Tracking', 'Stream Notifications'],
  },
  {
    id: 'business',
    name: 'Business/Professional',
    icon: Briefcase,
    description: 'Clean setup for professional communities and businesses',
    color: 'from-blue-500 to-cyan-600',
    features: ['Welcome Messages', 'Auto Moderation', 'Invite Tracking', 'Logging'],
  },
];

export default function OnboardingWizard({ serverId, serverName, onComplete, onSkip }: OnboardingWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['tickets', 'welcome']);
  const [welcomeChannel, setWelcomeChannel] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('Welcome to {server}, {user}! You are member #{memberCount}.');
  const [logChannel, setLogChannel] = useState('');
  const [autoModEnabled, setAutoModEnabled] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: onboardingData, isLoading } = useQuery<OnboardingData>({
    queryKey: [`/api/servers/${serverId}/onboarding`],
    enabled: !!serverId,
  });

  const { data: channelData } = useQuery<{ channels: DiscordChannel[] } | DiscordChannel[]>({
    queryKey: [`/api/servers/${serverId}/channels`],
    enabled: !!serverId,
  });
  
  // Handle both array and wrapped object response formats
  const channels = Array.isArray(channelData) ? channelData : (channelData?.channels || []);

  const { data: botSettings } = useQuery<BotSettings>({
    queryKey: [`/api/servers/${serverId}/settings`],
    enabled: !!serverId,
  });

  useEffect(() => {
    if (onboardingData?.status?.currentStep) {
      const stepIndex = STEPS.findIndex(s => s.id === onboardingData.status.currentStep);
      if (stepIndex >= 0) {
        setCurrentStepIndex(stepIndex);
      }
    }
  }, [onboardingData]);

  useEffect(() => {
    if (botSettings) {
      if (botSettings.welcomeChannelId) setWelcomeChannel(botSettings.welcomeChannelId);
      if (botSettings.welcomeMessageTemplate) setWelcomeMessage(botSettings.welcomeMessageTemplate);
      if (botSettings.loggingChannelId) setLogChannel(botSettings.loggingChannelId);
      if (botSettings.autoModEnabled) setAutoModEnabled(botSettings.autoModEnabled);
    }
  }, [botSettings]);

  const completeStepMutation = useMutation({
    mutationFn: async ({ step, stepData }: { step: string; stepData?: string }) => {
      return apiRequest('POST', `/api/servers/${serverId}/onboarding/complete-step`, { step, stepData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/onboarding`] });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/servers/${serverId}/onboarding/skip`);
    },
    onSuccess: () => {
      toast({ title: 'Onboarding skipped', description: 'You can always set up these features later in Settings.' });
      onSkip();
    },
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async (template: string) => {
      return apiRequest('POST', `/api/servers/${serverId}/onboarding/apply-template`, { template });
    },
    onSuccess: (_, template) => {
      toast({ title: 'Template applied!', description: `Your server is now configured for ${template} communities.` });
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/settings`] });
      setCurrentStepIndex(STEPS.length - 1);
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<BotSettings>) => {
      return apiRequest('PUT', `/api/servers/${serverId}/settings`, settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/settings`] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/servers/${serverId}/onboarding/complete`);
    },
    onSuccess: () => {
      toast({ title: 'Setup Complete!', description: 'Your bot is ready to go. Enjoy!' });
      onComplete();
    },
  });

  const currentStep = STEPS[currentStepIndex];
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;
  const textChannels = channels?.filter(c => c.type === 0) || [];

  const handleNext = async () => {
    if (currentStep.id === 'welcome_channel') {
      if (selectedFeatures.includes('welcome')) {
        await updateSettingsMutation.mutateAsync({
          welcomeEnabled: true,
          welcomeChannelId: welcomeChannel || undefined,
          welcomeMessageTemplate: welcomeMessage,
        });
      }
    }

    if (currentStep.id === 'moderation') {
      await updateSettingsMutation.mutateAsync({
        autoModEnabled,
        loggingChannelId: logChannel || undefined,
      });
    }

    await completeStepMutation.mutateAsync({ 
      step: currentStep.id,
      stepData: JSON.stringify({ selectedFeatures, welcomeChannel, welcomeMessage, logChannel, autoModEnabled })
    });

    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const toggleFeature = (featureId: string) => {
    setSelectedFeatures(prev => 
      prev.includes(featureId) 
        ? prev.filter(f => f !== featureId)
        : [...prev, featureId]
    );
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-discord-bg/95 backdrop-blur-sm flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-discord-blue"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-discord-bg/98 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-screen flex flex-col">
        <div className="sticky top-0 z-10 bg-discord-sidebar border-b border-discord-dark px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-discord-blue to-indigo-600 rounded-lg flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Setup Wizard</h1>
                <p className="text-sm text-discord-muted">{serverName}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 text-sm text-discord-muted">
                <span>Step {currentStepIndex + 1} of {STEPS.length}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => skipMutation.mutate()}
                className="text-discord-muted hover:text-white"
              >
                <X className="h-4 w-4 mr-1" />
                Skip
              </Button>
            </div>
          </div>

          <div className="max-w-4xl mx-auto mt-3">
            <Progress value={progress} className="h-2 bg-discord-dark" />
            <div className="flex justify-between mt-2">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const isCompleted = onboardingData?.completedSteps?.includes(step.id);
                const isCurrent = index === currentStepIndex;
                
                return (
                  <div key={step.id} className="flex flex-col items-center">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center transition-colors
                      ${isCompleted ? 'bg-green-500' : isCurrent ? 'bg-discord-blue' : 'bg-discord-dark'}
                    `}>
                      {isCompleted ? (
                        <Check className="h-4 w-4 text-white" />
                      ) : (
                        <Icon className={`h-4 w-4 ${isCurrent ? 'text-white' : 'text-discord-muted'}`} />
                      )}
                    </div>
                    <span className={`text-xs mt-1 hidden sm:block ${isCurrent ? 'text-white' : 'text-discord-muted'}`}>
                      {step.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-2xl">
            {currentStep.id === 'welcome' && (
              <Card className="bg-discord-sidebar border-discord-dark">
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto w-20 h-20 bg-gradient-to-br from-discord-blue to-indigo-600 rounded-2xl flex items-center justify-center mb-4">
                    <Sparkles className="h-10 w-10 text-white" />
                  </div>
                  <CardTitle className="text-2xl text-white">Welcome to Your Bot Setup!</CardTitle>
                  <CardDescription className="text-discord-muted text-base">
                    Let's get your bot configured for <span className="text-white font-medium">{serverName}</span>. 
                    This will only take a few minutes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4">
                    <div className="flex items-start gap-3 p-4 bg-discord-dark rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-white">Bot Connected</p>
                        <p className="text-sm text-discord-muted">Your bot is ready and connected to this server</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 bg-discord-dark rounded-lg">
                      <Shield className="h-5 w-5 text-discord-blue mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-white">Permissions Verified</p>
                        <p className="text-sm text-discord-muted">All required permissions are granted</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <Clock className="h-4 w-4 text-blue-400 flex-shrink-0" />
                    <p className="text-sm text-blue-300">
                      You can skip this wizard and configure settings manually anytime.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStep.id === 'features' && (
              <Card className="bg-discord-sidebar border-discord-dark">
                <CardHeader>
                  <CardTitle className="text-xl text-white flex items-center gap-2">
                    <Settings className="h-5 w-5 text-discord-blue" />
                    Choose Your Features
                  </CardTitle>
                  <CardDescription className="text-discord-muted">
                    Select the features you want to enable. Don't worry, you can change these later!
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {FEATURE_OPTIONS.map((feature) => {
                      const Icon = feature.icon;
                      const isSelected = selectedFeatures.includes(feature.id);
                      
                      return (
                        <button
                          key={feature.id}
                          onClick={() => toggleFeature(feature.id)}
                          className={`
                            flex items-start gap-3 p-4 rounded-lg border transition-all text-left
                            ${isSelected 
                              ? 'bg-discord-blue/10 border-discord-blue' 
                              : 'bg-discord-dark border-discord-dark hover:border-discord-muted'}
                          `}
                        >
                          <div className={`
                            w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                            ${isSelected ? 'bg-discord-blue' : 'bg-discord-sidebar'}
                          `}>
                            <Icon className={`h-5 w-5 ${isSelected ? 'text-white' : 'text-discord-muted'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`font-medium ${isSelected ? 'text-white' : 'text-discord-text'}`}>
                                {feature.name}
                              </p>
                              {isSelected && <Check className="h-4 w-4 text-discord-blue" />}
                            </div>
                            <p className="text-sm text-discord-muted">{feature.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStep.id === 'welcome_channel' && (
              <Card className="bg-discord-sidebar border-discord-dark">
                <CardHeader>
                  <CardTitle className="text-xl text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-discord-blue" />
                    Welcome Message Setup
                  </CardTitle>
                  <CardDescription className="text-discord-muted">
                    Configure how new members are greeted when they join your server.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-white">Welcome Channel</Label>
                    <Select value={welcomeChannel} onValueChange={setWelcomeChannel}>
                      <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                        <SelectValue placeholder="Select a channel..." />
                      </SelectTrigger>
                      <SelectContent className="bg-discord-dark border-discord-dark">
                        {textChannels.map((channel) => (
                          <SelectItem key={channel.id} value={channel.id} className="text-white">
                            #{channel.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Welcome Message</Label>
                    <Textarea
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      placeholder="Welcome to the server, {user}!"
                      className="bg-discord-dark border-discord-dark text-white min-h-[100px]"
                    />
                    <p className="text-xs text-discord-muted">
                      Available variables: {'{user}'}, {'{server}'}, {'{memberCount}'}
                    </p>
                  </div>

                  <div className="p-4 bg-discord-dark rounded-lg">
                    <p className="text-sm text-discord-muted mb-2">Preview:</p>
                    <p className="text-white">
                      {welcomeMessage
                        .replace('{user}', '@NewMember')
                        .replace('{server}', serverName)
                        .replace('{memberCount}', '1,234')}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStep.id === 'moderation' && (
              <Card className="bg-discord-sidebar border-discord-dark">
                <CardHeader>
                  <CardTitle className="text-xl text-white flex items-center gap-2">
                    <Shield className="h-5 w-5 text-discord-blue" />
                    Moderation Setup
                  </CardTitle>
                  <CardDescription className="text-discord-muted">
                    Configure auto-moderation and logging to keep your server safe.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-discord-dark rounded-lg">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-discord-blue" />
                      <div>
                        <p className="font-medium text-white">Auto Moderation</p>
                        <p className="text-sm text-discord-muted">Automatically filter spam and bad content</p>
                      </div>
                    </div>
                    <Switch
                      checked={autoModEnabled}
                      onCheckedChange={setAutoModEnabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Logging Channel</Label>
                    <Select value={logChannel} onValueChange={setLogChannel}>
                      <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                        <SelectValue placeholder="Select a channel for mod logs..." />
                      </SelectTrigger>
                      <SelectContent className="bg-discord-dark border-discord-dark">
                        {textChannels.map((channel) => (
                          <SelectItem key={channel.id} value={channel.id} className="text-white">
                            #{channel.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-discord-muted">
                      Message edits, deletions, and mod actions will be logged here.
                    </p>
                  </div>

                  {!autoModEnabled && (
                    <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <AlertCircle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                      <p className="text-sm text-yellow-300">
                        Auto moderation is disabled. You can enable it later in settings.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {currentStep.id === 'templates' && (
              <Card className="bg-discord-sidebar border-discord-dark">
                <CardHeader>
                  <CardTitle className="text-xl text-white flex items-center gap-2">
                    <Rocket className="h-5 w-5 text-discord-blue" />
                    Quick Start Templates
                  </CardTitle>
                  <CardDescription className="text-discord-muted">
                    Choose a preset that matches your community type for instant configuration.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {TEMPLATES.map((template) => {
                      const Icon = template.icon;
                      
                      return (
                        <button
                          key={template.id}
                          onClick={() => applyTemplateMutation.mutate(template.id)}
                          disabled={applyTemplateMutation.isPending}
                          className="flex items-start gap-4 p-4 rounded-lg border border-discord-dark bg-discord-dark hover:border-discord-muted transition-all text-left group"
                        >
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${template.color} flex items-center justify-center flex-shrink-0`}>
                            <Icon className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-white group-hover:text-discord-blue transition-colors">
                                {template.name}
                              </p>
                              <ArrowRight className="h-4 w-4 text-discord-muted group-hover:text-discord-blue transition-colors" />
                            </div>
                            <p className="text-sm text-discord-muted mb-2">{template.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {template.features.map((feature) => (
                                <Badge key={feature} variant="secondary" className="bg-discord-sidebar text-discord-text text-xs">
                                  {feature}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 text-center">
                    <Button
                      variant="ghost"
                      onClick={handleNext}
                      className="text-discord-muted hover:text-white"
                    >
                      Skip templates and finish setup
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStep.id === 'complete' && (
              <Card className="bg-discord-sidebar border-discord-dark">
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-600 rounded-2xl flex items-center justify-center mb-4 animate-bounce">
                    <PartyPopper className="h-12 w-12 text-white" />
                  </div>
                  <CardTitle className="text-3xl text-white">You're All Set! 🎉</CardTitle>
                  <CardDescription className="text-discord-muted text-base">
                    Your bot is now configured and ready to serve <span className="text-white font-medium">{serverName}</span>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-3 p-3 bg-discord-dark rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="text-white text-sm">Bot Connected</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-discord-dark rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="text-white text-sm">Features Configured</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-discord-dark rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="text-white text-sm">Channels Set Up</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-discord-dark rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="text-white text-sm">Ready to Go!</span>
                    </div>
                  </div>

                  <div className="p-4 bg-discord-blue/10 border border-discord-blue/20 rounded-lg">
                    <p className="text-sm text-blue-300">
                      <Zap className="h-4 w-4 inline mr-1" />
                      You can always adjust these settings later in the Settings panel.
                    </p>
                  </div>

                  <Button
                    onClick={() => completeMutation.mutate()}
                    disabled={completeMutation.isPending}
                    className="w-full bg-discord-blue hover:bg-blue-600 text-white py-6 text-lg"
                  >
                    {completeMutation.isPending ? 'Finishing...' : 'Start Using Your Bot'}
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {currentStep.id !== 'complete' && currentStep.id !== 'templates' && (
          <div className="sticky bottom-0 bg-discord-sidebar border-t border-discord-dark px-4 py-4">
            <div className="max-w-2xl mx-auto flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={currentStepIndex === 0}
                className="text-discord-muted hover:text-white"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>

              <Button
                onClick={handleNext}
                disabled={completeStepMutation.isPending || updateSettingsMutation.isPending}
                className="bg-discord-blue hover:bg-blue-600 text-white"
              >
                {completeStepMutation.isPending ? 'Saving...' : 'Continue'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
