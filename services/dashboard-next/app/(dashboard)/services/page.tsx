"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play,
  Square,
  RotateCw,
  Terminal,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Server,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface DockerService {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string[];
  uptime: string;
  cpu: number;
  memory: number;
  created: string;
}

export default function ServicesPage() {
  const [search, setSearch] = useState("");
  const [services, setServices] = useState<DockerService[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: string; content: string } | null>(null);
  const { toast } = useToast();

  const fetchServices = async () => {
    try {
      const res = await fetch("/api/docker");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setServices(data.services || []);
    } catch (error) {
      console.error("Failed to fetch services:", error);
      toast({
        title: "Error",
        description: "Failed to fetch Docker containers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (containerId: string, action: "start" | "stop" | "restart" | "logs") => {
    setActionLoading(`${containerId}-${action}`);
    try {
      const res = await fetch("/api/docker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId, action }),
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Action failed");
      
      if (action === "logs") {
        setLogs({ id: containerId, content: data.logs });
      } else {
        toast({
          title: "Success",
          description: `Container ${action} completed`,
        });
        setTimeout(fetchServices, 1000);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${action} container`,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredServices = services.filter((service) =>
    service.name.toLowerCase().includes(search.toLowerCase()) ||
    service.image.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Services</h1>
          <p className="text-muted-foreground">
            Docker containers running on this server
          </p>
        </div>
        <Button onClick={fetchServices} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search containers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No Docker containers found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Docker socket may not be accessible
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredServices.map((service) => (
            <Card key={service.id} className="relative overflow-hidden">
              <div
                className={`absolute left-0 top-0 h-full w-1 ${
                  service.state === "running"
                    ? "bg-green-500"
                    : service.state === "exited"
                    ? "bg-red-500"
                    : "bg-yellow-500"
                }`}
              />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Server className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{service.name}</CardTitle>
                      <CardDescription className="text-xs truncate max-w-[180px]">
                        {service.image}
                      </CardDescription>
                    </div>
                  </div>
                  {service.state === "running" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-md bg-secondary p-2">
                    <div className="text-muted-foreground text-xs">CPU</div>
                    <div className="font-medium">{service.cpu}%</div>
                  </div>
                  <div className="rounded-md bg-secondary p-2">
                    <div className="text-muted-foreground text-xs">RAM</div>
                    <div className="font-medium">{service.memory}MB</div>
                  </div>
                  <div className="rounded-md bg-secondary p-2">
                    <div className="text-muted-foreground text-xs">Uptime</div>
                    <div className="font-medium text-xs">{service.uptime}</div>
                  </div>
                </div>

                {service.ports.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Ports: {service.ports.join(", ")}
                  </div>
                )}

                <div className="flex gap-2">
                  {service.state === "running" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(service.id, "stop")}
                        disabled={actionLoading === `${service.id}-stop`}
                      >
                        {actionLoading === `${service.id}-stop` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(service.id, "restart")}
                        disabled={actionLoading === `${service.id}-restart`}
                      >
                        {actionLoading === `${service.id}-restart` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCw className="h-4 w-4" />
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(service.id, "start")}
                      disabled={actionLoading === `${service.id}-start`}
                    >
                      {actionLoading === `${service.id}-start` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(service.id, "logs")}
                    disabled={actionLoading === `${service.id}-logs`}
                  >
                    {actionLoading === `${service.id}-logs` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Terminal className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {logs && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Container Logs: {logs.id}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setLogs(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-black text-green-400 p-4 rounded-lg overflow-auto max-h-96 text-xs font-mono">
              {logs.content || "No logs available"}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
