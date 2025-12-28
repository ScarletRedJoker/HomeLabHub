import { useState, useEffect, useMemo } from "react";
import { useServerContext } from "@/contexts/ServerContext";
import { useToast } from "@/hooks/use-toast";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  Zap,
  Copy,
  Play,
  MessageSquare,
  UserPlus,
  Smile,
  MousePointer,
  Mic,
  Shield,
  Clock,
  Send,
  AtSign,
  Hash,
  Users,
  Timer,
  ArrowUp,
  ArrowDown,
  X,
  ChevronRight,
  Sparkles,
  Bookmark,
  Settings,
  AlertCircle,
  CheckCircle,
  Gift,
  Star,
  Gamepad2,
  Wrench,
  Volume2,
  UserMinus,
  Calendar
} from "lucide-react";

interface Workflow {
  id: number;
  serverId: string;
  name: string;
  description: string;
  enabled: boolean;
  triggerType: string;
  triggerConfig: Record<string, any>;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  cooldownEnabled: boolean;
  cooldownSeconds: number;
  cooldownType: 'user' | 'channel' | 'server';
  executionCount: number;
  lastExecutedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowCondition {
  id: string;
  type: string;
  config: Record<string, any>;
}

interface WorkflowAction {
  id: string;
  type: string;
  config: Record<string, any>;
  order: number;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'welcome' | 'moderation' | 'engagement' | 'utility' | 'fun';
  triggerType: string;
  triggerConfig: Record<string, any>;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

interface Role {
  id: string;
  name: string;
  color: number;
}

interface WorkflowFormData {
  name: string;
  description: string;
  enabled: boolean;
  triggerType: string;
  triggerConfig: Record<string, any>;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  cooldownEnabled: boolean;
  cooldownSeconds: number;
  cooldownType: 'user' | 'channel' | 'server';
}

const TRIGGER_TYPES = [
  { value: 'message_received', label: 'Message Received', icon: MessageSquare, description: 'When a message is sent in a channel' },
  { value: 'member_join', label: 'Member Join', icon: UserPlus, description: 'When a new member joins the server' },
  { value: 'member_leave', label: 'Member Leave', icon: UserMinus, description: 'When a member leaves the server' },
  { value: 'reaction_add', label: 'Reaction Added', icon: Smile, description: 'When a reaction is added to a message' },
  { value: 'button_click', label: 'Button Clicked', icon: MousePointer, description: 'When a button is clicked' },
  { value: 'voice_join', label: 'Voice Channel Join', icon: Mic, description: 'When someone joins a voice channel' },
  { value: 'voice_leave', label: 'Voice Channel Leave', icon: Volume2, description: 'When someone leaves a voice channel' },
  { value: 'role_add', label: 'Role Added', icon: Shield, description: 'When a role is added to a member' },
  { value: 'role_remove', label: 'Role Removed', icon: Shield, description: 'When a role is removed from a member' },
  { value: 'scheduled', label: 'Scheduled', icon: Calendar, description: 'Run on a schedule' },
];

const CONDITION_TYPES = [
  { value: 'user_has_role', label: 'User Has Role' },
  { value: 'user_missing_role', label: 'User Missing Role' },
  { value: 'channel_is', label: 'Channel Is' },
  { value: 'channel_is_not', label: 'Channel Is Not' },
  { value: 'message_contains', label: 'Message Contains' },
  { value: 'message_starts_with', label: 'Message Starts With' },
  { value: 'message_matches_regex', label: 'Message Matches Regex' },
  { value: 'time_between', label: 'Time Between' },
  { value: 'user_is_bot', label: 'User Is Bot' },
  { value: 'user_is_not_bot', label: 'User Is Not Bot' },
];

const ACTION_TYPES = [
  { value: 'send_message', label: 'Send Message', icon: Send, description: 'Send a message to a channel' },
  { value: 'send_dm', label: 'Send DM', icon: AtSign, description: 'Send a direct message to the user' },
  { value: 'add_role', label: 'Add Role', icon: Shield, description: 'Add a role to the user' },
  { value: 'remove_role', label: 'Remove Role', icon: Shield, description: 'Remove a role from the user' },
  { value: 'create_thread', label: 'Create Thread', icon: Hash, description: 'Create a thread from the message' },
  { value: 'wait_delay', label: 'Wait/Delay', icon: Timer, description: 'Wait for a specified time' },
  { value: 'delete_message', label: 'Delete Message', icon: Trash2, description: 'Delete the triggering message' },
  { value: 'react_message', label: 'React to Message', icon: Smile, description: 'Add a reaction to the message' },
];

const TEMPLATE_CATEGORIES = [
  { value: 'all', label: 'All Templates', icon: Sparkles },
  { value: 'welcome', label: 'Welcome', icon: Gift },
  { value: 'moderation', label: 'Moderation', icon: Shield },
  { value: 'engagement', label: 'Engagement', icon: Star },
  { value: 'utility', label: 'Utility', icon: Wrench },
  { value: 'fun', label: 'Fun', icon: Gamepad2 },
];

const VARIABLE_HINTS = [
  { variable: '{user.mention}', description: 'Mentions the user' },
  { variable: '{user.name}', description: 'Username' },
  { variable: '{user.tag}', description: 'Username#discriminator' },
  { variable: '{user.id}', description: 'User ID' },
  { variable: '{channel.name}', description: 'Channel name' },
  { variable: '{channel.mention}', description: 'Channel mention' },
  { variable: '{server.name}', description: 'Server name' },
  { variable: '{server.memberCount}', description: 'Member count' },
];

function getTriggerIcon(type: string) {
  const trigger = TRIGGER_TYPES.find(t => t.value === type);
  return trigger?.icon || Zap;
}

function getTriggerLabel(type: string) {
  const trigger = TRIGGER_TYPES.find(t => t.value === type);
  return trigger?.label || type;
}

function getActionIcon(type: string) {
  const action = ACTION_TYPES.find(a => a.value === type);
  return action?.icon || Zap;
}

export default function InteractionStudio() {
  const { selectedServerId, selectedServerName } = useServerContext();
  const { toast } = useToast();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [triggerFilter, setTriggerFilter] = useState<string>("all");
  const [templateCategory, setTemplateCategory] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeEditorTab, setActiveEditorTab] = useState("info");

  const form = useForm<WorkflowFormData>({
    defaultValues: {
      name: "",
      description: "",
      enabled: true,
      triggerType: "message_received",
      triggerConfig: {},
      conditions: [],
      actions: [],
      cooldownEnabled: false,
      cooldownSeconds: 60,
      cooldownType: 'user',
    },
  });

  const { fields: conditionFields, append: appendCondition, remove: removeCondition } = useFieldArray({
    control: form.control,
    name: "conditions",
  });

  const { fields: actionFields, append: appendAction, remove: removeAction, move: moveAction } = useFieldArray({
    control: form.control,
    name: "actions",
  });

  useEffect(() => {
    if (selectedServerId) {
      loadWorkflows();
      loadTemplates();
      loadChannels();
      loadRoles();
    }
  }, [selectedServerId]);

  const loadWorkflows = async () => {
    if (!selectedServerId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/servers/${selectedServerId}/workflows`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data);
      } else {
        throw new Error('Failed to load workflows');
      }
    } catch (error) {
      console.error("Failed to load workflows:", error);
      toast({
        title: "Error",
        description: "Failed to load workflows.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await fetch(`/api/workflow-templates`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error("Failed to load templates:", error);
    }
  };

  const loadChannels = async () => {
    if (!selectedServerId) return;
    try {
      const response = await fetch(`/api/servers/${selectedServerId}/channels`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setChannels(data);
      }
    } catch (error) {
      console.error("Failed to load channels:", error);
    }
  };

  const loadRoles = async () => {
    if (!selectedServerId) return;
    try {
      const response = await fetch(`/api/discord/server-info/${selectedServerId}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setRoles(data.roles || []);
      }
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  };

  const filteredWorkflows = useMemo(() => {
    return workflows.filter(workflow => {
      const matchesSearch = searchQuery === "" ||
        workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        workflow.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTrigger = triggerFilter === "all" || workflow.triggerType === triggerFilter;
      return matchesSearch && matchesTrigger;
    });
  }, [workflows, searchQuery, triggerFilter]);

  const filteredTemplates = useMemo(() => {
    if (templateCategory === "all") return templates;
    return templates.filter(t => t.category === templateCategory);
  }, [templates, templateCategory]);

  const openEditor = (workflow?: Workflow) => {
    if (workflow) {
      setEditingWorkflow(workflow);
      form.reset({
        name: workflow.name,
        description: workflow.description,
        enabled: workflow.enabled,
        triggerType: workflow.triggerType,
        triggerConfig: workflow.triggerConfig || {},
        conditions: workflow.conditions || [],
        actions: workflow.actions || [],
        cooldownEnabled: workflow.cooldownEnabled,
        cooldownSeconds: workflow.cooldownSeconds,
        cooldownType: workflow.cooldownType,
      });
    } else {
      setEditingWorkflow(null);
      form.reset({
        name: "",
        description: "",
        enabled: true,
        triggerType: "message_received",
        triggerConfig: {},
        conditions: [],
        actions: [],
        cooldownEnabled: false,
        cooldownSeconds: 60,
        cooldownType: 'user',
      });
    }
    setTestResult(null);
    setActiveEditorTab("info");
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingWorkflow(null);
    setTestResult(null);
  };

  const handleSaveWorkflow = async (data: WorkflowFormData) => {
    if (!selectedServerId) return;
    setIsSaving(true);
    try {
      const url = editingWorkflow
        ? `/api/servers/${selectedServerId}/workflows/${editingWorkflow.id}`
        : `/api/servers/${selectedServerId}/workflows`;
      const method = editingWorkflow ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Workflow ${editingWorkflow ? 'updated' : 'created'} successfully.`,
        });
        loadWorkflows();
        closeEditor();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save workflow');
      }
    } catch (error: any) {
      console.error("Failed to save workflow:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save workflow.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!selectedServerId || !workflowToDelete?.id) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/servers/${selectedServerId}/workflows/${workflowToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Workflow deleted successfully.",
        });
        loadWorkflows();
      } else {
        throw new Error('Failed to delete workflow');
      }
    } catch (error) {
      console.error("Failed to delete workflow:", error);
      toast({
        title: "Error",
        description: "Failed to delete workflow.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setWorkflowToDelete(null);
    }
  };

  const handleToggleEnabled = async (workflow: Workflow) => {
    if (!selectedServerId) return;
    try {
      const response = await fetch(`/api/servers/${selectedServerId}/workflows/${workflow.id}/toggle`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        setWorkflows(prev =>
          prev.map(w => w.id === workflow.id ? { ...w, enabled: !w.enabled } : w)
        );
        toast({
          title: "Success",
          description: `Workflow ${!workflow.enabled ? 'enabled' : 'disabled'}.`,
        });
      } else {
        throw new Error('Failed to toggle workflow');
      }
    } catch (error) {
      console.error("Failed to toggle workflow:", error);
      toast({
        title: "Error",
        description: "Failed to toggle workflow.",
        variant: "destructive",
      });
    }
  };

  const handleDuplicateWorkflow = async (workflow: Workflow) => {
    if (!selectedServerId) return;
    try {
      const duplicateData = {
        name: `${workflow.name} (Copy)`,
        description: workflow.description,
        enabled: false,
        triggerType: workflow.triggerType,
        triggerConfig: workflow.triggerConfig,
        conditions: workflow.conditions,
        actions: workflow.actions,
        cooldownEnabled: workflow.cooldownEnabled,
        cooldownSeconds: workflow.cooldownSeconds,
        cooldownType: workflow.cooldownType,
      };

      const response = await fetch(`/api/servers/${selectedServerId}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(duplicateData),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Workflow duplicated successfully.",
        });
        loadWorkflows();
      } else {
        throw new Error('Failed to duplicate workflow');
      }
    } catch (error) {
      console.error("Failed to duplicate workflow:", error);
      toast({
        title: "Error",
        description: "Failed to duplicate workflow.",
        variant: "destructive",
      });
    }
  };

  const handleTestWorkflow = async () => {
    if (!selectedServerId || !editingWorkflow?.id) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(`/api/servers/${selectedServerId}/workflows/${editingWorkflow.id}/test`, {
        method: 'POST',
        credentials: 'include',
      });

      const result = await response.json();
      setTestResult({
        success: response.ok,
        message: result.message || (response.ok ? 'Test completed successfully' : 'Test failed'),
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Failed to run test',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleInstallTemplate = async (template: WorkflowTemplate) => {
    if (!selectedServerId) return;
    try {
      const response = await fetch(`/api/servers/${selectedServerId}/workflows/install-template/${template.id}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Template "${template.name}" installed successfully.`,
        });
        loadWorkflows();
      } else {
        throw new Error('Failed to install template');
      }
    } catch (error) {
      console.error("Failed to install template:", error);
      toast({
        title: "Error",
        description: "Failed to install template.",
        variant: "destructive",
      });
    }
  };

  const addNewCondition = () => {
    appendCondition({
      id: `condition-${Date.now()}`,
      type: 'user_has_role',
      config: {},
    });
  };

  const addNewAction = () => {
    appendAction({
      id: `action-${Date.now()}`,
      type: 'send_message',
      config: {},
      order: actionFields.length,
    });
  };

  const moveActionUp = (index: number) => {
    if (index > 0) moveAction(index, index - 1);
  };

  const moveActionDown = (index: number) => {
    if (index < actionFields.length - 1) moveAction(index, index + 1);
  };

  const textChannels = channels.filter(c => c.type === 0);
  const voiceChannels = channels.filter(c => c.type === 2);

  if (!selectedServerId) {
    return (
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Zap className="h-12 w-12 text-discord-muted mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Server Selected</h3>
          <p className="text-discord-muted text-center max-w-md">
            Please select a server from the dropdown to manage workflow automations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="workflows" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Zap className="h-6 w-6 text-yellow-400" />
              Interaction Studio
            </h2>
            <p className="text-discord-muted">
              Build custom workflow automations for {selectedServerName || 'your server'}
            </p>
          </div>
          <Button
            onClick={() => openEditor()}
            className="bg-discord-blue hover:bg-discord-blue/80"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Workflow
          </Button>
        </div>

        <TabsList className="bg-discord-dark">
          <TabsTrigger value="workflows" className="data-[state=active]:bg-discord-sidebar">
            <Zap className="h-4 w-4 mr-2" />
            Workflows
          </TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-discord-sidebar">
            <Bookmark className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="space-y-4">
          <Card className="bg-discord-sidebar border-discord-dark">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-discord-muted" />
                  <Input
                    placeholder="Search workflows..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-discord-dark border-discord-dark text-white"
                  />
                </div>
                <Select value={triggerFilter} onValueChange={setTriggerFilter}>
                  <SelectTrigger className="w-[200px] bg-discord-dark border-discord-dark text-white">
                    <SelectValue placeholder="Filter by trigger" />
                  </SelectTrigger>
                  <SelectContent className="bg-discord-dark border-discord-dark">
                    <SelectItem value="all">All Triggers</SelectItem>
                    {TRIGGER_TYPES.map(trigger => (
                      <SelectItem key={trigger.value} value={trigger.value}>
                        {trigger.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <Card className="bg-discord-sidebar border-discord-dark">
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-discord-blue" />
              </CardContent>
            </Card>
          ) : filteredWorkflows.length === 0 ? (
            <Card className="bg-discord-sidebar border-discord-dark">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Zap className="h-12 w-12 text-discord-muted mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No Workflows Found</h3>
                <p className="text-discord-muted text-center max-w-md mb-4">
                  {searchQuery || triggerFilter !== "all"
                    ? "No workflows match your search criteria."
                    : "Create your first workflow automation to get started."}
                </p>
                <Button onClick={() => openEditor()} className="bg-discord-blue hover:bg-discord-blue/80">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Workflow
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredWorkflows.map(workflow => {
                const TriggerIcon = getTriggerIcon(workflow.triggerType);
                return (
                  <Card
                    key={workflow.id}
                    className="bg-discord-sidebar border-discord-dark hover:border-discord-blue/50 transition-colors cursor-pointer"
                    onClick={() => openEditor(workflow)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-lg ${workflow.enabled ? 'bg-discord-blue/20' : 'bg-discord-dark'}`}>
                            <TriggerIcon className={`h-4 w-4 ${workflow.enabled ? 'text-discord-blue' : 'text-discord-muted'}`} />
                          </div>
                          <div>
                            <CardTitle className="text-base text-white">{workflow.name}</CardTitle>
                            <Badge variant="outline" className="text-xs mt-1">
                              {getTriggerLabel(workflow.triggerType)}
                            </Badge>
                          </div>
                        </div>
                        <Switch
                          checked={workflow.enabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleEnabled(workflow);
                          }}
                        />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-discord-muted line-clamp-2 mb-3">
                        {workflow.description || "No description"}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-discord-muted">
                          {workflow.executionCount} executions
                        </span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-discord-muted hover:text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditor(workflow);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-discord-muted hover:text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateWorkflow(workflow);
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-discord-muted hover:text-red-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              setWorkflowToDelete(workflow);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card className="bg-discord-sidebar border-discord-dark">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  return (
                    <Button
                      key={cat.value}
                      variant={templateCategory === cat.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTemplateCategory(cat.value)}
                      className={templateCategory === cat.value ? "bg-discord-blue" : "border-discord-dark text-discord-muted hover:text-white"}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {cat.label}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {filteredTemplates.length === 0 ? (
            <Card className="bg-discord-sidebar border-discord-dark">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bookmark className="h-12 w-12 text-discord-muted mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No Templates Available</h3>
                <p className="text-discord-muted text-center max-w-md">
                  Templates will appear here once they're available.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map(template => {
                const TriggerIcon = getTriggerIcon(template.triggerType);
                const CategoryIcon = TEMPLATE_CATEGORIES.find(c => c.value === template.category)?.icon || Sparkles;
                return (
                  <Card key={template.id} className="bg-discord-sidebar border-discord-dark">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-gradient-to-br from-discord-blue/20 to-purple-500/20">
                            <TriggerIcon className="h-4 w-4 text-discord-blue" />
                          </div>
                          <div>
                            <CardTitle className="text-base text-white">{template.name}</CardTitle>
                            <div className="flex gap-1 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">
                                <CategoryIcon className="h-3 w-3 mr-1" />
                                {template.category}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-discord-muted line-clamp-2 mb-3">
                        {template.description}
                      </p>
                      <Button
                        className="w-full bg-discord-blue hover:bg-discord-blue/80"
                        onClick={() => handleInstallTemplate(template)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Install Template
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="bg-discord-sidebar border-discord-dark max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-400" />
              {editingWorkflow ? 'Edit Workflow' : 'Create Workflow'}
            </DialogTitle>
            <DialogDescription>
              Configure your workflow automation with triggers, conditions, and actions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(handleSaveWorkflow)} className="flex-1 overflow-hidden flex flex-col">
            <Tabs value={activeEditorTab} onValueChange={setActiveEditorTab} className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="bg-discord-dark shrink-0">
                <TabsTrigger value="info" className="data-[state=active]:bg-discord-sidebar">
                  <Settings className="h-4 w-4 mr-2" />
                  Info
                </TabsTrigger>
                <TabsTrigger value="trigger" className="data-[state=active]:bg-discord-sidebar">
                  <Zap className="h-4 w-4 mr-2" />
                  Trigger
                </TabsTrigger>
                <TabsTrigger value="conditions" className="data-[state=active]:bg-discord-sidebar">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Conditions
                </TabsTrigger>
                <TabsTrigger value="actions" className="data-[state=active]:bg-discord-sidebar">
                  <Play className="h-4 w-4 mr-2" />
                  Actions
                </TabsTrigger>
                <TabsTrigger value="settings" className="data-[state=active]:bg-discord-sidebar">
                  <Timer className="h-4 w-4 mr-2" />
                  Settings
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 pr-4">
                <div className="py-4">
                  <TabsContent value="info" className="mt-0 space-y-4">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="name" className="text-white">Workflow Name</Label>
                        <Input
                          id="name"
                          {...form.register("name", { required: true })}
                          placeholder="My Awesome Workflow"
                          className="bg-discord-dark border-discord-dark text-white mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="description" className="text-white">Description</Label>
                        <Textarea
                          id="description"
                          {...form.register("description")}
                          placeholder="Describe what this workflow does..."
                          className="bg-discord-dark border-discord-dark text-white mt-1"
                          rows={3}
                        />
                      </div>
                      <div className="flex items-center justify-between p-4 bg-discord-dark rounded-lg">
                        <div>
                          <Label className="text-white">Enabled</Label>
                          <p className="text-sm text-discord-muted">Enable or disable this workflow</p>
                        </div>
                        <Controller
                          name="enabled"
                          control={form.control}
                          render={({ field }) => (
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          )}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="trigger" className="mt-0 space-y-4">
                    <div>
                      <Label className="text-white mb-2 block">Trigger Type</Label>
                      <Controller
                        name="triggerType"
                        control={form.control}
                        render={({ field }) => (
                          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                            {TRIGGER_TYPES.map(trigger => {
                              const Icon = trigger.icon;
                              const isSelected = field.value === trigger.value;
                              return (
                                <div
                                  key={trigger.value}
                                  onClick={() => {
                                    field.onChange(trigger.value);
                                    form.setValue("triggerConfig", {});
                                  }}
                                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                    isSelected
                                      ? 'border-discord-blue bg-discord-blue/10'
                                      : 'border-discord-dark bg-discord-dark hover:border-discord-blue/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <Icon className={`h-5 w-5 ${isSelected ? 'text-discord-blue' : 'text-discord-muted'}`} />
                                    <div>
                                      <p className={`font-medium ${isSelected ? 'text-white' : 'text-discord-text'}`}>
                                        {trigger.label}
                                      </p>
                                      <p className="text-xs text-discord-muted">{trigger.description}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      />
                    </div>

                    <Separator className="bg-discord-dark" />

                    <div className="space-y-4">
                      <h4 className="text-white font-medium">Trigger Configuration</h4>
                      <TriggerConfigPanel
                        triggerType={form.watch("triggerType")}
                        config={form.watch("triggerConfig")}
                        onChange={(config) => form.setValue("triggerConfig", config)}
                        channels={textChannels}
                        voiceChannels={voiceChannels}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="conditions" className="mt-0 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-white font-medium">Conditions</h4>
                        <p className="text-sm text-discord-muted">Add conditions that must be met for the workflow to run</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addNewCondition} className="border-discord-dark">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Condition
                      </Button>
                    </div>

                    {conditionFields.length === 0 ? (
                      <div className="p-8 rounded-lg border border-dashed border-discord-dark text-center">
                        <AlertCircle className="h-8 w-8 text-discord-muted mx-auto mb-2" />
                        <p className="text-discord-muted">No conditions added. The workflow will run whenever the trigger fires.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {conditionFields.map((condition, index) => (
                          <div key={condition.id}>
                            {index > 0 && (
                              <div className="flex items-center justify-center py-2">
                                <Badge variant="outline" className="text-xs">AND</Badge>
                              </div>
                            )}
                            <Card className="bg-discord-dark border-discord-dark">
                              <CardContent className="p-4">
                                <div className="flex items-start gap-4">
                                  <div className="flex-1 space-y-3">
                                    <Controller
                                      name={`conditions.${index}.type`}
                                      control={form.control}
                                      render={({ field }) => (
                                        <Select value={field.value} onValueChange={field.onChange}>
                                          <SelectTrigger className="bg-discord-sidebar border-discord-dark text-white">
                                            <SelectValue placeholder="Select condition type" />
                                          </SelectTrigger>
                                          <SelectContent className="bg-discord-dark border-discord-dark">
                                            {CONDITION_TYPES.map(type => (
                                              <SelectItem key={type.value} value={type.value}>
                                                {type.label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    />
                                    <ConditionConfigPanel
                                      conditionType={form.watch(`conditions.${index}.type`)}
                                      config={form.watch(`conditions.${index}.config`)}
                                      onChange={(config) => form.setValue(`conditions.${index}.config`, config)}
                                      roles={roles}
                                      channels={textChannels}
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeCondition(index)}
                                    className="text-discord-muted hover:text-red-400 shrink-0"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="actions" className="mt-0 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-white font-medium">Actions</h4>
                        <p className="text-sm text-discord-muted">Define what happens when this workflow runs</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addNewAction} className="border-discord-dark">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Action
                      </Button>
                    </div>

                    <div className="p-3 rounded-lg bg-discord-dark/50 border border-discord-dark">
                      <p className="text-sm text-discord-muted mb-2">Available variables:</p>
                      <div className="flex flex-wrap gap-2">
                        {VARIABLE_HINTS.map(hint => (
                          <Badge key={hint.variable} variant="outline" className="text-xs font-mono cursor-help" title={hint.description}>
                            {hint.variable}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {actionFields.length === 0 ? (
                      <div className="p-8 rounded-lg border border-dashed border-discord-dark text-center">
                        <Play className="h-8 w-8 text-discord-muted mx-auto mb-2" />
                        <p className="text-discord-muted">No actions added. Add actions to define what the workflow should do.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {actionFields.map((action, index) => {
                          const ActionIcon = getActionIcon(form.watch(`actions.${index}.type`));
                          return (
                            <Card key={action.id} className="bg-discord-dark border-discord-dark">
                              <CardContent className="p-4">
                                <div className="flex items-start gap-4">
                                  <div className="flex flex-col gap-1 shrink-0">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => moveActionUp(index)}
                                      disabled={index === 0}
                                      className="h-6 w-6 text-discord-muted hover:text-white disabled:opacity-30"
                                    >
                                      <ArrowUp className="h-3 w-3" />
                                    </Button>
                                    <div className="w-6 h-6 rounded bg-discord-sidebar flex items-center justify-center">
                                      <span className="text-xs text-discord-muted">{index + 1}</span>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => moveActionDown(index)}
                                      disabled={index === actionFields.length - 1}
                                      className="h-6 w-6 text-discord-muted hover:text-white disabled:opacity-30"
                                    >
                                      <ArrowDown className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  <div className="flex-1 space-y-3">
                                    <Controller
                                      name={`actions.${index}.type`}
                                      control={form.control}
                                      render={({ field }) => (
                                        <Select value={field.value} onValueChange={field.onChange}>
                                          <SelectTrigger className="bg-discord-sidebar border-discord-dark text-white">
                                            <div className="flex items-center gap-2">
                                              <ActionIcon className="h-4 w-4 text-discord-blue" />
                                              <SelectValue placeholder="Select action type" />
                                            </div>
                                          </SelectTrigger>
                                          <SelectContent className="bg-discord-dark border-discord-dark">
                                            {ACTION_TYPES.map(type => {
                                              const Icon = type.icon;
                                              return (
                                                <SelectItem key={type.value} value={type.value}>
                                                  <div className="flex items-center gap-2">
                                                    <Icon className="h-4 w-4" />
                                                    {type.label}
                                                  </div>
                                                </SelectItem>
                                              );
                                            })}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    />
                                    <ActionConfigPanel
                                      actionType={form.watch(`actions.${index}.type`)}
                                      config={form.watch(`actions.${index}.config`)}
                                      onChange={(config) => form.setValue(`actions.${index}.config`, config)}
                                      roles={roles}
                                      channels={textChannels}
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeAction(index)}
                                    className="text-discord-muted hover:text-red-400 shrink-0"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="settings" className="mt-0 space-y-4">
                    <Card className="bg-discord-dark border-discord-dark">
                      <CardHeader>
                        <CardTitle className="text-white text-base flex items-center gap-2">
                          <Timer className="h-4 w-4" />
                          Cooldown Settings
                        </CardTitle>
                        <CardDescription>
                          Prevent the workflow from running too frequently
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-white">Enable Cooldown</Label>
                          <Controller
                            name="cooldownEnabled"
                            control={form.control}
                            render={({ field }) => (
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            )}
                          />
                        </div>
                        {form.watch("cooldownEnabled") && (
                          <>
                            <div>
                              <Label className="text-white">Duration (seconds)</Label>
                              <Input
                                type="number"
                                {...form.register("cooldownSeconds", { valueAsNumber: true })}
                                className="bg-discord-sidebar border-discord-dark text-white mt-1"
                                min={1}
                              />
                            </div>
                            <div>
                              <Label className="text-white">Cooldown Type</Label>
                              <Controller
                                name="cooldownType"
                                control={form.control}
                                render={({ field }) => (
                                  <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger className="bg-discord-sidebar border-discord-dark text-white mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-discord-dark border-discord-dark">
                                      <SelectItem value="user">Per User</SelectItem>
                                      <SelectItem value="channel">Per Channel</SelectItem>
                                      <SelectItem value="server">Per Server</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>

                    {editingWorkflow && (
                      <Card className="bg-discord-dark border-discord-dark">
                        <CardHeader>
                          <CardTitle className="text-white text-base flex items-center gap-2">
                            <Play className="h-4 w-4" />
                            Test Workflow
                          </CardTitle>
                          <CardDescription>
                            Run a simulated test of this workflow
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <Button
                            type="button"
                            onClick={handleTestWorkflow}
                            disabled={isTesting}
                            className="w-full bg-green-600 hover:bg-green-700"
                          >
                            {isTesting ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Testing...
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 mr-2" />
                                Test Workflow
                              </>
                            )}
                          </Button>
                          {testResult && (
                            <div className={`p-3 rounded-lg flex items-center gap-2 ${
                              testResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              {testResult.success ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : (
                                <AlertCircle className="h-4 w-4" />
                              )}
                              <span className="text-sm">{testResult.message}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>

            <DialogFooter className="shrink-0 pt-4 border-t border-discord-dark">
              <Button type="button" variant="outline" onClick={closeEditor} className="border-discord-dark">
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} className="bg-discord-blue hover:bg-discord-blue/80">
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Save Workflow
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!workflowToDelete} onOpenChange={() => setWorkflowToDelete(null)}>
        <AlertDialogContent className="bg-discord-sidebar border-discord-dark">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{workflowToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-discord-dark">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWorkflow}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface TriggerConfigPanelProps {
  triggerType: string;
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
  channels: Channel[];
  voiceChannels: Channel[];
}

function TriggerConfigPanel({ triggerType, config, onChange, channels, voiceChannels }: TriggerConfigPanelProps) {
  const updateConfig = (key: string, value: any) => {
    onChange({ ...config, [key]: value });
  };

  switch (triggerType) {
    case 'message_received':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-white text-sm">Channel (optional)</Label>
            <Select value={config.channelId || ""} onValueChange={(v) => updateConfig('channelId', v || undefined)}>
              <SelectTrigger className="bg-discord-dark border-discord-dark text-white mt-1">
                <SelectValue placeholder="Any channel" />
              </SelectTrigger>
              <SelectContent className="bg-discord-dark border-discord-dark">
                <SelectItem value="">Any channel</SelectItem>
                {channels.map(ch => (
                  <SelectItem key={ch.id} value={ch.id}>#{ch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-white text-sm">Keywords (comma-separated)</Label>
            <Input
              value={config.keywords || ""}
              onChange={(e) => updateConfig('keywords', e.target.value)}
              placeholder="hello, hi, hey"
              className="bg-discord-dark border-discord-dark text-white mt-1"
            />
          </div>
          <div>
            <Label className="text-white text-sm">Match Type</Label>
            <Select value={config.matchType || "contains"} onValueChange={(v) => updateConfig('matchType', v)}>
              <SelectTrigger className="bg-discord-dark border-discord-dark text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-discord-dark border-discord-dark">
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="starts_with">Starts With</SelectItem>
                <SelectItem value="ends_with">Ends With</SelectItem>
                <SelectItem value="exact">Exact Match</SelectItem>
                <SelectItem value="regex">Regex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="ignoreBots"
              checked={config.ignoreBots !== false}
              onCheckedChange={(checked) => updateConfig('ignoreBots', checked)}
            />
            <Label htmlFor="ignoreBots" className="text-sm text-discord-text">Ignore bot messages</Label>
          </div>
        </div>
      );

    case 'member_join':
    case 'member_leave':
      return (
        <div className="p-4 rounded-lg bg-discord-dark/50 text-center">
          <Users className="h-8 w-8 text-discord-muted mx-auto mb-2" />
          <p className="text-sm text-discord-muted">
            This trigger will fire automatically when a member {triggerType === 'member_join' ? 'joins' : 'leaves'} the server.
          </p>
        </div>
      );

    case 'reaction_add':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-white text-sm">Emoji</Label>
            <Input
              value={config.emoji || ""}
              onChange={(e) => updateConfig('emoji', e.target.value)}
              placeholder="⭐ or custom emoji name"
              className="bg-discord-dark border-discord-dark text-white mt-1"
            />
          </div>
          <div>
            <Label className="text-white text-sm">Message ID (optional)</Label>
            <Input
              value={config.messageId || ""}
              onChange={(e) => updateConfig('messageId', e.target.value)}
              placeholder="Leave empty for any message"
              className="bg-discord-dark border-discord-dark text-white mt-1"
            />
          </div>
        </div>
      );

    case 'button_click':
      return (
        <div>
          <Label className="text-white text-sm">Custom ID Pattern</Label>
          <Input
            value={config.customIdPattern || ""}
            onChange={(e) => updateConfig('customIdPattern', e.target.value)}
            placeholder="my-button-* (supports wildcards)"
            className="bg-discord-dark border-discord-dark text-white mt-1"
          />
        </div>
      );

    case 'voice_join':
    case 'voice_leave':
      return (
        <div>
          <Label className="text-white text-sm">Voice Channel (optional)</Label>
          <Select value={config.channelId || ""} onValueChange={(v) => updateConfig('channelId', v || undefined)}>
            <SelectTrigger className="bg-discord-dark border-discord-dark text-white mt-1">
              <SelectValue placeholder="Any voice channel" />
            </SelectTrigger>
            <SelectContent className="bg-discord-dark border-discord-dark">
              <SelectItem value="">Any voice channel</SelectItem>
              {voiceChannels.map(ch => (
                <SelectItem key={ch.id} value={ch.id}>🔊 {ch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'scheduled':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-white text-sm">Cron Expression</Label>
            <Input
              value={config.cron || ""}
              onChange={(e) => updateConfig('cron', e.target.value)}
              placeholder="0 9 * * * (every day at 9am)"
              className="bg-discord-dark border-discord-dark text-white mt-1 font-mono"
            />
          </div>
          <div className="p-3 rounded-lg bg-discord-dark/50">
            <p className="text-xs text-discord-muted mb-2">Common patterns:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <code className="text-discord-text">0 * * * *</code><span className="text-discord-muted">Every hour</span>
              <code className="text-discord-text">0 9 * * *</code><span className="text-discord-muted">Daily at 9am</span>
              <code className="text-discord-text">0 0 * * 0</code><span className="text-discord-muted">Weekly on Sunday</span>
              <code className="text-discord-text">0 0 1 * *</code><span className="text-discord-muted">Monthly on 1st</span>
            </div>
          </div>
        </div>
      );

    case 'role_add':
    case 'role_remove':
      return (
        <div className="p-4 rounded-lg bg-discord-dark/50 text-center">
          <Shield className="h-8 w-8 text-discord-muted mx-auto mb-2" />
          <p className="text-sm text-discord-muted">
            This trigger will fire when a role is {triggerType === 'role_add' ? 'added to' : 'removed from'} a member.
          </p>
        </div>
      );

    default:
      return (
        <div className="p-4 rounded-lg bg-discord-dark/50 text-center">
          <p className="text-sm text-discord-muted">No additional configuration needed for this trigger.</p>
        </div>
      );
  }
}

interface ConditionConfigPanelProps {
  conditionType: string;
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
  roles: Role[];
  channels: Channel[];
}

function ConditionConfigPanel({ conditionType, config, onChange, roles, channels }: ConditionConfigPanelProps) {
  const updateConfig = (key: string, value: any) => {
    onChange({ ...config, [key]: value });
  };

  switch (conditionType) {
    case 'user_has_role':
    case 'user_missing_role':
      return (
        <Select value={config.roleId || ""} onValueChange={(v) => updateConfig('roleId', v)}>
          <SelectTrigger className="bg-discord-sidebar border-discord-dark text-white">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent className="bg-discord-dark border-discord-dark">
            {roles.map(role => (
              <SelectItem key={role.id} value={role.id}>@{role.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'channel_is':
    case 'channel_is_not':
      return (
        <Select value={config.channelId || ""} onValueChange={(v) => updateConfig('channelId', v)}>
          <SelectTrigger className="bg-discord-sidebar border-discord-dark text-white">
            <SelectValue placeholder="Select a channel" />
          </SelectTrigger>
          <SelectContent className="bg-discord-dark border-discord-dark">
            {channels.map(ch => (
              <SelectItem key={ch.id} value={ch.id}>#{ch.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'message_contains':
    case 'message_starts_with':
    case 'message_matches_regex':
      return (
        <Input
          value={config.pattern || ""}
          onChange={(e) => updateConfig('pattern', e.target.value)}
          placeholder={conditionType === 'message_matches_regex' ? 'Regular expression pattern' : 'Text to match'}
          className="bg-discord-sidebar border-discord-dark text-white"
        />
      );

    case 'time_between':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-discord-muted">Start Time</Label>
            <Input
              type="time"
              value={config.startTime || ""}
              onChange={(e) => updateConfig('startTime', e.target.value)}
              className="bg-discord-sidebar border-discord-dark text-white"
            />
          </div>
          <div>
            <Label className="text-xs text-discord-muted">End Time</Label>
            <Input
              type="time"
              value={config.endTime || ""}
              onChange={(e) => updateConfig('endTime', e.target.value)}
              className="bg-discord-sidebar border-discord-dark text-white"
            />
          </div>
        </div>
      );

    case 'user_is_bot':
    case 'user_is_not_bot':
      return null;

    default:
      return null;
  }
}

interface ActionConfigPanelProps {
  actionType: string;
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
  roles: Role[];
  channels: Channel[];
}

function ActionConfigPanel({ actionType, config, onChange, roles, channels }: ActionConfigPanelProps) {
  const updateConfig = (key: string, value: any) => {
    onChange({ ...config, [key]: value });
  };

  switch (actionType) {
    case 'send_message':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-white text-sm">Channel</Label>
            <Select value={config.channelId || ""} onValueChange={(v) => updateConfig('channelId', v)}>
              <SelectTrigger className="bg-discord-sidebar border-discord-dark text-white mt-1">
                <SelectValue placeholder="Same as trigger channel" />
              </SelectTrigger>
              <SelectContent className="bg-discord-dark border-discord-dark">
                <SelectItem value="">Same as trigger channel</SelectItem>
                {channels.map(ch => (
                  <SelectItem key={ch.id} value={ch.id}>#{ch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-white text-sm">Message Content</Label>
            <Textarea
              value={config.content || ""}
              onChange={(e) => updateConfig('content', e.target.value)}
              placeholder="Use variables like {user.mention} to personalize the message"
              className="bg-discord-sidebar border-discord-dark text-white mt-1"
              rows={3}
            />
          </div>
        </div>
      );

    case 'send_dm':
      return (
        <div>
          <Label className="text-white text-sm">Message Content</Label>
          <Textarea
            value={config.content || ""}
            onChange={(e) => updateConfig('content', e.target.value)}
            placeholder="Use variables like {user.name} to personalize the message"
            className="bg-discord-sidebar border-discord-dark text-white mt-1"
            rows={3}
          />
        </div>
      );

    case 'add_role':
    case 'remove_role':
      return (
        <div>
          <Label className="text-white text-sm">Role</Label>
          <Select value={config.roleId || ""} onValueChange={(v) => updateConfig('roleId', v)}>
            <SelectTrigger className="bg-discord-sidebar border-discord-dark text-white mt-1">
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent className="bg-discord-dark border-discord-dark">
              {roles.map(role => (
                <SelectItem key={role.id} value={role.id}>@{role.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'create_thread':
      return (
        <div>
          <Label className="text-white text-sm">Thread Name</Label>
          <Input
            value={config.threadName || ""}
            onChange={(e) => updateConfig('threadName', e.target.value)}
            placeholder="Use {user.name} for dynamic names"
            className="bg-discord-sidebar border-discord-dark text-white mt-1"
          />
        </div>
      );

    case 'wait_delay':
      return (
        <div>
          <Label className="text-white text-sm">Delay (seconds)</Label>
          <Input
            type="number"
            value={config.seconds || 5}
            onChange={(e) => updateConfig('seconds', parseInt(e.target.value) || 5)}
            min={1}
            max={300}
            className="bg-discord-sidebar border-discord-dark text-white mt-1"
          />
        </div>
      );

    case 'react_message':
      return (
        <div>
          <Label className="text-white text-sm">Emoji</Label>
          <Input
            value={config.emoji || ""}
            onChange={(e) => updateConfig('emoji', e.target.value)}
            placeholder="👍 or custom emoji"
            className="bg-discord-sidebar border-discord-dark text-white mt-1"
          />
        </div>
      );

    case 'delete_message':
      return (
        <div className="p-3 rounded-lg bg-discord-dark/50 text-center">
          <Trash2 className="h-6 w-6 text-discord-muted mx-auto mb-2" />
          <p className="text-sm text-discord-muted">The triggering message will be deleted.</p>
        </div>
      );

    default:
      return null;
  }
}
