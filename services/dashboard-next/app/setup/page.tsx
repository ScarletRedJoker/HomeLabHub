"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { SuccessCelebration } from "@/components/ui/success-celebration";
import { Separator } from "@/components/ui/separator";
import {
  Rocket,
  Server,
  Network,
  Cpu,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Key,
  Database,
  Brain,
  Link2,
  Cloud,
  Play,
  LayoutDashboard,
  ExternalLink,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Wifi,
  WifiOff,
  Shield,
  Settings,
  Music,
  Video,
  MessageSquare,
  Bot,
  Download,
  Globe,
  Terminal,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type SetupStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface EnvironmentData {
  platform: "linode" | "local" | "replit" | "unknown";
  services: {
    postgresql: { available: boolean; version?: string };
    redis: { available: boolean };
    ollama: { available: boolean; models?: string[] };
    comfyui: { available: boolean };
  };
  nodes: {
    windowsVm: { available: boolean; ip?: string };
    ubuntuHome: { available: boolean; ip?: string };
    linode: { available: boolean; ip?: string };
  };
  network: {
    tailscale: boolean;
    publicIp?: string;
    hostname?: string;
  };
  capabilities: string[];
}

interface SecretConfig {
  key: string;
  name: string;
  description: string;
  category: "discord" | "twitch" | "youtube" | "spotify" | "ai" | "database" | "other";
  required: boolean;
  configured: boolean;
  link?: string;
}

interface DatabaseStatus {
  connected: boolean;
  version?: string;
  tables?: number;
  pendingMigrations?: number;
  lastMigration?: string;
}

interface AIServiceStatus {
  ollama: {
    available: boolean;
    endpoint?: string;
    models: string[];
  };
  comfyui: {
    available: boolean;
    endpoint?: string;
  };
  openai: {
    configured: boolean;
  };
}

interface PlatformConnection {
  name: string;
  icon: React.ElementType;
  connected: boolean;
  username?: string;
  error?: string;
}

interface DeploymentTarget {
  slug: string;
  name: string;
  type: "linux" | "windows";
  host?: string;
  status: "online" | "offline" | "unknown";
  lastChecked?: string;
}

const STEPS = [
  { title: "Welcome", description: "Get started with Nebula Command", icon: Rocket },
  { title: "Environment", description: "Detect your environment", icon: Server },
  { title: "Secrets", description: "Configure API keys", icon: Key },
  { title: "Database", description: "PostgreSQL setup", icon: Database },
  { title: "AI Services", description: "Configure AI endpoints", icon: Brain },
  { title: "Platforms", description: "Connect integrations", icon: Link2 },
  { title: "Deployment", description: "Configure servers", icon: Cloud },
  { title: "Complete", description: "Ready to go!", icon: Sparkles },
];

const DEFAULT_SECRETS: SecretConfig[] = [
  {
    key: "DISCORD_TOKEN",
    name: "Discord Bot Token",
    description: "Token for your Discord bot",
    category: "discord",
    required: true,
    configured: false,
    link: "https://discord.com/developers/applications",
  },
  {
    key: "DISCORD_CLIENT_ID",
    name: "Discord Client ID",
    description: "OAuth2 client ID for Discord",
    category: "discord",
    required: true,
    configured: false,
    link: "https://discord.com/developers/applications",
  },
  {
    key: "TWITCH_CLIENT_ID",
    name: "Twitch Client ID",
    description: "Client ID for Twitch API",
    category: "twitch",
    required: false,
    configured: false,
    link: "https://dev.twitch.tv/console/apps",
  },
  {
    key: "TWITCH_CLIENT_SECRET",
    name: "Twitch Client Secret",
    description: "Client secret for Twitch API",
    category: "twitch",
    required: false,
    configured: false,
    link: "https://dev.twitch.tv/console/apps",
  },
  {
    key: "YOUTUBE_API_KEY",
    name: "YouTube API Key",
    description: "API key for YouTube Data API",
    category: "youtube",
    required: false,
    configured: false,
    link: "https://console.cloud.google.com/apis/credentials",
  },
  {
    key: "SPOTIFY_CLIENT_ID",
    name: "Spotify Client ID",
    description: "Client ID for Spotify API",
    category: "spotify",
    required: false,
    configured: false,
    link: "https://developer.spotify.com/dashboard",
  },
  {
    key: "SPOTIFY_CLIENT_SECRET",
    name: "Spotify Client Secret",
    description: "Client secret for Spotify API",
    category: "spotify",
    required: false,
    configured: false,
    link: "https://developer.spotify.com/dashboard",
  },
  {
    key: "OPENAI_API_KEY",
    name: "OpenAI API Key",
    description: "API key for OpenAI services",
    category: "ai",
    required: false,
    configured: false,
    link: "https://platform.openai.com/api-keys",
  },
];

export default function SetupWizardPage() {
  const [currentStep, setCurrentStep] = useState<SetupStep>(0);
  const [loading, setLoading] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);

  const [environment, setEnvironment] = useState<EnvironmentData | null>(null);
  const [secrets, setSecrets] = useState<SecretConfig[]>(DEFAULT_SECRETS);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [showSecretValues, setShowSecretValues] = useState<Record<string, boolean>>({});
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(null);
  const [aiStatus, setAiStatus] = useState<AIServiceStatus | null>(null);
  const [platforms, setPlatforms] = useState<PlatformConnection[]>([]);
  const [deploymentTargets, setDeploymentTargets] = useState<DeploymentTarget[]>([]);
  const [ollamaEndpoint, setOllamaEndpoint] = useState("");
  const [serverConfigs, setServerConfigs] = useState<Record<string, { host: string; user: string }>>({});

  const [detectingEnv, setDetectingEnv] = useState(false);
  const [savingSecrets, setSavingSecrets] = useState(false);
  const [testingDb, setTestingDb] = useState(false);
  const [runningMigrations, setRunningMigrations] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);
  const [testingTarget, setTestingTarget] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);

  const [stepValidation, setStepValidation] = useState<Record<number, { valid: boolean; errors: string[]; warnings: string[] }>>({});
  const [validating, setValidating] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  useEffect(() => {
    detectEnvironment();
  }, []);

  const detectEnvironment = async () => {
    setDetectingEnv(true);
    try {
      const res = await fetch("/api/setup/detect");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.environment) {
          setEnvironment(data.environment);
          if (data.environment.nodes.windowsVm?.ip) {
            setOllamaEndpoint(`http://${data.environment.nodes.windowsVm.ip}:11434`);
          }
        }
      }
    } catch (error) {
      console.error("Failed to detect environment:", error);
    } finally {
      setDetectingEnv(false);
      setLoading(false);
    }
  };

  const checkSecretStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/setup/step/secrets");
      if (res.ok) {
        const data = await res.json();
        if (data.secrets) {
          setSecrets(prev => prev.map(s => ({
            ...s,
            configured: data.secrets.includes(s.key),
          })));
        }
      }
    } catch (error) {
      console.error("Failed to check secret status:", error);
    }
  }, []);

  const saveSecret = async (key: string, value: string) => {
    setSavingSecrets(true);
    try {
      const res = await fetch("/api/setup/step/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        setSecrets(prev => prev.map(s => 
          s.key === key ? { ...s, configured: true } : s
        ));
        setSecretValues(prev => ({ ...prev, [key]: "" }));
        toast.success(`${key} saved successfully`);
      } else {
        toast.error("Failed to save secret");
      }
    } catch (error) {
      toast.error("Failed to save secret");
    } finally {
      setSavingSecrets(false);
    }
  };

  const checkDatabaseStatus = async () => {
    setTestingDb(true);
    try {
      const res = await fetch("/api/setup/step/database");
      if (res.ok) {
        const data = await res.json();
        setDatabaseStatus(data);
      }
    } catch (error) {
      setDatabaseStatus({ connected: false });
      toast.error("Database connection failed");
    } finally {
      setTestingDb(false);
    }
  };

  const runMigrations = async () => {
    setRunningMigrations(true);
    try {
      const res = await fetch("/api/setup/step/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "migrate" }),
      });
      if (res.ok) {
        await checkDatabaseStatus();
        toast.success("Migrations completed");
      } else {
        toast.error("Migration failed");
      }
    } catch (error) {
      toast.error("Migration failed");
    } finally {
      setRunningMigrations(false);
    }
  };

  const checkAIServices = async () => {
    setTestingAi(true);
    try {
      const res = await fetch("/api/setup/step/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ollamaEndpoint }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiStatus(data);
      }
    } catch (error) {
      setAiStatus({
        ollama: { available: false, models: [] },
        comfyui: { available: false },
        openai: { configured: false },
      });
    } finally {
      setTestingAi(false);
    }
  };

  const checkPlatformConnections = async () => {
    try {
      const res = await fetch("/api/setup/step/platforms");
      if (res.ok) {
        const data = await res.json();
        setPlatforms(data.platforms || []);
      }
    } catch (error) {
      console.error("Failed to check platform connections:", error);
    }
  };

  const testPlatformConnection = async (platform: string) => {
    setTestingPlatform(platform);
    try {
      const res = await fetch("/api/setup/step/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", platform }),
      });
      if (res.ok) {
        const data = await res.json();
        setPlatforms(prev => prev.map(p => 
          p.name === platform ? { ...p, ...data.result } : p
        ));
        if (data.result?.connected) {
          toast.success(`${platform} connected successfully`);
        }
      }
    } catch (error) {
      toast.error(`Failed to test ${platform}`);
    } finally {
      setTestingPlatform(null);
    }
  };

  const checkDeploymentTargets = async () => {
    try {
      const res = await fetch("/api/setup/step/deployment");
      if (res.ok) {
        const data = await res.json();
        setDeploymentTargets(data.targets || []);
      }
    } catch (error) {
      console.error("Failed to check deployment targets:", error);
    }
  };

  const testDeploymentTarget = async (slug: string) => {
    setTestingTarget(slug);
    try {
      const config = serverConfigs[slug] || {};
      const res = await fetch("/api/setup/step/deployment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", target: slug, ...config }),
      });
      if (res.ok) {
        const data = await res.json();
        setDeploymentTargets(prev => prev.map(t => 
          t.slug === slug ? { ...t, status: data.status, lastChecked: new Date().toISOString() } : t
        ));
        toast.success(data.status === "online" ? "Connection successful" : "Connection failed");
      }
    } catch (error) {
      toast.error("Connection test failed");
    } finally {
      setTestingTarget(null);
    }
  };

  const saveStepProgress = async (stepNumber: number, data?: Record<string, unknown>, completed = false) => {
    try {
      await fetch("/api/setup/step/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepNumber, data, completed }),
      });
    } catch (error) {
      console.error("Failed to save step progress:", error);
    }
  };

  const validateSecretsStep = (): { valid: boolean; errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const requiredSecrets = secrets.filter(s => s.required && !s.configured);
    if (requiredSecrets.length > 0) {
      errors.push(`Missing required secrets: ${requiredSecrets.map(s => s.name).join(", ")}`);
    }
    
    return { valid: errors.length === 0, errors, warnings };
  };

  const validateDatabaseStep = (): { valid: boolean; errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!databaseStatus?.connected) {
      errors.push("Database connection required. Please configure DATABASE_URL.");
    }
    
    return { valid: errors.length === 0, errors, warnings };
  };

  const validateAIStep = (): { valid: boolean; errors: string[]; warnings: string[] } => {
    const warnings: string[] = [];
    
    if (!aiStatus?.ollama.available && !aiStatus?.openai.configured) {
      warnings.push("No AI services available. Some features will be limited.");
    } else if (!aiStatus?.ollama.available) {
      warnings.push("Ollama not reachable. Local AI features will be unavailable.");
    }
    
    return { valid: true, errors: [], warnings };
  };

  const validatePlatformsStep = (): { valid: boolean; errors: string[]; warnings: string[] } => {
    const warnings: string[] = [];
    
    const unconfigured = secrets.filter(s => !s.configured).length;
    if (unconfigured > 0) {
      warnings.push(`${unconfigured} platforms not configured. You can add them later.`);
    }
    
    return { valid: true, errors: [], warnings };
  };

  const validateStep = (step: number): { valid: boolean; errors: string[]; warnings: string[] } => {
    switch (step) {
      case 2:
        return validateSecretsStep();
      case 3:
        return validateDatabaseStep();
      case 4:
        return validateAIStep();
      case 5:
        return validatePlatformsStep();
      default:
        return { valid: true, errors: [], warnings: [] };
    }
  };

  const completeSetup = async () => {
    setDeploying(true);
    setCompleteError(null);
    
    try {
      const res = await fetch("/api/setup/validate");
      if (res.ok) {
        const validation = await res.json();
        if (!validation.canComplete) {
          const allErrors = validation.steps
            .filter((s: { valid: boolean }) => !s.valid)
            .flatMap((s: { errors: string[] }) => s.errors);
          setCompleteError(`Cannot complete setup: ${allErrors.join(", ")}`);
          toast.error("Setup validation failed");
          setDeploying(false);
          return;
        }
      }

      const completeRes = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment: environment?.platform,
          ollamaEndpoint,
          serverConfigs,
        }),
      });
      
      if (completeRes.ok) {
        const data = await completeRes.json();
        if (data.success) {
          setShowCelebration(true);
          setTimeout(() => setCurrentStep(7), 500);
        } else {
          setCompleteError(data.error || "Setup completion failed");
          toast.error(data.error || "Setup completion failed");
        }
      } else {
        const errorData = await completeRes.json().catch(() => ({}));
        setCompleteError(errorData.error || "Setup completion failed");
        toast.error(errorData.error || "Setup completion failed");
      }
    } catch (error) {
      setCompleteError("Setup completion failed - network error");
      toast.error("Setup completion failed");
    } finally {
      setDeploying(false);
    }
  };

  const goNext = async () => {
    const validation = validateStep(currentStep);
    setStepValidation(prev => ({ ...prev, [currentStep]: validation }));

    if (currentStep === 2 && !validation.valid) {
      toast.error("Please configure required secrets before continuing");
      return;
    }

    if (currentStep === 3 && !validation.valid) {
      toast.error("Database connection is required. Please verify your DATABASE_URL.");
      return;
    }

    if (validation.warnings.length > 0) {
      validation.warnings.forEach(warning => toast.warning(warning));
    }

    await saveStepProgress(currentStep, {}, validation.valid);

    const nextStep = Math.min(currentStep + 1, 7) as SetupStep;
    setCurrentStep(nextStep);
    
    if (nextStep === 2) checkSecretStatus();
    if (nextStep === 3) checkDatabaseStatus();
    if (nextStep === 4) checkAIServices();
    if (nextStep === 5) checkPlatformConnections();
    if (nextStep === 6) checkDeploymentTargets();
  };

  const goBack = () => {
    setCompleteError(null);
    setCurrentStep(prev => Math.max(prev - 1, 0) as SetupStep);
  };

  const canProceedFromStep = (step: number): boolean => {
    if (step === 2) {
      const requiredSecrets = secrets.filter(s => s.required && !s.configured);
      return requiredSecrets.length === 0;
    }
    if (step === 3) {
      return databaseStatus?.connected ?? false;
    }
    return true;
  };

  const getPlatformIcon = (name: string) => {
    const icons: Record<string, React.ElementType> = {
      Discord: MessageSquare,
      Twitch: Video,
      YouTube: Video,
      Spotify: Music,
      Kick: Video,
    };
    return icons[name] || Link2;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Initializing Nebula Command...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <SuccessCelebration
        show={showCelebration}
        title="Nebula Command is Ready!"
        message="Your homelab command center is configured"
        onComplete={() => setShowCelebration(false)}
      />

      <div className="max-w-4xl mx-auto px-4 py-8">
        {currentStep > 0 && currentStep < 7 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                Step {currentStep} of 6
              </span>
              <span className="text-sm font-medium">
                {STEPS[currentStep].title}
              </span>
            </div>
            <Progress value={(currentStep / 6) * 100} className="h-2" />

            <div className="flex justify-between mt-4 overflow-x-auto gap-2 pb-2">
              {STEPS.slice(1, 7).map((step, idx) => {
                const Icon = step.icon;
                const stepNumber = idx + 1;
                const isActive = currentStep === stepNumber;
                const isCompleted = currentStep > stepNumber;

                return (
                  <div
                    key={idx}
                    className="flex flex-col items-center flex-shrink-0 min-w-[60px]"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                        isCompleted
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : isActive
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={`text-xs mt-1 text-center ${
                        isActive ? "text-primary font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {currentStep === 0 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5 overflow-hidden">
                <CardHeader className="text-center pb-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring" }}
                    className="mx-auto mb-6"
                  >
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-2xl shadow-primary/30">
                      <Rocket className="h-12 w-12 text-white" />
                    </div>
                  </motion.div>
                  <CardTitle className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Welcome to Nebula Command
                  </CardTitle>
                  <CardDescription className="text-lg mt-3 max-w-lg mx-auto">
                    Your homelab command center for AI, streaming, and automation.
                    Let's get you set up in just a few minutes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { icon: Brain, label: "Local AI", desc: "Ollama & ComfyUI" },
                      { icon: MessageSquare, label: "Discord Bot", desc: "Community tools" },
                      { icon: Video, label: "Stream Bot", desc: "Multi-platform" },
                      { icon: Cloud, label: "Multi-Deploy", desc: "Cloud & home" },
                    ].map((feature, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + idx * 0.1 }}
                        className="bg-muted/30 rounded-xl p-4 text-center border border-border/50"
                      >
                        <feature.icon className="h-8 w-8 mx-auto mb-2 text-primary" />
                        <p className="font-medium">{feature.label}</p>
                        <p className="text-xs text-muted-foreground">{feature.desc}</p>
                      </motion.div>
                    ))}
                  </div>

                  <div className="flex flex-col items-center gap-4 pt-4">
                    <Button
                      size="lg"
                      onClick={() => setCurrentStep(1)}
                      className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 text-lg px-10 py-6 shadow-lg shadow-primary/25"
                    >
                      <Sparkles className="h-5 w-5 mr-2" />
                      Start Setup
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Takes about 5 minutes • Skip steps you don't need
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 1 && (
            <motion.div
              key="environment"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-6 w-6 text-primary" />
                    Environment Detection
                  </CardTitle>
                  <CardDescription>
                    We've detected your environment and available services
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Globe className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Platform</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {environment?.platform || "Detecting..."}
                        </p>
                      </div>
                    </div>
                    <Badge variant={environment?.platform === "replit" ? "default" : "secondary"}>
                      {environment?.platform === "replit" ? "Cloud" : 
                       environment?.platform === "linode" ? "VPS" : 
                       environment?.platform === "local" ? "Home" : "Unknown"}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-3">Detected Services</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { name: "PostgreSQL", available: environment?.services.postgresql.available, icon: Database },
                        { name: "Redis", available: environment?.services.redis.available, icon: Server },
                        { name: "Ollama", available: environment?.services.ollama.available, icon: Brain },
                        { name: "ComfyUI", available: environment?.services.comfyui.available, icon: Sparkles },
                      ].map((service) => (
                        <div
                          key={service.name}
                          className={`flex items-center gap-3 p-3 rounded-lg border ${
                            service.available 
                              ? "bg-green-500/10 border-green-500/30" 
                              : "bg-muted/30 border-border"
                          }`}
                        >
                          <service.icon className={`h-5 w-5 ${service.available ? "text-green-400" : "text-muted-foreground"}`} />
                          <span className={service.available ? "text-green-400" : "text-muted-foreground"}>
                            {service.name}
                          </span>
                          {service.available ? (
                            <CheckCircle2 className="h-4 w-4 text-green-400 ml-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground ml-auto" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-3">Network Nodes</h3>
                    <div className="space-y-2">
                      {[
                        { name: "Windows VM (GPU)", available: environment?.nodes.windowsVm.available, ip: environment?.nodes.windowsVm.ip },
                        { name: "Ubuntu Home", available: environment?.nodes.ubuntuHome.available, ip: environment?.nodes.ubuntuHome.ip },
                        { name: "Linode Cloud", available: environment?.nodes.linode.available, ip: environment?.nodes.linode.ip },
                      ].map((node) => (
                        <div
                          key={node.name}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            node.available ? "border-primary/30 bg-primary/5" : "border-border"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {node.available ? (
                              <Wifi className="h-5 w-5 text-green-400" />
                            ) : (
                              <WifiOff className="h-5 w-5 text-muted-foreground" />
                            )}
                            <span>{node.name}</span>
                          </div>
                          {node.ip && (
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {node.ip}
                            </code>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {environment?.network.tailscale && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                      <Shield className="h-5 w-5 text-blue-400" />
                      <span className="text-blue-400">Tailscale mesh network detected</span>
                    </div>
                  )}

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={goBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={detectEnvironment} disabled={detectingEnv}>
                        {detectingEnv ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button onClick={goNext}>
                        Continue
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="secrets"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-6 w-6 text-primary" />
                    Essential Secrets
                  </CardTitle>
                  <CardDescription>
                    Configure API keys and tokens for your services
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {secrets.filter(s => s.configured).length} of {secrets.length} configured
                    </span>
                    <span className="text-muted-foreground">
                      {secrets.filter(s => s.required && !s.configured).length} required remaining
                    </span>
                  </div>

                  <Progress 
                    value={(secrets.filter(s => s.configured).length / secrets.length) * 100} 
                    className="h-2"
                  />

                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {["discord", "twitch", "youtube", "spotify", "ai"].map((category) => {
                      const categorySecrets = secrets.filter(s => s.category === category);
                      if (categorySecrets.length === 0) return null;

                      return (
                        <div key={category}>
                          <h3 className="text-sm font-medium capitalize mb-2 flex items-center gap-2">
                            {category === "discord" && <MessageSquare className="h-4 w-4" />}
                            {category === "twitch" && <Video className="h-4 w-4" />}
                            {category === "youtube" && <Video className="h-4 w-4" />}
                            {category === "spotify" && <Music className="h-4 w-4" />}
                            {category === "ai" && <Brain className="h-4 w-4" />}
                            {category}
                          </h3>
                          <div className="space-y-2">
                            {categorySecrets.map((secret) => (
                              <div
                                key={secret.key}
                                className={`p-3 rounded-lg border ${
                                  secret.configured 
                                    ? "bg-green-500/5 border-green-500/30" 
                                    : secret.required 
                                    ? "bg-amber-500/5 border-amber-500/30" 
                                    : "border-border"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    {secret.configured ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                                    ) : secret.required ? (
                                      <AlertCircle className="h-4 w-4 text-amber-400" />
                                    ) : (
                                      <div className="w-4 h-4 rounded-full border-2 border-muted" />
                                    )}
                                    <span className="font-medium text-sm">{secret.name}</span>
                                    {secret.required && !secret.configured && (
                                      <Badge variant="outline" className="text-xs text-amber-400 border-amber-400">
                                        Required
                                      </Badge>
                                    )}
                                  </div>
                                  {secret.link && (
                                    <a
                                      href={secret.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-primary hover:underline flex items-center gap-1"
                                    >
                                      Get Key <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">{secret.description}</p>
                                {!secret.configured && (
                                  <div className="flex gap-2">
                                    <div className="relative flex-1">
                                      <Input
                                        type={showSecretValues[secret.key] ? "text" : "password"}
                                        placeholder={`Enter ${secret.key}`}
                                        value={secretValues[secret.key] || ""}
                                        onChange={(e) => setSecretValues(prev => ({ ...prev, [secret.key]: e.target.value }))}
                                        className="pr-10 font-mono text-xs"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setShowSecretValues(prev => ({ ...prev, [secret.key]: !prev[secret.key] }))}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                      >
                                        {showSecretValues[secret.key] ? (
                                          <EyeOff className="h-4 w-4" />
                                        ) : (
                                          <Eye className="h-4 w-4" />
                                        )}
                                      </button>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => saveSecret(secret.key, secretValues[secret.key] || "")}
                                      disabled={!secretValues[secret.key] || savingSecrets}
                                    >
                                      {savingSecrets ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        "Save"
                                      )}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {secrets.filter(s => s.required && !s.configured).length > 0 && (
                    <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5" />
                        <div>
                          <p className="font-medium text-amber-400">Required secrets missing</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Configure {secrets.filter(s => s.required && !s.configured).map(s => s.name).join(", ")} to continue.
                            These are required for core functionality.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={goBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button 
                      onClick={goNext}
                      disabled={secrets.filter(s => s.required && !s.configured).length > 0}
                      className={secrets.filter(s => s.required && !s.configured).length > 0 ? "opacity-50 cursor-not-allowed" : ""}
                    >
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div
              key="database"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-6 w-6 text-primary" />
                    Database Setup
                  </CardTitle>
                  <CardDescription>
                    Configure and verify your PostgreSQL database connection
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className={`p-6 rounded-xl border-2 ${
                    databaseStatus?.connected 
                      ? "bg-green-500/10 border-green-500/30" 
                      : "bg-muted/30 border-border"
                  }`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                        databaseStatus?.connected ? "bg-green-500/20" : "bg-muted"
                      }`}>
                        <Database className={`h-8 w-8 ${
                          databaseStatus?.connected ? "text-green-400" : "text-muted-foreground"
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold">PostgreSQL</h3>
                          {databaseStatus?.connected ? (
                            <Badge className="bg-green-500/20 text-green-400">Connected</Badge>
                          ) : (
                            <Badge variant="secondary">Not Connected</Badge>
                          )}
                        </div>
                        {databaseStatus?.version && (
                          <p className="text-sm text-muted-foreground">Version: {databaseStatus.version}</p>
                        )}
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={checkDatabaseStatus}
                        disabled={testingDb}
                      >
                        {testingDb ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Test
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {databaseStatus?.connected && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-muted/30 border">
                        <p className="text-sm text-muted-foreground">Tables</p>
                        <p className="text-2xl font-bold">{databaseStatus.tables || 0}</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/30 border">
                        <p className="text-sm text-muted-foreground">Pending Migrations</p>
                        <p className="text-2xl font-bold">{databaseStatus.pendingMigrations || 0}</p>
                      </div>
                    </div>
                  )}

                  {databaseStatus?.connected && (databaseStatus.pendingMigrations || 0) > 0 && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-400" />
                        <span>There are pending migrations to run</span>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={runMigrations}
                        disabled={runningMigrations}
                      >
                        {runningMigrations ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Run Migrations
                      </Button>
                    </div>
                  )}

                  {!databaseStatus?.connected && (
                    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                      <div className="flex items-start gap-3">
                        <XCircle className="h-5 w-5 text-red-400 mt-0.5" />
                        <div>
                          <p className="font-medium text-red-400">Database connection required</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            DATABASE_URL must be configured and the connection verified before continuing.
                            Nebula Command requires PostgreSQL for data persistence.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={goBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button 
                      onClick={goNext}
                      disabled={!databaseStatus?.connected}
                      className={!databaseStatus?.connected ? "opacity-50 cursor-not-allowed" : ""}
                    >
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 4 && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-6 w-6 text-primary" />
                    AI Services Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure local AI endpoints for Ollama and ComfyUI
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="ollamaEndpoint">Ollama Endpoint</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          id="ollamaEndpoint"
                          value={ollamaEndpoint}
                          onChange={(e) => setOllamaEndpoint(e.target.value)}
                          placeholder="http://192.168.x.x:11434"
                          className="font-mono"
                        />
                        <Button 
                          variant="outline" 
                          onClick={checkAIServices}
                          disabled={testingAi}
                        >
                          {testingAi ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Test
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Usually your Windows VM IP with port 11434
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className={`p-4 rounded-lg border ${
                      aiStatus?.ollama.available 
                        ? "bg-green-500/10 border-green-500/30" 
                        : "border-border"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Bot className={`h-6 w-6 ${aiStatus?.ollama.available ? "text-green-400" : "text-muted-foreground"}`} />
                          <div>
                            <p className="font-medium">Ollama</p>
                            <p className="text-xs text-muted-foreground">Local LLM inference</p>
                          </div>
                        </div>
                        {aiStatus?.ollama.available ? (
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                        ) : (
                          <XCircle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      {aiStatus?.ollama.available && aiStatus.ollama.models.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs text-muted-foreground mb-2">Available Models:</p>
                          <div className="flex flex-wrap gap-1">
                            {aiStatus.ollama.models.slice(0, 8).map((model) => (
                              <Badge key={model} variant="secondary" className="text-xs">
                                {model}
                              </Badge>
                            ))}
                            {aiStatus.ollama.models.length > 8 && (
                              <Badge variant="outline" className="text-xs">
                                +{aiStatus.ollama.models.length - 8} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={`p-4 rounded-lg border ${
                      aiStatus?.comfyui.available 
                        ? "bg-green-500/10 border-green-500/30" 
                        : "border-border"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Sparkles className={`h-6 w-6 ${aiStatus?.comfyui.available ? "text-green-400" : "text-muted-foreground"}`} />
                          <div>
                            <p className="font-medium">ComfyUI</p>
                            <p className="text-xs text-muted-foreground">Stable Diffusion workflows</p>
                          </div>
                        </div>
                        {aiStatus?.comfyui.available ? (
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                        ) : (
                          <XCircle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    <div className={`p-4 rounded-lg border ${
                      aiStatus?.openai.configured 
                        ? "bg-green-500/10 border-green-500/30" 
                        : "border-border"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Brain className={`h-6 w-6 ${aiStatus?.openai.configured ? "text-green-400" : "text-muted-foreground"}`} />
                          <div>
                            <p className="font-medium">OpenAI API</p>
                            <p className="text-xs text-muted-foreground">Cloud AI fallback</p>
                          </div>
                        </div>
                        {aiStatus?.openai.configured ? (
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Not configured</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {aiStatus?.ollama.available && aiStatus.ollama.models.length === 0 && (
                    <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                      <div className="flex items-start gap-3">
                        <Download className="h-5 w-5 text-blue-400 mt-0.5" />
                        <div>
                          <p className="font-medium text-blue-400">No models installed</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            We recommend installing <code className="text-xs bg-muted px-1 rounded">llama3.2</code> or{" "}
                            <code className="text-xs bg-muted px-1 rounded">mistral</code> for best results.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={goBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button onClick={goNext}>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 5 && (
            <motion.div
              key="platforms"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="h-6 w-6 text-primary" />
                    Platform Connections
                  </CardTitle>
                  <CardDescription>
                    Connect your streaming and social platforms
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    {[
                      { name: "Discord", icon: MessageSquare, connected: secrets.find(s => s.key === "DISCORD_TOKEN")?.configured },
                      { name: "Twitch", icon: Video, connected: secrets.find(s => s.key === "TWITCH_CLIENT_ID")?.configured },
                      { name: "YouTube", icon: Video, connected: secrets.find(s => s.key === "YOUTUBE_API_KEY")?.configured },
                      { name: "Spotify", icon: Music, connected: secrets.find(s => s.key === "SPOTIFY_CLIENT_ID")?.configured },
                    ].map((platform) => {
                      const Icon = platform.icon;
                      return (
                        <div
                          key={platform.name}
                          className={`flex items-center justify-between p-4 rounded-lg border ${
                            platform.connected 
                              ? "bg-green-500/10 border-green-500/30" 
                              : "border-border"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              platform.connected ? "bg-green-500/20" : "bg-muted"
                            }`}>
                              <Icon className={`h-5 w-5 ${platform.connected ? "text-green-400" : "text-muted-foreground"}`} />
                            </div>
                            <div>
                              <p className="font-medium">{platform.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {platform.connected ? "API keys configured" : "Not configured"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {platform.connected ? (
                              <Badge className="bg-green-500/20 text-green-400">Connected</Badge>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentStep(2)}
                              >
                                Configure
                              </Button>
                            )}
                            {platform.connected && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => testPlatformConnection(platform.name)}
                                disabled={testingPlatform === platform.name}
                              >
                                {testingPlatform === platform.name ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-4 rounded-lg bg-muted/30 border">
                    <div className="flex items-start gap-3">
                      <Settings className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium">Additional Platforms</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          More platforms like Kick, TikTok, and others can be configured in the Settings page after setup.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={goBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button onClick={goNext}>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 6 && (
            <motion.div
              key="deployment"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cloud className="h-6 w-6 text-primary" />
                    Deployment Targets
                  </CardTitle>
                  <CardDescription>
                    Configure your deployment servers
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    {[
                      { slug: "linode", name: "Linode Cloud", type: "linux" as const, envVar: "LINODE_SSH_HOST" },
                      { slug: "ubuntu-home", name: "Ubuntu Home Server", type: "linux" as const, envVar: "HOME_SSH_HOST" },
                      { slug: "windows-vm", name: "Windows VM (GPU)", type: "windows" as const, envVar: "WINDOWS_VM_TAILSCALE_IP" },
                    ].map((target) => {
                      const isConfigured = target.slug === "windows-vm" 
                        ? !!environment?.nodes.windowsVm.ip
                        : target.slug === "ubuntu-home"
                        ? !!environment?.nodes.ubuntuHome.ip
                        : !!environment?.nodes.linode.ip;

                      return (
                        <div
                          key={target.slug}
                          className={`p-4 rounded-lg border ${
                            isConfigured ? "border-primary/30" : "border-border"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                isConfigured ? "bg-primary/20" : "bg-muted"
                              }`}>
                                {target.type === "windows" ? (
                                  <Terminal className={`h-5 w-5 ${isConfigured ? "text-primary" : "text-muted-foreground"}`} />
                                ) : (
                                  <Server className={`h-5 w-5 ${isConfigured ? "text-primary" : "text-muted-foreground"}`} />
                                )}
                              </div>
                              <div>
                                <p className="font-medium">{target.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {target.type === "windows" ? "Agent connection" : "SSH connection"}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => testDeploymentTarget(target.slug)}
                              disabled={testingTarget === target.slug}
                            >
                              {testingTarget === target.slug ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Test
                                </>
                              )}
                            </Button>
                          </div>

                          {target.type === "linux" && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs">Host</Label>
                                <Input
                                  placeholder="192.168.1.x or hostname"
                                  value={serverConfigs[target.slug]?.host || ""}
                                  onChange={(e) => setServerConfigs(prev => ({
                                    ...prev,
                                    [target.slug]: { ...prev[target.slug], host: e.target.value, user: prev[target.slug]?.user || "root" }
                                  }))}
                                  className="mt-1 font-mono text-sm"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">User</Label>
                                <Input
                                  placeholder="root"
                                  value={serverConfigs[target.slug]?.user || ""}
                                  onChange={(e) => setServerConfigs(prev => ({
                                    ...prev,
                                    [target.slug]: { ...prev[target.slug], user: e.target.value, host: prev[target.slug]?.host || "" }
                                  }))}
                                  className="mt-1 font-mono text-sm"
                                />
                              </div>
                            </div>
                          )}

                          {target.type === "windows" && (
                            <div className="flex items-center gap-2 text-sm">
                              {environment?.nodes.windowsVm.available ? (
                                <>
                                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                                  <span className="text-green-400">Connected via Tailscale</span>
                                  <code className="text-xs bg-muted px-2 py-1 rounded ml-2">
                                    {environment.nodes.windowsVm.ip}
                                  </code>
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-muted-foreground">Not connected</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <Separator />

                  {completeError && (
                    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                      <div className="flex items-start gap-3">
                        <XCircle className="h-5 w-5 text-red-400 mt-0.5" />
                        <div>
                          <p className="font-medium text-red-400">Setup cannot be completed</p>
                          <p className="text-sm text-muted-foreground mt-1">{completeError}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h3 className="font-medium">Quick Start Actions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col gap-2"
                        onClick={completeSetup}
                        disabled={deploying}
                      >
                        {deploying ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          <Rocket className="h-6 w-6" />
                        )}
                        <span>Complete Setup</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col gap-2"
                        onClick={() => window.open("/deploy", "_blank")}
                      >
                        <Cloud className="h-6 w-6" />
                        <span>Deploy Center</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col gap-2"
                        onClick={() => window.open("/", "_blank")}
                      >
                        <LayoutDashboard className="h-6 w-6" />
                        <span>Dashboard</span>
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={goBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button 
                      onClick={completeSetup}
                      disabled={deploying}
                      className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                    >
                      {deploying ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4 mr-2" />
                      )}
                      Complete Setup
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 7 && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Card className="border-green-500/20 bg-gradient-to-br from-card to-green-500/5 overflow-hidden">
                <CardContent className="py-12 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.2 }}
                    className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mb-6"
                  >
                    <CheckCircle2 className="h-12 w-12 text-green-400" />
                  </motion.div>

                  <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                    Nebula Command is Ready!
                  </h2>
                  <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                    Your homelab command center is configured and ready to use.
                    Start managing your infrastructure, AI services, and more.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-blue-500 to-purple-500"
                      onClick={() => window.location.href = "/"}
                    >
                      <LayoutDashboard className="h-5 w-5 mr-2" />
                      Go to Dashboard
                    </Button>
                    <Button variant="outline" size="lg" asChild>
                      <a href="/deploy">
                        <Rocket className="h-5 w-5 mr-2" />
                        Deploy Center
                      </a>
                    </Button>
                    <Button variant="outline" size="lg" asChild>
                      <a href="/settings">
                        <Settings className="h-5 w-5 mr-2" />
                        Settings
                      </a>
                    </Button>
                  </div>

                  <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                    <a href="/jarvis" className="hover:text-primary flex items-center gap-1">
                      <Bot className="h-4 w-4" />
                      AI Chat
                    </a>
                    <span>•</span>
                    <a href="/services" className="hover:text-primary flex items-center gap-1">
                      <Server className="h-4 w-4" />
                      Services
                    </a>
                    <span>•</span>
                    <a href="/creative" className="hover:text-primary flex items-center gap-1">
                      <Sparkles className="h-4 w-4" />
                      Creative Studio
                    </a>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
