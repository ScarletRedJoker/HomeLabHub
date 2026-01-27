"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
}

interface RetryState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  retryCount: number;
  isRetrying: boolean;
  lastFetchTime: Date | null;
}

interface UseRetryFetchResult<T> extends RetryState<T> {
  refetch: (force?: boolean) => Promise<T | null>;
  reset: () => void;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 2000,
  maxDelayMs: 16000,
  backoffMultiplier: 2,
  timeoutMs: 10000,
};

export function useRetryFetch<T>(
  fetchFn: () => Promise<T>,
  config: RetryConfig = {}
): UseRetryFetchResult<T> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [state, setState] = useState<RetryState<T>>({
    data: null,
    error: null,
    loading: false,
    retryCount: 0,
    isRetrying: false,
    lastFetchTime: null,
  });

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const executeWithTimeout = useCallback(
    async (fn: () => Promise<T>): Promise<T> => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, mergedConfig.timeoutMs);

      try {
        const result = await fn();
        clearTimeout(timeoutId);
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) {
          throw new Error(`Request timed out after ${mergedConfig.timeoutMs / 1000}s`);
        }
        throw error;
      }
    },
    [mergedConfig.timeoutMs]
  );

  const refetch = useCallback(
    async (force: boolean = false): Promise<T | null> => {
      cleanup();

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        retryCount: 0,
        isRetrying: false,
      }));

      let lastError: Error | null = null;
      let currentDelay = mergedConfig.initialDelayMs;

      for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            setState((prev) => ({
              ...prev,
              retryCount: attempt,
              isRetrying: true,
            }));

            await new Promise((resolve) => {
              retryTimeoutRef.current = setTimeout(resolve, currentDelay);
            });

            currentDelay = Math.min(
              currentDelay * mergedConfig.backoffMultiplier,
              mergedConfig.maxDelayMs
            );
          }

          const result = await executeWithTimeout(fetchFn);

          setState({
            data: result,
            error: null,
            loading: false,
            retryCount: attempt,
            isRetrying: false,
            lastFetchTime: new Date(),
          });

          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt === mergedConfig.maxRetries) {
            setState({
              data: null,
              error: lastError,
              loading: false,
              retryCount: attempt,
              isRetrying: false,
              lastFetchTime: new Date(),
            });
          }
        }
      }

      return null;
    },
    [fetchFn, mergedConfig, cleanup, executeWithTimeout]
  );

  const reset = useCallback(() => {
    cleanup();
    setState({
      data: null,
      error: null,
      loading: false,
      retryCount: 0,
      isRetrying: false,
      lastFetchTime: null,
    });
  }, [cleanup]);

  return {
    ...state,
    refetch,
    reset,
  };
}

export function useAutoRefresh<T>(
  fetchFn: () => Promise<T>,
  intervalMs: number = 30000,
  config: RetryConfig = {}
): UseRetryFetchResult<T> & { countdown: number; isPaused: boolean; pause: () => void; resume: () => void } {
  const result = useRetryFetch(fetchFn, config);
  const [countdown, setCountdown] = useState(intervalMs / 1000);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const clearIntervals = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startIntervals = useCallback(() => {
    if (isPaused) return;
    clearIntervals();

    setCountdown(intervalMs / 1000);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return intervalMs / 1000;
        return prev - 1;
      });
    }, 1000);

    intervalRef.current = setInterval(() => {
      result.refetch();
      setCountdown(intervalMs / 1000);
    }, intervalMs);
  }, [intervalMs, isPaused, clearIntervals, result]);

  useEffect(() => {
    result.refetch();
    startIntervals();
    return clearIntervals;
  }, []);

  useEffect(() => {
    if (isPaused) {
      clearIntervals();
    } else {
      startIntervals();
    }
  }, [isPaused, startIntervals, clearIntervals]);

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);

  return {
    ...result,
    countdown,
    isPaused,
    pause,
    resume,
  };
}
