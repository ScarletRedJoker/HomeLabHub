import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { 
  Gamepad2, 
  Video, 
  Users, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  CheckCircle2,
  Zap,
  Star,
  Shield,
  MessageSquare,
  Coins,
  Ticket,
  Loader2,
  Sparkles,
  PartyPopper,
  HelpCircle
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface QuickSetupWizardProps {
  serverId: string;
  serverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

interface TemplatePreview {
  template: string;
  name: string;
  description: string;
  settings: Record<string, any>;
  levelRewards: { level: number; message: string }[];
  ticketCategories: { name: string; description: string }[];
}

const TEMPLATES = [
  {
    id: 'gaming',
    name: 'Gaming Community',
    icon: Gamepad2,
    description: 'Perfect for gaming servers with XP, levels, economy, and fun features',
    color: 'from-purple-500 to-indigo-600',
    highlights: ['XP & Leveling (rewards at 5, 10, 25, 50)', '100 Daily Coins Economy', 'Anti-Spam Protection', 'Starboard (5⭐)'],
  },
  {
    id: 'creator',
    name: 'Content Creator',
    icon: Video,
    description: 'Ideal for streamers and YouTubers with engagement and support tools',
    color: 'from-pink-500 to-rose-600',
    highlights: ['Stream Notifications Ready', 'Ticket System (Support, Collabs, Business)', 'Link & Spam Moderation', 'Custom Welcome Messages'],
  },
  {
    id: 'community',
    name: 'General Community',
    icon: Users,
    description: 'Great for general communities with balanced features',
    color: 'from-blue-500 to-cyan-600',
    highlights: ['Welcome & Goodbye Messages', 'Basic XP Leveling', 'Starboard (3⭐)', 'Spam & Bad Words Filter'],
  },
];

const STEPS = [
  { id: 'template', title: 'Choose Template', icon: Sparkles },
  { id: 'channels', title: 'Select Channels', icon: MessageSquare },
  { id: 'review', title: 'Review Settings', icon: CheckCircle2 },
  { id: 'complete', title: 'Apply & Complete', icon: PartyPopper },
];

export default function QuickSetupWizard({ 
  serverId, 
  serverName, 
  open, 
  onOpenChange, 
  onComplete 
}: QuickSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [channels, setChannels] = useState({
    welcomeChannelId: '',
    logChannelId: '',
    generalChannelId: '',
    starboardChannelId: '',
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: channelData, isLoading: isLoadingChannels, error: channelsError } = useQuery<{ channels: DiscordChannel[] } | DiscordChannel[]>({
    queryKey: [`/api/servers/${serverId}/channels`],
    enabled: !!serverId && open,
    retry: 2,
    staleTime: 1000 * 60 * 2,
  });

  const { data: templatePreview } = useQuery<TemplatePreview>({
    queryKey: [`/api/servers/${serverId}/quick-setup/preview/${selectedTemplate}`],
    enabled: !!serverId && !!selectedTemplate && currentStep >= 2,
  });

  const applySetupMutation = useMutation({
    mutationFn: async () => {
      // Filter out 'none' values from channels before sending to API
      const filteredChannels = {
        welcomeChannelId: channels.welcomeChannelId && channels.welcomeChannelId !== 'none' ? channels.welcomeChannelId : undefined,
        logChannelId: channels.logChannelId && channels.logChannelId !== 'none' ? channels.logChannelId : undefined,
        generalChannelId: channels.generalChannelId && channels.generalChannelId !== 'none' ? channels.generalChannelId : undefined,
        starboardChannelId: channels.starboardChannelId && channels.starboardChannelId !== 'none' ? channels.starboardChannelId : undefined,
      };
      return apiRequest('POST', `/api/servers/${serverId}/quick-setup`, {
        template: selectedTemplate,
        channels: filteredChannels,
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Setup Complete!',
        description: data.message || `Successfully configured your server with the ${data.templateName} template.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/settings`] });
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/onboarding`] });
      setCurrentStep(3);
    },
    onError: (error: any) => {
      toast({
        title: 'Setup Failed',
        description: error.message || 'Failed to apply quick setup. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Handle both array and wrapped object response formats
  const channelList = Array.isArray(channelData) ? channelData : (channelData?.channels || []);
  const textChannels = channelList?.filter(c => c.type === 0) || [];
  const progress = ((currentStep + 1) / STEPS.length) * 100;
  const selectedTemplateData = TEMPLATES.find(t => t.id === selectedTemplate);

  const handleNext = () => {
    if (currentStep === 0 && !selectedTemplate) {
      toast({ title: 'Please select a template', variant: 'destructive' });
      return;
    }
    if (currentStep === 2) {
      applySetupMutation.mutate();
      return;
    }
    setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleComplete = () => {
    setCurrentStep(0);
    setSelectedTemplate(null);
    setChannels({ welcomeChannelId: '', logChannelId: '', generalChannelId: '', starboardChannelId: '' });
    onComplete();
    onOpenChange(false);
  };

  const handleClose = () => {
    if (currentStep < 3) {
      setCurrentStep(0);
      setSelectedTemplate(null);
      setChannels({ welcomeChannelId: '', logChannelId: '', generalChannelId: '', starboardChannelId: '' });
    }
    onOpenChange(false);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <p className="text-discord-muted text-sm text-center mb-6">
              Choose a template that best matches your community type. You can customize these settings later.
            </p>
            <div className="grid gap-4">
              {TEMPLATES.map((template) => {
                const Icon = template.icon;
                const isSelected = selectedTemplate === template.id;
                
                return (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={`
                      flex items-start gap-4 p-4 rounded-lg border transition-all text-left w-full
                      ${isSelected 
                        ? 'bg-discord-blue/10 border-discord-blue ring-2 ring-discord-blue/50' 
                        : 'bg-discord-dark border-discord-dark hover:border-discord-muted'}
                    `}
                  >
                    <div className={`
                      w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
                      bg-gradient-to-br ${template.color}
                    `}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-white">{template.name}</p>
                        {isSelected && <Check className="h-4 w-4 text-discord-blue" />}
                      </div>
                      <p className="text-sm text-discord-muted mb-2">{template.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {template.highlights.slice(0, 3).map((highlight, i) => (
                          <Badge key={i} variant="secondary" className="text-xs bg-discord-sidebar">
                            {highlight}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <p className="text-discord-muted text-sm text-center">
              Select channels for each feature. All are optional - you can configure them later.
            </p>
            
            {isLoadingChannels && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-discord-blue mr-2" />
                <span className="text-discord-muted">Loading channels...</span>
              </div>
            )}

            {channelsError && !isLoadingChannels && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400 text-center">
                  Failed to load channels. You can continue and configure them later in settings.
                </p>
              </div>
            )}

            {!isLoadingChannels && !channelsError && textChannels.length === 0 && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-sm text-yellow-400 text-center">
                  No text channels found. Make sure the bot has permission to view channels, or configure them later in settings.
                </p>
              </div>
            )}

            <TooltipProvider delayDuration={200}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-white">Welcome Channel</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-discord-muted hover:text-discord-text cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs bg-discord-dark border-discord-muted text-white">
                        <p>Where new member greetings and goodbye messages are sent. Choose a public channel that all members can see.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-discord-muted">Greets new members and announces when members leave</p>
                  <Select 
                    value={channels.welcomeChannelId} 
                    onValueChange={(v) => setChannels(prev => ({ ...prev, welcomeChannelId: v }))}
                  >
                    <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                      <SelectValue placeholder="Select welcome channel..." />
                    </SelectTrigger>
                    <SelectContent className="bg-discord-dark border-discord-dark">
                      <SelectItem value="none" className="text-discord-muted">None (configure later)</SelectItem>
                      {textChannels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id} className="text-white">
                          #{channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-white">Log Channel</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-discord-muted hover:text-discord-text cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs bg-discord-dark border-discord-muted text-white">
                        <p>Where moderation actions and bot activity logs are recorded. Best to use a staff-only channel for privacy.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-discord-muted">Records moderation actions and bot activity (staff-only recommended)</p>
                  <Select 
                    value={channels.logChannelId} 
                    onValueChange={(v) => setChannels(prev => ({ ...prev, logChannelId: v }))}
                  >
                    <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                      <SelectValue placeholder="Select log channel..." />
                    </SelectTrigger>
                    <SelectContent className="bg-discord-dark border-discord-dark">
                      <SelectItem value="none" className="text-discord-muted">None (configure later)</SelectItem>
                      {textChannels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id} className="text-white">
                          #{channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedTemplate === 'gaming' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-white">Starboard Channel</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-discord-muted hover:text-discord-text cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs bg-discord-dark border-discord-muted text-white">
                          <p>Messages with enough star reactions get reposted here. Great for highlighting the best community moments!</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-xs text-discord-muted">Showcases popular messages that receive enough star reactions</p>
                    <Select 
                      value={channels.starboardChannelId} 
                      onValueChange={(v) => setChannels(prev => ({ ...prev, starboardChannelId: v }))}
                    >
                      <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                        <SelectValue placeholder="Select starboard channel..." />
                      </SelectTrigger>
                      <SelectContent className="bg-discord-dark border-discord-dark">
                        <SelectItem value="none" className="text-discord-muted">None (configure later)</SelectItem>
                        {textChannels.map((channel) => (
                          <SelectItem key={channel.id} value={channel.id} className="text-white">
                            #{channel.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-white">General Channel</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-discord-muted hover:text-discord-text cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs bg-discord-dark border-discord-muted text-white">
                        <p>The main chat channel where level-up announcements and general bot notifications appear.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-discord-muted">Main channel for level-up announcements and general notifications</p>
                  <Select 
                    value={channels.generalChannelId} 
                    onValueChange={(v) => setChannels(prev => ({ ...prev, generalChannelId: v }))}
                  >
                    <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                      <SelectValue placeholder="Select general channel..." />
                    </SelectTrigger>
                    <SelectContent className="bg-discord-dark border-discord-dark">
                      <SelectItem value="none" className="text-discord-muted">None (configure later)</SelectItem>
                      {textChannels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id} className="text-white">
                          #{channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TooltipProvider>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-discord-muted text-sm">
                Review the settings that will be applied to your server.
              </p>
            </div>

            {selectedTemplateData && (
              <Card className="bg-discord-dark border-discord-dark">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br ${selectedTemplateData.color}`}>
                      <selectedTemplateData.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-lg">{selectedTemplateData.name}</CardTitle>
                      <CardDescription className="text-discord-muted">{selectedTemplateData.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    {selectedTemplateData.highlights.map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span className="text-discord-text">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {(channels.welcomeChannelId || channels.logChannelId || channels.generalChannelId || channels.starboardChannelId) && (
                    <div className="pt-3 border-t border-discord-sidebar">
                      <p className="text-sm font-medium text-white mb-2">Selected Channels:</p>
                      <div className="space-y-1 text-sm text-discord-muted">
                        {channels.welcomeChannelId && channels.welcomeChannelId !== 'none' && (
                          <p>Welcome: #{textChannels.find(c => c.id === channels.welcomeChannelId)?.name}</p>
                        )}
                        {channels.logChannelId && channels.logChannelId !== 'none' && (
                          <p>Logs: #{textChannels.find(c => c.id === channels.logChannelId)?.name}</p>
                        )}
                        {channels.generalChannelId && channels.generalChannelId !== 'none' && (
                          <p>General: #{textChannels.find(c => c.id === channels.generalChannelId)?.name}</p>
                        )}
                        {channels.starboardChannelId && channels.starboardChannelId !== 'none' && (
                          <p>Starboard: #{textChannels.find(c => c.id === channels.starboardChannelId)?.name}</p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-300">
                💡 You can modify any of these settings later from the Settings panel.
              </p>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="text-center space-y-6 py-4">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
              <PartyPopper className="h-10 w-10 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">Setup Complete!</h3>
              <p className="text-discord-muted">
                Your server has been configured with the <span className="text-white font-medium">{selectedTemplateData?.name}</span> template.
              </p>
            </div>
            <div className="grid gap-2 text-left max-w-sm mx-auto">
              <div className="flex items-center gap-2 text-sm text-discord-text">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Bot settings updated</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-discord-text">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Features enabled and configured</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-discord-text">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Ready to use!</span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-discord-sidebar border-discord-dark max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-discord-blue" />
            Quick Setup - {serverName}
          </DialogTitle>
          <DialogDescription className="text-discord-muted">
            Configure your bot in just a few clicks
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-discord-muted">
              <span>Step {currentStep + 1} of {STEPS.length}</span>
              <span>{STEPS[currentStep].title}</span>
            </div>
            <Progress value={progress} className="h-2 bg-discord-dark" />
            <div className="flex justify-between mt-2">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const isCompleted = index < currentStep;
                const isCurrent = index === currentStep;
                
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

          {renderStepContent()}

          <div className="flex justify-between pt-4 border-t border-discord-dark">
            {currentStep === 3 ? (
              <Button
                onClick={handleComplete}
                className="w-full bg-discord-blue hover:bg-blue-600 text-white"
              >
                Go to Dashboard
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  disabled={currentStep === 0}
                  className="text-discord-text hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={applySetupMutation.isPending}
                  className="bg-discord-blue hover:bg-blue-600 text-white"
                >
                  {applySetupMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Applying...
                    </>
                  ) : currentStep === 2 ? (
                    <>
                      Apply Setup
                      <Check className="h-4 w-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
