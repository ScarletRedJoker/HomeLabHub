/**
 * Remediation Engine - Automatic troubleshooting and incident resolution
 * Executes runbooks to resolve common infrastructure issues
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import * as yaml from "yaml";
import Docker from "dockerode";
import { aiOrchestrator } from "./ai-orchestrator";

export type StepType = "log" | "docker" | "ssh" | "http" | "notify" | "wait" | "ai";
export type Severity = "critical" | "high" | "medium" | "low";
export type RunbookStatus = "pending" | "running" | "completed" | "failed" | "escalated";

export interface RunbookCondition {
  type: "metric" | "health" | "log_pattern" | "threshold";
  target: string;
  operator: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "contains" | "matches";
  value: string | number | boolean;
}

export interface RunbookStep {
  name: string;
  type: StepType;
  action: string;
  params?: Record<string, any>;
  timeout?: number;
  retries?: number;
  onFailure?: "continue" | "abort" | "escalate";
  condition?: RunbookCondition;
}

export interface Runbook {
  id: string;
  name: string;
  description: string;
  version: string;
  triggers: RunbookCondition[];
  severity: Severity;
  escalationTarget?: string;
  cooldownMinutes?: number;
  steps: RunbookStep[];
  metadata?: Record<string, any>;
}

export interface ExecutionContext {
  incidentId?: string;
  serviceName?: string;
  containerId?: string;
  variables?: Record<string, any>;
  previousOutput?: any;
}

export interface StepResult {
  stepName: string;
  status: "success" | "failure" | "skipped";
  output: any;
  duration: number;
  error?: string;
}

export interface RunbookExecution {
  runbookId: string;
  status: RunbookStatus;
  startedAt: Date;
  completedAt?: Date;
  stepsCompleted: number;
  stepsTotal: number;
  results: StepResult[];
  context: ExecutionContext;
}

class RemediationEngine {
  private runbooks: Map<string, Runbook> = new Map();
  private executions: Map<string, RunbookExecution> = new Map();
  private docker: Docker;
  private runbooksPath: string;
  private lastExecutionTime: Map<string, Date> = new Map();

  constructor() {
    this.docker = new Docker({ socketPath: "/var/run/docker.sock" });
    this.runbooksPath = join(process.cwd(), "../../orchestration/runbooks");
    
    const altPath = join(process.cwd(), "../../../orchestration/runbooks");
    if (existsSync(altPath)) {
      this.runbooksPath = altPath;
    }
    
    const rootPath = join(process.cwd(), "orchestration/runbooks");
    if (existsSync(rootPath)) {
      this.runbooksPath = rootPath;
    }
  }

  loadRunbooks(): void {
    this.runbooks.clear();

    if (!existsSync(this.runbooksPath)) {
      console.warn(`Runbooks directory not found: ${this.runbooksPath}`);
      return;
    }

    const files = readdirSync(this.runbooksPath).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml")
    );

    for (const file of files) {
      try {
        const content = readFileSync(join(this.runbooksPath, file), "utf-8");
        const runbook = yaml.parse(content) as Runbook;
        runbook.id = file.replace(/\.(yml|yaml)$/, "");
        this.runbooks.set(runbook.id, runbook);
        console.log(`Loaded runbook: ${runbook.id} - ${runbook.name}`);
      } catch (error) {
        console.error(`Failed to load runbook ${file}:`, error);
      }
    }

    console.log(`Loaded ${this.runbooks.size} runbooks`);
  }

  getRunbooks(): Runbook[] {
    return Array.from(this.runbooks.values());
  }

  getRunbook(id: string): Runbook | undefined {
    return this.runbooks.get(id);
  }

  async executeRunbook(
    runbookId: string,
    context: ExecutionContext
  ): Promise<RunbookExecution> {
    const runbook = this.runbooks.get(runbookId);
    if (!runbook) {
      throw new Error(`Runbook not found: ${runbookId}`);
    }

    if (runbook.cooldownMinutes) {
      const lastExec = this.lastExecutionTime.get(runbookId);
      if (lastExec) {
        const cooldownMs = runbook.cooldownMinutes * 60 * 1000;
        if (Date.now() - lastExec.getTime() < cooldownMs) {
          throw new Error(`Runbook ${runbookId} is in cooldown period`);
        }
      }
    }

    const execution: RunbookExecution = {
      runbookId,
      status: "running",
      startedAt: new Date(),
      stepsCompleted: 0,
      stepsTotal: runbook.steps.length,
      results: [],
      context,
    };

    const executionId = `${runbookId}-${Date.now()}`;
    this.executions.set(executionId, execution);
    this.lastExecutionTime.set(runbookId, new Date());

    try {
      for (const step of runbook.steps) {
        if (step.condition && !this.checkCondition(step.condition, context)) {
          execution.results.push({
            stepName: step.name,
            status: "skipped",
            output: "Condition not met",
            duration: 0,
          });
          continue;
        }

        const result = await this.executeStep(step, context);
        execution.results.push(result);
        execution.stepsCompleted++;

        context.previousOutput = result.output;

        if (result.status === "failure") {
          if (step.onFailure === "abort") {
            execution.status = "failed";
            break;
          } else if (step.onFailure === "escalate") {
            execution.status = "escalated";
            await this.escalate(runbook, execution, result.error);
            break;
          }
        }
      }

      if (execution.status === "running") {
        execution.status = "completed";
      }
    } catch (error: any) {
      execution.status = "failed";
      execution.results.push({
        stepName: "execution-error",
        status: "failure",
        output: null,
        duration: 0,
        error: error.message,
      });
    }

    execution.completedAt = new Date();
    return execution;
  }

  checkCondition(condition: RunbookCondition, context: ExecutionContext): boolean {
    const { type, target, operator, value } = condition;
    let actualValue: any;

    switch (type) {
      case "metric":
        actualValue = context.variables?.[target];
        break;
      case "health":
        actualValue = context.variables?.healthStatus?.[target];
        break;
      case "log_pattern":
        actualValue = context.variables?.lastLog;
        break;
      case "threshold":
        actualValue = context.variables?.[target];
        break;
      default:
        return false;
    }

    if (actualValue === undefined) return false;

    switch (operator) {
      case "eq":
        return actualValue === value;
      case "ne":
        return actualValue !== value;
      case "gt":
        return Number(actualValue) > Number(value);
      case "lt":
        return Number(actualValue) < Number(value);
      case "gte":
        return Number(actualValue) >= Number(value);
      case "lte":
        return Number(actualValue) <= Number(value);
      case "contains":
        return String(actualValue).includes(String(value));
      case "matches":
        return new RegExp(String(value)).test(String(actualValue));
      default:
        return false;
    }
  }

  async executeStep(step: RunbookStep, context: ExecutionContext): Promise<StepResult> {
    const startTime = Date.now();
    let retries = step.retries || 0;

    while (retries >= 0) {
      try {
        const output = await this.executeStepAction(step, context);
        return {
          stepName: step.name,
          status: "success",
          output,
          duration: Date.now() - startTime,
        };
      } catch (error: any) {
        if (retries > 0) {
          retries--;
          await this.delay(1000);
          continue;
        }
        return {
          stepName: step.name,
          status: "failure",
          output: null,
          duration: Date.now() - startTime,
          error: error.message,
        };
      }
    }

    return {
      stepName: step.name,
      status: "failure",
      output: null,
      duration: Date.now() - startTime,
      error: "Unexpected error",
    };
  }

  private async executeStepAction(step: RunbookStep, context: ExecutionContext): Promise<any> {
    const timeout = step.timeout || 30000;

    switch (step.type) {
      case "log":
        return this.executeLogStep(step, context);
      case "docker":
        return this.executeDockerStep(step, context, timeout);
      case "ssh":
        return this.executeSSHStep(step, context);
      case "http":
        return this.executeHTTPStep(step, context, timeout);
      case "notify":
        return this.executeNotifyStep(step, context);
      case "wait":
        return this.executeWaitStep(step);
      case "ai":
        return this.executeAIStep(step, context);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private executeLogStep(step: RunbookStep, context: ExecutionContext): any {
    const message = this.interpolate(step.action, context);
    console.log(`[Runbook] ${message}`);
    return { logged: message };
  }

  private async executeDockerStep(
    step: RunbookStep,
    context: ExecutionContext,
    timeout: number
  ): Promise<any> {
    const action = step.action;
    const containerId = step.params?.containerId || context.containerId;
    const serviceName = step.params?.serviceName || context.serviceName;

    if (action === "restart" && containerId) {
      const container = this.docker.getContainer(containerId);
      await container.restart({ t: Math.floor(timeout / 1000) });
      return { action: "restart", containerId, success: true };
    }

    if (action === "restart" && serviceName) {
      const containers = await this.docker.listContainers({ all: true });
      const target = containers.find((c) =>
        c.Names.some((n) => n.includes(serviceName))
      );
      if (target) {
        const container = this.docker.getContainer(target.Id);
        await container.restart({ t: Math.floor(timeout / 1000) });
        return { action: "restart", serviceName, containerId: target.Id, success: true };
      }
      throw new Error(`Container for service ${serviceName} not found`);
    }

    if (action === "start" && containerId) {
      const container = this.docker.getContainer(containerId);
      await container.start();
      return { action: "start", containerId, success: true };
    }

    if (action === "stop" && containerId) {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: Math.floor(timeout / 1000) });
      return { action: "stop", containerId, success: true };
    }

    if (action === "logs" && containerId) {
      const container = this.docker.getContainer(containerId);
      const logs = await container.logs({ stdout: true, stderr: true, tail: 100 });
      return { action: "logs", containerId, logs: logs.toString() };
    }

    if (action === "prune") {
      const result = await this.docker.pruneContainers();
      return { action: "prune", ...result };
    }

    if (action === "prune-images") {
      const result = await this.docker.pruneImages();
      return { action: "prune-images", ...result };
    }

    if (action === "prune-volumes") {
      const result = await this.docker.pruneVolumes();
      return { action: "prune-volumes", ...result };
    }

    throw new Error(`Unknown docker action: ${action}`);
  }

  private async executeSSHStep(step: RunbookStep, context: ExecutionContext): Promise<any> {
    const command = this.interpolate(step.action, context);
    const host = step.params?.host || "localhost";

    console.log(`[SSH] Would execute on ${host}: ${command}`);
    return { simulated: true, command, host };
  }

  private async executeHTTPStep(
    step: RunbookStep,
    context: ExecutionContext,
    timeout: number
  ): Promise<any> {
    const url = this.interpolate(step.params?.url || step.action, context);
    const method = step.params?.method || "GET";
    const headers = step.params?.headers || {};
    const body = step.params?.body;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type");
      let data;
      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        status: response.status,
        ok: response.ok,
        data,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async executeNotifyStep(step: RunbookStep, context: ExecutionContext): Promise<any> {
    const message = this.interpolate(step.action, context);
    const channel = step.params?.channel || "default";
    const severity = step.params?.severity || "info";

    console.log(`[Notify:${channel}] (${severity}) ${message}`);

    if (step.params?.webhookUrl) {
      try {
        await fetch(step.params.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: message,
            severity,
            channel,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (error) {
        console.error("Failed to send webhook notification:", error);
      }
    }

    return { notified: true, channel, message };
  }

  private async executeWaitStep(step: RunbookStep): Promise<any> {
    const duration = step.params?.duration || 5000;
    await this.delay(duration);
    return { waited: duration };
  }

  private async executeAIStep(step: RunbookStep, context: ExecutionContext): Promise<any> {
    const prompt = this.interpolate(step.action, context);

    const response = await aiOrchestrator.chat({
      messages: [
        {
          role: "system",
          content:
            "You are an infrastructure remediation assistant. Analyze the situation and provide actionable recommendations.",
        },
        { role: "user", content: prompt },
      ],
      config: {
        temperature: 0.3,
        maxTokens: 500,
      },
    });

    return {
      analysis: response.content,
      provider: response.provider,
      model: response.model,
    };
  }

  private async escalate(
    runbook: Runbook,
    execution: RunbookExecution,
    error?: string
  ): Promise<void> {
    console.log(`[Escalation] Runbook ${runbook.id} failed and escalated`);

    if (runbook.escalationTarget) {
      try {
        await fetch(runbook.escalationTarget, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runbookId: runbook.id,
            runbookName: runbook.name,
            severity: runbook.severity,
            error,
            execution: {
              stepsCompleted: execution.stepsCompleted,
              stepsTotal: execution.stepsTotal,
              results: execution.results,
            },
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (e) {
        console.error("Failed to send escalation:", e);
      }
    }
  }

  private interpolate(template: string, context: ExecutionContext): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (key === "serviceName") return context.serviceName || "";
      if (key === "containerId") return context.containerId || "";
      if (key === "incidentId") return context.incidentId || "";
      if (key === "previousOutput") return JSON.stringify(context.previousOutput || "");
      return context.variables?.[key] ?? "";
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getExecution(executionId: string): RunbookExecution | undefined {
    return this.executions.get(executionId);
  }

  getRecentExecutions(limit = 10): RunbookExecution[] {
    return Array.from(this.executions.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  async findMatchingRunbook(context: ExecutionContext): Promise<Runbook | null> {
    for (const runbook of this.runbooks.values()) {
      const allTriggersMatch = runbook.triggers.every((trigger) =>
        this.checkCondition(trigger, context)
      );
      if (allTriggersMatch) {
        return runbook;
      }
    }
    return null;
  }
}

export const remediationEngine = new RemediationEngine();
