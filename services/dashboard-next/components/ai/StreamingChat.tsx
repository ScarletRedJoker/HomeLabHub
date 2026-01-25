'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAIStream, StreamStatus } from '@/hooks/use-ai-stream';
import { useToast } from '@/components/ui/use-toast';
import type { ChatMessage } from '@/lib/ai/types';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  provider?: string;
  model?: string;
  isStreaming?: boolean;
}

interface StreamingChatProps {
  className?: string;
  title?: string;
  placeholder?: string;
  initialMessages?: Message[];
  systemPrompt?: string;
  onMessageSent?: (message: string) => void;
  onResponseComplete?: (response: string) => void;
  maxRetries?: number;
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <span className="text-sm">AI is thinking...</span>
    </div>
  );
}

function StatusBadge({ status, message }: { status: StreamStatus; message?: string }) {
  const statusConfig: Record<StreamStatus, { color: string; label: string }> = {
    idle: { color: 'bg-muted', label: 'Ready' },
    connecting: { color: 'bg-yellow-500', label: 'Connecting' },
    thinking: { color: 'bg-blue-500', label: 'Thinking' },
    streaming: { color: 'bg-green-500', label: 'Streaming' },
    retrying: { color: 'bg-orange-500', label: 'Retrying' },
    error: { color: 'bg-red-500', label: 'Error' },
    complete: { color: 'bg-green-500', label: 'Complete' },
  };

  const config = statusConfig[status];

  if (status === 'idle' || status === 'complete') return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn('w-2 h-2 rounded-full animate-pulse', config.color)} />
      <span className="text-muted-foreground">{message || config.label}</span>
    </div>
  );
}

function MessageBubble({ message, isTyping }: { message: Message; isTyping?: boolean }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex w-full mb-4', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        {message.isStreaming && !message.content ? (
          <ThinkingIndicator />
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {message.content}
            {isTyping && <span className="inline-block w-1 h-4 ml-0.5 bg-current animate-pulse" />}
          </div>
        )}
        {!isUser && message.provider && message.content && (
          <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
            {message.provider}{message.model ? ` · ${message.model}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

export function StreamingChat({
  className,
  title = 'AI Chat',
  placeholder = 'Type a message...',
  initialMessages = [],
  systemPrompt,
  onMessageSent,
  onResponseComplete,
  maxRetries = 3,
}: StreamingChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const {
    streamMessage,
    isStreaming,
    content: streamingContent,
    error,
    status,
    statusMessage,
    cancel,
    reset,
    retryCount,
    provider,
    model,
  } = useAIStream({
    maxRetries,
    onChunk: () => {
      scrollToBottom();
    },
    onComplete: (fullText) => {
      setMessages((prev) => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage?.role === 'assistant') {
          lastMessage.content = fullText;
          lastMessage.isStreaming = false;
          lastMessage.provider = provider || undefined;
          lastMessage.model = model || undefined;
        }
        return updated;
      });
      onResponseComplete?.(fullText);
    },
    onError: (err) => {
      setMessages((prev) => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage?.role === 'assistant' && !lastMessage.content) {
          updated.pop();
        } else if (lastMessage?.role === 'assistant') {
          lastMessage.isStreaming = false;
        }
        return updated;
      });
      toast({
        title: 'Connection Error',
        description: err.message,
        variant: 'destructive',
      });
    },
    onStatusChange: (newStatus, message) => {
      if (newStatus === 'retrying') {
        toast({
          title: 'Connection Lost',
          description: message || `Retrying... (attempt ${retryCount + 1}/${maxRetries})`,
        });
      }
    },
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  useEffect(() => {
    if (isStreaming && streamingContent) {
      setMessages((prev) => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.isStreaming) {
          lastMessage.content = streamingContent;
        }
        return updated;
      });
    }
  }, [isStreaming, streamingContent]);

  const handleSend = useCallback(async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isStreaming) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    };

    const assistantMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInputValue('');
    onMessageSent?.(trimmedInput);

    const chatHistory: ChatMessage[] = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    if (systemPrompt) {
      chatHistory.unshift({ role: 'system', content: systemPrompt });
    }

    chatHistory.push({ role: 'user', content: trimmedInput });

    await streamMessage(chatHistory);
  }, [inputValue, isStreaming, messages, systemPrompt, onMessageSent, streamMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleRetry = useCallback(() => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMessage) return;

    setMessages((prev) => {
      const updated = [...prev];
      const lastMessage = updated[updated.length - 1];
      if (lastMessage?.role === 'assistant') {
        updated.pop();
      }
      return updated;
    });

    reset();
    
    const userIdx = messages.findIndex((m) => m.id === lastUserMessage.id);
    const historyMessages = messages.slice(0, userIdx);
    
    const chatHistory: ChatMessage[] = historyMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    if (systemPrompt) {
      chatHistory.unshift({ role: 'system', content: systemPrompt });
    }

    chatHistory.push({ role: 'user', content: lastUserMessage.content });

    const assistantMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, assistantMessage]);
    streamMessage(chatHistory);
  }, [messages, systemPrompt, reset, streamMessage]);

  const handleCancel = useCallback(() => {
    cancel();
    setMessages((prev) => {
      const updated = [...prev];
      const lastMessage = updated[updated.length - 1];
      if (lastMessage?.role === 'assistant') {
        if (!lastMessage.content) {
          updated.pop();
        } else {
          lastMessage.isStreaming = false;
        }
      }
      return updated;
    });
  }, [cancel]);

  const handleClear = useCallback(() => {
    cancel();
    setMessages([]);
    reset();
  }, [cancel, reset]);

  return (
    <Card className={cn('flex flex-col h-[600px]', className)}>
      <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} message={statusMessage} />
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={isStreaming}>
              Clear
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>Start a conversation with the AI assistant</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isTyping={message.isStreaming && status === 'streaming'}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </CardContent>

      {error && (
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <span>{error.message}</span>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </div>
        </div>
      )}

      <CardFooter className="flex-shrink-0 p-4 pt-2 border-t">
        <div className="flex w-full gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isStreaming}
            className="flex-1"
          />
          {isStreaming ? (
            <Button variant="destructive" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <Button onClick={handleSend} disabled={!inputValue.trim()}>
              Send
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

export default StreamingChat;
