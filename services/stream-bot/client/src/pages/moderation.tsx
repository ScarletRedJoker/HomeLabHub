import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, AlertTriangle, Link, Ban, Trash2, Plus } from "lucide-react";
import { useWebSocket } from "@/hooks/use-websocket";

interface ModerationRule {
  id: string;
  userId: string;
  ruleType: string;
  isEnabled: boolean;
  severity: string;
  action: string;
  customPattern: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ModerationLog {
  id: string;
  userId: string;
  platform: string;
  username: string;
  message: string;
  ruleTriggered: string;
  action: string;
  severity: string;
  timestamp: Date;
}

interface LinkWhitelist {
  id: string;
  userId: string;
  domain: string;
  createdAt: Date;
}

interface ModerationStats {
  today: number;
  thisWeek: number;
  allTime: number;
}

const ruleTypeLabels: Record<string, { label: string; icon: any; description: string }> = {
  toxic: {
    label: "Toxic Language",
    icon: AlertTriangle,
    description: "AI-powered detection of toxic, hateful, or offensive content",
  },
  spam: {
    label: "Spam Detection",
    icon: Ban,
    description: "Detects repetitive messages and excessive emojis",
  },
  links: {
    label: "Link Filter",
    icon: Link,
    description: "Blocks unauthorized links (whitelist available below)",
  },
  caps: {
    label: "Caps Lock",
    icon: Shield,
    description: "Flags messages with excessive uppercase letters (>50%)",
  },
  symbols: {
    label: "Symbol Spam",
    icon: Shield,
    description: "Detects repeated characters and symbol spam (>30%)",
  },
};

const severityColors: Record<string, string> = {
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-red-500",
};

const actionColors: Record<string, string> = {
  warn: "bg-blue-500",
  timeout: "bg-orange-500",
  ban: "bg-red-500",
};

export default function Moderation() {
  const { toast } = useToast();
  const [newDomain, setNewDomain] = useState("");
  const [newBannedWord, setNewBannedWord] = useState("");
  const [realtimeLogs, setRealtimeLogs] = useState<ModerationLog[]>([]);

  const { data: rules } = useQuery<ModerationRule[]>({
    queryKey: ["/api/moderation/rules"],
  });

  const { data: logs } = useQuery<ModerationLog[]>({
    queryKey: ["/api/moderation/logs"],
  });

  const { data: whitelist } = useQuery<LinkWhitelist[]>({
    queryKey: ["/api/moderation/whitelist"],
  });

  const { data: stats } = useQuery<ModerationStats>({
    queryKey: ["/api/moderation/stats"],
  });

  const { data: settings } = useQuery<{ bannedWords: string[] }>({
    queryKey: ["/api/moderation/settings"],
  });

  useWebSocket((message) => {
    if (message?.type === "moderation_action") {
      const newLog: ModerationLog = {
        id: Date.now().toString(),
        userId: message.data.userId,
        platform: message.data.platform,
        username: message.data.username,
        message: message.data.message,
        ruleTriggered: message.data.ruleTriggered,
        action: message.data.action,
        severity: message.data.severity || "medium",
        timestamp: new Date(),
      };
      setRealtimeLogs((prev) => [newLog, ...prev].slice(0, 50));
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/stats"] });
    }
  });

  const allLogs = [...realtimeLogs, ...(logs || [])].slice(0, 100);

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ModerationRule> }) => {
      return await apiRequest("PATCH", `/api/moderation/rules/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/rules"] });
      toast({
        title: "Rule updated",
        description: "Moderation rule has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update rule",
        variant: "destructive",
      });
    },
  });

  const addWhitelistMutation = useMutation({
    mutationFn: async (domain: string) => {
      return await apiRequest("POST", "/api/moderation/whitelist", { domain });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/whitelist"] });
      setNewDomain("");
      toast({
        title: "Domain added",
        description: "Domain has been added to the whitelist.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add domain",
        variant: "destructive",
      });
    },
  });

  const removeWhitelistMutation = useMutation({
    mutationFn: async (domain: string) => {
      return await apiRequest("DELETE", `/api/moderation/whitelist/${encodeURIComponent(domain)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/whitelist"] });
      toast({
        title: "Domain removed",
        description: "Domain has been removed from the whitelist.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove domain",
        variant: "destructive",
      });
    },
  });

  const handleToggleRule = (rule: ModerationRule) => {
    updateRuleMutation.mutate({
      id: rule.id,
      data: { isEnabled: !rule.isEnabled },
    });
  };

  const handleSeverityChange = (rule: ModerationRule, value: number[]) => {
    const severityMap = ["low", "medium", "high"];
    updateRuleMutation.mutate({
      id: rule.id,
      data: { severity: severityMap[value[0]] },
    });
  };

  const handleActionChange = (rule: ModerationRule, action: string) => {
    updateRuleMutation.mutate({
      id: rule.id,
      data: { action },
    });
  };

  const handleAddDomain = () => {
    if (!newDomain.trim()) return;
    addWhitelistMutation.mutate(newDomain.trim());
  };

  const addBannedWordMutation = useMutation({
    mutationFn: async (word: string) => {
      const currentWords = settings?.bannedWords || [];
      return await apiRequest("PATCH", "/api/moderation/settings", { 
        bannedWords: [...currentWords, word] 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/settings"] });
      setNewBannedWord("");
      toast({
        title: "Word added",
        description: "Banned word has been added to the list.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add banned word",
        variant: "destructive",
      });
    },
  });

  const removeBannedWordMutation = useMutation({
    mutationFn: async (word: string) => {
      const currentWords = settings?.bannedWords || [];
      return await apiRequest("PATCH", "/api/moderation/settings", { 
        bannedWords: currentWords.filter(w => w !== word) 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/settings"] });
      toast({
        title: "Word removed",
        description: "Banned word has been removed from the list.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove banned word",
        variant: "destructive",
      });
    },
  });

  const handleAddBannedWord = () => {
    if (!newBannedWord.trim()) return;
    addBannedWordMutation.mutate(newBannedWord.trim());
  };

  const getSeverityValue = (severity: string): number => {
    const map: Record<string, number> = { low: 0, medium: 1, high: 2 };
    return map[severity] || 1;
  };

  const formatTimestamp = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInSeconds = Math.floor(diffInMs / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Auto-Moderation</h1>
          <p className="text-muted-foreground mt-1">
            Protect your chat with AI-powered moderation rules
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.today || 0}</div>
            <p className="text-xs text-muted-foreground">messages moderated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.thisWeek || 0}</div>
            <p className="text-xs text-muted-foreground">messages moderated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">All Time</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.allTime || 0}</div>
            <p className="text-xs text-muted-foreground">messages moderated</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Moderation Rules</CardTitle>
          <CardDescription>
            Configure how the AI bot should moderate your chat
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {rules?.map((rule) => {
            const config = ruleTypeLabels[rule.ruleType];
            const Icon = config?.icon || Shield;

            return (
              <div
                key={rule.id}
                className="flex flex-col space-y-4 p-4 border rounded-lg bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Icon className="h-5 w-5 text-primary" />
                    <div>
                      <h3 className="font-medium">{config?.label || rule.ruleType}</h3>
                      <p className="text-sm text-muted-foreground">{config?.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={rule.isEnabled}
                    onCheckedChange={() => handleToggleRule(rule)}
                  />
                </div>

                {rule.isEnabled && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label>Severity</Label>
                      <div className="flex items-center space-x-4">
                        <Slider
                          value={[getSeverityValue(rule.severity)]}
                          onValueChange={(value) => handleSeverityChange(rule, value)}
                          max={2}
                          step={1}
                          className="flex-1"
                        />
                        <Badge className={`${severityColors[rule.severity]} text-white`}>
                          {rule.severity}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Action</Label>
                      <Select
                        value={rule.action}
                        onValueChange={(value) => handleActionChange(rule, value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="warn">Warn</SelectItem>
                          <SelectItem value="timeout">Timeout (10min)</SelectItem>
                          <SelectItem value="ban">Ban</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Banned Words</CardTitle>
            <CardDescription>
              Messages containing these words will be automatically blocked
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex space-x-2">
              <Input
                placeholder="Add banned word..."
                value={newBannedWord}
                onChange={(e) => setNewBannedWord(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddBannedWord()}
              />
              <Button onClick={handleAddBannedWord} disabled={!newBannedWord.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {settings?.bannedWords?.map((word, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <span className="text-sm font-mono">{word}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBannedWordMutation.mutate(word)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {(!settings?.bannedWords || settings.bannedWords.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No banned words
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Link Whitelist</CardTitle>
            <CardDescription>
              Domains on this list are exempt from link filtering
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex space-x-2">
              <Input
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
              />
              <Button onClick={handleAddDomain} disabled={!newDomain.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {whitelist?.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <span className="text-sm">{entry.domain}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeWhitelistMutation.mutate(entry.domain)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {(!whitelist || whitelist.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No whitelisted domains
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Moderation Log</CardTitle>
          <CardDescription>Recent moderation actions (live updates)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No moderation actions yet
                  </TableCell>
                </TableRow>
              ) : (
                allLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {formatTimestamp(log.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.platform}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{log.username}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{log.ruleTriggered}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${actionColors[log.action]} text-white`}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {log.message}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
