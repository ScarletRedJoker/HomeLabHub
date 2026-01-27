"use client";

import { useState, useEffect, createContext, useContext, ReactNode } from "react";

export interface ServiceAvailability {
  chat: boolean;
  imageGeneration: boolean;
  workflowAutomation: boolean;
  voiceSynthesis: boolean;
  codeDevelopment: boolean;
}

export interface ServiceHealthState {
  ollama: "online" | "offline" | "degraded" | "unknown";
  openai: "online" | "offline" | "degraded" | "unknown";
  stableDiffusion: "online" | "offline" | "degraded" | "unknown";
  comfyui: "online" | "offline" | "degraded" | "unknown";
}

export interface ServiceContextValue {
  health: ServiceHealthState;
  availability: ServiceAvailability;
  isLoading: boolean;
  error: string | null;
  lastCheck: Date | null;
  refresh: () => Promise<void>;
  isFeatureAvailable: (feature: keyof ServiceAvailability) => boolean;
}

const defaultHealth: ServiceHealthState = {
  ollama: "unknown",
  openai: "unknown",
  stableDiffusion: "unknown",
  comfyui: "unknown",
};

const defaultAvailability: ServiceAvailability = {
  chat: false,
  imageGeneration: false,
  workflowAutomation: false,
  voiceSynthesis: false,
  codeDevelopment: false,
};

const ServiceContext = createContext<ServiceContextValue | null>(null);

export function ServiceAvailabilityProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<ServiceHealthState>(defaultHealth);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const computeAvailability = (h: ServiceHealthState): ServiceAvailability => ({
    chat: (h.ollama === "online" || h.ollama === "degraded") || (h.openai === "online" || h.openai === "degraded"),
    imageGeneration: (h.stableDiffusion === "online" || h.stableDiffusion === "degraded") || (h.comfyui === "online" || h.comfyui === "degraded"),
    workflowAutomation: h.comfyui === "online" || h.comfyui === "degraded",
    voiceSynthesis: h.ollama === "online" || h.ollama === "degraded",
    codeDevelopment: (h.ollama === "online" || h.ollama === "degraded") || (h.openai === "online" || h.openai === "degraded"),
  });

  const refresh = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("/api/ai/health", {
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const data = await response.json();

      setHealth({
        ollama: data.providers?.ollama?.status || "unknown",
        openai: data.providers?.openai?.status || "unknown",
        stableDiffusion: data.providers?.stableDiffusion?.status || "unknown",
        comfyui: data.providers?.comfyui?.status || "unknown",
      });

      setLastCheck(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);

      setHealth({
        ollama: "unknown",
        openai: "unknown",
        stableDiffusion: "unknown",
        comfyui: "unknown",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();

    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, []);

  const isFeatureAvailable = (feature: keyof ServiceAvailability): boolean => {
    return computeAvailability(health)[feature];
  };

  const value: ServiceContextValue = {
    health,
    availability: computeAvailability(health),
    isLoading,
    error,
    lastCheck,
    refresh,
    isFeatureAvailable,
  };

  return (
    <ServiceContext.Provider value={value}>
      {children}
    </ServiceContext.Provider>
  );
}

export function useServiceAvailability(): ServiceContextValue {
  const context = useContext(ServiceContext);
  if (!context) {
    throw new Error("useServiceAvailability must be used within ServiceAvailabilityProvider");
  }
  return context;
}

export function useFeatureGate(feature: keyof ServiceAvailability): {
  available: boolean;
  loading: boolean;
  reason: string;
} {
  const { availability, isLoading, health } = useServiceAvailability();

  const getUnavailableReason = (f: keyof ServiceAvailability): string => {
    switch (f) {
      case "chat":
        return health.ollama === "offline" && health.openai === "offline"
          ? "No AI chat providers available. Start Ollama or configure OpenAI."
          : "";
      case "imageGeneration":
        return health.stableDiffusion === "offline" && health.comfyui === "offline"
          ? "No image generation services available. Start Stable Diffusion or ComfyUI."
          : "";
      case "workflowAutomation":
        return health.comfyui === "offline"
          ? "ComfyUI is required for workflow automation but is offline."
          : "";
      case "voiceSynthesis":
        return health.ollama === "offline"
          ? "Voice synthesis requires Ollama which is offline."
          : "";
      case "codeDevelopment":
        return health.ollama === "offline" && health.openai === "offline"
          ? "AI code development requires Ollama or OpenAI."
          : "";
      default:
        return "Unknown feature";
    }
  };

  return {
    available: availability[feature],
    loading: isLoading,
    reason: getUnavailableReason(feature),
  };
}
