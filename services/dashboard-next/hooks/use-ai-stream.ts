'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage } from '@/lib/ai/types';
import type { SSEChunk } from '@/lib/ai/streaming';

export type StreamStatus = 
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'thinking'
  | 'retrying'
  | 'error'
  | 'complete';

export interface UseAIStreamOptions {
  onChunk?: (chunk: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: StreamStatus, message?: string) => void;
  maxRetries?: number;
  retryDelayMs?: number;
  endpoint?: string;
}

export interface UseAIStreamReturn {
  streamMessage: (messages: ChatMessage[]) => Promise<void>;
  isStreaming: boolean;
  content: string;
  error: Error | null;
  status: StreamStatus;
  statusMessage: string;
  cancel: () => void;
  reset: () => void;
  retryCount: number;
  provider: string | null;
  model: string | null;
}

export function useAIStream(options: UseAIStreamOptions = {}): UseAIStreamReturn {
  const {
    onChunk,
    onComplete,
    onError,
    onStatusChange,
    maxRetries = 3,
    retryDelayMs = 1000,
    endpoint = '/api/ai/chat',
  } = options;

  const [isStreaming, setIsStreaming] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const partialContentRef = useRef('');
  const messagesRef = useRef<ChatMessage[]>([]);

  const updateStatus = useCallback((newStatus: StreamStatus, message = '') => {
    setStatus(newStatus);
    setStatusMessage(message);
    onStatusChange?.(newStatus, message);
  }, [onStatusChange]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
    updateStatus('idle');
  }, [updateStatus]);

  const reset = useCallback(() => {
    cancel();
    setContent('');
    setError(null);
    setRetryCount(0);
    setProvider(null);
    setModel(null);
    partialContentRef.current = '';
  }, [cancel]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const streamMessage = useCallback(async (messages: ChatMessage[]) => {
    messagesRef.current = messages;
    abortControllerRef.current?.abort();
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsStreaming(true);
    setError(null);
    setContent('');
    partialContentRef.current = '';
    setRetryCount(0);

    let currentRetry = 0;
    let accumulatedContent = '';

    const attemptStream = async (): Promise<void> => {
      if (controller.signal.aborted) return;

      try {
        updateStatus(currentRetry > 0 ? 'retrying' : 'connecting', 
          currentRetry > 0 ? `Reconnecting... (attempt ${currentRetry + 1}/${maxRetries})` : 'Connecting to AI...');

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            message: messages[messages.length - 1]?.content || '',
            history: messages.slice(0, -1),
            stream: true,
            provider: 'auto',
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        updateStatus('thinking', 'AI is thinking...');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let hasReceivedContent = false;

        try {
          while (true) {
            if (controller.signal.aborted) break;

            const { value, done } = await reader.read();
            
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              
              const data = line.slice(6).trim();
              
              if (data === '[DONE]') {
                updateStatus('complete');
                onComplete?.(accumulatedContent);
                return;
              }

              try {
                const chunk: SSEChunk = JSON.parse(data);

                if (chunk.error) {
                  throw new Error(chunk.error);
                }

                if (chunk.provider && !provider) {
                  setProvider(chunk.provider);
                }
                if (chunk.model && !model) {
                  setModel(chunk.model);
                }

                if (chunk.toolExecuting) {
                  updateStatus('thinking', 'Executing tool...');
                  continue;
                }

                if (chunk.content) {
                  if (!hasReceivedContent) {
                    hasReceivedContent = true;
                    updateStatus('streaming');
                  }
                  
                  accumulatedContent += chunk.content;
                  partialContentRef.current = accumulatedContent;
                  setContent(accumulatedContent);
                  onChunk?.(chunk.content);
                }

                if (chunk.done) {
                  updateStatus('complete');
                  onComplete?.(accumulatedContent);
                  return;
                }
              } catch (parseError) {
                console.warn('[useAIStream] Parse error:', parseError);
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        if (accumulatedContent) {
          updateStatus('complete');
          onComplete?.(accumulatedContent);
        } else {
          throw new Error('Stream ended without content');
        }

      } catch (err: any) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          updateStatus('idle');
          return;
        }

        console.error('[useAIStream] Stream error:', err);
        
        accumulatedContent = partialContentRef.current;

        if (currentRetry < maxRetries - 1) {
          currentRetry++;
          setRetryCount(currentRetry);
          
          const delay = retryDelayMs * Math.pow(2, currentRetry - 1);
          updateStatus('retrying', `Connection lost. Retrying in ${Math.round(delay / 1000)}s... (${currentRetry}/${maxRetries})`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          
          if (!controller.signal.aborted) {
            return attemptStream();
          }
        } else {
          const streamError = new Error(err.message || 'Stream failed after retries');
          setError(streamError);
          updateStatus('error', err.message || 'Connection failed');
          onError?.(streamError);
        }
      }
    };

    try {
      await attemptStream();
    } finally {
      setIsStreaming(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [endpoint, maxRetries, retryDelayMs, onChunk, onComplete, onError, updateStatus, provider, model]);

  return {
    streamMessage,
    isStreaming,
    content,
    error,
    status,
    statusMessage,
    cancel,
    reset,
    retryCount,
    provider,
    model,
  };
}
