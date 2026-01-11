"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Monitor,
  Power,
  PowerOff,
  RotateCcw,
  RefreshCw,
  Loader2,
  Terminal,
  Package,
  Server,
  Cpu,
  Bot,
  CheckCircle,
  XCircle,
  Play,
  Square,
  Download,
  Trash2,
  Send,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface VMStatus {
  success: boolean;
  vmName: string | null;
  vmIp: string | null;
  vmState: string;
  winrmAvailable: boolean;
  sshAvailable: boolean;
  ports: {
    [key: string]: { port: number; available: boolean };
  };
  services: {
    ollama?: { status: string; version?: string };
  };
  error?: string;
}

interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

export default function WindowsVMPage() {
  const [status, setStatus] = useState<VMStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commandLoading, setCommandLoading] = useState(false);
  const [command, setCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<{ cmd: string; result: CommandResult }[]>([]);
  const [packageName, setPackageName] = useState("");
  const [modelName, setModelName] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/windows?action=status");
      const data = await res.json();
      setStatus(data);
      
      if (data.services?.ollama?.status === "online") {
        fetchOllamaModels();
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
      toast({
        title: "Error",
        description: "Failed to fetch Windows VM status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  const fetchOllamaModels = async () => {
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ollama-list" }),
      });
      const data = await res.json();
      if (data.success && data.output) {
        const lines = data.output.split("\n").slice(1);
        const models = lines
          .map((line: string) => line.split(/\s+/)[0])
          .filter((m: string) => m && m.length > 0);
        setOllamaModels(models);
      }
    } catch (error) {
      console.error("Failed to fetch Ollama models:", error);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStatus();
  };

  const executeCommand = async () => {
    if (!command.trim()) return;
    
    setCommandLoading(true);
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "execute", command, method: "ssh" }),
      });
      const result = await res.json();
      
      setCommandHistory((prev) => [...prev, { cmd: command, result }]);
      setCommand("");
      
      if (!result.success) {
        toast({
          title: "Command failed",
          description: result.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to execute command",
        variant: "destructive",
      });
    } finally {
      setCommandLoading(false);
    }
  };

  const installPackage = async () => {
    if (!packageName.trim()) return;
    
    setCommandLoading(true);
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install", package: packageName }),
      });
      const result = await res.json();
      
      toast({
        title: result.success ? "Package installed" : "Installation failed",
        description: result.success ? `${packageName} installed successfully` : result.error,
        variant: result.success ? "default" : "destructive",
      });
      
      setPackageName("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to install package",
        variant: "destructive",
      });
    } finally {
      setCommandLoading(false);
    }
  };

  const pullOllamaModel = async () => {
    if (!modelName.trim()) return;
    
    setCommandLoading(true);
    toast({
      title: "Pulling model",
      description: `Downloading ${modelName}... This may take a few minutes.`,
    });
    
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ollama-pull", model: modelName }),
      });
      const result = await res.json();
      
      toast({
        title: result.success ? "Model pulled" : "Pull failed",
        description: result.success ? `${modelName} downloaded successfully` : result.error,
        variant: result.success ? "default" : "destructive",
      });
      
      if (result.success) {
        setModelName("");
        fetchOllamaModels();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to pull model",
        variant: "destructive",
      });
    } finally {
      setCommandLoading(false);
    }
  };

  const handleVMAction = async (action: string) => {
    setCommandLoading(true);
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await res.json();
      
      toast({
        title: result.success ? "Action completed" : "Action failed",
        description: result.success ? `VM ${action} initiated` : result.error,
        variant: result.success ? "default" : "destructive",
      });
      
      setTimeout(fetchStatus, 5000);
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} VM`,
        variant: "destructive",
      });
    } finally {
      setCommandLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isOnline = status?.vmState === "running" && (status?.sshAvailable || status?.winrmAvailable);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Windows VM Control</h1>
          <p className="text-muted-foreground">
            Remote management for {status?.vmName || "Windows VM"}
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {status?.error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{status.error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">VM Status</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {status?.vmState === "running" ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className="text-xl font-bold capitalize">{status?.vmState || "Unknown"}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">IP: {status?.vmIp || "N/A"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">SSH</CardTitle>
            <Terminal className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={status?.sshAvailable ? "default" : "secondary"}>
              {status?.sshAvailable ? "Connected" : "Offline"}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">Port 22</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">WinRM</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={status?.winrmAvailable ? "default" : "secondary"}>
              {status?.winrmAvailable ? "Available" : "Offline"}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">Port 5985/5986</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ollama</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={status?.services?.ollama?.status === "online" ? "default" : "secondary"}>
              {status?.services?.ollama?.status === "online" ? "Online" : "Offline"}
            </Badge>
            {status?.services?.ollama?.version && (
              <p className="text-xs text-muted-foreground mt-1">v{status.services.ollama.version}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleVMAction("restart")}
          disabled={commandLoading || !isOnline}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Restart
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleVMAction("shutdown")}
          disabled={commandLoading || !isOnline}
        >
          <PowerOff className="h-4 w-4 mr-2" />
          Shutdown
        </Button>
      </div>

      <Tabs defaultValue="terminal" className="space-y-4">
        <TabsList>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="ollama">Ollama AI</TabsTrigger>
          <TabsTrigger value="ports">Ports</TabsTrigger>
        </TabsList>

        <TabsContent value="terminal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Remote Terminal
              </CardTitle>
              <CardDescription>Execute commands on the Windows VM via SSH</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter PowerShell command..."
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && executeCommand()}
                  disabled={!isOnline || commandLoading}
                />
                <Button onClick={executeCommand} disabled={!isOnline || commandLoading}>
                  {commandLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              
              <ScrollArea className="h-[300px] rounded-md border bg-black p-4 font-mono text-sm">
                {commandHistory.length === 0 ? (
                  <p className="text-muted-foreground">No commands executed yet</p>
                ) : (
                  commandHistory.map((entry, i) => (
                    <div key={i} className="mb-4">
                      <div className="text-green-400">$ {entry.cmd}</div>
                      {entry.result.success ? (
                        <pre className="text-white whitespace-pre-wrap">{entry.result.output}</pre>
                      ) : (
                        <pre className="text-red-400">{entry.result.error}</pre>
                      )}
                    </div>
                  ))
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Package Management
              </CardTitle>
              <CardDescription>Install software on Windows VM using winget</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Package name (e.g., Microsoft.VisualStudioCode)"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && installPackage()}
                  disabled={!isOnline || commandLoading}
                />
                <Button onClick={installPackage} disabled={!isOnline || commandLoading}>
                  <Download className="h-4 w-4 mr-2" />
                  Install
                </Button>
              </div>
              
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Popular packages:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Microsoft.VisualStudioCode",
                    "Git.Git",
                    "Python.Python.3.12",
                    "Nodejs.Nodejs",
                    "Docker.DockerDesktop",
                  ].map((pkg) => (
                    <Button
                      key={pkg}
                      variant="outline"
                      size="sm"
                      onClick={() => setPackageName(pkg)}
                    >
                      {pkg.split(".").pop()}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ollama" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Ollama AI Models
              </CardTitle>
              <CardDescription>Manage local AI models on Windows VM</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Model name (e.g., llama3.2, codellama)"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && pullOllamaModel()}
                  disabled={status?.services?.ollama?.status !== "online" || commandLoading}
                />
                <Button
                  onClick={pullOllamaModel}
                  disabled={status?.services?.ollama?.status !== "online" || commandLoading}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Pull
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Popular models:</p>
                <div className="flex flex-wrap gap-2">
                  {["llama3.2", "codellama", "mistral", "phi3", "gemma2"].map((model) => (
                    <Button
                      key={model}
                      variant="outline"
                      size="sm"
                      onClick={() => setModelName(model)}
                    >
                      {model}
                    </Button>
                  ))}
                </div>
              </div>

              {ollamaModels.length > 0 && (
                <div className="mt-4">
                  <p className="font-medium mb-2">Installed models:</p>
                  <div className="flex flex-wrap gap-2">
                    {ollamaModels.map((model) => (
                      <Badge key={model} variant="secondary">
                        {model}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Port Status
              </CardTitle>
              <CardDescription>Network connectivity to Windows VM</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {status?.ports && Object.entries(status.ports).map(([name, info]) => (
                  <div key={name} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium capitalize">{name.replace(/([A-Z])/g, " $1").trim()}</p>
                      <p className="text-xs text-muted-foreground">Port {info.port}</p>
                    </div>
                    <Badge variant={info.available ? "default" : "secondary"}>
                      {info.available ? "Open" : "Closed"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
