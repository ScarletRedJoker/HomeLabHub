"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusCard, type ServiceHealth } from "@/components/status/status-card";
import {
  RefreshCw,
  Activity,
  Server,
  Bot,
  Video,
  Database,
  HardDrive,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Settings,
  Brain,
  Image,
  Palette,
} from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

const serviceIcons: Record<string, LucideIcon> = {
  dashboard: Activity,
  "discord-bot": Bot,
  "stream-bot": Video,
  database: Database,
  redis: Server,
  docker: HardDrive,
  ollama: Brain,
  "stable-diffusion": Image,
  comfyui: Palette,
};

interface HealthResponse {
  services: ServiceHealth[];
  summary: {
    healthy: number;
    total: number;
    timestamp: string;
  };
}

export default function StatusPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);

  const fetchHealth = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    
    try {
      const response = await fetch("/api/health/status", { cache: "no-store" });
      if (response.ok) {
        const result = await response.json();
        setData(result);
        setLastRefresh(new Date());
        setCountdown(30);
      }
    } catch (error) {
      console.error("Failed to fetch health status:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => fetchHealth(), 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 30));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getOverallStatus = () => {
    if (!data) return "unknown";
    const healthyRatio = data.summary.healthy / data.summary.total;
    if (healthyRatio === 1) return "healthy";
    if (healthyRatio >= 0.5) return "degraded";
    return "critical";
  };

  const overallStatus = getOverallStatus();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Checking service health...</p>
        </div>
      </div>
    );
  }

  if (!data || data.services.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Status Overview</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Monitor the health of all your homelab services
          </p>
        </div>
        
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Services Configured</h3>
            <p className="text-muted-foreground max-w-md mb-6">
              Health monitoring is not yet configured. Make sure your services are running
              and accessible to see their status here.
            </p>
            <div className="flex gap-3">
              <Link href="/services">
                <Button variant="outline">
                  <Server className="h-4 w-4 mr-2" />
                  Manage Services
                </Button>
              </Link>
              <Link href="/settings">
                <Button>
                  <Settings className="h-4 w-4 mr-2" />
                  Configure
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Status Overview</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Monitor the health of all your homelab services
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Refreshing in {countdown}s
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchHealth(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <Card className={
        overallStatus === "healthy" 
          ? "bg-green-500/5 border-green-500/20" 
          : overallStatus === "degraded"
          ? "bg-yellow-500/5 border-yellow-500/20"
          : "bg-red-500/5 border-red-500/20"
      }>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {overallStatus === "healthy" ? (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              ) : overallStatus === "degraded" ? (
                <AlertCircle className="h-6 w-6 text-yellow-500" />
              ) : (
                <AlertCircle className="h-6 w-6 text-red-500" />
              )}
              <div>
                <CardTitle className="text-lg">
                  {overallStatus === "healthy" 
                    ? "All Systems Operational" 
                    : overallStatus === "degraded"
                    ? "Degraded Performance"
                    : "Critical Issues Detected"}
                </CardTitle>
                <CardDescription>
                  {data.summary.healthy} of {data.summary.total} services healthy
                </CardDescription>
              </div>
            </div>
            {lastRefresh && (
              <span className="text-xs text-muted-foreground">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.services.map((service) => (
          <StatusCard
            key={service.id}
            service={service}
            icon={serviceIcons[service.id] || Server}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service Endpoints</CardTitle>
          <CardDescription>
            Health check endpoints being monitored
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm font-mono">
            <div className="flex justify-between p-2 rounded bg-muted/50">
              <span>Dashboard</span>
              <span className="text-muted-foreground">/api/health</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-muted/50">
              <span>Discord Bot</span>
              <span className="text-muted-foreground">discord-bot:4000/health</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-muted/50">
              <span>Stream Bot</span>
              <span className="text-muted-foreground">stream-bot:5000/health</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-muted/50">
              <span>PostgreSQL</span>
              <span className="text-muted-foreground">DATABASE_URL connection</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-muted/50">
              <span>Redis</span>
              <span className="text-muted-foreground">REDIS_URL connection</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-muted/50">
              <span>Docker</span>
              <span className="text-muted-foreground">docker.sock (production only)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
