"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Bot,
  User,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Square,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Terminal,
  Search,
  FileText,
  GitBranch,
  Globe,
  Zap,
  Settings2,
  Sparkles,
  Code2,
  FolderOpen,
  HardDrive,
  Cloud,
  Shield,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface AgentStep {
  type: "thinking" | "tool_call" | "tool_result" | "response" | "approval_needed";
  content: string;
  toolCall?: { tool: string; parameters: Record<string, any> };
  toolResult?: { success: boolean; output: string; error?: string };
  timestamp: Date;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  steps?: AgentStep[];
  toolsUsed?: string[];
  provider?: string;
  model?: string;
  pendingApprovals?: any[];
}

const toolIcons: Record<string, any> = {
  search_codebase: Search,
  list_files: FolderOpen,
  read_file: FileText,
  write_file: FileText,
  edit_file: Code2,
  run_command: Terminal,
  web_search: Globe,
  git_status: GitBranch,
  git_diff: GitBranch,
};

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<string>("auto");
  const [model, setModel] = useState<string>("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis;
      
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        
        recognitionRef.current.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join("");
          setInput(transcript);
        };

        recognitionRef.current.onerror = () => {
          setIsListening(false);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition not supported in your browser. Try Chrome or Edge.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setInput("");
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const speak = useCallback((text: string) => {
    if (!synthRef.current || !voiceEnabled) return;
    
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    synthRef.current.speak(utterance);
  }, [voiceEnabled]);

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    try {
      const response = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: currentInput,
          provider,
          model: model || undefined,
          autoApprove,
        }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || data.error || "Something went wrong",
        timestamp: new Date(),
        steps: data.steps,
        toolsUsed: data.toolsUsed,
        provider: data.provider,
        model: data.model,
        pendingApprovals: data.pendingApprovals,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (voiceEnabled && data.response) {
        const cleanText = data.response.replace(/```[\s\S]*?```/g, "").slice(0, 500);
        speak(cleanText);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Failed to execute agent request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStepExpand = (messageId: string, stepIndex: number) => {
    const key = `${messageId}-${stepIndex}`;
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getStepIcon = (step: AgentStep) => {
    if (step.type === "thinking") return Sparkles;
    if (step.type === "approval_needed") return Shield;
    if (step.toolCall) {
      return toolIcons[step.toolCall.tool] || Terminal;
    }
    return CheckCircle2;
  };

  const getStepColor = (step: AgentStep) => {
    if (step.type === "approval_needed") return "text-yellow-500";
    if (step.toolResult?.success === false) return "text-red-500";
    if (step.toolResult?.success === true) return "text-green-500";
    if (step.type === "thinking") return "text-purple-500";
    return "text-blue-500";
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      <div className="flex-1 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
              >
                <Zap className="h-8 w-8 text-yellow-500" />
              </motion.div>
              AI Agent
            </h1>
            <p className="text-muted-foreground">
              Autonomous coding assistant with tool execution
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="voice"
                checked={voiceEnabled}
                onCheckedChange={setVoiceEnabled}
              />
              <Label htmlFor="voice" className="text-sm">Voice</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="auto-approve"
                checked={autoApprove}
                onCheckedChange={setAutoApprove}
              />
              <Label htmlFor="auto-approve" className="text-sm">Auto-approve</Label>
            </div>

            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Auto
                  </div>
                </SelectItem>
                <SelectItem value="ollama">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-green-500" />
                    Ollama (Local)
                  </div>
                </SelectItem>
                <SelectItem value="openai">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-blue-500" />
                    OpenAI
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium">Start a conversation</h3>
                <p className="text-muted-foreground text-sm max-w-md mt-2">
                  I can search your codebase, read and edit files, run commands, 
                  and research documentation. Just tell me what you need!
                </p>
                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                  {[
                    "Search for all API routes",
                    "Find and fix TypeScript errors",
                    "Create a new React component",
                    "Run the test suite",
                  ].map((prompt) => (
                    <Button
                      key={prompt}
                      variant="outline"
                      size="sm"
                      onClick={() => setInput(prompt)}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center shrink-0">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                  )}

                  <div className={cn(
                    "max-w-[85%] space-y-2",
                    message.role === "user" ? "items-end" : "items-start"
                  )}>
                    <div
                      className={cn(
                        "rounded-2xl p-4",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/50"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>

                    {message.steps && message.steps.length > 0 && (
                      <div className="space-y-1 mt-2">
                        <p className="text-xs text-muted-foreground font-medium mb-1">
                          Execution Steps ({message.steps.length})
                        </p>
                        {message.steps.map((step, i) => {
                          const Icon = getStepIcon(step);
                          const isExpanded = expandedSteps.has(`${message.id}-${i}`);
                          return (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className="bg-background/50 rounded-lg border text-sm"
                            >
                              <button
                                onClick={() => toggleStepExpand(message.id, i)}
                                className="w-full flex items-center gap-2 p-2 hover:bg-accent/50 rounded-lg transition-colors"
                              >
                                <Icon className={cn("h-4 w-4", getStepColor(step))} />
                                <span className="flex-1 text-left truncate">
                                  {step.toolCall?.tool || step.type}
                                </span>
                                {step.toolResult && (
                                  step.toolResult.success
                                    ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                                    : <XCircle className="h-3 w-3 text-red-500" />
                                )}
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="p-2 pt-0 space-y-2">
                                      {step.toolCall && (
                                        <pre className="text-xs bg-black/50 p-2 rounded overflow-x-auto">
                                          {JSON.stringify(step.toolCall.parameters, null, 2)}
                                        </pre>
                                      )}
                                      {step.toolResult && (
                                        <pre className={cn(
                                          "text-xs p-2 rounded overflow-x-auto max-h-48",
                                          step.toolResult.success ? "bg-green-500/10" : "bg-red-500/10"
                                        )}>
                                          {step.toolResult.error || step.toolResult.output || "No output"}
                                        </pre>
                                      )}
                                      {step.type === "thinking" && (
                                        <p className="text-xs text-muted-foreground">{step.content}</p>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}

                    {message.toolsUsed && message.toolsUsed.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {message.toolsUsed.map((tool) => (
                          <Badge key={tool} variant="secondary" className="text-xs">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {message.provider && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span>{message.timestamp.toLocaleTimeString()}</span>
                        <Badge variant="outline" className="text-xs">
                          {message.provider} {message.model && `• ${message.model}`}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {message.role === "user" && (
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <User className="h-5 w-5" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                </div>
                <div className="bg-secondary/50 rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Agent is working...</span>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t p-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Textarea
                  placeholder="Ask the agent to search code, edit files, run commands..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={isLoading}
                  className="min-h-[60px] pr-20 resize-none"
                  rows={2}
                />
                {isListening && (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="absolute right-14 top-1/2 -translate-y-1/2"
                  >
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                  </motion.div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <Button
                  variant={isListening ? "destructive" : "outline"}
                  size="icon"
                  onClick={toggleListening}
                  disabled={isLoading}
                >
                  {isListening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>

                <Button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  size="icon"
                  className="bg-gradient-to-r from-yellow-500 to-orange-600"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span>Enter to send • Shift+Enter for new line</span>
                {isSpeaking && (
                  <Button variant="ghost" size="sm" onClick={stopSpeaking} className="h-6 text-xs">
                    <VolumeX className="h-3 w-3 mr-1" />
                    Stop speaking
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {autoApprove ? (
                  <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/50">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Auto-approve ON
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-green-500 border-green-500/50">
                    <Shield className="h-3 w-3 mr-1" />
                    Safe mode
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="w-72 hidden xl:block">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Available Tools
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            { icon: Search, name: "search_codebase", desc: "Search code" },
            { icon: FolderOpen, name: "list_files", desc: "List directory" },
            { icon: FileText, name: "read_file", desc: "Read file" },
            { icon: Code2, name: "edit_file", desc: "Edit file", approval: true },
            { icon: Terminal, name: "run_command", desc: "Run command", approval: true },
            { icon: Globe, name: "web_search", desc: "Web search" },
            { icon: GitBranch, name: "git_status", desc: "Git status" },
          ].map((tool) => (
            <div
              key={tool.name}
              className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30"
            >
              <tool.icon className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium text-xs">{tool.name}</p>
                <p className="text-xs text-muted-foreground">{tool.desc}</p>
              </div>
              {tool.approval && (
                <Shield className="h-3 w-3 text-yellow-500" />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
