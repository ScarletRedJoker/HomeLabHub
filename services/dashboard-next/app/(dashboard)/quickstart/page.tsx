"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  MessageSquare,
  Server,
  Layout,
  Terminal,
  Loader2,
  Copy,
  CheckCircle2,
  Rocket,
  Sparkles,
} from "lucide-react";
import Editor from "@monaco-editor/react";

interface TemplateFile {
  path: string;
  content: string;
  language: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  files?: TemplateFile[];
}

const iconMap: Record<string, React.ReactNode> = {
  Globe: <Globe className="h-8 w-8" />,
  MessageSquare: <MessageSquare className="h-8 w-8" />,
  Server: <Server className="h-8 w-8" />,
  Layout: <Layout className="h-8 w-8" />,
  Terminal: <Terminal className="h-8 w-8" />,
};

const difficultyColors = {
  beginner: "bg-green-500/20 text-green-400 border-green-500/30",
  intermediate: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  advanced: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function QuickStartPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<TemplateFile[]>([]);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    try {
      const res = await fetch("/api/templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectTemplate(template: Template) {
    setSelectedTemplate(template);
    setGeneratedFiles([]);
    setInstructions([]);
    setActiveFile(0);
  }

  async function handleGenerate() {
    if (!selectedTemplate) return;

    setGenerating(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplate.id }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedFiles(data.files);
        setInstructions(data.instructions);
      }
    } catch (error) {
      console.error("Failed to generate:", error);
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
      jsx: "javascript",
      typescript: "typescript",
      tsx: "typescript",
      python: "python",
      json: "json",
      html: "html",
      css: "css",
      text: "plaintext",
    };
    return map[lang] || "plaintext";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Rocket className="h-8 w-8 text-purple-500" />
        <div>
          <h1 className="text-2xl font-bold">Quick Start</h1>
          <p className="text-muted-foreground">
            Choose a template to get started quickly with a new project
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <Card
            key={template.id}
            className="cursor-pointer hover:border-purple-500/50 transition-colors"
            onClick={() => handleSelectTemplate(template)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
                  {iconMap[template.icon] || <Sparkles className="h-8 w-8" />}
                </div>
                <Badge className={difficultyColors[template.difficulty]}>
                  {template.difficulty}
                </Badge>
              </div>
              <CardTitle className="mt-4">{template.name}</CardTitle>
              <CardDescription>{template.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {template.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                {selectedTemplate && iconMap[selectedTemplate.icon]}
              </div>
              {selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription>{selectedTemplate?.description}</DialogDescription>
          </DialogHeader>

          {generatedFiles.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground mb-6">
                This template includes {selectedTemplate?.tags.join(", ")}. Click below to generate
                the project files.
              </p>
              <Button onClick={handleGenerate} disabled={generating} size="lg">
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
          ) : (
            <Tabs defaultValue="files" className="flex-1 overflow-hidden flex flex-col">
              <TabsList>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="instructions">Instructions</TabsTrigger>
              </TabsList>

              <TabsContent value="files" className="flex-1 overflow-hidden flex flex-col mt-4">
                <div className="flex gap-2 mb-2 flex-wrap">
                  {generatedFiles.map((file, idx) => (
                    <Button
                      key={file.path}
                      variant={activeFile === idx ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveFile(idx)}
                    >
                      {file.path}
                    </Button>
                  ))}
                </div>

                <div className="flex-1 border rounded-lg overflow-hidden relative min-h-[300px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 z-10"
                    onClick={() => copyToClipboard(generatedFiles[activeFile]?.content || "")}
                  >
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
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
                    }}
                  />
                </div>
              </TabsContent>

              <TabsContent value="instructions" className="space-y-4 mt-4">
                <div className="bg-muted/50 rounded-lg p-6">
                  <h3 className="font-semibold mb-4">Getting Started</h3>
                  <ol className="space-y-3">
                    {instructions.map((instruction, idx) => (
                      <li key={idx} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">
                          {idx + 1}
                        </span>
                        <span className="text-muted-foreground">{instruction.replace(/^\d+\.\s*/, "")}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
