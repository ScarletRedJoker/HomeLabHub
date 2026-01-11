"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Zap,
  Plus,
  Play,
  Square,
  Trash2,
  Save,
  Settings2,
  Clock,
  Mail,
  MessageSquare,
  Webhook,
  Database,
  Code2,
  GitBranch,
  Bell,
  Cloud,
  Home,
  Server,
  ArrowRight,
  Circle,
  CheckCircle2,
  XCircle,
  Loader2,
  GripVertical,
  Copy,
  MoreVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface WorkflowNode {
  id: string;
  type: "trigger" | "action" | "condition" | "delay";
  name: string;
  icon: string;
  config: Record<string, any>;
  position: { x: number; y: number };
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  connections: { from: string; to: string }[];
  isActive: boolean;
  lastRun?: Date;
  runCount: number;
}

const TRIGGER_NODES = [
  { type: "schedule", name: "Schedule", icon: Clock, description: "Run on a schedule" },
  { type: "webhook", name: "Webhook", icon: Webhook, description: "HTTP webhook trigger" },
  { type: "discord", name: "Discord Event", icon: MessageSquare, description: "Discord bot events" },
  { type: "stream", name: "Stream Event", icon: Cloud, description: "Stream go-live/offline" },
  { type: "homelab", name: "Homelab Event", icon: Home, description: "Server health changes" },
];

const ACTION_NODES = [
  { type: "discord_message", name: "Send Discord Message", icon: MessageSquare },
  { type: "email", name: "Send Email", icon: Mail },
  { type: "webhook_call", name: "HTTP Request", icon: Webhook },
  { type: "database", name: "Database Query", icon: Database },
  { type: "script", name: "Run Script", icon: Code2 },
  { type: "notification", name: "Push Notification", icon: Bell },
  { type: "server_command", name: "Server Command", icon: Server },
];

const CONDITION_NODES = [
  { type: "if", name: "If Condition", icon: GitBranch },
  { type: "filter", name: "Filter", icon: GitBranch },
];

const DEFAULT_WORKFLOWS: Workflow[] = [
  {
    id: "1",
    name: "Stream Go-Live Alert",
    description: "Post Discord message when stream starts",
    nodes: [
      {
        id: "n1",
        type: "trigger",
        name: "Stream Start",
        icon: "Cloud",
        config: { platform: "twitch", event: "stream.online" },
        position: { x: 100, y: 150 },
      },
      {
        id: "n2",
        type: "action",
        name: "Discord Message",
        icon: "MessageSquare",
        config: { channel: "announcements", template: "🔴 {streamer} is now live!" },
        position: { x: 350, y: 150 },
      },
    ],
    connections: [{ from: "n1", to: "n2" }],
    isActive: true,
    lastRun: new Date(Date.now() - 3600000),
    runCount: 47,
  },
  {
    id: "2",
    name: "Server Health Monitor",
    description: "Alert when server goes down",
    nodes: [
      {
        id: "n1",
        type: "trigger",
        name: "Health Check",
        icon: "Home",
        config: { interval: 60, servers: ["all"] },
        position: { x: 100, y: 150 },
      },
      {
        id: "n2",
        type: "condition",
        name: "Is Unhealthy?",
        icon: "GitBranch",
        config: { condition: "status !== 'healthy'" },
        position: { x: 300, y: 150 },
      },
      {
        id: "n3",
        type: "action",
        name: "Send Alert",
        icon: "Bell",
        config: { channels: ["discord", "email"] },
        position: { x: 500, y: 150 },
      },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
    ],
    isActive: true,
    lastRun: new Date(Date.now() - 60000),
    runCount: 1203,
  },
];

const nodeIcons: Record<string, any> = {
  Clock,
  Webhook,
  MessageSquare,
  Cloud,
  Home,
  Mail,
  Database,
  Code2,
  GitBranch,
  Bell,
  Server,
};

export default function AutomationsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>(DEFAULT_WORKFLOWS);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [showNodePicker, setShowNodePicker] = useState(false);
  const [draggedNode, setDraggedNode] = useState<WorkflowNode | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleCreateWorkflow = () => {
    const newWorkflow: Workflow = {
      id: Date.now().toString(),
      name: "New Automation",
      description: "Describe your automation",
      nodes: [],
      connections: [],
      isActive: false,
      runCount: 0,
    };
    setWorkflows([...workflows, newWorkflow]);
    setSelectedWorkflow(newWorkflow);
  };

  const handleAddNode = (nodeType: string, nodeName: string, icon: string, type: WorkflowNode["type"]) => {
    if (!selectedWorkflow) return;

    const newNode: WorkflowNode = {
      id: `n${Date.now()}`,
      type,
      name: nodeName,
      icon,
      config: {},
      position: {
        x: 100 + selectedWorkflow.nodes.length * 200,
        y: 150,
      },
    };

    const updatedWorkflow = {
      ...selectedWorkflow,
      nodes: [...selectedWorkflow.nodes, newNode],
    };

    if (selectedWorkflow.nodes.length > 0) {
      const lastNode = selectedWorkflow.nodes[selectedWorkflow.nodes.length - 1];
      updatedWorkflow.connections = [
        ...updatedWorkflow.connections,
        { from: lastNode.id, to: newNode.id },
      ];
    }

    setSelectedWorkflow(updatedWorkflow);
    setWorkflows(workflows.map((w) => (w.id === updatedWorkflow.id ? updatedWorkflow : w)));
    setShowNodePicker(false);
  };

  const handleToggleWorkflow = (id: string) => {
    setWorkflows(
      workflows.map((w) =>
        w.id === id ? { ...w, isActive: !w.isActive } : w
      )
    );
    if (selectedWorkflow?.id === id) {
      setSelectedWorkflow({ ...selectedWorkflow, isActive: !selectedWorkflow.isActive });
    }
  };

  const handleDeleteWorkflow = (id: string) => {
    setWorkflows(workflows.filter((w) => w.id !== id));
    if (selectedWorkflow?.id === id) {
      setSelectedWorkflow(null);
    }
  };

  const handleRunWorkflow = async (id: string) => {
    const workflow = workflows.find((w) => w.id === id);
    if (!workflow) return;

    setWorkflows(
      workflows.map((w) =>
        w.id === id ? { ...w, lastRun: new Date(), runCount: w.runCount + 1 } : w
      )
    );
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Automations
            </h2>
            <Button size="sm" onClick={handleCreateWorkflow}>
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Visual workflow designer for automated tasks
          </p>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-2">
          <AnimatePresence>
            {workflows.map((workflow) => (
              <motion.div
                key={workflow.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    selectedWorkflow?.id === workflow.id && "ring-2 ring-primary"
                  )}
                  onClick={() => setSelectedWorkflow(workflow)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm truncate">{workflow.name}</h3>
                          <Badge
                            variant={workflow.isActive ? "default" : "secondary"}
                            className={cn("text-xs", workflow.isActive && "bg-green-500")}
                          >
                            {workflow.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {workflow.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Circle className="h-3 w-3" />
                            {workflow.nodes.length} nodes
                          </span>
                          <span className="flex items-center gap-1">
                            <Play className="h-3 w-3" />
                            {workflow.runCount} runs
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedWorkflow ? (
          <>
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Input
                  value={selectedWorkflow.name}
                  onChange={(e) => {
                    const updated = { ...selectedWorkflow, name: e.target.value };
                    setSelectedWorkflow(updated);
                    setWorkflows(workflows.map((w) => (w.id === updated.id ? updated : w)));
                  }}
                  className="font-semibold w-64"
                />
                <Badge variant="outline" className="text-xs">
                  {selectedWorkflow.nodes.length} nodes
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRunWorkflow(selectedWorkflow.id)}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Test Run
                </Button>

                <Button
                  variant={selectedWorkflow.isActive ? "destructive" : "default"}
                  size="sm"
                  onClick={() => handleToggleWorkflow(selectedWorkflow.id)}
                >
                  {selectedWorkflow.isActive ? (
                    <>
                      <Square className="h-4 w-4 mr-1" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-1" />
                      Activate
                    </>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteWorkflow(selectedWorkflow.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div
              ref={canvasRef}
              className="flex-1 bg-muted/30 relative overflow-auto"
              style={{
                backgroundImage:
                  "radial-gradient(circle, hsl(var(--muted-foreground) / 0.15) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            >
              <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
                {selectedWorkflow.connections.map((conn, i) => {
                  const fromNode = selectedWorkflow.nodes.find((n) => n.id === conn.from);
                  const toNode = selectedWorkflow.nodes.find((n) => n.id === conn.to);
                  if (!fromNode || !toNode) return null;

                  const x1 = fromNode.position.x + 140;
                  const y1 = fromNode.position.y + 40;
                  const x2 = toNode.position.x;
                  const y2 = toNode.position.y + 40;

                  return (
                    <g key={i}>
                      <path
                        d={`M ${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                      />
                      <circle cx={x2} cy={y2} r="4" fill="hsl(var(--primary))" />
                    </g>
                  );
                })}
              </svg>

              {selectedWorkflow.nodes.map((node) => {
                const IconComponent = nodeIcons[node.icon] || Circle;
                return (
                  <motion.div
                    key={node.id}
                    className="absolute"
                    style={{ left: node.position.x, top: node.position.y }}
                    drag
                    dragMomentum={false}
                    onDrag={(_, info) => {
                      const updated = {
                        ...selectedWorkflow,
                        nodes: selectedWorkflow.nodes.map((n) =>
                          n.id === node.id
                            ? {
                                ...n,
                                position: {
                                  x: node.position.x + info.offset.x,
                                  y: node.position.y + info.offset.y,
                                },
                              }
                            : n
                        ),
                      };
                      setSelectedWorkflow(updated);
                    }}
                    onDragEnd={(_, info) => {
                      const updated = {
                        ...selectedWorkflow,
                        nodes: selectedWorkflow.nodes.map((n) =>
                          n.id === node.id
                            ? {
                                ...n,
                                position: {
                                  x: Math.max(0, node.position.x + info.offset.x),
                                  y: Math.max(0, node.position.y + info.offset.y),
                                },
                              }
                            : n
                        ),
                      };
                      setSelectedWorkflow(updated);
                      setWorkflows(workflows.map((w) => (w.id === updated.id ? updated : w)));
                    }}
                  >
                    <Card className="w-36 cursor-move shadow-lg hover:shadow-xl transition-shadow">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className={cn(
                              "h-8 w-8 rounded-lg flex items-center justify-center",
                              node.type === "trigger" && "bg-blue-500/10 text-blue-500",
                              node.type === "action" && "bg-green-500/10 text-green-500",
                              node.type === "condition" && "bg-yellow-500/10 text-yellow-500"
                            )}
                          >
                            <IconComponent className="h-4 w-4" />
                          </div>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] px-1.5",
                              node.type === "trigger" && "bg-blue-500/20",
                              node.type === "action" && "bg-green-500/20",
                              node.type === "condition" && "bg-yellow-500/20"
                            )}
                          >
                            {node.type}
                          </Badge>
                        </div>
                        <p className="text-xs font-medium truncate">{node.name}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}

              <Dialog open={showNodePicker} onOpenChange={setShowNodePicker}>
                <DialogTrigger asChild>
                  <Button
                    className="absolute bottom-4 right-4 shadow-lg"
                    size="lg"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Add Node
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add Node</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Circle className="h-4 w-4 text-blue-500" />
                        Triggers
                      </h4>
                      <div className="grid grid-cols-3 gap-2">
                        {TRIGGER_NODES.map((node) => (
                          <Button
                            key={node.type}
                            variant="outline"
                            className="h-auto py-3 flex-col items-start"
                            onClick={() =>
                              handleAddNode(node.type, node.name, node.icon.name || "Circle", "trigger")
                            }
                          >
                            <node.icon className="h-5 w-5 mb-1 text-blue-500" />
                            <span className="text-xs">{node.name}</span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Circle className="h-4 w-4 text-green-500" />
                        Actions
                      </h4>
                      <div className="grid grid-cols-4 gap-2">
                        {ACTION_NODES.map((node) => (
                          <Button
                            key={node.type}
                            variant="outline"
                            className="h-auto py-3 flex-col items-start"
                            onClick={() =>
                              handleAddNode(node.type, node.name, node.icon.name || "Circle", "action")
                            }
                          >
                            <node.icon className="h-5 w-5 mb-1 text-green-500" />
                            <span className="text-xs truncate w-full">{node.name}</span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Circle className="h-4 w-4 text-yellow-500" />
                        Logic
                      </h4>
                      <div className="grid grid-cols-4 gap-2">
                        {CONDITION_NODES.map((node) => (
                          <Button
                            key={node.type}
                            variant="outline"
                            className="h-auto py-3 flex-col items-start"
                            onClick={() =>
                              handleAddNode(node.type, node.name, node.icon.name || "Circle", "condition")
                            }
                          >
                            <node.icon className="h-5 w-5 mb-1 text-yellow-500" />
                            <span className="text-xs">{node.name}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Zap className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">Select an Automation</h3>
              <p className="text-sm mb-4">Choose an automation from the sidebar or create a new one</p>
              <Button onClick={handleCreateWorkflow}>
                <Plus className="h-4 w-4 mr-2" />
                Create Automation
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
