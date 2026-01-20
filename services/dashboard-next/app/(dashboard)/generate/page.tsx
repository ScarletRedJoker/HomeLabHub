"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Editor from "@monaco-editor/react";
import {
  Code,
  Wand2,
  Copy,
  Check,
  Loader2,
  History,
  Trash2,
  FileCode,
  Layout,
  Server,
  FolderTree,
  Sparkles,
  ChevronRight,
  Package,
  FolderOpen,
} from "lucide-react";

interface GenerationResult {
  code: string;
  filePath: string;
  explanation: string;
  dependencies: string[];
  provider: string;
  model: string;
  generationType: string;
  language: string;
  timestamp: string;
}

interface HistoryItem extends GenerationResult {
  id: string;
  description: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  type: string;
  language: string;
  prompt: string;
  icon: React.ReactNode;
}

const templates: Template[] = [
  {
    id: "nextjs-api",
    name: "Next.js API Endpoint",
    description: "RESTful API route with validation and error handling",
    type: "api",
    language: "nextjs",
    prompt: "Create a Next.js API route that handles CRUD operations for a resource. Include request validation, proper HTTP status codes, and TypeScript types.",
    icon: <Server className="h-5 w-5" />,
  },
  {
    id: "react-component",
    name: "React Component",
    description: "Reusable UI component with props and Tailwind styling",
    type: "component",
    language: "react",
    prompt: "Create a reusable React component with TypeScript props interface, Tailwind CSS styling, and proper accessibility attributes.",
    icon: <Layout className="h-5 w-5" />,
  },
  {
    id: "flask-route",
    name: "Python Flask Route",
    description: "Flask Blueprint with route handlers and validation",
    type: "api",
    language: "flask",
    prompt: "Create a Flask Blueprint with RESTful routes. Include request validation using marshmallow or pydantic, error handling, and proper response formatting.",
    icon: <Server className="h-5 w-5" />,
  },
  {
    id: "discord-command",
    name: "Discord Bot Command",
    description: "Slash command with options and permissions",
    type: "file",
    language: "discord",
    prompt: "Create a Discord.js slash command with subcommands, options, permission checks, and embedded responses. Use the latest discord.js v14 patterns.",
    icon: <FileCode className="h-5 w-5" />,
  },
  {
    id: "express-middleware",
    name: "Express Middleware",
    description: "Custom middleware with error handling",
    type: "file",
    language: "express",
    prompt: "Create Express.js middleware for authentication/authorization with JWT validation, rate limiting, and proper error responses. Use TypeScript.",
    icon: <Server className="h-5 w-5" />,
  },
];

const generationTypes = [
  { value: "file", label: "Single File", icon: FileCode },
  { value: "component", label: "UI Component", icon: Layout },
  { value: "api", label: "API Endpoint", icon: Server },
  { value: "full-project", label: "Full Project", icon: FolderTree },
];

const languages = [
  { value: "react", label: "React (TypeScript)" },
  { value: "nextjs", label: "Next.js" },
  { value: "nodejs", label: "Node.js" },
  { value: "express", label: "Express.js" },
  { value: "python", label: "Python" },
  { value: "flask", label: "Flask" },
  { value: "discord", label: "Discord.js" },
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
];

const languageToMonaco: Record<string, string> = {
  react: "typescript",
  nextjs: "typescript",
  nodejs: "javascript",
  express: "typescript",
  python: "python",
  flask: "python",
  discord: "typescript",
  typescript: "typescript",
  javascript: "javascript",
};

export default function GeneratePage() {
  const [description, setDescription] = useState("");
  const [generationType, setGenerationType] = useState("file");
  const [language, setLanguage] = useState("react");
  const [additionalContext, setAdditionalContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("generate");

  useEffect(() => {
    const saved = localStorage.getItem("codeGenerationHistory");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch {}
    }
  }, []);

  const saveToHistory = (result: GenerationResult, description: string) => {
    const item: HistoryItem = {
      ...result,
      id: Date.now().toString(),
      description,
    };
    const updated = [item, ...history].slice(0, 20);
    setHistory(updated);
    localStorage.setItem("codeGenerationHistory", JSON.stringify(updated));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("codeGenerationHistory");
  };

  const loadFromHistory = (item: HistoryItem) => {
    setResult(item);
    setDescription(item.description);
    setGenerationType(item.generationType);
    setLanguage(item.language);
    setActiveTab("generate");
  };

  const useTemplate = (template: Template) => {
    setDescription(template.prompt);
    setGenerationType(template.type);
    setLanguage(template.language);
    setActiveTab("generate");
  };

  async function generateCode() {
    if (!description.trim()) return;

    setGenerating(true);
    setResult(null);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          type: generationType,
          language,
          additionalContext: additionalContext.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        saveToHistory(data, description);
        toast.success("Code generated successfully!");
      } else {
        const error = await res.json();
        toast.error(`Error: ${error.details || error.error}`);
      }
    } catch (error: any) {
      toast.error(`Failed to generate code: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  }

  async function copyToClipboard() {
    if (!result?.code) return;
    await navigator.clipboard.writeText(result.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Code className="h-6 w-6 text-blue-500" />
            Code Generation
          </h1>
          <p className="text-muted-foreground">
            Generate production-ready code from natural language descriptions
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Generate
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History
            {history.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-muted rounded-full">
                {history.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>What do you want to build?</Label>
                <Textarea
                  placeholder="Describe the code you want to generate in detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Generation Type</Label>
                  <Select value={generationType} onValueChange={setGenerationType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {generationTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Language / Framework</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Additional Context (optional)</Label>
                <Textarea
                  placeholder="Any additional requirements, constraints, or examples..."
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <Button
                onClick={generateCode}
                disabled={generating || !description.trim()}
                className="w-full"
                size="lg"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generate Code
                  </>
                )}
              </Button>

              {result && (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Generation Info</span>
                    <span className="text-xs text-muted-foreground">
                      {result.provider} / {result.model}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Suggested path:</span>
                      <code className="px-2 py-0.5 bg-muted rounded text-xs">
                        {result.filePath}
                      </code>
                    </div>

                    {result.dependencies && result.dependencies.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Package className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <span className="text-muted-foreground">Dependencies:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {result.dependencies.map((dep) => (
                              <code
                                key={dep}
                                className="px-2 py-0.5 bg-muted rounded text-xs"
                              >
                                {dep}
                              </code>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {result.explanation && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {result.explanation}
                    </p>
                  )}

                  <Button variant="outline" size="sm" className="w-full" disabled>
                    <ChevronRight className="h-4 w-4 mr-2" />
                    Apply to Project (Coming Soon)
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Generated Code</Label>
                {result?.code && (
                  <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden h-[500px]">
                <Editor
                  height="100%"
                  language={languageToMonaco[language] || "typescript"}
                  value={result?.code || "// Generated code will appear here..."}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    padding: { top: 12, bottom: 12 },
                  }}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="p-4 border rounded-lg hover:border-blue-500/50 hover:bg-muted/30 transition-colors cursor-pointer group"
                onClick={() => useTemplate(template)}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    {template.icon}
                  </div>
                  <div>
                    <h3 className="font-medium">{template.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {template.language.toUpperCase()}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {template.description}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Use Template
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          {history.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Generation History</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Your code generation history will appear here. Generated code is
                stored locally in your browser.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={clearHistory}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear History
                </Button>
              </div>

              <div className="space-y-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 border rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => loadFromHistory(item)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-muted-foreground" />
                        <code className="text-sm">{item.filePath}</code>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.timestamp).toLocaleDateString()}{" "}
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs px-2 py-0.5 bg-muted rounded">
                        {item.generationType}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-muted rounded">
                        {item.language}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
