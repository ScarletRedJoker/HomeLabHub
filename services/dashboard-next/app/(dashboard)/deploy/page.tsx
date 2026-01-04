"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  Server,
  Home,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface Deployment {
  id: string;
  server: string;
  status: "running" | "success" | "failed";
  startTime: string;
  endTime?: string;
  logs: string[];
}

const deployTargets = [
  {
    id: "linode",
    name: "Linode Server",
    description: "Deploy all services to Linode cloud",
    services: ["Dashboard", "Discord Bot", "Stream Bot"],
  },
  {
    id: "home",
    name: "Home Server",
    description: "Deploy to local Ubuntu server",
    services: ["Plex", "Home Assistant", "MinIO"],
  },
];

export default function DeployPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [activeDeploy, setActiveDeploy] = useState<Deployment | null>(null);
  const { toast } = useToast();

  const fetchDeployments = async () => {
    try {
      const res = await fetch("/api/deploy");
      if (!res.ok) return;
      const data = await res.json();
      setDeployments(data.deployments || []);
    } catch (error) {
      console.error("Failed to fetch deployments:", error);
    }
  };

  const pollDeployment = async (deployId: string) => {
    try {
      const res = await fetch(`/api/deploy?id=${deployId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  useEffect(() => {
    fetchDeployments();
  }, []);

  useEffect(() => {
    if (!activeDeploy || activeDeploy.status !== "running") return;

    const interval = setInterval(async () => {
      const updated = await pollDeployment(activeDeploy.id);
      if (updated) {
        setActiveDeploy(updated);
        if (updated.status !== "running") {
          clearInterval(interval);
          setDeploying(null);
          fetchDeployments();
          toast({
            title: updated.status === "success" ? "Deployment Complete" : "Deployment Failed",
            description: updated.status === "success" 
              ? "All services deployed successfully"
              : "Check logs for details",
            variant: updated.status === "success" ? "default" : "destructive",
          });
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeDeploy]);

  const handleDeploy = async (server: string) => {
    setDeploying(server);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Deploy failed");

      toast({
        title: "Deployment Started",
        description: `Deploying to ${server}...`,
      });

      const deploy = await pollDeployment(data.deployId);
      if (deploy) {
        setActiveDeploy(deploy);
      }
    } catch (error: any) {
      setDeploying(null);
      toast({
        title: "Error",
        description: error.message || "Failed to start deployment",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Rocket className="h-8 w-8 text-primary" />
          Deployment
        </h1>
        <p className="text-muted-foreground">
          Deploy services via SSH to your servers
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {deployTargets.map((target) => (
          <Card key={target.id}>
            <CardHeader>
              <div className="flex items-center gap-3">
                {target.id === "linode" ? (
                  <div className="rounded-lg bg-blue-500/10 p-2">
                    <Server className="h-6 w-6 text-blue-500" />
                  </div>
                ) : (
                  <div className="rounded-lg bg-green-500/10 p-2">
                    <Home className="h-6 w-6 text-green-500" />
                  </div>
                )}
                <div>
                  <CardTitle>{target.name}</CardTitle>
                  <CardDescription>{target.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Services: {target.services.join(", ")}
              </div>
              <Button
                className="w-full"
                onClick={() => handleDeploy(target.id)}
                disabled={deploying !== null}
              >
                {deploying === target.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 h-4 w-4" />
                    Deploy Now
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {activeDeploy && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {activeDeploy.status === "running" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                ) : activeDeploy.status === "success" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )}
                Deployment: {activeDeploy.server}
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {activeDeploy.status}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-black text-green-400 p-4 rounded-lg overflow-auto max-h-96 text-xs font-mono">
              {activeDeploy.logs.join("\n") || "Waiting for logs..."}
            </pre>
          </CardContent>
        </Card>
      )}

      {deployments.length > 0 && !activeDeploy && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Deployments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deployments.slice(0, 5).map((deploy) => (
                <div
                  key={deploy.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary"
                >
                  <div className="flex items-center gap-3">
                    {deploy.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : deploy.status === "failed" ? (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-blue-500" />
                    )}
                    <span className="font-medium capitalize">{deploy.server}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(deploy.startTime).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
