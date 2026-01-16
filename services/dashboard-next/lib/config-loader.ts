/**
 * Configuration Loader with Smart Defaults and Auto-Detection
 * 
 * Reads YAML configs, validates them, applies smart defaults,
 * and auto-detects services from project structure.
 */

import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import YAML from "yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { glob } from "glob";

export interface ProjectConfig {
  name: string;
  repo?: string;
  description?: string;
}

export interface SSHConfig {
  host: string;
  port?: number;
  user?: string;
  keyPath?: string;
  keyName?: string;
}

export interface EnvironmentConfig {
  name: string;
  type: "production" | "staging" | "development" | "local";
  ssh?: SSHConfig;
  tailscale?: { hostname: string; ip?: string };
  variables?: Record<string, string>;
  autoDetected?: boolean;
}

export interface HealthCheckConfig {
  type: "http" | "tcp" | "command" | "docker" | "pm2";
  endpoint?: string;
  port?: number;
  command?: string;
  interval?: number;
  timeout?: number;
  retries?: number;
}

export interface ServiceConfig {
  name: string;
  type: "nodejs" | "python" | "docker" | "systemd" | "pm2" | "static" | "custom";
  path?: string;
  command?: string;
  port?: number;
  environment?: string;
  healthCheck?: HealthCheckConfig;
  dependencies?: string[];
  autoDetected?: boolean;
}

export interface PipelineStageConfig {
  name: string;
  command: string;
  workingDir?: string;
  environment?: Record<string, string>;
  continueOnError?: boolean;
}

export interface PipelineConfig {
  name: string;
  trigger?: "manual" | "push" | "schedule" | "webhook";
  schedule?: string;
  stages: PipelineStageConfig[];
  environments?: string[];
}

export interface NebulaConfig {
  version?: string;
  project: ProjectConfig;
  environments: EnvironmentConfig[];
  services: ServiceConfig[];
  pipelines: PipelineConfig[];
}

export interface ValidationError {
  path: string;
  message: string;
  line?: number;
  column?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface SetupAnswers {
  projectName: string;
  environments: Array<{
    name: string;
    type: "production" | "staging" | "development" | "local";
    host?: string;
  }>;
  services: Array<{
    name: string;
    type: ServiceConfig["type"];
    port?: number;
  }>;
}

const nebulaConfigSchema = {
  type: "object",
  required: ["project"],
  properties: {
    version: { type: "string" },
    project: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1 },
        repo: { type: "string", format: "uri" },
        description: { type: "string" },
      },
    },
    environments: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "type"],
        properties: {
          name: { type: "string", minLength: 1 },
          type: { type: "string", enum: ["production", "staging", "development", "local"] },
          ssh: {
            type: "object",
            properties: {
              host: { type: "string" },
              port: { type: "integer", minimum: 1, maximum: 65535 },
              user: { type: "string" },
              keyPath: { type: "string" },
              keyName: { type: "string" },
            },
          },
          tailscale: {
            type: "object",
            properties: {
              hostname: { type: "string" },
              ip: { type: "string", format: "ipv4" },
            },
          },
          variables: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
      },
    },
    services: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "type"],
        properties: {
          name: { type: "string", minLength: 1 },
          type: { type: "string", enum: ["nodejs", "python", "docker", "systemd", "pm2", "static", "custom"] },
          path: { type: "string" },
          command: { type: "string" },
          port: { type: "integer", minimum: 1, maximum: 65535 },
          environment: { type: "string" },
          healthCheck: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["http", "tcp", "command", "docker", "pm2"] },
              endpoint: { type: "string" },
              port: { type: "integer" },
              command: { type: "string" },
              interval: { type: "integer", minimum: 1000 },
              timeout: { type: "integer", minimum: 100 },
              retries: { type: "integer", minimum: 1 },
            },
          },
          dependencies: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    pipelines: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "stages"],
        properties: {
          name: { type: "string", minLength: 1 },
          trigger: { type: "string", enum: ["manual", "push", "schedule", "webhook"] },
          schedule: { type: "string" },
          environments: { type: "array", items: { type: "string" } },
          stages: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "command"],
              properties: {
                name: { type: "string" },
                command: { type: "string" },
                workingDir: { type: "string" },
                continueOnError: { type: "boolean" },
                environment: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
};

export class ConfigLoader {
  private ajv: InstanceType<typeof Ajv>;
  private configPath: string;
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || process.cwd();
    this.configPath = path.join(this.basePath, "nebula.yaml");
    
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv as any);
  }

  async load(): Promise<NebulaConfig> {
    let userConfig: Partial<NebulaConfig> = {};

    if (existsSync(this.configPath)) {
      userConfig = await this.loadYamlFile(this.configPath);
    } else {
      const altPath = path.join(this.basePath, "nebula.yml");
      if (existsSync(altPath)) {
        this.configPath = altPath;
        userConfig = await this.loadYamlFile(altPath);
      }
    }

    const detectedEnvironments = await this.detectEnvironments();
    const detectedServices = await this.detectServices();

    const mergedConfig: NebulaConfig = {
      version: userConfig.version || "1.0",
      project: userConfig.project || { name: path.basename(this.basePath) },
      environments: this.mergeArrays(userConfig.environments || [], detectedEnvironments, "name"),
      services: this.mergeArrays(userConfig.services || [], detectedServices, "name"),
      pipelines: userConfig.pipelines || [],
    };

    const withDefaults = this.applyDefaults(mergedConfig);

    const validation = this.validate(withDefaults);
    if (!validation.valid) {
      const errorMessages = validation.errors
        .map(e => `  - ${e.path}: ${e.message}${e.line ? ` (line ${e.line})` : ""}`)
        .join("\n");
      throw new Error(`Configuration validation failed:\n${errorMessages}`);
    }

    return withDefaults;
  }

  private async loadYamlFile(filePath: string): Promise<Partial<NebulaConfig>> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const substituted = this.substituteEnvVars(content);
      
      const doc = YAML.parseDocument(substituted);
      
      if (doc.errors && doc.errors.length > 0) {
        const error = doc.errors[0];
        const line = error.linePos?.[0]?.line;
        throw new Error(
          `YAML parsing error at line ${line || "unknown"}: ${error.message}`
        );
      }

      return doc.toJSON() as Partial<NebulaConfig>;
    } catch (error) {
      if (error instanceof Error && error.message.includes("YAML parsing")) {
        throw error;
      }
      throw new Error(`Failed to load config file ${filePath}: ${error}`);
    }
  }

  private substituteEnvVars(content: string): string {
    return content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const [name, defaultValue] = varName.split(":-");
      const envValue = process.env[name.trim()];
      
      if (envValue !== undefined) {
        return envValue;
      }
      
      if (defaultValue !== undefined) {
        return defaultValue.trim();
      }

      console.warn(`[ConfigLoader] Environment variable ${name} not set, keeping placeholder`);
      return match;
    });
  }

  async detectEnvironments(): Promise<EnvironmentConfig[]> {
    const environments: EnvironmentConfig[] = [];
    const homeDir = os.homedir();
    const sshDir = path.join(homeDir, ".ssh");

    if (existsSync(sshDir)) {
      try {
        const sshFiles = await fs.readdir(sshDir);
        const keyFiles = sshFiles.filter(f => 
          !f.endsWith(".pub") && 
          !f.includes("known_hosts") && 
          !f.includes("config") &&
          !f.includes("authorized_keys")
        );

        for (const keyFile of keyFiles) {
          const keyPath = path.join(sshDir, keyFile);
          const stat = await fs.stat(keyPath);
          
          if (stat.isFile()) {
            const content = await fs.readFile(keyPath, "utf-8").catch(() => "");
            if (content.includes("PRIVATE KEY")) {
              const envName = keyFile.replace(/^id_/, "").replace(/_/g, "-");
              
              if (envName !== "rsa" && envName !== "ed25519" && envName !== "ecdsa") {
                environments.push({
                  name: envName,
                  type: this.inferEnvironmentType(envName),
                  ssh: {
                    host: `${envName}.local`,
                    keyPath: keyPath,
                    keyName: keyFile,
                  },
                  autoDetected: true,
                });
              }
            }
          }
        }
      } catch (error) {
        console.warn("[ConfigLoader] Could not scan SSH directory:", error);
      }
    }

    const nebulaEnvVars = Object.entries(process.env)
      .filter(([key]) => key.startsWith("NEBULA_ENV_"))
      .map(([key, value]) => ({
        name: key.replace("NEBULA_ENV_", "").toLowerCase().replace(/_/g, "-"),
        value: value || "",
      }));

    for (const { name, value } of nebulaEnvVars) {
      if (!environments.find(e => e.name === name)) {
        environments.push({
          name,
          type: this.inferEnvironmentType(name),
          ssh: value.includes("@") ? { host: value.split("@")[1] || value } : undefined,
          autoDetected: true,
        });
      }
    }

    if (!environments.find(e => e.name === "local")) {
      environments.push({
        name: "local",
        type: "local",
        autoDetected: true,
      });
    }

    return environments;
  }

  private inferEnvironmentType(name: string): EnvironmentConfig["type"] {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("prod")) return "production";
    if (lowerName.includes("stage") || lowerName.includes("stg")) return "staging";
    if (lowerName.includes("dev")) return "development";
    return "production";
  }

  async detectServices(): Promise<ServiceConfig[]> {
    const services: ServiceConfig[] = [];

    const packageJsonFiles = await glob("**/package.json", {
      cwd: this.basePath,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
      nodir: true,
    });

    for (const pkgPath of packageJsonFiles) {
      try {
        const fullPath = path.join(this.basePath, pkgPath);
        const content = await fs.readFile(fullPath, "utf-8");
        const pkg = JSON.parse(content);
        
        const servicePath = path.dirname(pkgPath);
        const serviceName = pkg.name || path.basename(servicePath);
        
        let port: number | undefined;
        if (pkg.scripts?.dev) {
          const portMatch = pkg.scripts.dev.match(/-p\s*(\d+)|--port[=\s]+(\d+)|PORT[=\s]+(\d+)/);
          if (portMatch) {
            port = parseInt(portMatch[1] || portMatch[2] || portMatch[3], 10);
          }
        }

        services.push({
          name: serviceName,
          type: "nodejs",
          path: servicePath === "." ? undefined : servicePath,
          command: pkg.scripts?.start ? "npm start" : pkg.scripts?.dev ? "npm run dev" : undefined,
          port,
          healthCheck: port ? {
            type: "http",
            port,
            endpoint: "/health",
            interval: 30000,
            timeout: 5000,
            retries: 3,
          } : undefined,
          autoDetected: true,
        });
      } catch (error) {
        console.warn(`[ConfigLoader] Could not parse ${pkgPath}:`, error);
      }
    }

    const dockerComposeFiles = await glob("**/docker-compose*.{yml,yaml}", {
      cwd: this.basePath,
      ignore: ["**/node_modules/**"],
      nodir: true,
    });

    for (const composePath of dockerComposeFiles) {
      try {
        const fullPath = path.join(this.basePath, composePath);
        const content = await fs.readFile(fullPath, "utf-8");
        const compose = YAML.parse(content);
        
        if (compose.services) {
          for (const [serviceName, serviceConfig] of Object.entries(compose.services)) {
            const svc = serviceConfig as any;
            
            let port: number | undefined;
            if (svc.ports && Array.isArray(svc.ports) && svc.ports.length > 0) {
              const portStr = String(svc.ports[0]);
              const portMatch = portStr.match(/(\d+):(\d+)/);
              port = portMatch ? parseInt(portMatch[1], 10) : parseInt(portStr, 10);
            }

            if (!services.find(s => s.name === serviceName)) {
              services.push({
                name: serviceName,
                type: "docker",
                path: path.dirname(composePath),
                command: svc.command,
                port,
                healthCheck: svc.healthcheck ? {
                  type: "docker",
                  command: svc.healthcheck.test?.join?.(" ") || svc.healthcheck.test,
                  interval: this.parseDuration(svc.healthcheck.interval),
                  timeout: this.parseDuration(svc.healthcheck.timeout),
                  retries: svc.healthcheck.retries,
                } : undefined,
                autoDetected: true,
              });
            }
          }
        }
      } catch (error) {
        console.warn(`[ConfigLoader] Could not parse ${composePath}:`, error);
      }
    }

    const pm2Files = await glob("**/ecosystem.config.{js,cjs,mjs,json}", {
      cwd: this.basePath,
      ignore: ["**/node_modules/**"],
      nodir: true,
    });

    for (const pm2Path of pm2Files) {
      try {
        const fullPath = path.join(this.basePath, pm2Path);
        const content = await fs.readFile(fullPath, "utf-8");
        
        let pm2Config: any;
        if (pm2Path.endsWith(".json")) {
          pm2Config = JSON.parse(content);
        } else {
          const match = content.match(/module\.exports\s*=\s*({[\s\S]*})/);
          if (match) {
            try {
              pm2Config = eval(`(${match[1]})`);
            } catch {
              continue;
            }
          }
        }
        
        if (pm2Config?.apps && Array.isArray(pm2Config.apps)) {
          for (const app of pm2Config.apps) {
            if (!services.find(s => s.name === app.name)) {
              services.push({
                name: app.name,
                type: "pm2",
                path: path.dirname(pm2Path),
                command: app.script,
                port: app.env?.PORT || app.env?.port,
                healthCheck: {
                  type: "pm2",
                  interval: 30000,
                  timeout: 5000,
                  retries: 3,
                },
                autoDetected: true,
              });
            }
          }
        }
      } catch (error) {
        console.warn(`[ConfigLoader] Could not parse ${pm2Path}:`, error);
      }
    }

    if (existsSync("/etc/systemd/system")) {
      try {
        const systemdFiles = await fs.readdir("/etc/systemd/system");
        const serviceFiles = systemdFiles.filter(f => f.endsWith(".service"));
        
        for (const serviceFile of serviceFiles.slice(0, 10)) {
          const serviceName = serviceFile.replace(".service", "");
          
          if (serviceName.includes("homelab") || serviceName.includes("nebula")) {
            if (!services.find(s => s.name === serviceName)) {
              services.push({
                name: serviceName,
                type: "systemd",
                healthCheck: {
                  type: "command",
                  command: `systemctl is-active ${serviceName}`,
                  interval: 30000,
                  timeout: 5000,
                  retries: 3,
                },
                autoDetected: true,
              });
            }
          }
        }
      } catch (error) {
        // Ignore systemd errors on non-Linux systems
      }
    }

    const requirementsFiles = await glob("**/requirements.txt", {
      cwd: this.basePath,
      ignore: ["**/node_modules/**", "**/.venv/**", "**/venv/**"],
      nodir: true,
    });

    for (const reqPath of requirementsFiles) {
      const servicePath = path.dirname(reqPath);
      const mainPy = path.join(this.basePath, servicePath, "main.py");
      const appPy = path.join(this.basePath, servicePath, "app.py");
      
      if (existsSync(mainPy) || existsSync(appPy)) {
        const serviceName = path.basename(servicePath) || "python-app";
        
        if (!services.find(s => s.name === serviceName)) {
          services.push({
            name: serviceName,
            type: "python",
            path: servicePath === "." ? undefined : servicePath,
            command: existsSync(mainPy) ? "python main.py" : "python app.py",
            autoDetected: true,
          });
        }
      }
    }

    return services;
  }

  private parseDuration(duration: string | undefined): number | undefined {
    if (!duration) return undefined;
    
    const match = duration.match(/^(\d+)(ms|s|m|h)?$/);
    if (!match) return undefined;
    
    const value = parseInt(match[1], 10);
    const unit = match[2] || "ms";
    
    switch (unit) {
      case "ms": return value;
      case "s": return value * 1000;
      case "m": return value * 60 * 1000;
      case "h": return value * 60 * 60 * 1000;
      default: return value;
    }
  }

  applyDefaults(config: NebulaConfig): NebulaConfig {
    const result: NebulaConfig = JSON.parse(JSON.stringify(config));
    const homeDir = os.homedir();

    for (const env of result.environments) {
      if (env.ssh) {
        env.ssh.port = env.ssh.port ?? 22;
        env.ssh.user = env.ssh.user ?? process.env.USER ?? "root";
        
        if (!env.ssh.keyPath && !env.ssh.keyName) {
          const defaultKey = path.join(homeDir, ".ssh", "id_rsa");
          const ed25519Key = path.join(homeDir, ".ssh", "id_ed25519");
          
          if (existsSync(ed25519Key)) {
            env.ssh.keyPath = ed25519Key;
          } else if (existsSync(defaultKey)) {
            env.ssh.keyPath = defaultKey;
          }
        } else if (env.ssh.keyName && !env.ssh.keyPath) {
          env.ssh.keyPath = path.join(homeDir, ".ssh", env.ssh.keyName);
        }
      }

      if (env.type === "local" && !env.variables) {
        env.variables = {};
      }
    }

    for (const service of result.services) {
      if (service.type === "pm2" && !service.command) {
        service.command = "npm start";
      }

      if (service.type === "nodejs" && !service.command) {
        service.command = "npm start";
      }

      if (service.type === "python" && !service.command) {
        service.command = "python main.py";
      }

      if (service.port && !service.healthCheck) {
        service.healthCheck = {
          type: "http",
          port: service.port,
          endpoint: "/health",
          interval: 30000,
          timeout: 5000,
          retries: 3,
        };
      }

      if (service.healthCheck) {
        service.healthCheck.interval = service.healthCheck.interval ?? 30000;
        service.healthCheck.timeout = service.healthCheck.timeout ?? 5000;
        service.healthCheck.retries = service.healthCheck.retries ?? 3;
        
        if (service.healthCheck.type === "http" && !service.healthCheck.endpoint) {
          service.healthCheck.endpoint = "/health";
        }
        
        if ((service.healthCheck.type === "http" || service.healthCheck.type === "tcp") && 
            !service.healthCheck.port && service.port) {
          service.healthCheck.port = service.port;
        }
      }
    }

    for (const pipeline of result.pipelines) {
      pipeline.trigger = pipeline.trigger ?? "manual";
      
      for (const stage of pipeline.stages) {
        stage.continueOnError = stage.continueOnError ?? false;
      }
    }

    return result;
  }

  validate(config: NebulaConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const validate = this.ajv.compile(nebulaConfigSchema);
    const valid = validate(config);

    if (!valid && validate.errors) {
      for (const error of validate.errors) {
        const err = error as any;
        errors.push({
          path: err.instancePath || err.dataPath || "/",
          message: this.formatAjvError(err),
        });
      }
    }

    if (!config.project?.name) {
      errors.push({
        path: "/project/name",
        message: "Project name is required",
      });
    }

    const envNames = new Set<string>();
    for (const env of config.environments || []) {
      if (envNames.has(env.name)) {
        errors.push({
          path: "/environments",
          message: `Duplicate environment name: ${env.name}`,
        });
      }
      envNames.add(env.name);

      if (env.ssh?.host && !env.ssh.keyPath && !env.ssh.keyName) {
        warnings.push({
          path: `/environments/${env.name}/ssh`,
          message: "SSH configured without key path, will use default ~/.ssh/id_rsa",
        });
      }
    }

    const serviceNames = new Set<string>();
    for (const service of config.services || []) {
      if (serviceNames.has(service.name)) {
        errors.push({
          path: "/services",
          message: `Duplicate service name: ${service.name}`,
        });
      }
      serviceNames.add(service.name);

      if (service.environment && !envNames.has(service.environment)) {
        warnings.push({
          path: `/services/${service.name}/environment`,
          message: `Service references unknown environment: ${service.environment}`,
        });
      }

      if (service.dependencies) {
        for (const dep of service.dependencies) {
          if (!serviceNames.has(dep)) {
            warnings.push({
              path: `/services/${service.name}/dependencies`,
              message: `Service depends on unknown service: ${dep}`,
            });
          }
        }
      }
    }

    for (const pipeline of config.pipelines || []) {
      if (pipeline.environments) {
        for (const envName of pipeline.environments) {
          if (!envNames.has(envName)) {
            warnings.push({
              path: `/pipelines/${pipeline.name}/environments`,
              message: `Pipeline references unknown environment: ${envName}`,
            });
          }
        }
      }

      if (pipeline.trigger === "schedule" && !pipeline.schedule) {
        errors.push({
          path: `/pipelines/${pipeline.name}/schedule`,
          message: "Schedule trigger requires a schedule expression",
        });
      }

      if (!pipeline.stages || pipeline.stages.length === 0) {
        errors.push({
          path: `/pipelines/${pipeline.name}/stages`,
          message: "Pipeline must have at least one stage",
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private formatAjvError(error: any): string {
    switch (error.keyword) {
      case "required":
        return `Missing required property: ${error.params.missingProperty}`;
      case "type":
        return `Expected ${error.params.type}, got ${typeof error.data}`;
      case "enum":
        return `Must be one of: ${error.params.allowedValues.join(", ")}`;
      case "minLength":
        return `Must be at least ${error.params.limit} characters`;
      case "minimum":
        return `Must be >= ${error.params.limit}`;
      case "maximum":
        return `Must be <= ${error.params.limit}`;
      case "format":
        return `Invalid format, expected ${error.params.format}`;
      default:
        return error.message || "Validation error";
    }
  }

  generateMinimalConfig(answers: SetupAnswers): string {
    const config: NebulaConfig = {
      version: "1.0",
      project: {
        name: answers.projectName,
      },
      environments: answers.environments.map(env => ({
        name: env.name,
        type: env.type,
        ssh: env.host ? { host: env.host } : undefined,
      })),
      services: answers.services.map(svc => ({
        name: svc.name,
        type: svc.type,
        port: svc.port,
      })),
      pipelines: [],
    };

    const yamlContent = YAML.stringify(config, {
      indent: 2,
      lineWidth: 120,
    });

    const header = `# Nebula Command Configuration
# Generated by setup wizard on ${new Date().toISOString().split("T")[0]}
# Documentation: https://nebula-command.dev/docs/config

`;

    return header + yamlContent;
  }

  async saveConfig(config: NebulaConfig, filePath?: string): Promise<void> {
    const targetPath = filePath || this.configPath;
    
    const validation = this.validate(config);
    if (!validation.valid) {
      throw new Error(
        `Cannot save invalid config:\n${validation.errors.map(e => `  - ${e.message}`).join("\n")}`
      );
    }

    const yamlContent = YAML.stringify(config, {
      indent: 2,
      lineWidth: 120,
    });

    await fs.writeFile(targetPath, yamlContent, "utf-8");
    console.log(`[ConfigLoader] Saved configuration to ${targetPath}`);
  }

  private mergeArrays<T extends { name: string }>(
    userConfig: T[],
    detected: T[],
    keyField: keyof T
  ): T[] {
    const merged = [...userConfig];
    const existingKeys = new Set(userConfig.map(item => item[keyField]));

    for (const item of detected) {
      if (!existingKeys.has(item[keyField])) {
        merged.push(item);
      }
    }

    return merged;
  }

  getConfigPath(): string {
    return this.configPath;
  }

  async exists(): Promise<boolean> {
    return existsSync(this.configPath) || existsSync(path.join(this.basePath, "nebula.yml"));
  }

  async watchConfig(callback: (config: NebulaConfig) => void): Promise<() => void> {
    const { watch } = await import("fs");
    
    const watcher = watch(this.configPath, async (eventType) => {
      if (eventType === "change") {
        try {
          const config = await this.load();
          callback(config);
        } catch (error) {
          console.error("[ConfigLoader] Error reloading config:", error);
        }
      }
    });

    return () => watcher.close();
  }
}

export const configLoader = new ConfigLoader();

export async function loadConfig(basePath?: string): Promise<NebulaConfig> {
  const loader = basePath ? new ConfigLoader(basePath) : configLoader;
  return loader.load();
}

export function createConfigLoader(basePath: string): ConfigLoader {
  return new ConfigLoader(basePath);
}
