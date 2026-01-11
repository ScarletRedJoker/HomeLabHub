"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
  Sparkles,
  Server,
  Globe,
  Code2,
  Loader2,
  Copy,
  Check,
  Cloud,
  HardDrive,
  Zap,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  provider?: string;
  model?: string;
  codeBlocks?: { language: string; code: string }[];
}

interface Provider {
  id: string;
  name: string;
  description: string;
  models: string[];
  available: boolean;
  type: "cloud" | "local";
}

const suggestedPrompts = [
  { icon: Server, text: "Check server status", color: "text-blue-500" },
  { icon: Globe, text: "Create a new portfolio website", color: "text-green-500" },
  { icon: Code2, text: "Debug the stream bot OAuth issue", color: "text-orange-500" },
  { icon: Sparkles, text: "Generate a REST API for user management", color: "text-purple-500" },
];

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm Jarvis, your AI assistant for Nebula Command. I can help you manage services, create websites, debug issues, and generate code. What would you like to do?",
      timestamp: new Date(),
      provider: "system",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("auto");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [streamingContent, setStreamingContent] = useState("");
  const [loadingProviders, setLoadingProviders] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch("/api/ai/chat");
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
        if (data.defaultProvider) {
          setSelectedProvider(data.defaultProvider);
        }
      }
    } catch (error) {
      console.error("Failed to fetch providers:", error);
    } finally {
      setLoadingProviders(false);
    }
  };

  const getAvailableModels = useCallback(() => {
    if (selectedProvider === "auto") {
      const allModels: string[] = [];
      providers.forEach(p => {
        if (p.available) {
          allModels.push(...p.models.slice(0, 2));
        }
      });
      return allModels;
    }
    const provider = providers.find(p => p.id === selectedProvider);
    return provider?.models || [];
  }, [selectedProvider, providers]);

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
    setStreamingContent("");

    try {
      const history = messages
        .filter(m => m.role !== "assistant" || m.id !== "1")
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: currentInput,
          history,
          provider: selectedProvider,
          model: selectedModel || undefined,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const contentType = response.headers.get("content-type");
      
      if (contentType?.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let provider = "";
        let model = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                  setStreamingContent(fullContent);
                }
                if (parsed.provider) provider = parsed.provider;
                if (parsed.model) model = parsed.model;
              } catch {
              }
            }
          }
        }

        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        const codeBlocks: { language: string; code: string }[] = [];
        let match;
        while ((match = codeBlockRegex.exec(fullContent)) !== null) {
          codeBlocks.push({
            language: match[1] || "plaintext",
            code: match[2].trim(),
          });
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: fullContent,
          timestamp: new Date(),
          provider,
          model,
          codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingContent("");
      } else {
        const data = await response.json();

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response || "I apologize, but I encountered an issue processing your request.",
          timestamp: new Date(),
          provider: data.provider,
          model: data.model,
          codeBlocks: data.codeBlocks,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I apologize, but I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSuggestedPrompt = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const clearChat = () => {
    setMessages([
      {
        id: "1",
        role: "assistant",
        content: "Hello! I'm Jarvis, your AI assistant for Nebula Command. I can help you manage services, create websites, debug issues, and generate code. What would you like to do?",
        timestamp: new Date(),
        provider: "system",
      },
    ]);
  };

  const getProviderIcon = (type: string) => {
    return type === "local" ? HardDrive : Cloud;
  };

  const currentProvider = providers.find(p => p.id === selectedProvider);
  const availableModels = getAvailableModels();

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            >
              <Bot className="h-8 w-8 text-primary" />
            </motion.div>
            Jarvis AI
          </h1>
          <p className="text-muted-foreground">
            Your intelligent assistant for homelab management
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Auto (Best)
                  </div>
                </SelectItem>
                {providers.map(provider => {
                  const Icon = getProviderIcon(provider.type);
                  return (
                    <SelectItem key={provider.id} value={provider.id} disabled={!provider.available}>
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", provider.type === "local" ? "text-green-500" : "text-blue-500")} />
                        {provider.name}
                        {!provider.available && <AlertCircle className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {availableModels.length > 0 && (
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Default model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Default</SelectItem>
                  {availableModels.map(model => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button variant="outline" size="icon" onClick={fetchProviders} disabled={loadingProviders}>
            <RefreshCw className={cn("h-4 w-4", loadingProviders && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {providers.map(provider => {
          const Icon = getProviderIcon(provider.type);
          return (
            <motion.div
              key={provider.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
                provider.available
                  ? "bg-green-500/10 text-green-500 border border-green-500/20"
                  : "bg-muted text-muted-foreground border border-border"
              )}
            >
              <Icon className="h-3 w-3" />
              {provider.name}
              {provider.available ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
            </motion.div>
          );
        })}
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border-2">
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <motion.div 
                    className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shrink-0 shadow-lg"
                    whileHover={{ scale: 1.1 }}
                  >
                    <Bot className="h-5 w-5 text-primary-foreground" />
                  </motion.div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl p-4 shadow-md",
                    message.role === "user"
                      ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
                      : "bg-secondary/50 backdrop-blur"
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  {message.codeBlocks?.map((block, i) => (
                    <div key={i} className="mt-3 rounded-lg bg-black/80 overflow-hidden border border-white/10">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
                        <span className="text-xs font-mono text-muted-foreground">
                          {block.language}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs hover:bg-white/10"
                          onClick={() => handleCopy(block.code, `${message.id}-${i}`)}
                        >
                          {copiedId === `${message.id}-${i}` ? (
                            <>
                              <Check className="h-3 w-3 mr-1 text-green-500" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>
                      <pre className="p-4 text-sm overflow-x-auto">
                        <code className="text-green-400">{block.code}</code>
                      </pre>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 mt-2">
                    <p className="text-xs opacity-50">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                    {message.provider && message.provider !== "system" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {message.provider} {message.model && `• ${message.model}`}
                      </span>
                    )}
                  </div>
                </div>
                {message.role === "user" && (
                  <motion.div 
                    className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0"
                    whileHover={{ scale: 1.1 }}
                  >
                    <User className="h-5 w-5" />
                  </motion.div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {(isLoading || streamingContent) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shrink-0 shadow-lg">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="bg-secondary/50 backdrop-blur rounded-2xl p-4 max-w-[80%]">
                {streamingContent ? (
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {streamingContent}
                    <motion.span
                      animate={{ opacity: [1, 0] }}
                      transition={{ repeat: Infinity, duration: 0.8 }}
                      className="inline-block w-2 h-4 bg-primary ml-1"
                    />
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {messages.length === 1 && !isLoading && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 pb-4"
          >
            <p className="text-sm text-muted-foreground mb-3">
              Try one of these:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {suggestedPrompts.map((prompt, i) => (
                <motion.div
                  key={i}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto py-3 hover:border-primary/50 transition-all"
                    onClick={() => handleSuggestedPrompt(prompt.text)}
                  >
                    <prompt.icon className={cn("mr-2 h-4 w-4", prompt.color)} />
                    <span className="text-sm">{prompt.text}</span>
                  </Button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        <div className="border-t p-4 bg-background/50 backdrop-blur">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Ask Jarvis anything... 'Deploy stream bot', 'Create new portfolio site'"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              disabled={isLoading}
              className="flex-1 h-12 text-base"
            />
            <Button 
              onClick={handleSend} 
              disabled={isLoading || !input.trim()}
              size="lg"
              className="px-6 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>Press Enter to send • Shift+Enter for new line</span>
            {messages.length > 1 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearChat}>
                Clear chat
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
