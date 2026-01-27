"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Image,
  Workflow,
  Server,
  Clock,
  Zap,
  Bug,
  Wrench,
  Cloud,
  Cpu,
  AlertCircle,
} from "lucide-react";

interface EndpointStatus {
  url: string;
  status: "online" | "offline" | "degraded";
  latencyMs?: number;
  error?: string;
  models?: string[];
}

interface ProviderStatus {
  status: "online" | "offline" | "degraded";
  endpoints?: EndpointStatus[];
  endpoint?: EndpointStatus;
  configured?: boolean;
  error?: string;
  health?: {
    status: string;
    lastCheck?: string;
  };
  availableModels?: string[];
}

interface TroubleshootingItem {
  issue: string;
  steps: string[];
}

interface HealthResponse {
  localAIOnly?: boolean;
  fallbackAvailable?: boolean;
  timestamp: string;
  providers: {
    ollama: ProviderStatus;
    openai: ProviderStatus;
    stableDiffusion: ProviderStatus;
    comfyui: ProviderStatus;
  };
  gpu?: {
    available: boolean;
    stats?: {
      memoryUsed: number;
      memoryTotal: number;
      memoryUsagePercent: number;
    };
  };
  troubleshooting?: TroubleshootingItem[];
  recommendation: string;
}

type ServiceStatus = "online" | "offline" | "degraded" | "checking";

interface ServiceInfo {
  id: keyof HealthResponse["providers"];
  name: string;
  description: string;
  icon: typeof Server;
  getStatus: (data: HealthResponse) => ServiceStatus;
  getLatency: (data: HealthResponse) => number | undefined;
  getError: (data: HealthResponse) => string | undefined;
}

const SERVICES: ServiceInfo[] = [
  {
    id: "ollama",
    name: "Ollama",
    description: "Local LLM inference",
    icon: Cpu,
    getStatus: (data) => data.providers.ollama.status,
    getLatency: (data) => data.providers.ollama.endpoints?.[0]?.latencyMs,
    getError: (data) => data.providers.ollama.endpoints?.[0]?.error,
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Cloud fallback",
    icon: Cloud,
    getStatus: (data) => data.providers.openai.status,
    getLatency: (data) => undefined,
    getError: (data) => data.providers.openai.error,
  },
  {
    id: "stableDiffusion",
    name: "Stable Diffusion",
    description: "Image generation",
    icon: Image,
    getStatus: (data) => data.providers.stableDiffusion.status,
    getLatency: (data) => data.providers.stableDiffusion.endpoint?.latencyMs,
    getError: (data) => data.providers.stableDiffusion.endpoint?.error,
  },
  {
    id: "comfyui",
    name: "ComfyUI",
    description: "Workflow-based image generation",
    icon: Workflow,
    getStatus: (data) => data.providers.comfyui.status,
    getLatency: (data) => data.providers.comfyui.endpoint?.latencyMs,
    getError: (data) => data.providers.comfyui.endpoint?.error,
  },
];

const STATUS_CONFIG = {
  online: {
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
    icon: CheckCircle2,
    label: "Online",
    badgeVariant: "success" as const,
  },
  degraded: {
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/20",
    icon: AlertTriangle,
    label: "Degraded",
    badgeVariant: "warning" as const,
  },
  offline: {
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    icon: XCircle,
    label: "Offline",
    badgeVariant: "destructive" as const,
  },
  checking: {
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-muted",
    icon: Loader2,
    label: "Checking...",
    badgeVariant: "secondary" as const,
  },
};

const REFRESH_INTERVAL = 30;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000;
const REQUEST_TIMEOUT = 10000;

interface FeatureAvailability {
  name: string;
  available: boolean;
  icon: typeof MessageSquare;
  description: string;
}

function getFeatureAvailability(data: HealthResponse | null): FeatureAvailability[] {
  if (!data) {
    return [
      { name: "AI Chat", available: false, icon: MessageSquare, description: "Requires Ollama or OpenAI" },
      { name: "Image Generation", available: false, icon: Image, description: "Requires SD or ComfyUI" },
      { name: "Workflow Automation", available: false, icon: Workflow, description: "Requires ComfyUI" },
    ];
  }

  const ollamaOnline = data.providers.ollama.status === "online" || data.providers.ollama.status === "degraded";
  const openaiOnline = data.providers.openai.status === "online" || data.providers.openai.status === "degraded";
  const sdOnline = data.providers.stableDiffusion.status === "online" || data.providers.stableDiffusion.status === "degraded";
  const comfyOnline = data.providers.comfyui.status === "online" || data.providers.comfyui.status === "degraded";

  return [
    {
      name: "AI Chat",
      available: ollamaOnline || openaiOnline,
      icon: MessageSquare,
      description: ollamaOnline ? "Using local Ollama" : openaiOnline ? "Using OpenAI cloud" : "Requires Ollama or OpenAI",
    },
    {
      name: "Image Generation",
      available: sdOnline || comfyOnline,
      icon: Image,
      description: sdOnline ? "Using Stable Diffusion" : comfyOnline ? "Using ComfyUI" : "Requires SD or ComfyUI",
    },
    {
      name: "Workflow Automation",
      available: comfyOnline,
      icon: Workflow,
      description: comfyOnline ? "ComfyUI workflows available" : "Requires ComfyUI",
    },
  ];
}

function ServiceStatusSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function FeatureAvailabilitySection({ features }: { features: FeatureAvailability[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {features.map((feature) => {
        const Icon = feature.icon;
        return (
          <div
            key={feature.name}
            className={cn(
              "flex items-center gap-2 p-3 rounded-lg border transition-colors",
              feature.available
                ? "bg-green-500/5 border-green-500/20"
                : "bg-muted/30 border-muted"
            )}
          >
            <div
              className={cn(
                "p-1.5 rounded-md",
                feature.available ? "bg-green-500/10" : "bg-muted"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  feature.available ? "text-green-500" : "text-muted-foreground"
                )}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-medium truncate",
                  feature.available ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {feature.available ? `${feature.name} Ready` : feature.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {feature.description}
              </p>
            </div>
            {feature.available ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ServiceRowProps {
  service: ServiceInfo;
  data: HealthResponse | null;
  isLoading: boolean;
}

function ServiceRow({ service, data, isLoading }: ServiceRowProps) {
  const status = isLoading ? "checking" : data ? service.getStatus(data) : "offline";
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;
  const ServiceIcon = service.icon;
  const latency = data ? service.getLatency(data) : undefined;
  const error = data ? service.getError(data) : undefined;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all",
        config.bgColor,
        config.borderColor
      )}
    >
      <div className={cn("p-2 rounded-lg", config.bgColor)}>
        <ServiceIcon className={cn("h-5 w-5", config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{service.name}</p>
          {latency !== undefined && status !== "offline" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {latency}ms
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {error && status === "offline" ? error : service.description}
        </p>
      </div>
      <Badge variant={config.badgeVariant} className="flex items-center gap-1">
        <StatusIcon
          className={cn("h-3 w-3", status === "checking" && "animate-spin")}
        />
        {config.label}
      </Badge>
    </div>
  );
}

interface DebugPanelProps {
  data: HealthResponse | null;
  lastCheck: Date | null;
  retryCount: number;
  error: string | null;
}

function DebugPanel({ data, lastCheck, retryCount, error }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between">
          <span className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Debug Information
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4">
        <div className="rounded-lg bg-muted/50 p-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last Check</span>
            <span className="font-mono">
              {lastCheck ? lastCheck.toLocaleTimeString() : "Never"}
            </span>
          </div>
          {retryCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Retry Attempts</span>
              <span className="font-mono text-yellow-500">
                {retryCount} / {MAX_RETRIES}
              </span>
            </div>
          )}
          {error && (
            <div className="pt-2 border-t">
              <p className="text-muted-foreground mb-1">Last Error</p>
              <p className="font-mono text-xs text-red-500 bg-red-500/5 p-2 rounded">
                {error}
              </p>
            </div>
          )}
          {data && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Server Timestamp</span>
                <span className="font-mono text-xs">
                  {new Date(data.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {data.gpu?.available && data.gpu.stats && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">GPU VRAM</span>
                  <span className={cn(
                    "font-mono",
                    data.gpu.stats.memoryUsagePercent > 90 ? "text-red-500" :
                    data.gpu.stats.memoryUsagePercent > 70 ? "text-yellow-500" :
                    "text-green-500"
                  )}>
                    {data.gpu.stats.memoryUsed}MB / {data.gpu.stats.memoryTotal}MB
                    ({data.gpu.stats.memoryUsagePercent}%)
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Local AI Only</span>
                <span className="font-mono">
                  {data.localAIOnly ? "Yes" : "No"}
                </span>
              </div>
            </>
          )}

          {SERVICES.map((service) => {
            const latency = data ? service.getLatency(data) : undefined;
            const error = data ? service.getError(data) : undefined;
            return (
              <div key={service.id} className="pt-2 border-t first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{service.name} Latency</span>
                  <span className="font-mono">
                    {latency !== undefined ? `${latency}ms` : "N/A"}
                  </span>
                </div>
                {error && (
                  <p className="font-mono text-xs text-red-500 mt-1">{error}</p>
                )}
              </div>
            );
          })}
        </div>

        {data?.troubleshooting && data.troubleshooting.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Troubleshooting Steps
            </h4>
            {data.troubleshooting.map((item, idx) => (
              <div key={idx} className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium text-yellow-500 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {item.issue}
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-6">
                  {item.steps.map((step, stepIdx) => (
                    <li key={stepIdx}>{step}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AIServiceStatus() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchHealth = useCallback(async (isRetry = false, attempt = 0): Promise<boolean> => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/ai/health?refresh=true", {
        signal: abortControllerRef.current.signal,
        headers: { "Cache-Control": "no-cache" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
      setError(null);
      setRetryCount(0);
      setLastCheck(new Date());
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return false;
      }

      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      
      if (attempt < MAX_RETRIES && !isRetry) {
        setRetryCount(attempt + 1);
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return fetchHealth(true, attempt + 1);
      }

      setError(errorMessage);
      setRetryCount(attempt);
      return false;
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRetryCount(0);
    
    const timeoutId = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setError("Request timed out after 10 seconds. Please try again.");
      setIsRefreshing(false);
    }, REQUEST_TIMEOUT);

    const success = await fetchHealth();
    clearTimeout(timeoutId);
    
    setIsRefreshing(false);
    if (success) {
      setCountdown(REFRESH_INTERVAL);
    }
  }, [fetchHealth]);

  useEffect(() => {
    const initialLoad = async () => {
      setIsLoading(true);
      
      const timeoutId = setTimeout(() => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        setError("Initial load timed out after 10 seconds. Click 'Retry Connection' to try again.");
        setIsLoading(false);
      }, REQUEST_TIMEOUT);

      await fetchHealth();
      clearTimeout(timeoutId);
      setIsLoading(false);
    };

    initialLoad();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchHealth]);

  useEffect(() => {
    if (isLoading) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleRefresh();
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoading, handleRefresh]);

  const getOverallStatus = (): { status: ServiceStatus; message: string } => {
    if (isLoading) {
      return { status: "checking", message: "Checking service status..." };
    }
    if (error && !data) {
      return { status: "offline", message: "Unable to check services" };
    }
    if (!data) {
      return { status: "offline", message: "No data available" };
    }

    const statuses = SERVICES.map((s) => s.getStatus(data));
    const onlineCount = statuses.filter((s) => s === "online").length;
    const degradedCount = statuses.filter((s) => s === "degraded").length;
    const offlineCount = statuses.filter((s) => s === "offline").length;

    if (offlineCount === statuses.length) {
      return { status: "offline", message: "All services unavailable" };
    }
    if (onlineCount === statuses.length) {
      return { status: "online", message: "All Systems Operational" };
    }
    if (offlineCount > 0) {
      return { status: "degraded", message: "Some Services Unavailable" };
    }
    if (degradedCount > 0) {
      return { status: "degraded", message: "Some services running slowly" };
    }
    return { status: "online", message: "All Systems Operational" };
  };

  const overall = getOverallStatus();
  const overallConfig = STATUS_CONFIG[overall.status];
  const OverallIcon = overallConfig.icon;
  const features = getFeatureAvailability(data);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              AI Service Status
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <OverallIcon
                className={cn(
                  "h-4 w-4",
                  overallConfig.color,
                  overall.status === "checking" && "animate-spin"
                )}
              />
              <span className={overallConfig.color}>{overall.message}</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {isRefreshing ? (
                "Refreshing..."
              ) : (
                `${countdown}s`
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
            >
              <RefreshCw
                className={cn("h-4 w-4", (isRefreshing || isLoading) && "animate-spin")}
              />
              <span className="ml-2 hidden sm:inline">
                {isRefreshing ? "Refreshing..." : "Retry Connection"}
              </span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && !data && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-500">Connection Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              {retryCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Retry attempts: {retryCount} / {MAX_RETRIES}
                </p>
              )}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            Available Features
          </h3>
          <FeatureAvailabilitySection features={features} />
        </div>

        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            Service Status
          </h3>
          {isLoading ? (
            <ServiceStatusSkeleton />
          ) : (
            <div className="space-y-2">
              {SERVICES.map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  data={data}
                  isLoading={isRefreshing}
                />
              ))}
            </div>
          )}
        </div>

        {data?.recommendation && (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">{data.recommendation}</p>
          </div>
        )}

        <DebugPanel
          data={data}
          lastCheck={lastCheck}
          retryCount={retryCount}
          error={error}
        />
      </CardContent>
    </Card>
  );
}

export default AIServiceStatus;
