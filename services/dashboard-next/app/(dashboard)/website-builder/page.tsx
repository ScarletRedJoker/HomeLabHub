"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Eye,
  Code2,
  Save,
  Undo2,
  Redo2,
  History,
  Smartphone,
  Tablet,
  Monitor,
  Download,
  Upload,
  Palette,
  Layout,
  Type,
  Image as ImageIcon,
  Box,
  Sparkles,
  RefreshCw,
  Check,
  X,
  Clock,
  Globe,
  FileCode,
  Layers,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false }
);

interface Version {
  id: string;
  timestamp: Date;
  html: string;
  css: string;
  js: string;
  label?: string;
}

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website</title>
</head>
<body>
  <header class="hero">
    <nav class="navbar">
      <div class="logo">MyBrand</div>
      <ul class="nav-links">
        <li><a href="#home">Home</a></li>
        <li><a href="#about">About</a></li>
        <li><a href="#services">Services</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
    </nav>
    <div class="hero-content">
      <h1>Welcome to My Website</h1>
      <p>Build something amazing today</p>
      <button class="cta-button">Get Started</button>
    </div>
  </header>
  
  <section class="features">
    <div class="feature-card">
      <div class="icon">⚡</div>
      <h3>Fast</h3>
      <p>Lightning fast performance</p>
    </div>
    <div class="feature-card">
      <div class="icon">🎨</div>
      <h3>Beautiful</h3>
      <p>Stunning modern design</p>
    </div>
    <div class="feature-card">
      <div class="icon">🔒</div>
      <h3>Secure</h3>
      <p>Enterprise-grade security</p>
    </div>
  </section>
  
  <footer>
    <p>&copy; 2025 MyBrand. All rights reserved.</p>
  </footer>
</body>
</html>`;

const DEFAULT_CSS = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  line-height: 1.6;
  color: #333;
}

.hero {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  color: white;
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 5%;
}

.logo {
  font-size: 1.8rem;
  font-weight: bold;
}

.nav-links {
  display: flex;
  list-style: none;
  gap: 2rem;
}

.nav-links a {
  color: white;
  text-decoration: none;
  transition: opacity 0.3s;
}

.nav-links a:hover {
  opacity: 0.8;
}

.hero-content {
  text-align: center;
  padding: 10rem 2rem;
}

.hero-content h1 {
  font-size: 3.5rem;
  margin-bottom: 1rem;
  animation: fadeInUp 0.8s ease-out;
}

.hero-content p {
  font-size: 1.3rem;
  opacity: 0.9;
  margin-bottom: 2rem;
}

.cta-button {
  background: white;
  color: #667eea;
  border: none;
  padding: 1rem 2.5rem;
  font-size: 1.1rem;
  border-radius: 50px;
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
}

.cta-button:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
}

.features {
  display: flex;
  justify-content: center;
  gap: 2rem;
  padding: 5rem 2rem;
  background: #f8f9fa;
  flex-wrap: wrap;
}

.feature-card {
  background: white;
  padding: 2.5rem;
  border-radius: 16px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  transition: transform 0.3s;
  max-width: 280px;
}

.feature-card:hover {
  transform: translateY(-5px);
}

.feature-card .icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.feature-card h3 {
  margin-bottom: 0.5rem;
  color: #667eea;
}

footer {
  background: #2d3748;
  color: white;
  text-align: center;
  padding: 2rem;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}`;

const DEFAULT_JS = `// Add interactivity here
document.addEventListener('DOMContentLoaded', function() {
  const ctaButton = document.querySelector('.cta-button');
  
  ctaButton?.addEventListener('click', function() {
    alert('Welcome! Let\\'s get started.');
  });
  
  // Smooth scroll for navigation
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      target?.scrollIntoView({ behavior: 'smooth' });
    });
  });
});`;

type ViewportSize = "desktop" | "tablet" | "mobile";

export default function WebsiteBuilderPage() {
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [css, setCss] = useState(DEFAULT_CSS);
  const [js, setJs] = useState(DEFAULT_JS);
  const [activeTab, setActiveTab] = useState("html");
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [versions, setVersions] = useState<Version[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [projectName, setProjectName] = useState("My Website");
  const [showHistory, setShowHistory] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const viewportWidths = {
    desktop: "100%",
    tablet: "768px",
    mobile: "375px",
  };

  const generatePreview = useCallback(() => {
    const previewContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>${css}</style>
        </head>
        <body>
          ${html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, "")}
          <script>${js}<\/script>
        </body>
      </html>
    `;
    return previewContent;
  }, [html, css, js]);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(generatePreview());
        doc.close();
      }
    }
  }, [generatePreview]);

  useEffect(() => {
    if (autoSave) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        handleAutoSave();
      }, 30000);
    }
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [html, css, js, autoSave]);

  const handleAutoSave = async () => {
    const newVersion: Version = {
      id: Date.now().toString(),
      timestamp: new Date(),
      html,
      css,
      js,
      label: "Auto-save",
    };
    setVersions((prev) => [...prev.slice(-49), newVersion]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/website-builder/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          html,
          css,
          js,
        }),
      });

      const newVersion: Version = {
        id: Date.now().toString(),
        timestamp: new Date(),
        html,
        css,
        js,
        label: "Manual save",
      };
      setVersions((prev) => [...prev, newVersion]);
      setCurrentVersionIndex(versions.length);
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = (version: Version) => {
    setHtml(version.html);
    setCss(version.css);
    setJs(version.js);
    setShowHistory(false);
  };

  const handleUndo = () => {
    if (currentVersionIndex > 0) {
      const prevVersion = versions[currentVersionIndex - 1];
      setHtml(prevVersion.html);
      setCss(prevVersion.css);
      setJs(prevVersion.js);
      setCurrentVersionIndex(currentVersionIndex - 1);
    }
  };

  const handleRedo = () => {
    if (currentVersionIndex < versions.length - 1) {
      const nextVersion = versions[currentVersionIndex + 1];
      setHtml(nextVersion.html);
      setCss(nextVersion.css);
      setJs(nextVersion.js);
      setCurrentVersionIndex(currentVersionIndex + 1);
    }
  };

  const handleExport = () => {
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
  <style>
${css}
  </style>
</head>
<body>
${html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, "")}
  <script>
${js}
  </script>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, "-")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-48 h-8 font-medium"
              />
            </div>
            <Badge variant="outline" className="text-xs">
              {versions.length} versions
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-lg p-1">
              <Button
                variant={viewport === "desktop" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewport("desktop")}
              >
                <Monitor className="h-4 w-4" />
              </Button>
              <Button
                variant={viewport === "tablet" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewport("tablet")}
              >
                <Tablet className="h-4 w-4" />
              </Button>
              <Button
                variant={viewport === "mobile" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewport("mobile")}
              >
                <Smartphone className="h-4 w-4" />
              </Button>
            </div>

            <div className="h-6 w-px bg-border" />

            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              disabled={currentVersionIndex <= 0}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRedo}
              disabled={currentVersionIndex >= versions.length - 1}
            >
              <Redo2 className="h-4 w-4" />
            </Button>

            <Dialog open={showHistory} onOpenChange={setShowHistory}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <History className="h-4 w-4 mr-1" />
                  History
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Version History</DialogTitle>
                </DialogHeader>
                <div className="max-h-96 overflow-auto space-y-2">
                  {versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No versions saved yet
                    </p>
                  ) : (
                    versions
                      .slice()
                      .reverse()
                      .map((version) => (
                        <div
                          key={version.id}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {version.label || "Version"}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {version.timestamp.toLocaleString()}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRevert(version)}
                          >
                            Revert
                          </Button>
                        </div>
                      ))
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <div className="h-6 w-px bg-border" />

            <Button variant="ghost" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-gradient-to-r from-green-500 to-emerald-600"
            >
              {isSaving ? (
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              ) : showSuccess ? (
                <Check className="h-4 w-4 mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              {showSuccess ? "Saved!" : "Save"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 border-r flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="border-b px-4">
              <TabsList className="h-10">
                <TabsTrigger value="html" className="gap-1.5">
                  <FileCode className="h-3.5 w-3.5" />
                  HTML
                </TabsTrigger>
                <TabsTrigger value="css" className="gap-1.5">
                  <Palette className="h-3.5 w-3.5" />
                  CSS
                </TabsTrigger>
                <TabsTrigger value="js" className="gap-1.5">
                  <Code2 className="h-3.5 w-3.5" />
                  JavaScript
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1">
              <TabsContent value="html" className="h-full m-0">
                <MonacoEditor
                  height="100%"
                  defaultLanguage="html"
                  value={html}
                  onChange={(value) => setHtml(value || "")}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: "on",
                    lineNumbers: "on",
                    folding: true,
                    automaticLayout: true,
                  }}
                />
              </TabsContent>
              <TabsContent value="css" className="h-full m-0">
                <MonacoEditor
                  height="100%"
                  defaultLanguage="css"
                  value={css}
                  onChange={(value) => setCss(value || "")}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: "on",
                    lineNumbers: "on",
                    folding: true,
                    automaticLayout: true,
                  }}
                />
              </TabsContent>
              <TabsContent value="js" className="h-full m-0">
                <MonacoEditor
                  height="100%"
                  defaultLanguage="javascript"
                  value={js}
                  onChange={(value) => setJs(value || "")}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: "on",
                    lineNumbers: "on",
                    folding: true,
                    automaticLayout: true,
                  }}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="w-1/2 bg-muted/30 flex flex-col">
          <div className="border-b px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span className="text-sm font-medium">Live Preview</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (iframeRef.current) {
                  const doc = iframeRef.current.contentDocument;
                  if (doc) {
                    doc.open();
                    doc.write(generatePreview());
                    doc.close();
                  }
                }
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <motion.div
              layout
              className="bg-white rounded-lg shadow-2xl overflow-hidden"
              style={{
                width: viewportWidths[viewport],
                height: viewport === "mobile" ? "667px" : "100%",
                maxWidth: "100%",
              }}
            >
              <iframe
                ref={iframeRef}
                className="w-full h-full border-0"
                title="Preview"
                sandbox="allow-scripts"
              />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
