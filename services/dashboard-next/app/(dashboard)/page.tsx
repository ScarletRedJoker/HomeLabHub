"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Server,
  Globe,
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Clock,
  Rocket,
  RefreshCw,
  Bot,
  Loader2,
  Play,
  Square,
  RotateCw,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

interface DockerService {
  id: string;
  name: string;
  state: string;
  uptime: string;
  cpu: number;
  memory: number;
}

interface ServerMetrics {
  id: string;
  name: string;
  status: string;
  uptime?: string;
  metrics: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

export default function DashboardPage() {
  const [services, setServices] = useState<DockerService[]>([]);
  const [servers, setServers] = useState<ServerMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    try {
      const [dockerRes, serverRes] = await Promise.all([
        fetch("/api/docker").catch(() => null),
        fetch("/api/servers").catch(() => null),
      ]);

      if (dockerRes?.ok) {
        const data = await dockerRes.json();
        setServices(data.services || []);
      }

      if (serverRes?.ok) {
        const data = await serverRes.json();
        setServers(data.servers || []);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickAction = async (action: string, params?: any) => {
    setActionLoading(action);
    try {
      if (action === "deploy-linode" || action === "deploy-home") {
        const server = action === "deploy-linode" ? "linode" : "home";
        const res = await fetch("/api/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ server }),
        });
        const data = await res.json();
        toast({
          title: data.success ? "Deployment Started" : "Error",
          description: data.message || data.error,
          variant: data.success ? "default" : "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Action failed",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const runningCount = services.filter((s) => s.state === "running").length;
  const totalCpu = servers.reduce((sum, s) => sum + (s.metrics?.cpu || 0), 0) / Math.max(servers.length, 1);
  const totalMem = servers.reduce((sum, s) => sum + (s.metrics?.memory || 0), 0) / Math.max(servers.length, 1);

  const stats = [
    { label: "Containers Running", value: `${runningCount}/${services.length}`, icon: Server, color: "text-green-500" },
    { label: "Servers Online", value: `${servers.filter(s => s.status === "online").length}/${servers.length}`, icon: Wifi, color: "text-blue-500" },
    { label: "Avg CPU", value: `${Math.round(totalCpu)}%`, icon: Cpu, color: "text-orange-500" },
    { label: "Avg Memory", value: `${Math.round(totalMem)}%`, icon: Activity, color: "text-purple-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here&apos;s your homelab overview.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link href="/ai">
            <Button size="sm">
              <Bot className="h-4 w-4 mr-2" />
              Ask Jarvis
            </Button>
          </Link>
        </div>
      </div>

      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium mr-2">Quick Actions:</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleQuickAction("deploy-linode")}
              disabled={actionLoading === "deploy-linode"}
            >
              {actionLoading === "deploy-linode" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-2" />
              )}
              Deploy Linode
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleQuickAction("deploy-home")}
              disabled={actionLoading === "deploy-home"}
            >
              {actionLoading === "deploy-home" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-2" />
              )}
              Deploy Home
            </Button>
            <Link href="/services">
              <Button size="sm" variant="outline">
                <Server className="h-4 w-4 mr-2" />
                Manage Services
              </Button>
            </Link>
            <Link href="/deploy">
              <Button size="sm" variant="outline">
                View Deploy Logs
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Docker Containers</CardTitle>
                <CardDescription>
                  {services.length > 0 ? "Status of containers on this server" : "Connect Docker to see containers"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {services.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No containers found. Docker may not be accessible in this environment.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {services.slice(0, 6).map((service) => (
                      <div
                        key={service.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-3">
                          {service.state === "running" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <p className="font-medium text-sm">{service.name}</p>
                            <p className="text-xs text-muted-foreground">
                              CPU: {service.cpu}% | RAM: {service.memory}MB
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {service.uptime}
                        </div>
                      </div>
                    ))}
                    {services.length > 6 && (
                      <Link href="/services">
                        <Button variant="ghost" size="sm" className="w-full">
                          View all {services.length} containers
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Server Health</CardTitle>
                <CardDescription>
                  {servers.length > 0 ? "Real-time metrics via SSH" : "Configure SSH for metrics"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {servers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No servers connected. SSH keys may not be configured.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {servers.map((server) => (
                      <div key={server.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {server.id === "linode" ? (
                              <HardDrive className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Wifi className="h-4 w-4 text-green-500" />
                            )}
                            <span className="font-medium text-sm">{server.name}</span>
                          </div>
                          {server.status === "online" ? (
                            <span className="text-xs text-green-500">Online</span>
                          ) : (
                            <span className="text-xs text-red-500">{server.status}</span>
                          )}
                        </div>
                        {server.status === "online" && (
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">CPU</span>
                              <div className="h-1.5 rounded-full bg-secondary mt-1">
                                <div
                                  className="h-1.5 rounded-full bg-blue-500"
                                  style={{ width: `${server.metrics.cpu}%` }}
                                />
                              </div>
                              <span>{server.metrics.cpu}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">RAM</span>
                              <div className="h-1.5 rounded-full bg-secondary mt-1">
                                <div
                                  className="h-1.5 rounded-full bg-purple-500"
                                  style={{ width: `${server.metrics.memory}%` }}
                                />
                              </div>
                              <span>{server.metrics.memory}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Disk</span>
                              <div className="h-1.5 rounded-full bg-secondary mt-1">
                                <div
                                  className="h-1.5 rounded-full bg-orange-500"
                                  style={{ width: `${server.metrics.disk}%` }}
                                />
                              </div>
                              <span>{server.metrics.disk}%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
