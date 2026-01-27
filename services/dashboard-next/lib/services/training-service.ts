import { db } from "@/lib/db";
import {
  trainingDatasets, trainingJobs, trainedModels,
  TrainingDataset, NewTrainingDataset,
  TrainingJob, NewTrainingJob,
  TrainedModel, NewTrainedModel,
} from "@/lib/db/platform-schema";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import { auditService } from "./audit-service";
import { getAIConfig } from "@/lib/ai/config";

const aiConfig = getAIConfig();
const WINDOWS_VM_IP = aiConfig.windowsVM.ip;
const WINDOWS_VM_API_PORT = process.env.WINDOWS_VM_API_PORT || "8765";

export interface DatasetUploadOptions {
  name: string;
  description?: string;
  type: "text" | "image" | "conversation" | "instruction";
  format: "jsonl" | "parquet" | "csv" | "folder";
  data: string | Buffer;
  createdBy?: string;
}

export interface TrainingJobOptions {
  name: string;
  modelType: "lora" | "qlora" | "sdxl" | "dreambooth" | "full";
  baseModel: string;
  datasetId?: string;
  config?: TrainingJobConfig;
  hyperparameters?: TrainingHyperparameters;
  createdBy?: string;
}

export interface TrainingJobConfig {
  outputDir?: string;
  saveSteps?: number;
  loggingSteps?: number;
  evalSteps?: number;
  maxSteps?: number;
  gradientAccumulationSteps?: number;
  useFp16?: boolean;
  useBf16?: boolean;
}

export interface TrainingHyperparameters {
  learningRate?: number;
  epochs?: number;
  batchSize?: number;
  warmupSteps?: number;
  weightDecay?: number;
  loraRank?: number;
  loraAlpha?: number;
  loraDropout?: number;
  targetModules?: string[];
}

export interface WindowsVMStatus {
  online: boolean;
  gpuAvailable: boolean;
  gpuName?: string;
  gpuMemoryTotal?: number;
  gpuMemoryUsed?: number;
  runningJobs: number;
  error?: string;
}

export class TrainingService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `http://${WINDOWS_VM_IP}:${WINDOWS_VM_API_PORT}`;
  }

  async listDatasets(options?: {
    type?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ datasets: TrainingDataset[]; total: number }> {
    const conditions = [];
    
    if (options?.type) {
      conditions.push(eq(trainingDatasets.type, options.type));
    }
    if (options?.status) {
      conditions.push(eq(trainingDatasets.status, options.status));
    }

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const datasets = await db
      .select()
      .from(trainingDatasets)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(trainingDatasets.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trainingDatasets)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      datasets,
      total: countResult?.count || 0,
    };
  }

  async getDataset(id: string): Promise<TrainingDataset | null> {
    const [dataset] = await db
      .select()
      .from(trainingDatasets)
      .where(eq(trainingDatasets.id, id))
      .limit(1);
    
    return dataset || null;
  }

  async uploadDataset(options: DatasetUploadOptions): Promise<TrainingDataset> {
    let storagePath: string | undefined;
    let recordCount = 0;
    let size = 0;

    if (typeof options.data === "string") {
      size = Buffer.byteLength(options.data, "utf8");
      if (options.format === "jsonl") {
        recordCount = options.data.split("\n").filter(line => line.trim()).length;
      }
    } else {
      size = options.data.length;
    }

    try {
      const uploadResult = await this.sendToWindowsVM("/training/datasets/upload", {
        method: "POST",
        body: JSON.stringify({
          name: options.name,
          type: options.type,
          format: options.format,
          data: typeof options.data === "string" ? options.data : options.data.toString("base64"),
        }),
      });
      storagePath = uploadResult.path;
    } catch (error) {
      console.log("[TrainingService] Windows VM upload failed, storing locally:", error);
      storagePath = `/data/training/datasets/${options.name}`;
    }

    const [dataset] = await db.insert(trainingDatasets).values({
      name: options.name,
      description: options.description,
      type: options.type,
      format: options.format,
      size,
      recordCount,
      storagePath,
      status: "ready",
      createdBy: options.createdBy,
    }).returning();

    await auditService.log({
      userId: options.createdBy,
      action: "training.start",
      resource: "training_dataset",
      resourceId: dataset.id,
      details: { name: options.name, type: options.type, format: options.format },
      status: "success",
    });

    return dataset;
  }

  async deleteDataset(id: string, userId?: string): Promise<boolean> {
    const dataset = await this.getDataset(id);
    if (!dataset) return false;

    try {
      if (dataset.storagePath) {
        await this.sendToWindowsVM("/training/datasets/delete", {
          method: "POST",
          body: JSON.stringify({ path: dataset.storagePath }),
        });
      }
    } catch (error) {
      console.log("[TrainingService] Windows VM delete failed:", error);
    }

    await db.delete(trainingDatasets).where(eq(trainingDatasets.id, id));

    await auditService.log({
      userId,
      action: "model.delete",
      resource: "training_dataset",
      resourceId: id,
      details: { name: dataset.name },
      status: "success",
    });

    return true;
  }

  async listJobs(options?: {
    status?: string;
    modelType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: TrainingJob[]; total: number }> {
    const conditions = [];
    
    if (options?.status) {
      conditions.push(eq(trainingJobs.status, options.status));
    }
    if (options?.modelType) {
      conditions.push(eq(trainingJobs.modelType, options.modelType));
    }

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const jobs = await db
      .select()
      .from(trainingJobs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(trainingJobs.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trainingJobs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      jobs,
      total: countResult?.count || 0,
    };
  }

  async getJob(id: string): Promise<TrainingJob | null> {
    const [job] = await db
      .select()
      .from(trainingJobs)
      .where(eq(trainingJobs.id, id))
      .limit(1);
    
    return job || null;
  }

  async startJob(options: TrainingJobOptions): Promise<TrainingJob> {
    const defaultConfig: TrainingJobConfig = {
      saveSteps: 500,
      loggingSteps: 10,
      evalSteps: 100,
      gradientAccumulationSteps: 4,
      useFp16: true,
    };

    const defaultHyperparameters: TrainingHyperparameters = {
      learningRate: 1e-4,
      epochs: 3,
      batchSize: 1,
      warmupSteps: 100,
      weightDecay: 0.01,
      loraRank: 16,
      loraAlpha: 32,
      loraDropout: 0.05,
      targetModules: ["q_proj", "v_proj", "k_proj", "o_proj"],
    };

    const config = { ...defaultConfig, ...options.config };
    const hyperparameters = { ...defaultHyperparameters, ...options.hyperparameters };

    const [job] = await db.insert(trainingJobs).values({
      name: options.name,
      modelType: options.modelType,
      baseModel: options.baseModel,
      datasetId: options.datasetId,
      status: "pending",
      progress: "0",
      config: config as Record<string, unknown>,
      hyperparameters: hyperparameters as Record<string, unknown>,
      createdBy: options.createdBy,
    }).returning();

    try {
      const result = await this.sendToWindowsVM("/training/jobs/start", {
        method: "POST",
        body: JSON.stringify({
          jobId: job.id,
          name: options.name,
          modelType: options.modelType,
          baseModel: options.baseModel,
          datasetId: options.datasetId,
          config,
          hyperparameters,
        }),
      });

      await db.update(trainingJobs).set({
        status: "running",
        startedAt: new Date(),
        outputPath: result.outputPath,
      }).where(eq(trainingJobs.id, job.id));

      const [updatedJob] = await db
        .select()
        .from(trainingJobs)
        .where(eq(trainingJobs.id, job.id))
        .limit(1);

      await auditService.log({
        userId: options.createdBy,
        action: "training.start",
        resource: "training_job",
        resourceId: job.id,
        details: { name: options.name, modelType: options.modelType, baseModel: options.baseModel },
        status: "success",
      });

      return updatedJob || job;
    } catch (error) {
      await db.update(trainingJobs).set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to start training on Windows VM",
      }).where(eq(trainingJobs.id, job.id));

      await auditService.log({
        userId: options.createdBy,
        action: "training.start",
        resource: "training_job",
        resourceId: job.id,
        details: { name: options.name, error: String(error) },
        status: "failure",
      });

      throw error;
    }
  }

  async stopJob(id: string, userId?: string): Promise<boolean> {
    const job = await this.getJob(id);
    if (!job) return false;

    if (!["pending", "running"].includes(job.status || "")) {
      throw new Error(`Cannot stop job in ${job.status} state`);
    }

    try {
      await this.sendToWindowsVM("/training/jobs/stop", {
        method: "POST",
        body: JSON.stringify({ jobId: id }),
      });
    } catch (error) {
      console.log("[TrainingService] Windows VM stop failed:", error);
    }

    await db.update(trainingJobs).set({
      status: "cancelled",
      completedAt: new Date(),
    }).where(eq(trainingJobs.id, id));

    await auditService.log({
      userId,
      action: "training.stop",
      resource: "training_job",
      resourceId: id,
      details: { name: job.name },
      status: "success",
    });

    return true;
  }

  async updateJobProgress(id: string, progress: number, metrics?: Record<string, unknown>): Promise<void> {
    const updates: Partial<NewTrainingJob> = {
      progress: String(progress),
    };

    if (metrics) {
      const job = await this.getJob(id);
      updates.metrics = {
        ...(job?.metrics as Record<string, unknown> || {}),
        ...metrics,
        updatedAt: new Date().toISOString(),
      };
    }

    await db.update(trainingJobs).set(updates).where(eq(trainingJobs.id, id));
  }

  async completeJob(id: string, outputPath: string, metrics: Record<string, unknown>): Promise<TrainedModel> {
    const job = await this.getJob(id);
    if (!job) throw new Error("Job not found");

    await db.update(trainingJobs).set({
      status: "completed",
      progress: "100",
      completedAt: new Date(),
      outputPath,
      metrics,
    }).where(eq(trainingJobs.id, id));

    const [model] = await db.insert(trainedModels).values({
      name: job.name,
      version: "1.0.0",
      type: job.modelType,
      baseModel: job.baseModel,
      trainingJobId: id,
      storagePath: outputPath,
      metrics,
      config: job.hyperparameters as Record<string, unknown>,
      createdBy: job.createdBy,
    }).returning();

    await auditService.log({
      userId: job.createdBy?.toString(),
      action: "training.complete",
      resource: "training_job",
      resourceId: id,
      details: { name: job.name, modelId: model.id },
      status: "success",
    });

    return model;
  }

  async failJob(id: string, errorMessage: string): Promise<void> {
    await db.update(trainingJobs).set({
      status: "failed",
      completedAt: new Date(),
      errorMessage,
    }).where(eq(trainingJobs.id, id));
  }

  async listModels(options?: {
    type?: string;
    isDeployed?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ models: TrainedModel[]; total: number }> {
    const conditions = [];
    
    if (options?.type) {
      conditions.push(eq(trainedModels.type, options.type));
    }
    if (options?.isDeployed !== undefined) {
      conditions.push(eq(trainedModels.isDeployed, options.isDeployed));
    }

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const models = await db
      .select()
      .from(trainedModels)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(trainedModels.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trainedModels)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      models,
      total: countResult?.count || 0,
    };
  }

  async getModel(id: string): Promise<TrainedModel | null> {
    const [model] = await db
      .select()
      .from(trainedModels)
      .where(eq(trainedModels.id, id))
      .limit(1);
    
    return model || null;
  }

  async deployModel(id: string, userId?: string): Promise<TrainedModel> {
    const model = await this.getModel(id);
    if (!model) throw new Error("Model not found");

    if (model.isDeployed) {
      throw new Error("Model is already deployed");
    }

    let deploymentEndpoint: string;

    try {
      const result = await this.sendToWindowsVM("/training/models/deploy", {
        method: "POST",
        body: JSON.stringify({
          modelId: id,
          modelPath: model.storagePath,
          modelType: model.type,
          modelName: model.name,
        }),
      });
      deploymentEndpoint = result.endpoint;
    } catch (error) {
      deploymentEndpoint = `${this.baseUrl}/models/${model.name}`;
    }

    await db.update(trainedModels).set({
      isDeployed: true,
      deploymentEndpoint,
      updatedAt: new Date(),
    }).where(eq(trainedModels.id, id));

    const [updatedModel] = await db
      .select()
      .from(trainedModels)
      .where(eq(trainedModels.id, id))
      .limit(1);

    await auditService.log({
      userId,
      action: "model.deploy",
      resource: "trained_model",
      resourceId: id,
      details: { name: model.name, endpoint: deploymentEndpoint },
      status: "success",
    });

    return updatedModel!;
  }

  async undeployModel(id: string, userId?: string): Promise<TrainedModel> {
    const model = await this.getModel(id);
    if (!model) throw new Error("Model not found");

    if (!model.isDeployed) {
      throw new Error("Model is not deployed");
    }

    try {
      await this.sendToWindowsVM("/training/models/undeploy", {
        method: "POST",
        body: JSON.stringify({ modelId: id }),
      });
    } catch (error) {
      console.log("[TrainingService] Windows VM undeploy failed:", error);
    }

    await db.update(trainedModels).set({
      isDeployed: false,
      deploymentEndpoint: null,
      updatedAt: new Date(),
    }).where(eq(trainedModels.id, id));

    const [updatedModel] = await db
      .select()
      .from(trainedModels)
      .where(eq(trainedModels.id, id))
      .limit(1);

    await auditService.log({
      userId,
      action: "model.undeploy",
      resource: "trained_model",
      resourceId: id,
      details: { name: model.name },
      status: "success",
    });

    return updatedModel!;
  }

  async deleteModel(id: string, userId?: string): Promise<boolean> {
    const model = await this.getModel(id);
    if (!model) return false;

    if (model.isDeployed) {
      throw new Error("Cannot delete deployed model. Undeploy first.");
    }

    try {
      if (model.storagePath) {
        await this.sendToWindowsVM("/training/models/delete", {
          method: "POST",
          body: JSON.stringify({ path: model.storagePath }),
        });
      }
    } catch (error) {
      console.log("[TrainingService] Windows VM delete failed:", error);
    }

    await db.delete(trainedModels).where(eq(trainedModels.id, id));

    await auditService.log({
      userId,
      action: "model.delete",
      resource: "trained_model",
      resourceId: id,
      details: { name: model.name },
      status: "success",
    });

    return true;
  }

  async getWindowsVMStatus(): Promise<WindowsVMStatus> {
    try {
      const result = await this.sendToWindowsVM("/status", { method: "GET" });
      return {
        online: true,
        gpuAvailable: result.gpu?.available ?? false,
        gpuName: result.gpu?.name,
        gpuMemoryTotal: result.gpu?.memoryTotal,
        gpuMemoryUsed: result.gpu?.memoryUsed,
        runningJobs: result.runningJobs ?? 0,
      };
    } catch (error) {
      return {
        online: false,
        gpuAvailable: false,
        runningJobs: 0,
        error: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }

  async getStats(): Promise<{
    totalDatasets: number;
    totalJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
    totalModels: number;
    deployedModels: number;
  }> {
    const [datasetCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trainingDatasets);

    const [jobStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        running: sql<number>`count(*) filter (where status = 'running')::int`,
        completed: sql<number>`count(*) filter (where status = 'completed')::int`,
        failed: sql<number>`count(*) filter (where status = 'failed')::int`,
      })
      .from(trainingJobs);

    const [modelStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        deployed: sql<number>`count(*) filter (where is_deployed = true)::int`,
      })
      .from(trainedModels);

    return {
      totalDatasets: datasetCount?.count || 0,
      totalJobs: jobStats?.total || 0,
      runningJobs: jobStats?.running || 0,
      completedJobs: jobStats?.completed || 0,
      failedJobs: jobStats?.failed || 0,
      totalModels: modelStats?.total || 0,
      deployedModels: modelStats?.deployed || 0,
    };
  }

  private async sendToWindowsVM(endpoint: string, options: RequestInit): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Windows VM error: ${response.status} - ${error}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Windows VM request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const trainingService = new TrainingService();
