"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Server,
  Play,
  Square,
  RefreshCw,
  Power,
  Cpu,
  Image,
  Video,
  Loader2,
  AlertCircle,
  Monitor,
  Cloud,
  Home,
  Laptop,
  Wifi,
  WifiOff,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

interface VM {
  name: string;
  status: "running" | "stopped" | "paused" | "starting" | "stopping" | "unknown";
  autostart: boolean;
}

interface ServiceAPI {
  id: string;
  name: string;
  running: boolean;
  healthy: boolean;
  port: number;
  autostart: boolean;
}

interface Service {
  id: string;
  name: string;
  status: "running" | "stopped";
  health: "healthy" | "unhealthy" | "unknown";
  port: number;
  autostart: boolean;
}

function transformService(apiService: ServiceAPI): Service {
  return {
    id: apiService.id,
    name: apiService.name,
    status: apiService.running ? "running" : "stopped",
    health: apiService.healthy ? "healthy" : "unhealthy",
    port: apiService.port,
    autostart: apiService.autostart,
  };
}

const serviceIcons: Record<string, LucideIcon> = {
  ollama: Cpu,
  "stable-diffusion": Image,
  comfyui: Video,
};

const serverIcons: Record<string, LucideIcon> = {
  linode: Cloud,
  home: Home,
  windows: Laptop,
};

interface ManagedServer {
  id: string;
  name: string;
  description?: string;
  online: boolean;
  serverType: "linux" | "windows";
  supportsWol: boolean;
  wolRelayServer?: string;
}

export default function InfrastructurePage() {
  const [vms, setVMs] = useState<VM[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [managedServers, setManagedServers] = useState<ManagedServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vmActions, setVmActions] = useState<Record<string, boolean>>({});
  const [serviceActions, setServiceActions] = useState<Record<string, boolean>>({});
  const [serverActions, setServerActions] = useState<Record<string, boolean>>({});
  const [forceStopConfirm, setForceStopConfirm] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(15);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    
    try {
      const [vmRes, servicesRes, serversRes] = await Promise.all([
        fetch("/api/vm", { cache: "no-store" }),
        fetch("/api/services", { cache: "no-store" }),
        fetch("/api/servers/power", { cache: "no-store" }),
      ]);

      if (vmRes.ok) {
        const vmData = await vmRes.json();
        setVMs(vmData.vms || []);
      }

      if (servicesRes.ok) {
        const servicesData = await servicesRes.json();
        const transformedServices = (servicesData.services || []).map(transformService);
        setServices(transformedServices);
      }

      if (serversRes.ok) {
        const serversData = await serversRes.json();
        setManagedServers(serversData.servers || []);
      }

      setCountdown(15);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to fetch infrastructure status");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 15));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleVMAction = async (vmName: string, action: "start" | "stop" | "restart" | "force-stop") => {
    setVmActions((prev) => ({ ...prev, [vmName]: true }));
    try {
      const res = await fetch("/api/vm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vmName, action }),
      });

      if (res.ok) {
        toast.success(`VM ${action} command sent successfully`);
        await fetchData();
      } else {
        const error = await res.json();
        toast.error(error.message || `Failed to ${action} VM`);
      }
    } catch (error) {
      toast.error(`Failed to ${action} VM`);
    } finally {
      setVmActions((prev) => ({ ...prev, [vmName]: false }));
      setForceStopConfirm(null);
    }
  };

  const handleVMAutostart = async (vmName: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/vm/autostart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vmName, enabled }),
      });

      if (res.ok) {
        toast.success(`VM autostart ${enabled ? "enabled" : "disabled"}`);
        await fetchData();
      } else {
        toast.error("Failed to update VM autostart");
      }
    } catch (error) {
      toast.error("Failed to update VM autostart");
    }
  };

  const handleServiceAction = async (serviceId: string, action: "start" | "stop") => {
    setServiceActions((prev) => ({ ...prev, [serviceId]: true }));
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, action }),
      });

      if (res.ok) {
        toast.success(`Service ${action} command sent successfully`);
        await fetchData();
      } else {
        const error = await res.json();
        toast.error(error.message || `Failed to ${action} service`);
      }
    } catch (error) {
      toast.error(`Failed to ${action} service`);
    } finally {
      setServiceActions((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const handleServiceAutostart = async (serviceId: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/services/autostart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, enabled }),
      });

      if (res.ok) {
        toast.success(`Service autostart ${enabled ? "enabled" : "disabled"}`);
        await fetchData();
      } else {
        toast.error("Failed to update service autostart");
      }
    } catch (error) {
      toast.error("Failed to update service autostart");
    }
  };

  const handleServerAction = async (serverId: string, action: "wake" | "shutdown" | "restart") => {
    setServerActions((prev) => ({ ...prev, [serverId]: true }));
    try {
      const res = await fetch("/api/servers/power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId, action }),
      });

      const data = await res.json();
      
      if (res.ok) {
        toast.success(data.message || `Server ${action} command sent successfully`);
        setTimeout(() => fetchData(), 3000);
      } else {
        toast.error(data.error || `Failed to ${action} server`);
      }
    } catch (error) {
      toast.error(`Failed to ${action} server`);
    } finally {
      setServerActions((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  const handleDeployToServer = async (serverId: string) => {
    setServerActions((prev) => ({ ...prev, [`deploy-${serverId}`]: true }));
    try {
      let endpoint = "/api/deploy/execute";
      let body: any = { serverId };
      
      if (serverId === "windows") {
        endpoint = "/api/deploy/windows";
        body = { action: "git-pull" };
      }
      
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      
      if (res.ok) {
        toast.success(`Deployment to ${serverId} initiated`);
      } else {
        toast.error(data.error || "Deployment failed");
      }
    } catch (error) {
      toast.error("Failed to deploy");
    } finally {
      setServerActions((prev) => ({ ...prev, [`deploy-${serverId}`]: false }));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge variant="success">Running</Badge>;
      case "stopped":
        return <Badge variant="destructive">Stopped</Badge>;
      case "starting":
        return <Badge variant="warning">Starting</Badge>;
      case "stopping":
        return <Badge variant="warning">Stopping</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getHealthBadge = (health: string) => {
    switch (health) {
      case "healthy":
        return <Badge variant="success">Healthy</Badge>;
      case "unhealthy":
        return <Badge variant="destructive">Unhealthy</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading infrastructure status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Infrastructure</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage VMs and services
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Refreshing in {countdown}s
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Server className="h-5 w-5" />
            All Servers
          </h2>
          {managedServers.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Servers Found</h3>
                <p className="text-muted-foreground">
                  No managed servers are configured.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {managedServers.map((server) => {
                const Icon = serverIcons[server.id] || Server;
                return (
                  <Card key={server.id} className={server.online ? "border-green-500/30" : "border-red-500/30"}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5" />
                          <CardTitle className="text-base">{server.name}</CardTitle>
                        </div>
                        <Badge variant={server.online ? "success" : "destructive"} className="flex items-center gap-1">
                          {server.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                          {server.online ? "Online" : "Offline"}
                        </Badge>
                      </div>
                      {server.description && (
                        <CardDescription>{server.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Type</span>
                        <Badge variant="outline">
                          {server.serverType === "windows" ? "Windows" : "Linux"}
                        </Badge>
                      </div>
                      {server.supportsWol && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Wake-on-LAN</span>
                          <Badge variant="outline" className="text-green-500">
                            {server.wolRelayServer ? `Via ${server.wolRelayServer}` : "Direct"}
                          </Badge>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {!server.online && server.supportsWol && (
                          <Button
                            size="sm"
                            onClick={() => handleServerAction(server.id, "wake")}
                            disabled={serverActions[server.id]}
                          >
                            {serverActions[server.id] ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Power className="h-4 w-4 mr-2" />
                            )}
                            Wake
                          </Button>
                        )}
                        {server.online && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleServerAction(server.id, "restart")}
                              disabled={serverActions[server.id]}
                            >
                              {serverActions[server.id] ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                              )}
                              Restart
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleServerAction(server.id, "shutdown")}
                              disabled={serverActions[server.id]}
                            >
                              <Power className="h-4 w-4 mr-2" />
                              Shutdown
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDeployToServer(server.id)}
                              disabled={serverActions[`deploy-${server.id}`]}
                            >
                              {serverActions[`deploy-${server.id}`] ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Rocket className="h-4 w-4 mr-2" />
                              )}
                              Deploy
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Virtual Machines
          </h2>
          {vms.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No VMs Found</h3>
                <p className="text-muted-foreground">
                  No virtual machines are configured or available.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {vms.map((vm) => (
                <Card key={vm.name}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-5 w-5" />
                        <CardTitle className="text-base">{vm.name}</CardTitle>
                      </div>
                      {getStatusBadge(vm.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Autostart</span>
                      <Switch
                        checked={vm.autostart}
                        onCheckedChange={(checked) => handleVMAutostart(vm.name, checked)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {vm.status === "stopped" ? (
                        <Button
                          size="sm"
                          onClick={() => handleVMAction(vm.name, "start")}
                          disabled={vmActions[vm.name]}
                        >
                          {vmActions[vm.name] ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-2" />
                          )}
                          Start
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVMAction(vm.name, "stop")}
                            disabled={vmActions[vm.name]}
                          >
                            {vmActions[vm.name] ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Square className="h-4 w-4 mr-2" />
                            )}
                            Stop
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVMAction(vm.name, "restart")}
                            disabled={vmActions[vm.name]}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Restart
                          </Button>
                        </>
                      )}
                      {vm.status === "running" && (
                        forceStopConfirm === vm.name ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleVMAction(vm.name, "force-stop")}
                              disabled={vmActions[vm.name]}
                            >
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setForceStopConfirm(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setForceStopConfirm(vm.name)}
                            disabled={vmActions[vm.name]}
                          >
                            <Power className="h-4 w-4 mr-2" />
                            Force Stop
                          </Button>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Server className="h-5 w-5" />
            Services
          </h2>
          {services.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Services Found</h3>
                <p className="text-muted-foreground">
                  No managed services are configured or available.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => {
                const Icon = serviceIcons[service.id] || Server;
                return (
                  <Card key={service.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5" />
                          <CardTitle className="text-base">{service.name}</CardTitle>
                        </div>
                        {getStatusBadge(service.status)}
                      </div>
                      <CardDescription>Port: {service.port}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Health</span>
                        {getHealthBadge(service.health)}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Autostart</span>
                        <Switch
                          checked={service.autostart}
                          onCheckedChange={(checked) => handleServiceAutostart(service.id, checked)}
                        />
                      </div>
                      <div className="flex gap-2">
                        {service.status === "stopped" ? (
                          <Button
                            size="sm"
                            onClick={() => handleServiceAction(service.id, "start")}
                            disabled={serviceActions[service.id]}
                          >
                            {serviceActions[service.id] ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-2" />
                            )}
                            Start
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleServiceAction(service.id, "stop")}
                            disabled={serviceActions[service.id]}
                          >
                            {serviceActions[service.id] ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Square className="h-4 w-4 mr-2" />
                            )}
                            Stop
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
