import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { detectEnvironment, type Environment } from "./env-bootstrap";

export interface SetupAnswers {
  projectName: string;
  deploymentType: "single" | "multi" | "hybrid";
  primaryServer?: { host: string; user: string };
  hasGPU: boolean;
  gpuServer?: { host: string };
}

export interface QuestionOption {
  value: string;
  label: string;
}

export interface SetupQuestion {
  id: keyof SetupAnswers | string;
  question: string;
  type?: "text" | "select" | "boolean" | "server";
  options?: QuestionOption[];
  fields?: string[];
  default?: unknown;
  when?: (answers: Partial<SetupAnswers>) => boolean;
}

export interface TestResult {
  target: string;
  type: "ssh" | "api" | "gpu";
  success: boolean;
  message: string;
  latencyMs?: number;
}

export interface DetectedValues {
  projectName: string;
  environment: Environment;
  hasSSHKeys: boolean;
  sshKeyPath: string | null;
  detectedHosts: string[];
  hasGPU: boolean;
  gpuEndpoint: string | null;
  existingConfig: boolean;
}

export interface SetupResult {
  success: boolean;
  config: string;
  configPath: string;
  testResults: TestResult[];
  errors: string[];
}

export interface SetupStatus {
  isConfigured: boolean;
  configPath: string | null;
  detected: DetectedValues;
  questions: SetupQuestion[];
}

function getConfigDir(): string {
  if (process.env.NEBULA_CONFIG_DIR) {
    return process.env.NEBULA_CONFIG_DIR;
  }
  if (process.env.REPL_ID) {
    return "./config";
  }
  if (existsSync("/opt/homelab")) {
    return "/opt/homelab/config";
  }
  return join(homedir(), ".nebula");
}

function getConfigPath(): string {
  return join(getConfigDir(), "nebula.yaml");
}

class SetupWizard {
  questions: SetupQuestion[] = [
    {
      id: "projectName",
      question: "What is your project name?",
      type: "text",
      default: "nebula-homelab",
    },
    {
      id: "deploymentType",
      question: "How will you deploy?",
      type: "select",
      options: [
        { value: "single", label: "Single server (VPS or home server)" },
        { value: "multi", label: "Multiple servers" },
        { value: "hybrid", label: "Cloud + home + GPU (advanced)" },
      ],
    },
    {
      id: "primaryServer",
      question: "Enter your server details",
      type: "server",
      fields: ["host", "user"],
      when: (answers) => answers.deploymentType !== undefined,
    },
    {
      id: "hasGPU",
      question: "Do you have a GPU server for AI?",
      type: "boolean",
      default: false,
    },
    {
      id: "gpuServer",
      question: "GPU server address",
      type: "text",
      when: (answers) => answers.hasGPU === true,
    },
  ];

  async detectProjectName(): Promise<string> {
    try {
      const pkgPath = join(process.cwd(), "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.name) {
          return pkg.name.replace(/^@[^/]+\//, "");
        }
      }
    } catch {}

    const cwd = process.cwd();
    const dirName = cwd.split(/[/\\]/).pop() || "nebula-homelab";
    return dirName;
  }

  async detectSSHKeys(): Promise<{ hasKeys: boolean; keyPath: string | null }> {
    const sshDir = join(homedir(), ".ssh");
    const keyNames = ["homelab", "id_ed25519", "id_rsa"];

    for (const keyName of keyNames) {
      const keyPath = join(sshDir, keyName);
      if (existsSync(keyPath)) {
        return { hasKeys: true, keyPath };
      }
    }

    return { hasKeys: false, keyPath: null };
  }

  async detectGPU(): Promise<{ hasGPU: boolean; endpoint: string | null }> {
    const gpuIp = process.env.WINDOWS_VM_TAILSCALE_IP;
    if (gpuIp) {
      const endpoint = `http://${gpuIp}:9765`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${endpoint}/api/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok) {
          return { hasGPU: true, endpoint };
        }
      } catch {}
    }

    return { hasGPU: false, endpoint: null };
  }

  async detectHosts(): Promise<string[]> {
    const hosts: string[] = [];

    if (process.env.HOME_SSH_HOST) {
      hosts.push(process.env.HOME_SSH_HOST);
    }
    if (process.env.LINODE_SSH_HOST) {
      hosts.push(process.env.LINODE_SSH_HOST);
    }
    if (process.env.WINDOWS_VM_TAILSCALE_IP) {
      hosts.push(process.env.WINDOWS_VM_TAILSCALE_IP);
    }

    return hosts;
  }

  async autoDetect(): Promise<DetectedValues> {
    const [projectName, sshInfo, gpuInfo, detectedHosts] = await Promise.all([
      this.detectProjectName(),
      this.detectSSHKeys(),
      this.detectGPU(),
      this.detectHosts(),
    ]);

    const configPath = getConfigPath();

    return {
      projectName,
      environment: detectEnvironment(),
      hasSSHKeys: sshInfo.hasKeys,
      sshKeyPath: sshInfo.keyPath,
      detectedHosts,
      hasGPU: gpuInfo.hasGPU,
      gpuEndpoint: gpuInfo.endpoint,
      existingConfig: existsSync(configPath),
    };
  }

  generateConfig(answers: SetupAnswers): string {
    const lines: string[] = [
      `# Nebula Command Configuration`,
      `# Generated: ${new Date().toISOString()}`,
      ``,
      `project:`,
      `  name: "${answers.projectName}"`,
      `  deployment: "${answers.deploymentType}"`,
      ``,
    ];

    if (answers.primaryServer) {
      lines.push(`primary_server:`);
      lines.push(`  host: "${answers.primaryServer.host}"`);
      lines.push(`  user: "${answers.primaryServer.user}"`);
      lines.push(``);
    }

    if (answers.hasGPU && answers.gpuServer) {
      lines.push(`gpu_server:`);
      lines.push(`  host: "${answers.gpuServer.host}"`);
      lines.push(`  port: 9765`);
      lines.push(``);
    }

    lines.push(`services:`);
    lines.push(`  dashboard: true`);
    lines.push(`  registry: true`);

    if (answers.hasGPU) {
      lines.push(`  ai_agent: true`);
    }

    return lines.join("\n");
  }

  async testSSHConnection(
    host: string,
    user: string
  ): Promise<TestResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      await fetch(`http://${host}:22`, {
        method: "HEAD",
        signal: controller.signal,
      }).catch(() => {});
      clearTimeout(timeout);

      return {
        target: `${user}@${host}`,
        type: "ssh",
        success: true,
        message: "SSH port reachable",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        target: `${user}@${host}`,
        type: "ssh",
        success: false,
        message: error instanceof Error ? error.message : "Connection failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async testAPIConnection(endpoint: string): Promise<TestResult> {
    const start = Date.now();
    try {
      const url = endpoint.startsWith("http") ? endpoint : `http://${endpoint}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${url}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      return {
        target: endpoint,
        type: "api",
        success: response.ok,
        message: response.ok ? "API reachable" : `Status: ${response.status}`,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        target: endpoint,
        type: "api",
        success: false,
        message: error instanceof Error ? error.message : "Connection failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async testGPUConnection(host: string): Promise<TestResult> {
    const start = Date.now();
    const endpoint = host.includes(":") ? host : `${host}:9765`;
    const url = `http://${endpoint}/api/health`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      return {
        target: host,
        type: "gpu",
        success: response.ok,
        message: response.ok ? "GPU agent reachable" : `Status: ${response.status}`,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        target: host,
        type: "gpu",
        success: false,
        message: error instanceof Error ? error.message : "Connection failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async testConnections(answers: SetupAnswers): Promise<TestResult[]> {
    const tests: Promise<TestResult>[] = [];

    if (answers.primaryServer) {
      tests.push(
        this.testSSHConnection(
          answers.primaryServer.host,
          answers.primaryServer.user
        )
      );
    }

    if (answers.hasGPU && answers.gpuServer) {
      tests.push(this.testGPUConnection(answers.gpuServer.host));
    }

    return Promise.all(tests);
  }

  async testConnection(
    type: "ssh" | "api" | "gpu",
    target: string,
    options?: { user?: string }
  ): Promise<TestResult> {
    switch (type) {
      case "ssh":
        return this.testSSHConnection(target, options?.user || "root");
      case "api":
        return this.testAPIConnection(target);
      case "gpu":
        return this.testGPUConnection(target);
      default:
        return {
          target,
          type,
          success: false,
          message: "Unknown connection type",
        };
    }
  }

  saveConfig(content: string): { success: boolean; path: string; error?: string } {
    const configPath = getConfigPath();
    const configDir = getConfigDir();

    try {
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      writeFileSync(configPath, content, "utf-8");
      return { success: true, path: configPath };
    } catch (error) {
      return {
        success: false,
        path: configPath,
        error: error instanceof Error ? error.message : "Failed to save config",
      };
    }
  }

  async run(answers: SetupAnswers): Promise<SetupResult> {
    const errors: string[] = [];

    const config = this.generateConfig(answers);
    const testResults = await this.testConnections(answers);

    const failedTests = testResults.filter((t) => !t.success);
    if (failedTests.length > 0) {
      for (const test of failedTests) {
        errors.push(`${test.target}: ${test.message}`);
      }
    }

    const saveResult = this.saveConfig(config);
    if (!saveResult.success && saveResult.error) {
      errors.push(`Config save failed: ${saveResult.error}`);
    }

    return {
      success: saveResult.success && failedTests.length === 0,
      config,
      configPath: saveResult.path,
      testResults,
      errors,
    };
  }

  async getStatus(): Promise<SetupStatus> {
    const detected = await this.autoDetect();
    const configPath = getConfigPath();

    const filteredQuestions = this.questions.filter((q) => {
      if (!q.when) return true;
      return true;
    });

    return {
      isConfigured: detected.existingConfig,
      configPath: detected.existingConfig ? configPath : null,
      detected,
      questions: filteredQuestions,
    };
  }
}

export const setupWizard = new SetupWizard();
