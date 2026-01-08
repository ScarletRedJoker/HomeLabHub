"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Factory,
  Rocket,
  Globe,
  Server,
  Bot,
  ShoppingCart,
  BarChart3,
  MessageSquare,
  Zap,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Code2,
  Database,
  Shield,
  CreditCard,
  Users,
  FileCode,
  Terminal,
  Package,
  Copy,
  Download,
  Play,
  Boxes,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { useToast } from "@/components/ui/use-toast";

interface AppTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "saas" | "api" | "landing" | "dashboard" | "bot" | "ecommerce";
  features: string[];
  stack: string[];
  complexity: "starter" | "standard" | "enterprise";
  estimatedTime: string;
}

interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

interface ProjectConfig {
  name: string;
  description: string;
  database: "postgresql" | "sqlite" | "none";
  auth: "session" | "jwt" | "oauth" | "none";
  styling: "tailwind" | "css" | "styled-components";
  deployment: "docker" | "serverless" | "vps";
}

const iconMap: Record<string, React.ReactNode> = {
  Globe: <Globe className="h-6 w-6" />,
  Server: <Server className="h-6 w-6" />,
  Bot: <Bot className="h-6 w-6" />,
  ShoppingCart: <ShoppingCart className="h-6 w-6" />,
  BarChart3: <BarChart3 className="h-6 w-6" />,
  MessageSquare: <MessageSquare className="h-6 w-6" />,
  Zap: <Zap className="h-6 w-6" />,
  CreditCard: <CreditCard className="h-6 w-6" />,
  Users: <Users className="h-6 w-6" />,
};

const categoryColors: Record<string, string> = {
  saas: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  api: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  landing: "bg-green-500/20 text-green-400 border-green-500/30",
  dashboard: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  bot: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  ecommerce: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const complexityConfig = {
  starter: { label: "Starter", color: "bg-green-500/20 text-green-400", time: "5 min" },
  standard: { label: "Standard", color: "bg-blue-500/20 text-blue-400", time: "15 min" },
  enterprise: { label: "Enterprise", color: "bg-purple-500/20 text-purple-400", time: "30 min" },
};

const templates: AppTemplate[] = [
  {
    id: "saas-starter",
    name: "SaaS Starter Kit",
    description: "Complete SaaS foundation with auth, billing, and user management",
    icon: "Zap",
    category: "saas",
    features: ["User Authentication", "Stripe Billing", "Admin Dashboard", "API Keys"],
    stack: ["Next.js", "PostgreSQL", "Stripe", "Tailwind"],
    complexity: "enterprise",
    estimatedTime: "30 min",
  },
  {
    id: "api-service",
    name: "REST API Service",
    description: "Production-ready API with rate limiting, auth, and documentation",
    icon: "Server",
    category: "api",
    features: ["JWT Auth", "Rate Limiting", "OpenAPI Docs", "Logging"],
    stack: ["Node.js", "Express", "PostgreSQL", "Docker"],
    complexity: "standard",
    estimatedTime: "15 min",
  },
  {
    id: "landing-page",
    name: "Marketing Landing Page",
    description: "High-converting landing page with animations and CTA sections",
    icon: "Globe",
    category: "landing",
    features: ["Hero Section", "Feature Grid", "Testimonials", "Contact Form"],
    stack: ["Next.js", "Tailwind", "Framer Motion"],
    complexity: "starter",
    estimatedTime: "5 min",
  },
  {
    id: "admin-dashboard",
    name: "Admin Dashboard",
    description: "Full-featured admin panel with charts, tables, and user management",
    icon: "BarChart3",
    category: "dashboard",
    features: ["Analytics", "User Management", "Role-based Access", "Reports"],
    stack: ["React", "Recharts", "Tailwind", "PostgreSQL"],
    complexity: "standard",
    estimatedTime: "20 min",
  },
  {
    id: "discord-bot",
    name: "Discord Bot",
    description: "Feature-rich Discord bot with slash commands and event handling",
    icon: "Bot",
    category: "bot",
    features: ["Slash Commands", "Event System", "Database", "Moderation"],
    stack: ["Node.js", "Discord.js", "SQLite"],
    complexity: "standard",
    estimatedTime: "10 min",
  },
  {
    id: "ecommerce-store",
    name: "E-Commerce Store",
    description: "Online store with cart, checkout, and inventory management",
    icon: "ShoppingCart",
    category: "ecommerce",
    features: ["Product Catalog", "Shopping Cart", "Stripe Checkout", "Order Management"],
    stack: ["Next.js", "Stripe", "PostgreSQL", "Tailwind"],
    complexity: "enterprise",
    estimatedTime: "45 min",
  },
  {
    id: "chat-app",
    name: "Real-time Chat",
    description: "WebSocket-powered chat application with rooms and direct messages",
    icon: "MessageSquare",
    category: "saas",
    features: ["Real-time Messages", "Chat Rooms", "File Sharing", "User Presence"],
    stack: ["Node.js", "Socket.io", "React", "Redis"],
    complexity: "standard",
    estimatedTime: "20 min",
  },
  {
    id: "subscription-api",
    name: "Subscription API",
    description: "Stripe-powered subscription management API with webhooks",
    icon: "CreditCard",
    category: "api",
    features: ["Stripe Integration", "Webhook Handling", "Plan Management", "Usage Tracking"],
    stack: ["Node.js", "Stripe", "PostgreSQL", "Express"],
    complexity: "standard",
    estimatedTime: "15 min",
  },
  {
    id: "team-portal",
    name: "Team Portal",
    description: "Internal tool for team collaboration and project management",
    icon: "Users",
    category: "dashboard",
    features: ["Team Management", "Project Boards", "Time Tracking", "Notifications"],
    stack: ["Next.js", "PostgreSQL", "Tailwind", "NextAuth"],
    complexity: "enterprise",
    estimatedTime: "40 min",
  },
];

const defaultConfig: ProjectConfig = {
  name: "",
  description: "",
  database: "postgresql",
  auth: "session",
  styling: "tailwind",
  deployment: "docker",
};

export default function AppFactoryPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<AppTemplate | null>(null);
  const [config, setConfig] = useState<ProjectConfig>(defaultConfig);
  const [step, setStep] = useState<"browse" | "configure" | "generate" | "deploy">("browse");
  const [generating, setGenerating] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [activeFile, setActiveFile] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const filteredTemplates = categoryFilter === "all" 
    ? templates 
    : templates.filter(t => t.category === categoryFilter);

  async function handleGenerate() {
    if (!selectedTemplate || !config.name) return;

    setGenerating(true);
    try {
      const res = await fetch("/api/factory/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          config,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedFiles(data.files);
        setStep("generate");
        toast({
          title: "Project Generated!",
          description: `Created ${data.files.length} files for ${config.name}`,
        });
      } else {
        throw new Error("Generation failed");
      }
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Could not generate project files. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function copyToClipboard(content: string) {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getLanguageForMonaco(lang: string): string {
    const map: Record<string, string> = {
      javascript: "javascript",
      typescript: "typescript",
      python: "python",
      json: "json",
      html: "html",
      css: "css",
      yaml: "yaml",
      dockerfile: "dockerfile",
      shell: "shell",
      markdown: "markdown",
    };
    return map[lang] || "plaintext";
  }

  function resetAndBrowse() {
    setSelectedTemplate(null);
    setConfig(defaultConfig);
    setStep("browse");
    setGeneratedFiles([]);
    setActiveFile(0);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
            <Factory className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">App Factory</h1>
            <p className="text-muted-foreground">
              Build production-ready applications in minutes
            </p>
          </div>
        </div>
        {step !== "browse" && (
          <Button variant="outline" onClick={resetAndBrowse}>
            Start Over
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className={`flex items-center gap-2 ${step === "browse" ? "text-purple-400" : "text-muted-foreground"}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "browse" ? "bg-purple-500/20 border-2 border-purple-500" : "bg-muted"}`}>
            1
          </div>
          <span>Choose Template</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center gap-2 ${step === "configure" ? "text-purple-400" : "text-muted-foreground"}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "configure" ? "bg-purple-500/20 border-2 border-purple-500" : "bg-muted"}`}>
            2
          </div>
          <span>Configure</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center gap-2 ${step === "generate" ? "text-purple-400" : "text-muted-foreground"}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "generate" ? "bg-purple-500/20 border-2 border-purple-500" : "bg-muted"}`}>
            3
          </div>
          <span>Generate</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center gap-2 ${step === "deploy" ? "text-purple-400" : "text-muted-foreground"}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "deploy" ? "bg-purple-500/20 border-2 border-purple-500" : "bg-muted"}`}>
            4
          </div>
          <span>Deploy</span>
        </div>
      </div>

      {step === "browse" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={categoryFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("all")}
            >
              All
            </Button>
            {["saas", "api", "landing", "dashboard", "bot", "ecommerce"].map((cat) => (
              <Button
                key={cat}
                variant={categoryFilter === cat ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter(cat)}
                className="capitalize"
              >
                {cat}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                className="cursor-pointer hover:border-purple-500/50 transition-all hover:shadow-lg hover:shadow-purple-500/10 group"
                onClick={() => {
                  setSelectedTemplate(template);
                  setConfig({ ...defaultConfig, name: template.name.toLowerCase().replace(/\s+/g, "-") });
                  setStep("configure");
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-purple-400 group-hover:from-purple-500/30 group-hover:to-pink-500/30 transition-colors">
                      {iconMap[template.icon] || <Sparkles className="h-6 w-6" />}
                    </div>
                    <div className="flex gap-2">
                      <Badge className={categoryColors[template.category]} variant="outline">
                        {template.category}
                      </Badge>
                    </div>
                  </div>
                  <CardTitle className="mt-3 group-hover:text-purple-400 transition-colors">
                    {template.name}
                  </CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-1">
                    {template.stack.map((tech) => (
                      <Badge key={tech} variant="secondary" className="text-xs">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className={`px-2 py-0.5 rounded ${complexityConfig[template.complexity].color}`}>
                      {complexityConfig[template.complexity].label}
                    </span>
                    <span className="text-muted-foreground">~{template.estimatedTime}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {step === "configure" && selectedTemplate && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                  {iconMap[selectedTemplate.icon]}
                </div>
                {selectedTemplate.name}
              </CardTitle>
              <CardDescription>{selectedTemplate.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Features Included</h4>
                <div className="space-y-2">
                  {selectedTemplate.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Tech Stack</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedTemplate.stack.map((tech) => (
                    <Badge key={tech} variant="outline">
                      {tech}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Project Configuration</CardTitle>
              <CardDescription>Customize your project settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  placeholder="my-awesome-app"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={config.description}
                  onChange={(e) => setConfig({ ...config, description: e.target.value })}
                  placeholder="A brief description of your project"
                />
              </div>

              <div className="space-y-2">
                <Label>Database</Label>
                <Select
                  value={config.database}
                  onValueChange={(v) => setConfig({ ...config, database: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="postgresql">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        PostgreSQL
                      </div>
                    </SelectItem>
                    <SelectItem value="sqlite">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        SQLite
                      </div>
                    </SelectItem>
                    <SelectItem value="none">No Database</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Authentication</Label>
                <Select
                  value={config.auth}
                  onValueChange={(v) => setConfig({ ...config, auth: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="session">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Session-based
                      </div>
                    </SelectItem>
                    <SelectItem value="jwt">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        JWT Tokens
                      </div>
                    </SelectItem>
                    <SelectItem value="oauth">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        OAuth 2.0
                      </div>
                    </SelectItem>
                    <SelectItem value="none">No Authentication</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Deployment Target</Label>
                <Select
                  value={config.deployment}
                  onValueChange={(v) => setConfig({ ...config, deployment: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="docker">
                      <div className="flex items-center gap-2">
                        <Boxes className="h-4 w-4" />
                        Docker Container
                      </div>
                    </SelectItem>
                    <SelectItem value="serverless">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Serverless
                      </div>
                    </SelectItem>
                    <SelectItem value="vps">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        VPS / Bare Metal
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => setStep("browse")}>
                  Back
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  onClick={handleGenerate}
                  disabled={generating || !config.name}
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Project
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === "generate" && generatedFiles.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileCode className="h-4 w-4" />
                Project Files
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="space-y-1 p-2">
                  {generatedFiles.map((file, idx) => (
                    <Button
                      key={file.path}
                      variant={activeFile === idx ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start text-xs font-mono"
                      onClick={() => setActiveFile(idx)}
                    >
                      {file.path}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-mono">
                  {generatedFiles[activeFile]?.path}
                </CardTitle>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(generatedFiles[activeFile]?.content || "")}
                >
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[400px] border-t">
                <Editor
                  height="100%"
                  language={getLanguageForMonaco(generatedFiles[activeFile]?.language || "text")}
                  value={generatedFiles[activeFile]?.content || ""}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    padding: { top: 16 },
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-4 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setStep("configure")}>
              Back to Configure
            </Button>
            <Button
              className="bg-gradient-to-r from-purple-500 to-pink-500"
              onClick={() => setStep("deploy")}
            >
              <Rocket className="mr-2 h-4 w-4" />
              Deploy Project
            </Button>
          </div>
        </div>
      )}

      {step === "deploy" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Rocket className="h-6 w-6 text-purple-500" />
              Deploy Your Project
            </CardTitle>
            <CardDescription>
              Choose where to deploy your generated project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="cursor-pointer hover:border-purple-500/50 transition-colors">
                <CardContent className="pt-6 text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Server className="h-6 w-6 text-blue-400" />
                  </div>
                  <h3 className="font-semibold">Homelab Server</h3>
                  <p className="text-sm text-muted-foreground">
                    Deploy to your local or Linode server via SSH
                  </p>
                  <Button className="w-full" variant="outline">
                    <Terminal className="mr-2 h-4 w-4" />
                    Deploy via SSH
                  </Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-purple-500/50 transition-colors">
                <CardContent className="pt-6 text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Boxes className="h-6 w-6 text-purple-400" />
                  </div>
                  <h3 className="font-semibold">Docker Container</h3>
                  <p className="text-sm text-muted-foreground">
                    Build and run as a Docker container
                  </p>
                  <Button className="w-full" variant="outline">
                    <Package className="mr-2 h-4 w-4" />
                    Build Container
                  </Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-purple-500/50 transition-colors">
                <CardContent className="pt-6 text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Download className="h-6 w-6 text-green-400" />
                  </div>
                  <h3 className="font-semibold">Download ZIP</h3>
                  <p className="text-sm text-muted-foreground">
                    Download project files as a ZIP archive
                  </p>
                  <Button className="w-full" variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium mb-3">Quick Start Commands</h4>
              <div className="space-y-2 font-mono text-sm">
                <div className="flex items-center gap-2 bg-background rounded px-3 py-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <code>cd {config.name}</code>
                </div>
                <div className="flex items-center gap-2 bg-background rounded px-3 py-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <code>npm install</code>
                </div>
                <div className="flex items-center gap-2 bg-background rounded px-3 py-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <code>npm run dev</code>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
