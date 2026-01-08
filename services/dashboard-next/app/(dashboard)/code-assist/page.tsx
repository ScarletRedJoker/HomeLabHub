"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wand2,
  Loader2,
  Copy,
  CheckCircle2,
  Sparkles,
  Bug,
  Zap,
  FileCode,
  MessageSquare,
  RefreshCw,
  ArrowRight,
  Code2,
  Shield,
  Gauge,
  BookOpen,
  Lightbulb,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { useToast } from "@/components/ui/use-toast";

type AssistMode = "refactor" | "explain" | "debug" | "optimize" | "document" | "convert" | "suggest";

interface AssistResult {
  code?: string;
  explanation?: string;
  suggestions?: string[];
}

const modeConfig: Record<AssistMode, { label: string; icon: React.ReactNode; description: string; color: string }> = {
  refactor: {
    label: "Refactor",
    icon: <RefreshCw className="h-4 w-4" />,
    description: "Clean up and improve code structure",
    color: "bg-blue-500/20 text-blue-400",
  },
  explain: {
    label: "Explain",
    icon: <BookOpen className="h-4 w-4" />,
    description: "Get a detailed explanation of the code",
    color: "bg-green-500/20 text-green-400",
  },
  debug: {
    label: "Debug",
    icon: <Bug className="h-4 w-4" />,
    description: "Find and fix bugs in your code",
    color: "bg-red-500/20 text-red-400",
  },
  optimize: {
    label: "Optimize",
    icon: <Gauge className="h-4 w-4" />,
    description: "Improve performance and efficiency",
    color: "bg-yellow-500/20 text-yellow-400",
  },
  document: {
    label: "Document",
    icon: <FileCode className="h-4 w-4" />,
    description: "Add comments and documentation",
    color: "bg-purple-500/20 text-purple-400",
  },
  convert: {
    label: "Convert",
    icon: <ArrowRight className="h-4 w-4" />,
    description: "Convert between languages or frameworks",
    color: "bg-orange-500/20 text-orange-400",
  },
  suggest: {
    label: "Suggest",
    icon: <Lightbulb className="h-4 w-4" />,
    description: "Get improvement suggestions",
    color: "bg-cyan-500/20 text-cyan-400",
  },
};

const languages = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
];

const sampleCode = `// Example: Calculate user statistics
function getUserStats(users) {
  let totalAge = 0;
  let activeCount = 0;
  
  for (let i = 0; i < users.length; i++) {
    totalAge = totalAge + users[i].age;
    if (users[i].active == true) {
      activeCount = activeCount + 1;
    }
  }
  
  const avgAge = totalAge / users.length;
  
  return {
    total: users.length,
    averageAge: avgAge,
    activeUsers: activeCount,
    inactiveUsers: users.length - activeCount
  };
}`;

export default function CodeAssistPage() {
  const [code, setCode] = useState(sampleCode);
  const [mode, setMode] = useState<AssistMode>("refactor");
  const [language, setLanguage] = useState("typescript");
  const [targetLanguage, setTargetLanguage] = useState("python");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssistResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const { toast } = useToast();

  const handleAssist = useCallback(async () => {
    if (!code.trim()) {
      toast({
        title: "No Code Provided",
        description: "Please enter some code to analyze",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/code-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          mode,
          language,
          targetLanguage: mode === "convert" ? targetLanguage : undefined,
          customPrompt: customPrompt || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to process code");

      const data = await res.json();
      setResult(data);

      toast({
        title: "Analysis Complete",
        description: `${modeConfig[mode].label} completed successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to analyze code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [code, mode, language, targetLanguage, customPrompt, toast]);

  async function copyToClipboard(content: string) {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500">
          <Wand2 className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">AI Code Assistant</h1>
          <p className="text-muted-foreground">
            Refactor, explain, debug, and optimize your code with AI
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(modeConfig) as AssistMode[]).map((m) => (
          <Button
            key={m}
            variant={mode === m ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(m)}
            className="gap-2"
          >
            <span className={`p-1 rounded ${mode === m ? "bg-white/20" : modeConfig[m].color}`}>
              {modeConfig[m].icon}
            </span>
            {modeConfig[m].label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                Input Code
              </CardTitle>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-[140px]">
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
            <CardDescription>{modeConfig[mode].description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[350px] border rounded-lg overflow-hidden">
              <Editor
                height="100%"
                language={language}
                value={code}
                onChange={(value) => setCode(value || "")}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  padding: { top: 16 },
                }}
              />
            </div>

            {mode === "convert" && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Convert to:</span>
                <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.filter((l) => l.value !== language).map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Textarea
              placeholder="Add custom instructions (optional)..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="resize-none"
              rows={2}
            />

            <Button
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
              onClick={handleAssist}
              disabled={loading || !code.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {modeConfig[mode].label} Code
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Result
              </CardTitle>
              {result?.code && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(result.code!)}
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
            <CardDescription>
              {result ? "AI analysis complete" : "Results will appear here"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Wand2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter your code and click the button to get AI assistance</p>
                </div>
              </div>
            ) : (
              <Tabs defaultValue={result.code ? "code" : "explanation"} className="h-[400px] flex flex-col">
                <TabsList>
                  {result.code && <TabsTrigger value="code">Code</TabsTrigger>}
                  {result.explanation && <TabsTrigger value="explanation">Explanation</TabsTrigger>}
                  {result.suggestions && result.suggestions.length > 0 && (
                    <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
                  )}
                </TabsList>

                {result.code && (
                  <TabsContent value="code" className="flex-1 mt-4">
                    <div className="h-[320px] border rounded-lg overflow-hidden">
                      <Editor
                        height="100%"
                        language={mode === "convert" ? targetLanguage : language}
                        value={result.code}
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
                  </TabsContent>
                )}

                {result.explanation && (
                  <TabsContent value="explanation" className="flex-1 mt-4">
                    <ScrollArea className="h-[320px] border rounded-lg p-4">
                      <div className="prose prose-invert prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {result.explanation}
                        </div>
                      </div>
                    </ScrollArea>
                  </TabsContent>
                )}

                {result.suggestions && result.suggestions.length > 0 && (
                  <TabsContent value="suggestions" className="flex-1 mt-4">
                    <ScrollArea className="h-[320px] border rounded-lg p-4">
                      <div className="space-y-3">
                        {result.suggestions.map((suggestion, idx) => (
                          <div
                            key={idx}
                            className="flex gap-3 p-3 rounded-lg bg-muted/50"
                          >
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">
                              {idx + 1}
                            </div>
                            <p className="text-sm">{suggestion}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                )}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => {
                setMode("debug");
                handleAssist();
              }}
              disabled={loading}
            >
              <Bug className="h-5 w-5 text-red-400" />
              <span className="text-xs">Find Bugs</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => {
                setMode("optimize");
                handleAssist();
              }}
              disabled={loading}
            >
              <Gauge className="h-5 w-5 text-yellow-400" />
              <span className="text-xs">Optimize</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => {
                setMode("document");
                handleAssist();
              }}
              disabled={loading}
            >
              <FileCode className="h-5 w-5 text-purple-400" />
              <span className="text-xs">Add Docs</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => {
                setMode("suggest");
                handleAssist();
              }}
              disabled={loading}
            >
              <Lightbulb className="h-5 w-5 text-cyan-400" />
              <span className="text-xs">Get Tips</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
