"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Workflow,
  Play,
  Plus,
  Loader2,
  Clock,
  Webhook,
  Zap,
  Globe,
  Terminal,
  MessageSquare,
  Mail,
  Trash2,
  Edit,
  History,
  Check,
  X,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface WorkflowTrigger {
  type: "schedule" | "webhook" | "event";
  config: {
    cron?: string;
    webhookUrl?: string;
    eventType?: "server-status" | "container-status";
    eventConfig?: Record<string, unknown>;
  };
}

interface WorkflowAction {
  id: string;
  type: "http-request" | "ssh-command" | "discord-notify" | "email";
  name: string;
  config: Record<string, unknown>;
}

interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: string;
  triggeredBy: string;
  output: any;
  error?: string;
  durationMs?: number;
  startedAt: string;
  completedAt?: string;
}

interface WorkflowData {
  id: string;
  userId: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  enabled: boolean;
  lastRun: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
  recentExecutions?: WorkflowExecution[];
}

const triggerIcons: Record<string, React.ReactNode> = {
  schedule: <Clock className="h-4 w-4" />,
  webhook: <Webhook className="h-4 w-4" />,
  event: <Zap className="h-4 w-4" />,
};

const actionIcons: Record<string, React.ReactNode> = {
  "http-request": <Globe className="h-4 w-4" />,
  "ssh-command": <Terminal className="h-4 w-4" />,
  "discord-notify": <MessageSquare className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
};

const triggerColors: Record<string, string> = {
  schedule: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  webhook: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  event: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

const TRIGGER_TYPES = [
  { value: "schedule", label: "Schedule (Cron)", icon: Clock },
  { value: "webhook", label: "Webhook", icon: Webhook },
  { value: "event", label: "Event", icon: Zap },
] as const;

const ACTION_TYPES = [
  { value: "http-request", label: "HTTP Request", icon: Globe },
  { value: "ssh-command", label: "SSH Command", icon: Terminal },
  { value: "discord-notify", label: "Discord Notify", icon: MessageSquare },
  { value: "email", label: "Email", icon: Mail },
] as const;

const EVENT_TYPES = [
  { value: "server-status", label: "Server Status Change" },
  { value: "container-status", label: "Container Status Change" },
] as const;

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    triggerType: "schedule" as WorkflowTrigger["type"],
    triggerConfig: {
      cron: "0 * * * *",
      webhookUrl: "",
      eventType: "server-status" as "server-status" | "container-status",
    },
    actions: [] as WorkflowAction[],
  });

  const { toast } = useToast();

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workflows");
      if (!res.ok) throw new Error("Failed to fetch workflows");
      const data = await res.json();
      setWorkflows(data.workflows || []);
    } catch (error) {
      console.error("Failed to fetch workflows:", error);
      toast({
        title: "Error",
        description: "Failed to load workflows",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      triggerType: "schedule",
      triggerConfig: {
        cron: "0 * * * *",
        webhookUrl: "",
        eventType: "server-status",
      },
      actions: [],
    });
    setEditingWorkflow(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const openEditDialog = (workflow: WorkflowData) => {
    setEditingWorkflow(workflow);
    setFormData({
      name: workflow.name,
      description: workflow.description,
      triggerType: workflow.trigger.type,
      triggerConfig: {
        cron: workflow.trigger.config.cron || "0 * * * *",
        webhookUrl: workflow.trigger.config.webhookUrl || "",
        eventType: (workflow.trigger.config.eventType as any) || "server-status",
      },
      actions: workflow.actions,
    });
    setShowCreateDialog(true);
  };

  const addAction = () => {
    const newAction: WorkflowAction = {
      id: `action-${Date.now()}`,
      type: "http-request",
      name: `Action ${formData.actions.length + 1}`,
      config: {},
    };
    setFormData((prev) => ({ ...prev, actions: [...prev.actions, newAction] }));
  };

  const updateAction = (index: number, updates: Partial<WorkflowAction>) => {
    setFormData((prev) => ({
      ...prev,
      actions: prev.actions.map((action, i) =>
        i === index ? { ...action, ...updates } : action
      ),
    }));
  };

  const removeAction = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    if (!formData.name || formData.actions.length === 0) {
      toast({
        title: "Missing Fields",
        description: "Please provide a name and at least one action",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const trigger: WorkflowTrigger = {
        type: formData.triggerType,
        config: {},
      };

      if (formData.triggerType === "schedule") {
        trigger.config.cron = formData.triggerConfig.cron;
      } else if (formData.triggerType === "webhook") {
        trigger.config.webhookUrl = `https://api.example.com/webhooks/${Date.now()}`;
      } else if (formData.triggerType === "event") {
        trigger.config.eventType = formData.triggerConfig.eventType;
      }

      const payload = {
        id: editingWorkflow?.id,
        name: formData.name,
        description: formData.description,
        trigger,
        actions: formData.actions,
      };

      const res = await fetch("/api/workflows", {
        method: editingWorkflow ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save workflow");

      toast({
        title: editingWorkflow ? "Workflow Updated" : "Workflow Created",
        description: `${formData.name} has been saved successfully`,
      });

      setShowCreateDialog(false);
      resetForm();
      fetchWorkflows();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save workflow",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (workflow: WorkflowData) => {
    try {
      const res = await fetch("/api/workflows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: workflow.id, enabled: !workflow.enabled }),
      });

      if (!res.ok) throw new Error("Failed to toggle workflow");

      setWorkflows((prev) =>
        prev.map((w) => (w.id === workflow.id ? { ...w, enabled: !w.enabled } : w))
      );

      toast({
        title: "Workflow Updated",
        description: `${workflow.name} has been ${workflow.enabled ? "disabled" : "enabled"}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle workflow",
        variant: "destructive",
      });
    }
  };

  const handleExecute = async (workflowId: string) => {
    setIsExecuting(workflowId);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "execute", workflowId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to execute workflow");

      toast({
        title: "Workflow Executed",
        description: `Workflow completed in ${data.execution.durationMs}ms`,
      });

      fetchWorkflows();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to execute workflow",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(null);
    }
  };

  const handleDelete = async (workflowId: string) => {
    try {
      const res = await fetch(`/api/workflows?id=${workflowId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete workflow");

      setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));

      toast({
        title: "Workflow Deleted",
        description: "Workflow has been removed",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete workflow",
        variant: "destructive",
      });
    }
  };

  const filteredWorkflows =
    activeTab === "all"
      ? workflows
      : activeTab === "enabled"
        ? workflows.filter((w) => w.enabled)
        : workflows.filter((w) => !w.enabled);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Workflow className="h-7 w-7 text-primary" />
            Workflow Automation
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Create and manage automated workflows for your infrastructure
          </p>
        </div>
        <Button onClick={openCreateDialog} className="self-start sm:self-auto">
          <Plus className="mr-2 h-4 w-4" />
          Create Workflow
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Workflow className="h-4 w-4" />
            All ({workflows.length})
          </TabsTrigger>
          <TabsTrigger value="enabled" className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            Enabled ({workflows.filter((w) => w.enabled).length})
          </TabsTrigger>
          <TabsTrigger value="disabled" className="flex items-center gap-2">
            <X className="h-4 w-4" />
            Disabled ({workflows.filter((w) => !w.enabled).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredWorkflows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Workflow className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No workflows found</p>
                <Button onClick={openCreateDialog} variant="outline" className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first workflow
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {filteredWorkflows.map((workflow) => (
                <Card
                  key={workflow.id}
                  className={cn(
                    "group relative overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-primary/50",
                    !workflow.enabled && "opacity-60"
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "rounded-lg p-2.5 transition-colors",
                            triggerColors[workflow.trigger.type]
                          )}
                        >
                          {triggerIcons[workflow.trigger.type]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">{workflow.name}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {workflow.trigger.type === "schedule" && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {workflow.trigger.config.cron}
                              </span>
                            )}
                            {workflow.trigger.type === "webhook" && "Triggered by webhook"}
                            {workflow.trigger.type === "event" && (
                              <span>On {workflow.trigger.config.eventType}</span>
                            )}
                          </CardDescription>
                        </div>
                      </div>
                      <Switch
                        checked={workflow.enabled}
                        onCheckedChange={() => handleToggle(workflow)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {workflow.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {workflow.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {workflow.actions.map((action) => (
                        <span
                          key={action.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-secondary"
                        >
                          {actionIcons[action.type]}
                          {action.name}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last run: {formatDate(workflow.lastRun)}
                      </span>
                      <span className="flex items-center gap-1">
                        <History className="h-3 w-3" />
                        {workflow.runCount} runs
                      </span>
                    </div>

                    {workflow.recentExecutions && workflow.recentExecutions.length > 0 && (
                      <div>
                        <button
                          onClick={() =>
                            setExpandedWorkflow(
                              expandedWorkflow === workflow.id ? null : workflow.id
                            )
                          }
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {expandedWorkflow === workflow.id ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                          Recent executions
                        </button>
                        {expandedWorkflow === workflow.id && (
                          <div className="mt-2 space-y-1">
                            {workflow.recentExecutions.map((exec) => (
                              <div
                                key={exec.id}
                                className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1"
                              >
                                <span className="flex items-center gap-1">
                                  {exec.status === "completed" ? (
                                    <Check className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <X className="h-3 w-3 text-red-500" />
                                  )}
                                  {exec.triggeredBy}
                                </span>
                                <span>{formatDate(exec.startedAt)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        className="flex-1"
                        onClick={() => handleExecute(workflow.id)}
                        disabled={!workflow.enabled || isExecuting === workflow.id}
                      >
                        {isExecuting === workflow.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Run Now
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openEditDialog(workflow)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDelete(workflow.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingWorkflow ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingWorkflow ? "Edit Workflow" : "Create Workflow"}
            </DialogTitle>
            <DialogDescription>
              {editingWorkflow
                ? "Modify your workflow configuration"
                : "Define a new automated workflow"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="workflow-name">Name *</Label>
              <Input
                id="workflow-name"
                placeholder="My Workflow"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workflow-description">Description</Label>
              <Input
                id="workflow-description"
                placeholder="What does this workflow do?"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>

            <div className="space-y-4">
              <Label>Trigger</Label>
              <div className="grid grid-cols-3 gap-2">
                {TRIGGER_TYPES.map((trigger) => (
                  <button
                    key={trigger.value}
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, triggerType: trigger.value }))
                    }
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                      formData.triggerType === trigger.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <trigger.icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{trigger.label}</span>
                  </button>
                ))}
              </div>

              {formData.triggerType === "schedule" && (
                <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                  <Label htmlFor="cron">Cron Expression</Label>
                  <Input
                    id="cron"
                    placeholder="0 * * * *"
                    value={formData.triggerConfig.cron}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        triggerConfig: { ...prev.triggerConfig, cron: e.target.value },
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Examples: "0 * * * *" (hourly), "0 0 * * *" (daily), "0 0 * * 0" (weekly)
                  </p>
                </div>
              )}

              {formData.triggerType === "webhook" && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    A unique webhook URL will be generated when you save this workflow.
                  </p>
                </div>
              )}

              {formData.triggerType === "event" && (
                <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                  <Label>Event Type</Label>
                  <Select
                    value={formData.triggerConfig.eventType}
                    onValueChange={(value: "server-status" | "container-status") =>
                      setFormData((prev) => ({
                        ...prev,
                        triggerConfig: { ...prev.triggerConfig, eventType: value },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((event) => (
                        <SelectItem key={event.value} value={event.value}>
                          {event.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Actions *</Label>
                <Button variant="outline" size="sm" onClick={addAction}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Action
                </Button>
              </div>

              {formData.actions.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    No actions added. Click "Add Action" to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.actions.map((action, index) => (
                    <div
                      key={action.id}
                      className="p-4 border rounded-lg space-y-3 bg-muted/30"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Action {index + 1}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAction(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select
                            value={action.type}
                            onValueChange={(value: WorkflowAction["type"]) =>
                              updateAction(index, { type: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ACTION_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  <span className="flex items-center gap-2">
                                    <type.icon className="h-4 w-4" />
                                    {type.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input
                            value={action.name}
                            onChange={(e) => updateAction(index, { name: e.target.value })}
                            placeholder="Action name"
                          />
                        </div>
                      </div>

                      {action.type === "http-request" && (
                        <div className="space-y-2">
                          <Label>URL</Label>
                          <Input
                            value={(action.config.url as string) || ""}
                            onChange={(e) =>
                              updateAction(index, {
                                config: { ...action.config, url: e.target.value },
                              })
                            }
                            placeholder="https://api.example.com/endpoint"
                          />
                        </div>
                      )}

                      {action.type === "ssh-command" && (
                        <div className="space-y-2">
                          <Label>Command</Label>
                          <Input
                            value={(action.config.command as string) || ""}
                            onChange={(e) =>
                              updateAction(index, {
                                config: { ...action.config, command: e.target.value },
                              })
                            }
                            placeholder="docker restart my-container"
                          />
                        </div>
                      )}

                      {action.type === "discord-notify" && (
                        <div className="space-y-2">
                          <Label>Message</Label>
                          <Input
                            value={(action.config.message as string) || ""}
                            onChange={(e) =>
                              updateAction(index, {
                                config: { ...action.config, message: e.target.value },
                              })
                            }
                            placeholder="Workflow completed successfully!"
                          />
                        </div>
                      )}

                      {action.type === "email" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>To</Label>
                            <Input
                              value={(action.config.to as string) || ""}
                              onChange={(e) =>
                                updateAction(index, {
                                  config: { ...action.config, to: e.target.value },
                                })
                              }
                              placeholder="user@example.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Subject</Label>
                            <Input
                              value={(action.config.subject as string) || ""}
                              onChange={(e) =>
                                updateAction(index, {
                                  config: { ...action.config, subject: e.target.value },
                                })
                              }
                              placeholder="Workflow notification"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  {editingWorkflow ? "Update Workflow" : "Create Workflow"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
