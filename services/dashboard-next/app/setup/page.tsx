"use client";

import { useState, useEffect } from "react";
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
  FolderGit2,
  Zap,
  LayoutDashboard,
  BookOpen,
  ExternalLink,
  Terminal,
  Shield,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

type DeploymentType = "single" | "multi" | "hybrid";
type SetupStep = 0 | 1 | 2 | 3 | 4 | 5;

interface DetectedValues {
  projectName: string;
  environment: string;
  hasSSHKeys: boolean;
  sshKeyPath: string | null;
  detectedHosts: string[];
  hasGPU: boolean;
  gpuEndpoint: string | null;
  existingConfig: boolean;
}

interface FormData {
  projectName: string;
  deploymentType: DeploymentType | null;
  serverHost: string;
  serverUser: string;
  gpuHost: string;
  gpuToken: string;
}

interface TestResult {
  target: string;
  type: "ssh" | "api" | "gpu";
  success: boolean;
  message: string;
  latencyMs?: number;
}

interface SaveProgress {
  saving: boolean;
  testing: boolean;
  starting: boolean;
  completed: boolean;
}

const DEPLOYMENT_OPTIONS = [
  {
    value: "single" as DeploymentType,
    title: "Single Server",
    description: "Deploy to one VPS or home server",
    icon: Server,
    color: "blue",
  },
  {
    value: "multi" as DeploymentType,
    title: "Multiple Servers",
    description: "Distributed across servers",
    icon: Network,
    color: "purple",
  },
  {
    value: "hybrid" as DeploymentType,
    title: "Hybrid + GPU",
    description: "Cloud + home + AI acceleration",
    icon: Cpu,
    color: "amber",
  },
];

const STEPS = [
  { title: "Project Name", description: "Name your deployment" },
  { title: "Deployment Type", description: "Choose your infrastructure" },
  { title: "Server Config", description: "Configure primary server" },
  { title: "GPU Server", description: "AI acceleration setup" },
  { title: "Review & Finish", description: "Confirm and save" },
];

export default function SetupWizardPage() {
  const [currentStep, setCurrentStep] = useState<SetupStep>(0);
  const [loading, setLoading] = useState(true);
  const [detected, setDetected] = useState<DetectedValues | null>(null);
  const [formData, setFormData] = useState<FormData>({
    projectName: "",
    deploymentType: null,
    serverHost: "",
    serverUser: "root",
    gpuHost: "",
    gpuToken: "",
  });

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [gpuTestResult, setGpuTestResult] = useState<TestResult | null>(null);
  const [saveProgress, setSaveProgress] = useState<SaveProgress>({
    saving: false,
    testing: false,
    starting: false,
    completed: false,
  });
  const [showCelebration, setShowCelebration] = useState(false);
  const [generatedConfig, setGeneratedConfig] = useState<string>("");
  const [finalTestResults, setFinalTestResults] = useState<TestResult[]>([]);

  useEffect(() => {
    fetchDetectedValues();
  }, []);

  const fetchDetectedValues = async () => {
    try {
      const res = await fetch("/api/setup");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.detected) {
          setDetected(data.detected);
          setFormData((prev) => ({
            ...prev,
            projectName: data.detected.projectName || "nebula-homelab",
            serverHost:
              data.detected.detectedHosts?.[0] || "",
            gpuHost: data.detected.gpuEndpoint
              ? data.detected.gpuEndpoint.replace(/^https?:\/\//, "").replace(/:\d+$/, "")
              : "",
          }));
        }
      }
    } catch (error) {
      console.error("Failed to fetch setup status:", error);
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (type: "ssh" | "gpu") => {
    setTestingConnection(true);
    const target = type === "ssh" ? formData.serverHost : formData.gpuHost;
    const user = type === "ssh" ? formData.serverUser : undefined;

    try {
      const res = await fetch("/api/setup/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: type === "ssh" ? "ssh" : "gpu",
          target,
          user,
        }),
      });

      const data = await res.json();
      const result = data.result as TestResult;

      if (type === "ssh") {
        setTestResult(result);
      } else {
        setGpuTestResult(result);
      }

      if (result.success) {
        toast.success(`Connection successful! (${result.latencyMs}ms)`);
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }
    } catch (error) {
      const errorResult: TestResult = {
        target,
        type: type === "ssh" ? "ssh" : "gpu",
        success: false,
        message: error instanceof Error ? error.message : "Test failed",
      };

      if (type === "ssh") {
        setTestResult(errorResult);
      } else {
        setGpuTestResult(errorResult);
      }

      toast.error("Connection test failed");
    } finally {
      setTestingConnection(false);
    }
  };

  const generatePreviewConfig = () => {
    const lines = [
      `# Nebula Command Configuration`,
      `# Generated: ${new Date().toISOString().split("T")[0]}`,
      ``,
      `project:`,
      `  name: "${formData.projectName}"`,
      `  deployment: "${formData.deploymentType}"`,
      ``,
    ];

    if (formData.serverHost) {
      lines.push(`primary_server:`);
      lines.push(`  host: "${formData.serverHost}"`);
      lines.push(`  user: "${formData.serverUser}"`);
      lines.push(``);
    }

    if (formData.deploymentType === "hybrid" && formData.gpuHost) {
      lines.push(`gpu_server:`);
      lines.push(`  host: "${formData.gpuHost}"`);
      lines.push(`  port: 9765`);
      if (formData.gpuToken) {
        lines.push(`  token: "${formData.gpuToken.substring(0, 4)}..."`);
      }
      lines.push(``);
    }

    lines.push(`services:`);
    lines.push(`  dashboard: true`);
    lines.push(`  registry: true`);

    if (formData.deploymentType === "hybrid") {
      lines.push(`  ai_agent: true`);
    }

    return lines.join("\n");
  };

  const handleSaveAndComplete = async () => {
    setSaveProgress({ saving: true, testing: false, starting: false, completed: false });

    try {
      const answers = {
        projectName: formData.projectName,
        deploymentType: formData.deploymentType,
        primaryServer: formData.serverHost
          ? { host: formData.serverHost, user: formData.serverUser }
          : undefined,
        hasGPU: formData.deploymentType === "hybrid" && !!formData.gpuHost,
        gpuServer: formData.gpuHost ? { host: formData.gpuHost } : undefined,
      };

      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });

      const data = await res.json();

      setSaveProgress({ saving: false, testing: true, starting: false, completed: false });

      await new Promise((r) => setTimeout(r, 1000));

      if (data.testResults) {
        setFinalTestResults(data.testResults);
      }

      setSaveProgress({ saving: false, testing: false, starting: true, completed: false });

      await new Promise((r) => setTimeout(r, 800));

      setSaveProgress({ saving: false, testing: false, starting: false, completed: true });

      if (data.success) {
        setGeneratedConfig(data.config);
        setShowCelebration(true);
      } else {
        toast.error(data.errors?.[0] || "Setup completed with warnings");
        setCurrentStep(6 as SetupStep);
      }
    } catch (error) {
      toast.error("Failed to save configuration");
      setSaveProgress({ saving: false, testing: false, starting: false, completed: false });
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1:
        return formData.projectName.trim().length >= 2;
      case 2:
        return formData.deploymentType !== null;
      case 3:
        return formData.serverHost.trim().length > 0;
      case 4:
        return formData.deploymentType !== "hybrid" || formData.gpuHost.trim().length > 0;
      default:
        return true;
    }
  };

  const shouldShowGPUStep = formData.deploymentType === "hybrid";

  const getActiveStep = (): number => {
    if (currentStep <= 3) return currentStep - 1;
    if (currentStep === 4 && !shouldShowGPUStep) return 3;
    if (currentStep === 4) return 3;
    if (currentStep === 5) return shouldShowGPUStep ? 4 : 3;
    return currentStep - 1;
  };

  const getTotalSteps = (): number => {
    return shouldShowGPUStep ? 5 : 4;
  };

  const goNext = () => {
    if (currentStep === 3 && !shouldShowGPUStep) {
      setCurrentStep(5);
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, 5) as SetupStep);
    }
  };

  const goBack = () => {
    if (currentStep === 5 && !shouldShowGPUStep) {
      setCurrentStep(3);
    } else {
      setCurrentStep((prev) => Math.max(prev - 1, 1) as SetupStep);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Detecting your environment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <SuccessCelebration
        show={showCelebration}
        title="You're all set!"
        message="Nebula Command is configured and ready"
        onComplete={() => setShowCelebration(false)}
      />

      <div className="max-w-4xl mx-auto px-4 py-8">
        {currentStep > 0 && currentStep <= 5 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                Step {getActiveStep() + 1} of {getTotalSteps()}
              </span>
              <span className="text-sm font-medium">
                {STEPS[currentStep - 1]?.title}
              </span>
            </div>
            <Progress
              value={((getActiveStep() + 1) / getTotalSteps()) * 100}
              className="h-2"
            />

            <div className="flex justify-between mt-4">
              {STEPS.slice(0, shouldShowGPUStep ? 5 : 4).map((step, idx) => {
                if (idx === 3 && !shouldShowGPUStep) return null;
                const actualIdx = idx >= 3 && !shouldShowGPUStep ? idx : idx;
                const displayIdx = !shouldShowGPUStep && idx > 3 ? idx - 1 : idx;
                const isActive = getActiveStep() === displayIdx;
                const isCompleted = getActiveStep() > displayIdx;

                return (
                  <div
                    key={idx}
                    className={`flex flex-col items-center flex-1 ${
                      idx > 0 ? "ml-2" : ""
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                        isCompleted
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        displayIdx + 1
                      )}
                    </div>
                    <span
                      className={`text-xs mt-1 hidden sm:block ${
                        isActive ? "text-primary" : "text-muted-foreground"
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
              <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
                <CardHeader className="text-center pb-2">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring" }}
                    className="mx-auto mb-4"
                  >
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-primary/25">
                      <Rocket className="h-10 w-10 text-white" />
                    </div>
                  </motion.div>
                  <CardTitle className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Nebula Command
                  </CardTitle>
                  <CardDescription className="text-lg mt-2">
                    Let's get you set up in 5 minutes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {detected && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                    >
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <FolderGit2 className="h-5 w-5 mx-auto mb-1 text-blue-400" />
                        <p className="text-xs text-muted-foreground">Project</p>
                        <p className="text-sm font-medium truncate">
                          {detected.projectName}
                        </p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <Key
                          className={`h-5 w-5 mx-auto mb-1 ${
                            detected.hasSSHKeys ? "text-green-400" : "text-muted-foreground"
                          }`}
                        />
                        <p className="text-xs text-muted-foreground">SSH Keys</p>
                        <p className="text-sm font-medium">
                          {detected.hasSSHKeys ? "Found" : "Not found"}
                        </p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <Server className="h-5 w-5 mx-auto mb-1 text-purple-400" />
                        <p className="text-xs text-muted-foreground">Hosts</p>
                        <p className="text-sm font-medium">
                          {detected.detectedHosts.length} detected
                        </p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <Cpu
                          className={`h-5 w-5 mx-auto mb-1 ${
                            detected.hasGPU ? "text-amber-400" : "text-muted-foreground"
                          }`}
                        />
                        <p className="text-xs text-muted-foreground">GPU</p>
                        <p className="text-sm font-medium">
                          {detected.hasGPU ? "Available" : "Not found"}
                        </p>
                      </div>
                    </motion.div>
                  )}

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="flex flex-col items-center gap-4 pt-4"
                  >
                    <Button
                      size="lg"
                      onClick={() => setCurrentStep(1)}
                      className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-lg px-8"
                    >
                      <Sparkles className="h-5 w-5 mr-2" />
                      Start Setup
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </Button>
                    {detected?.existingConfig && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        Existing configuration detected - this will update it
                      </p>
                    )}
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FolderGit2 className="h-6 w-6 text-primary" />
                    Project Name
                  </CardTitle>
                  <CardDescription>
                    Give your deployment a memorable name
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="projectName">Project Name</Label>
                    <Input
                      id="projectName"
                      value={formData.projectName}
                      onChange={(e) =>
                        setFormData({ ...formData, projectName: e.target.value })
                      }
                      placeholder="my-homelab"
                      className="text-lg h-12"
                    />
                    {formData.projectName.length > 0 &&
                      formData.projectName.length < 2 && (
                        <p className="text-sm text-red-400">
                          Name must be at least 2 characters
                        </p>
                      )}
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={() => setCurrentStep(0)}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button onClick={goNext} disabled={!canProceed()}>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-6 w-6 text-primary" />
                    Deployment Type
                  </CardTitle>
                  <CardDescription>
                    How will you deploy Nebula Command?
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {DEPLOYMENT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isSelected = formData.deploymentType === option.value;

                      return (
                        <motion.div
                          key={option.value}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Card
                            className={`cursor-pointer transition-all ${
                              isSelected
                                ? `border-${option.color}-500 bg-${option.color}-500/10 ring-2 ring-${option.color}-500/30`
                                : "hover:border-primary/50"
                            }`}
                            onClick={() =>
                              setFormData({
                                ...formData,
                                deploymentType: option.value,
                              })
                            }
                          >
                            <CardContent className="pt-6 text-center">
                              <div
                                className={`w-14 h-14 mx-auto rounded-xl flex items-center justify-center mb-4 ${
                                  isSelected
                                    ? `bg-${option.color}-500/20`
                                    : "bg-muted"
                                }`}
                              >
                                <Icon
                                  className={`h-7 w-7 ${
                                    isSelected
                                      ? option.color === "blue"
                                        ? "text-blue-400"
                                        : option.color === "purple"
                                        ? "text-purple-400"
                                        : "text-amber-400"
                                      : "text-muted-foreground"
                                  }`}
                                />
                              </div>
                              <h3 className="font-semibold mb-1">{option.title}</h3>
                              <p className="text-sm text-muted-foreground">
                                {option.description}
                              </p>
                              {isSelected && (
                                <Badge className="mt-3 bg-green-500/20 text-green-400 border-green-500/30">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Selected
                                </Badge>
                              )}
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={goBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button onClick={goNext} disabled={!canProceed()}>
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
              key="step3"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Terminal className="h-6 w-6 text-primary" />
                    Server Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure your primary server connection
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="serverHost">Server Host / IP</Label>
                      <Input
                        id="serverHost"
                        value={formData.serverHost}
                        onChange={(e) =>
                          setFormData({ ...formData, serverHost: e.target.value })
                        }
                        placeholder="192.168.1.100 or server.example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="serverUser">Username</Label>
                      <Input
                        id="serverUser"
                        value={formData.serverUser}
                        onChange={(e) =>
                          setFormData({ ...formData, serverUser: e.target.value })
                        }
                        placeholder="root"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={() => testConnection("ssh")}
                      disabled={!formData.serverHost || testingConnection}
                    >
                      {testingConnection ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4 mr-2" />
                      )}
                      Test Connection
                    </Button>

                    {testResult && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`flex items-center gap-2 text-sm ${
                          testResult.success ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {testResult.success ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        {testResult.message}
                        {testResult.latencyMs && (
                          <span className="text-muted-foreground">
                            ({testResult.latencyMs}ms)
                          </span>
                        )}
                      </motion.div>
                    )}
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={goBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button onClick={goNext} disabled={!canProceed()}>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 4 && shouldShowGPUStep && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-6 w-6 text-amber-400" />
                    GPU Server Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure your GPU server for AI workloads
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="gpuHost">GPU Agent URL / IP</Label>
                      <Input
                        id="gpuHost"
                        value={formData.gpuHost}
                        onChange={(e) =>
                          setFormData({ ...formData, gpuHost: e.target.value })
                        }
                        placeholder="192.168.1.200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gpuToken">
                        API Token{" "}
                        <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="gpuToken"
                        type="password"
                        value={formData.gpuToken}
                        onChange={(e) =>
                          setFormData({ ...formData, gpuToken: e.target.value })
                        }
                        placeholder="For secure connections"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={() => testConnection("gpu")}
                      disabled={!formData.gpuHost || testingConnection}
                    >
                      {testingConnection ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4 mr-2" />
                      )}
                      Test Connection
                    </Button>

                    {gpuTestResult && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`flex items-center gap-2 text-sm ${
                          gpuTestResult.success ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {gpuTestResult.success ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        {gpuTestResult.message}
                      </motion.div>
                    )}
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={goBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setCurrentStep(5)}>
                        Skip for now
                      </Button>
                      <Button onClick={goNext} disabled={!canProceed()}>
                        Continue
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-6 w-6 text-green-400" />
                    Review & Finish
                  </CardTitle>
                  <CardDescription>
                    Review your configuration before saving
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Configuration Preview</h4>
                      <pre className="bg-muted/50 rounded-lg p-4 text-xs overflow-x-auto font-mono border">
                        {generatePreviewConfig()}
                      </pre>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium mb-2">Services to Enable</h4>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                            Dashboard
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                            Service Registry
                          </div>
                          {formData.deploymentType === "hybrid" && (
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-400" />
                              AI Agent
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium mb-2">Summary</h4>
                        <dl className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Project</dt>
                            <dd className="font-medium">{formData.projectName}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Type</dt>
                            <dd className="font-medium capitalize">
                              {formData.deploymentType}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Server</dt>
                            <dd className="font-medium">
                              {formData.serverUser}@{formData.serverHost}
                            </dd>
                          </div>
                          {formData.gpuHost && (
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">GPU</dt>
                              <dd className="font-medium">{formData.gpuHost}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    </div>
                  </div>

                  {(saveProgress.saving ||
                    saveProgress.testing ||
                    saveProgress.starting) && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-3">
                        {saveProgress.saving ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : saveProgress.testing ||
                          saveProgress.starting ||
                          saveProgress.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted" />
                        )}
                        <span
                          className={
                            saveProgress.saving
                              ? "text-primary"
                              : saveProgress.testing ||
                                saveProgress.starting ||
                                saveProgress.completed
                              ? "text-green-400"
                              : "text-muted-foreground"
                          }
                        >
                          Save configuration
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {saveProgress.testing ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : saveProgress.starting || saveProgress.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted" />
                        )}
                        <span
                          className={
                            saveProgress.testing
                              ? "text-primary"
                              : saveProgress.starting || saveProgress.completed
                              ? "text-green-400"
                              : "text-muted-foreground"
                          }
                        >
                          Test connections
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {saveProgress.starting ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : saveProgress.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted" />
                        )}
                        <span
                          className={
                            saveProgress.starting
                              ? "text-primary"
                              : saveProgress.completed
                              ? "text-green-400"
                              : "text-muted-foreground"
                          }
                        >
                          Initialize services
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={goBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      onClick={handleSaveAndComplete}
                      disabled={
                        saveProgress.saving ||
                        saveProgress.testing ||
                        saveProgress.starting
                      }
                      className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                    >
                      {saveProgress.saving ||
                      saveProgress.testing ||
                      saveProgress.starting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Rocket className="h-4 w-4 mr-2" />
                      )}
                      Save & Complete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {(currentStep as number) === 6 && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <Card className="border-green-500/20 bg-gradient-to-br from-card to-green-500/5">
                <CardContent className="py-12">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.2 }}
                    className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-6"
                  >
                    <CheckCircle2 className="h-10 w-10 text-green-400" />
                  </motion.div>

                  <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
                  <p className="text-muted-foreground mb-8">
                    Nebula Command is configured and ready to use
                  </p>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button asChild size="lg">
                      <a href="/">
                        <LayoutDashboard className="h-4 w-4 mr-2" />
                        Go to Dashboard
                      </a>
                    </Button>
                    <Button variant="outline" asChild>
                      <a href="/deploy">
                        <Rocket className="h-4 w-4 mr-2" />
                        Deployment Center
                      </a>
                    </Button>
                    <Button variant="ghost" asChild>
                      <a
                        href="https://docs.nebula-command.dev"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <BookOpen className="h-4 w-4 mr-2" />
                        Read Docs
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </Button>
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
