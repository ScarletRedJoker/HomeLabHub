import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Hash, Users, Send, CheckCircle, AlertCircle, Info, MessageSquare, ExternalLink, Bot, UserPlus, Palette } from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  type: number;
  topic: string | null;
  parentId: string | null;
  position: number;
  permissions: {
    canSendMessages: boolean;
    canEmbedLinks: boolean;
    canManageMessages: boolean;
  };
}

interface Server {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  permissions: {
    canSendMessages: boolean;
    canEmbedLinks: boolean;
    canManageChannels: boolean;
  };
  channels: Channel[];
}

interface ChannelData {
  servers: Server[];
  totalChannels: number;
}

interface PanelTemplate {
  id: string;
  serverId: string;
  name: string;
  description: string | null;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  embedFooter: string | null;
  embedImageUrl: string | null;
  embedThumbnailUrl: string | null;
  embedAuthorName: string | null;
  embedAuthorIconUrl: string | null;
  fields: Array<{
    name: string;
    value: string;
    inline: boolean;
  }>;
  buttons: Array<{
    label: string;
    style: number;
    emoji: string | null;
    url: string | null;
    action: string | null;
  }>;
}

export default function ChannelManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [sendingChannels, setSendingChannels] = useState<Set<string>>(new Set());
  const [selectedTemplates, setSelectedTemplates] = useState<Map<string, string>>(new Map());

  // Fetch bot invite URL
  const {
    data: botInviteData,
    isLoading: isLoadingInvite,
    error: inviteError
  } = useQuery<{ inviteURL: string; permissions: number; clientId: string }>({
    queryKey: ['/api/bot/invite-url'],
    queryFn: () => fetch('/api/bot/invite-url').then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch invite URL: ${res.statusText}`);
      }
      return res.json();
    }),
    retry: 2,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Fetch Discord channels
  const {
    data: channelData,
    isLoading,
    error,
    refetch
  } = useQuery<ChannelData>({
    queryKey: ['/api/discord/channels'],
    queryFn: () => fetch('/api/discord/channels').then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch channels: ${res.statusText}`);
      }
      return res.json();
    }),
    retry: 2
  });

  // Fetch panel templates for all servers
  const {
    data: templatesData = [],
    isLoading: isLoadingTemplates
  } = useQuery<PanelTemplate[]>({
    queryKey: ['/api/panel-templates'],
    queryFn: () => fetch('/api/panel-templates').then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch templates: ${res.statusText}`);
      }
      return res.json();
    }),
    enabled: !!channelData?.servers?.length,
    retry: 2
  });

  // Mutation for sending ticket panels
  const sendPanelMutation = useMutation({
    mutationFn: async ({ channelId, guildId }: { channelId: string; guildId: string }) => {
      const response = await fetch('/api/discord/send-ticket-panel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId, guildId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send ticket panel');
      }

      return response.json();
    },
    onMutate: ({ channelId }) => {
      setSendingChannels(prev => new Set(prev).add(channelId));
    },
    onSettled: (_, __, { channelId }) => {
      setSendingChannels(prev => {
        const newSet = new Set(prev);
        newSet.delete(channelId);
        return newSet;
      });
    },
    onSuccess: (data, { channelId }) => {
      toast({
        title: 'Success!',
        description: 'Ticket panel sent successfully to the channel',
      });
    },
    onError: (error: any, { channelId }) => {
      toast({
        title: 'Failed to send ticket panel',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Mutation for sending panel templates
  const sendTemplateMutation = useMutation({
    mutationFn: async ({ channelId, guildId, templateId }: { channelId: string; guildId: string; templateId: string }) => {
      const response = await fetch('/api/discord/send-panel-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId, guildId, templateId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send panel template');
      }

      return response.json();
    },
    onMutate: ({ channelId }) => {
      setSendingChannels(prev => new Set(prev).add(channelId));
    },
    onSettled: (_, __, { channelId }) => {
      setSendingChannels(prev => {
        const newSet = new Set(prev);
        newSet.delete(channelId);
        return newSet;
      });
    },
    onSuccess: (data, { channelId }) => {
      toast({
        title: 'Success!',
        description: 'Panel template sent successfully to the channel',
      });
    },
    onError: (error: any, { channelId }) => {
      toast({
        title: 'Failed to send panel template',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const toggleServerExpansion = (serverId: string) => {
    setExpandedServers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(serverId)) {
        newSet.delete(serverId);
      } else {
        newSet.add(serverId);
      }
      return newSet;
    });
  };

  const handleSendPanel = (channelId: string, guildId: string) => {
    const templateId = selectedTemplates.get(channelId);
    if (templateId && templateId !== 'default') {
      sendTemplateMutation.mutate({ channelId, guildId, templateId });
    } else {
      sendPanelMutation.mutate({ channelId, guildId });
    }
  };

  const handleTemplateChange = (channelId: string, value: string) => {
    setSelectedTemplates(prev => {
      const newMap = new Map(prev);
      if (value === 'default') {
        newMap.delete(channelId);
      } else {
        newMap.set(channelId, value);
      }
      return newMap;
    });
  };

  const getChannelIcon = (channel: Channel) => {
    // Return different icons based on channel type or permissions
    if (channel.permissions.canManageMessages) {
      return <Hash className="h-4 w-4 text-blue-500" />;
    }
    return <Hash className="h-4 w-4 text-gray-500" />;
  };

  const getPermissionBadge = (channel: Channel) => {
    if (!channel.permissions.canSendMessages) {
      return (
        <Badge variant="destructive" className="ml-2">
          <AlertCircle className="h-3 w-3 mr-1" />
          No Send Permission
        </Badge>
      );
    }
    if (!channel.permissions.canEmbedLinks) {
      return (
        <Badge variant="outline" className="ml-2">
          <AlertCircle className="h-3 w-3 mr-1" />
          No Embed Permission
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="ml-2">
        <CheckCircle className="h-3 w-3 mr-1" />
        Ready
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discord Channel Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading Discord channels...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discord Channel Management</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load Discord channels. Please ensure the bot is connected to your servers.
              <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-2">
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!channelData?.servers?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MessageSquare className="h-5 w-5 mr-2" />
            Discord Channel Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No Discord servers found. You need to invite the bot to your Discord servers first.
            </AlertDescription>
          </Alert>
          
          <Card className="border-dashed border-2">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Invite Bot to Server</CardTitle>
              <div className="text-sm text-muted-foreground">
                Add the ticket bot to your Discord server to start managing support tickets
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm space-y-2">
                <p className="font-medium">Required Permissions:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                  <li>View Channels - To see your server channels</li>
                  <li>Send Messages - To send ticket panels and notifications</li>
                  <li>Embed Links - To display rich ticket information</li>
                  <li>Read Message History - To process ticket interactions</li>
                  <li>Manage Messages - To manage ticket-related messages</li>
                  <li>Use Application Commands - To enable slash commands</li>
                </ul>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                {inviteError ? (
                  <div className="flex-1">
                    <Button size="lg" disabled className="w-full mb-2">
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Invite URL Unavailable
                    </Button>
                    <Alert variant="destructive" className="text-sm">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Failed to load bot invite URL. Please check your configuration or try again later.
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : botInviteData?.inviteURL ? (
                  <Button 
                    size="lg"
                    onClick={() => window.open(botInviteData.inviteURL, '_blank', 'noopener,noreferrer')}
                    className="flex-1"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite Bot to Server
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button size="lg" disabled className="flex-1">
                    <Loader2 className={`h-4 w-4 mr-2 ${isLoadingInvite ? 'animate-spin' : ''}`} />
                    {isLoadingInvite ? 'Loading Invite URL...' : 'Invite URL Not Available'}
                  </Button>
                )}
                
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={() => refetch()}
                >
                  <Loader2 className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
              
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Next steps:</strong> After inviting the bot, make sure you have admin permissions on the server, 
                  then refresh this page to see your servers and start deploying ticket panels.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    );
  }

  const totalChannelsWithPermission = channelData.servers.reduce((total, server) => 
    total + server.channels.filter(channel => 
      channel.permissions.canSendMessages && channel.permissions.canEmbedLinks
    ).length, 0
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MessageSquare className="h-5 w-5 mr-2" />
            Discord Channel Management
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Deploy ticket creation panels to Discord channels in your connected servers
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{channelData.servers.length}</div>
              <div className="text-sm text-muted-foreground">Connected Servers</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{channelData.totalChannels}</div>
              <div className="text-sm text-muted-foreground">Total Channels</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-500">{totalChannelsWithPermission}</div>
              <div className="text-sm text-muted-foreground">Channels Ready</div>
            </div>
          </div>
          
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mb-4">
            <Loader2 className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Channels
          </Button>
        </CardContent>
      </Card>

      {channelData.servers.map((server) => (
        <Card key={server.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {server.icon && (
                  <img 
                    src={server.icon} 
                    alt={server.name}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div>
                  <CardTitle className="text-lg">{server.name}</CardTitle>
                  <div className="text-sm text-muted-foreground flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    {server.memberCount} members • {server.channels.length} channels
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleServerExpansion(server.id)}
              >
                {expandedServers.has(server.id) ? 'Collapse' : 'Expand'}
              </Button>
            </div>
          </CardHeader>
          
          {expandedServers.has(server.id) && (
            <CardContent>
              <div className="space-y-3">
                {server.channels.map((channel) => {
                  const serverTemplates = templatesData.filter(t => t.serverId === server.id);
                  const hasTemplates = serverTemplates.length > 0;
                  
                  return (
                    <div key={channel.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                      <div className="flex items-center space-x-3">
                        {getChannelIcon(channel)}
                        <div>
                          <div className="font-medium flex items-center">
                            #{channel.name}
                            {getPermissionBadge(channel)}
                          </div>
                          {channel.topic && (
                            <div className="text-sm text-muted-foreground truncate max-w-md">
                              {channel.topic}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {hasTemplates && (
                          <Select
                            value={selectedTemplates.get(channel.id) || 'default'}
                            onValueChange={(value) => handleTemplateChange(channel.id, value)}
                            disabled={
                              !channel.permissions.canSendMessages || 
                              !channel.permissions.canEmbedLinks ||
                              sendingChannels.has(channel.id) ||
                              isLoadingTemplates
                            }
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Select template" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">
                                <div className="flex items-center">
                                  <MessageSquare className="h-4 w-4 mr-2" />
                                  Default Ticket Panel
                                </div>
                              </SelectItem>
                              {serverTemplates.map((template) => (
                                <SelectItem key={template.id} value={template.id}>
                                  <div className="flex items-center">
                                    <Palette className="h-4 w-4 mr-2" />
                                    {template.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        
                        <Button
                          size="sm"
                          onClick={() => handleSendPanel(channel.id, server.id)}
                          disabled={
                            !channel.permissions.canSendMessages || 
                            !channel.permissions.canEmbedLinks ||
                            sendingChannels.has(channel.id)
                          }
                          className="ml-4"
                        >
                          {sendingChannels.has(channel.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-1" />
                              Send Panel
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                
                {server.channels.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Hash className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No available channels found in this server</p>
                    <p className="text-sm">The bot may need additional permissions</p>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}