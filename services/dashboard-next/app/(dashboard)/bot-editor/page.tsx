"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Bot,
  Settings2,
  Zap,
  MessageSquare,
  Music,
  Bell,
  Shield,
  Users,
  Hash,
  Volume2,
  Play,
  Square,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Terminal,
  Code2,
  Globe,
  Activity,
  BarChart3,
  Clock,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false }
);

interface BotCommand {
  id: string;
  name: string;
  description: string;
  code: string;
  enabled: boolean;
  cooldown: number;
  permissions: string[];
}

interface BotConfig {
  prefix: string;
  status: string;
  statusType: string;
  embedColor: string;
  logChannel: string;
  welcomeEnabled: boolean;
  welcomeChannel: string;
  welcomeMessage: string;
  autoRole: string;
}

const DEFAULT_COMMANDS: BotCommand[] = [
  {
    id: "1",
    name: "ping",
    description: "Check bot latency",
    code: `async execute(interaction) {
  const latency = Date.now() - interaction.createdTimestamp;
  await interaction.reply(\`Pong! Latency: \${latency}ms\`);
}`,
    enabled: true,
    cooldown: 3,
    permissions: [],
  },
  {
    id: "2",
    name: "help",
    description: "Show available commands",
    code: `async execute(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Bot Commands')
    .setDescription('Here are all available commands:')
    .addFields(
      { name: '/ping', value: 'Check bot latency' },
      { name: '/help', value: 'Show this help menu' },
      { name: '/userinfo', value: 'Get user information' }
    )
    .setColor('#5865F2');
  await interaction.reply({ embeds: [embed] });
}`,
    enabled: true,
    cooldown: 5,
    permissions: [],
  },
  {
    id: "3",
    name: "userinfo",
    description: "Get user information",
    code: `async execute(interaction) {
  const user = interaction.options.getUser('user') || interaction.user;
  const member = await interaction.guild.members.fetch(user.id);
  
  const embed = new EmbedBuilder()
    .setTitle(user.username)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: 'ID', value: user.id, inline: true },
      { name: 'Joined', value: member.joinedAt.toDateString(), inline: true },
      { name: 'Roles', value: member.roles.cache.map(r => r.name).join(', ') }
    )
    .setColor('#5865F2');
  await interaction.reply({ embeds: [embed] });
}`,
    enabled: true,
    cooldown: 5,
    permissions: [],
  },
];

const DEFAULT_CONFIG: BotConfig = {
  prefix: "!",
  status: "Watching over the server",
  statusType: "watching",
  embedColor: "#5865F2",
  logChannel: "",
  welcomeEnabled: false,
  welcomeChannel: "",
  welcomeMessage: "Welcome {user} to {server}!",
  autoRole: "",
};

export default function BotEditorPage() {
  const [activeBot, setActiveBot] = useState<"discord" | "stream">("discord");
  const [commands, setCommands] = useState<BotCommand[]>(DEFAULT_COMMANDS);
  const [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [editingCommand, setEditingCommand] = useState<BotCommand | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "[INFO] Bot initialized",
    "[INFO] Connected to Discord API",
    "[INFO] Loaded 3 commands",
    "[INFO] Ready to receive commands",
  ]);

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      await fetch("/api/bot-editor/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot: activeBot, config, commands }),
      });
      setLogs((prev) => [...prev, `[INFO] Configuration saved for ${activeBot} bot`]);
    } catch (error) {
      setLogs((prev) => [...prev, `[ERROR] Failed to save configuration`]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBot = async () => {
    setIsRunning(!isRunning);
    if (!isRunning) {
      setLogs((prev) => [
        ...prev,
        "[INFO] Starting bot...",
        "[INFO] Connecting to gateway...",
        "[INFO] Bot is now online!",
      ]);
    } else {
      setLogs((prev) => [...prev, "[INFO] Stopping bot...", "[INFO] Bot is now offline"]);
    }
  };

  const handleAddCommand = () => {
    const newCommand: BotCommand = {
      id: Date.now().toString(),
      name: "new-command",
      description: "New command description",
      code: `async execute(interaction) {
  await interaction.reply('Hello!');
}`,
      enabled: true,
      cooldown: 3,
      permissions: [],
    };
    setCommands([...commands, newCommand]);
    setEditingCommand(newCommand);
  };

  const handleDeleteCommand = (id: string) => {
    setCommands(commands.filter((c) => c.id !== id));
    if (editingCommand?.id === id) {
      setEditingCommand(null);
    }
  };

  const handleUpdateCommand = (updated: BotCommand) => {
    setCommands(commands.map((c) => (c.id === updated.id ? updated : c)));
    setEditingCommand(updated);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Bot className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Remote Bot Editor</h1>
            <div className="flex items-center border rounded-lg p-1">
              <Button
                variant={activeBot === "discord" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveBot("discord")}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Discord Bot
              </Button>
              <Button
                variant={activeBot === "stream" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveBot("stream")}
              >
                <Globe className="h-4 w-4 mr-1" />
                Stream Bot
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant={isRunning ? "default" : "secondary"}
              className={cn(isRunning && "bg-green-500")}
            >
              <div
                className={cn(
                  "h-2 w-2 rounded-full mr-1.5",
                  isRunning ? "bg-green-200 animate-pulse" : "bg-gray-400"
                )}
              />
              {isRunning ? "Online" : "Offline"}
            </Badge>

            <Button variant="outline" size="sm" onClick={handleToggleBot}>
              {isRunning ? (
                <>
                  <Square className="h-4 w-4 mr-1" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Start
                </>
              )}
            </Button>

            <Button
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="bg-gradient-to-r from-indigo-500 to-purple-600"
            >
              {isSaving ? (
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 border-r flex flex-col">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Commands</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAddCommand}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-2 space-y-1">
            {commands.map((command) => (
              <div
                key={command.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors group",
                  editingCommand?.id === command.id
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-accent"
                )}
                onClick={() => setEditingCommand(command)}
              >
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm truncate">{command.name}</span>
                <Switch
                  checked={command.enabled}
                  onCheckedChange={(enabled) =>
                    handleUpdateCommand({ ...command, enabled })
                  }
                  className="scale-75"
                  onClick={(e) => e.stopPropagation()}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCommand(command.id);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <Tabs defaultValue="code" className="flex-1 flex flex-col">
            <div className="border-b px-4">
              <TabsList>
                <TabsTrigger value="code" className="gap-1.5">
                  <Code2 className="h-3.5 w-3.5" />
                  Code Editor
                </TabsTrigger>
                <TabsTrigger value="config" className="gap-1.5">
                  <Settings2 className="h-3.5 w-3.5" />
                  Bot Config
                </TabsTrigger>
                <TabsTrigger value="logs" className="gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />
                  Console
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="code" className="flex-1 m-0 p-4">
              {editingCommand ? (
                <div className="h-full flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Command Name</Label>
                      <Input
                        value={editingCommand.name}
                        onChange={(e) =>
                          handleUpdateCommand({ ...editingCommand, name: e.target.value })
                        }
                        className="mt-1"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <Input
                        value={editingCommand.description}
                        onChange={(e) =>
                          handleUpdateCommand({
                            ...editingCommand,
                            description: e.target.value,
                          })
                        }
                        className="mt-1"
                      />
                    </div>
                    <div className="w-24">
                      <Label className="text-xs text-muted-foreground">Cooldown (s)</Label>
                      <Input
                        type="number"
                        value={editingCommand.cooldown}
                        onChange={(e) =>
                          handleUpdateCommand({
                            ...editingCommand,
                            cooldown: parseInt(e.target.value) || 0,
                          })
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex-1 border rounded-lg overflow-hidden">
                    <MonacoEditor
                      height="100%"
                      defaultLanguage="javascript"
                      value={editingCommand.code}
                      onChange={(value) =>
                        handleUpdateCommand({ ...editingCommand, code: value || "" })
                      }
                      theme="vs-dark"
                      options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        lineNumbers: "on",
                        automaticLayout: true,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Code2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>Select a command to edit its code</p>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="config" className="flex-1 m-0 p-4 overflow-auto">
              <div className="max-w-2xl space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">General Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Command Prefix</Label>
                        <Input
                          value={config.prefix}
                          onChange={(e) =>
                            setConfig({ ...config, prefix: e.target.value })
                          }
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Embed Color</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            value={config.embedColor}
                            onChange={(e) =>
                              setConfig({ ...config, embedColor: e.target.value })
                            }
                          />
                          <input
                            type="color"
                            value={config.embedColor}
                            onChange={(e) =>
                              setConfig({ ...config, embedColor: e.target.value })
                            }
                            className="h-9 w-12 rounded border cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Status Message</Label>
                        <Input
                          value={config.status}
                          onChange={(e) =>
                            setConfig({ ...config, status: e.target.value })
                          }
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Status Type</Label>
                        <Select
                          value={config.statusType}
                          onValueChange={(value) =>
                            setConfig({ ...config, statusType: value })
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="playing">Playing</SelectItem>
                            <SelectItem value="watching">Watching</SelectItem>
                            <SelectItem value="listening">Listening</SelectItem>
                            <SelectItem value="competing">Competing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Welcome System</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Enable Welcome Messages</Label>
                        <p className="text-xs text-muted-foreground">
                          Send a message when new members join
                        </p>
                      </div>
                      <Switch
                        checked={config.welcomeEnabled}
                        onCheckedChange={(enabled) =>
                          setConfig({ ...config, welcomeEnabled: enabled })
                        }
                      />
                    </div>

                    {config.welcomeEnabled && (
                      <>
                        <div>
                          <Label>Welcome Channel ID</Label>
                          <Input
                            value={config.welcomeChannel}
                            onChange={(e) =>
                              setConfig({ ...config, welcomeChannel: e.target.value })
                            }
                            placeholder="Enter channel ID"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Welcome Message</Label>
                          <Textarea
                            value={config.welcomeMessage}
                            onChange={(e) =>
                              setConfig({ ...config, welcomeMessage: e.target.value })
                            }
                            placeholder="Use {user} for username and {server} for server name"
                            className="mt-1"
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="logs" className="flex-1 m-0">
              <div className="h-full bg-black p-4 font-mono text-sm overflow-auto">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className={cn(
                      "py-0.5",
                      log.includes("[ERROR]")
                        ? "text-red-400"
                        : log.includes("[WARN]")
                        ? "text-yellow-400"
                        : "text-green-400"
                    )}
                  >
                    {log}
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
