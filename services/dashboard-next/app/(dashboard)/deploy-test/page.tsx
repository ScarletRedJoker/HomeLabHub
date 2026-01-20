"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SkipForward,
  ChevronDown,
  ChevronRight,
  Server,
  Database,
  Key,
  Brain,
  Shield,
  Loader2,
  Clock,
} from "lucide-react";

interface TestResult {
  name: string;
  status: "pass" | "fail" | "warning" | "skip";
  message: string;
  duration: number;
  details?: string;
}

interface CategoryResult {
  category: string;
  status: "pass" | "fail" | "warning" | "skip";
  tests: TestResult[];
  duration: number;
}

interface TestResponse {
  success: boolean;
  timestamp: string;
  duration: number;
  summary: {
    status: "pass" | "fail" | "warning";
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  categories: CategoryResult[];
  error?: string;
}

const categoryConfig = {
  "service-health": { icon: Server, label: "Service Health", color: "blue" },
  "database": { icon: Database, label: "Database", color: "green" },
  "oauth": { icon: Key, label: "OAuth Flows", color: "purple" },
  "ai-services": { icon: Brain, label: "AI Services", color: "orange" },
  "ssl": { icon: Shield, label: "SSL/TLS", color: "cyan" },
};

const statusIcons = {
  pass: CheckCircle2,
  fail: XCircle,
  warning: AlertTriangle,
  skip: SkipForward,
};

const statusColors = {
  pass: "text-green-500",
  fail: "text-red-500",
  warning: "text-yellow-500",
  skip: "text-gray-400",
};

const statusBgColors = {
  pass: "bg-green-500/10 border-green-500/20",
  fail: "bg-red-500/10 border-red-500/20",
  warning: "bg-yellow-500/10 border-yellow-500/20",
  skip: "bg-gray-500/10 border-gray-500/20",
};

export default function DeployTestPage() {
  const [results, setResults] = useState<TestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningCategory, setRunningCategory] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);

  const runTests = useCallback(async (categories?: string[]) => {
    setLoading(true);
    setProgress(0);
    setRunningCategory(categories?.[0] || "all");
    
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 10, 90));
    }, 200);
    
    try {
      const response = await fetch("/api/deploy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories }),
      });
      
      const data: TestResponse = await response.json();
      setResults(data);
      setProgress(100);
      
      const failedCategories = data.categories
        .filter(c => c.status === "fail" || c.status === "warning")
        .map(c => c.category);
      setExpandedCategories(new Set(failedCategories));
    } catch (error) {
      console.error("Test execution failed:", error);
      setResults({
        success: false,
        timestamp: new Date().toISOString(),
        duration: 0,
        summary: { status: "fail", total: 0, passed: 0, failed: 1, warnings: 0, skipped: 0 },
        categories: [],
        error: error instanceof Error ? error.message : "Test execution failed",
      });
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
      setRunningCategory(null);
      setTimeout(() => setProgress(0), 1000);
    }
  }, []);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const getCategoryKey = (categoryName: string): string => {
    const mapping: Record<string, string> = {
      "Service Health": "service-health",
      "Database Connectivity": "database",
      "OAuth Flows": "oauth",
      "AI Services": "ai-services",
      "SSL/TLS": "ssl",
    };
    return mapping[categoryName] || categoryName.toLowerCase().replace(/\s+/g, "-");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Production Smoke Tests</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Verify deployment readiness across all services
          </p>
        </div>
        <Button
          onClick={() => runTests()}
          disabled={loading}
          size="lg"
          className="gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running Tests...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run All Tests
            </>
          )}
        </Button>
      </div>

      {loading && progress > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {runningCategory === "all" ? "Running all tests..." : `Testing ${runningCategory}...`}
                </span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-5">
        {Object.entries(categoryConfig).map(([key, config]) => {
          const Icon = config.icon;
          const isRunning = runningCategory === key;
          
          return (
            <Button
              key={key}
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => runTests([key])}
              className="gap-2 justify-start"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              <span className="truncate">{config.label}</span>
            </Button>
          );
        })}
      </div>

      {results && (
        <>
          <Card className={statusBgColors[results.summary.status]}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {results.summary.status === "pass" ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : results.summary.status === "warning" ? (
                    <AlertTriangle className="h-6 w-6 text-yellow-500" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500" />
                  )}
                  <div>
                    <CardTitle className="text-lg">
                      {results.summary.status === "pass"
                        ? "All Tests Passed"
                        : results.summary.status === "warning"
                        ? "Tests Completed with Warnings"
                        : "Some Tests Failed"}
                    </CardTitle>
                    <CardDescription>
                      {results.summary.passed} passed, {results.summary.failed} failed, {results.summary.warnings} warnings, {results.summary.skipped} skipped
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {results.duration}ms
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => runTests()}
                    disabled={loading}
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="space-y-3">
            {results.categories.map((category) => {
              const categoryKey = getCategoryKey(category.category);
              const config = categoryConfig[categoryKey as keyof typeof categoryConfig];
              const Icon = config?.icon || Server;
              const StatusIcon = statusIcons[category.status];
              const isExpanded = expandedCategories.has(category.category);
              
              return (
                <Collapsible
                  key={category.category}
                  open={isExpanded}
                  onOpenChange={() => toggleCategory(category.category)}
                >
                  <Card className={category.status !== "pass" ? statusBgColors[category.status] : ""}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Icon className="h-5 w-5" />
                            <div>
                              <CardTitle className="text-base">{category.category}</CardTitle>
                              <CardDescription className="text-xs">
                                {category.tests.length} tests • {category.duration}ms
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusIcon className={`h-5 w-5 ${statusColors[category.status]}`} />
                            <span className={`text-sm font-medium ${statusColors[category.status]}`}>
                              {category.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="border rounded-lg divide-y">
                          {category.tests.map((test, idx) => {
                            const TestStatusIcon = statusIcons[test.status];
                            
                            return (
                              <div key={idx} className="p-3 flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <TestStatusIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${statusColors[test.status]}`} />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-sm truncate">{test.name}</div>
                                    <div className="text-xs text-muted-foreground">{test.message}</div>
                                    {test.details && (
                                      <div className="text-xs text-muted-foreground mt-1 p-2 bg-muted/50 rounded">
                                        {test.details}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                  {test.duration}ms
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        </>
      )}

      {!results && !loading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Play className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ready to Test</h3>
            <p className="text-muted-foreground max-w-md mb-6">
              Run smoke tests to verify your deployment is ready for production.
              Tests check service health, database connectivity, OAuth configuration, AI services, and SSL certificates.
            </p>
            <Button onClick={() => runTests()} size="lg" className="gap-2">
              <Play className="h-4 w-4" />
              Start Testing
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
