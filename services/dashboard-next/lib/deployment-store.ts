import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  remoteDeployments,
  deploymentVerifications,
  environmentStatus,
  configSnapshots,
  RemoteDeployment,
  NewRemoteDeployment,
  DeploymentVerification,
  EnvironmentStatus,
  ConfigSnapshot,
} from "./db/platform-schema";
import type { DeployStep, ProbeResult } from "./remote-deploy";

export interface CreateDeploymentInput {
  environment: string;
  status: string;
  gitCommit?: string;
  gitBranch?: string;
  previousCommit?: string;
  triggeredBy?: string;
  steps?: DeployStep[];
}

export interface UpdateDeploymentInput {
  status?: string;
  gitCommit?: string;
  completedAt?: Date;
  durationMs?: number;
  steps?: DeployStep[];
  logs?: string[];
  error?: string;
}

export interface HistoryOptions {
  environment?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

class DeploymentStore {
  async createDeployment(data: CreateDeploymentInput): Promise<RemoteDeployment> {
    const [deployment] = await db
      .insert(remoteDeployments)
      .values({
        environment: data.environment,
        status: data.status,
        gitCommit: data.gitCommit,
        gitBranch: data.gitBranch,
        previousCommit: data.previousCommit,
        triggeredBy: data.triggeredBy,
        steps: data.steps as unknown as Record<string, unknown>,
        startedAt: new Date(),
      })
      .returning();
    return deployment;
  }

  async updateDeployment(id: string, data: UpdateDeploymentInput): Promise<RemoteDeployment> {
    const [deployment] = await db
      .update(remoteDeployments)
      .set({
        status: data.status,
        gitCommit: data.gitCommit,
        completedAt: data.completedAt,
        durationMs: data.durationMs,
        steps: data.steps as unknown as Record<string, unknown>,
        logs: data.logs,
        error: data.error,
      })
      .where(eq(remoteDeployments.id, id))
      .returning();
    return deployment;
  }

  async getDeployment(id: string): Promise<RemoteDeployment | null> {
    const [deployment] = await db
      .select()
      .from(remoteDeployments)
      .where(eq(remoteDeployments.id, id))
      .limit(1);
    return deployment || null;
  }

  async getHistory(options: HistoryOptions = {}): Promise<{
    deployments: RemoteDeployment[];
    total: number;
  }> {
    const { environment, status, limit = 20, offset = 0 } = options;

    const conditions = [];
    if (environment) {
      conditions.push(eq(remoteDeployments.environment, environment));
    }
    if (status) {
      conditions.push(eq(remoteDeployments.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [deploymentsList, countResult] = await Promise.all([
      db
        .select()
        .from(remoteDeployments)
        .where(whereClause)
        .orderBy(desc(remoteDeployments.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(remoteDeployments)
        .where(whereClause),
    ]);

    return {
      deployments: deploymentsList,
      total: countResult[0]?.count || 0,
    };
  }

  async getLatestDeployment(environment: string): Promise<RemoteDeployment | null> {
    const [deployment] = await db
      .select()
      .from(remoteDeployments)
      .where(eq(remoteDeployments.environment, environment))
      .orderBy(desc(remoteDeployments.createdAt))
      .limit(1);
    return deployment || null;
  }

  async saveVerification(
    deploymentId: string,
    environment: string,
    results: ProbeResult[]
  ): Promise<DeploymentVerification> {
    const passed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    const [verification] = await db
      .insert(deploymentVerifications)
      .values({
        deploymentId,
        environment,
        probeResults: results as unknown as Record<string, unknown>,
        passed,
        failed,
        total: results.length,
      })
      .returning();
    return verification;
  }

  async getVerification(deploymentId: string): Promise<DeploymentVerification | null> {
    const [verification] = await db
      .select()
      .from(deploymentVerifications)
      .where(eq(deploymentVerifications.deploymentId, deploymentId))
      .orderBy(desc(deploymentVerifications.createdAt))
      .limit(1);
    return verification || null;
  }

  async getEnvironmentStatus(env: string): Promise<EnvironmentStatus | null> {
    const [status] = await db
      .select()
      .from(environmentStatus)
      .where(eq(environmentStatus.environment, env))
      .limit(1);
    return status || null;
  }

  async updateEnvironmentStatus(
    env: string,
    data: Partial<Omit<EnvironmentStatus, "environment">>
  ): Promise<EnvironmentStatus> {
    const existing = await this.getEnvironmentStatus(env);

    if (existing) {
      const [updated] = await db
        .update(environmentStatus)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(environmentStatus.environment, env))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(environmentStatus)
        .values({
          environment: env,
          ...data,
          updatedAt: new Date(),
        })
        .returning();
      return created;
    }
  }

  async getAllEnvironmentStatuses(): Promise<EnvironmentStatus[]> {
    return db.select().from(environmentStatus);
  }

  async saveConfigSnapshot(configType: string, content: string): Promise<ConfigSnapshot> {
    const [snapshot] = await db
      .insert(configSnapshots)
      .values({
        configType,
        content,
      })
      .returning();
    return snapshot;
  }

  async getLatestConfigSnapshot(configType: string): Promise<ConfigSnapshot | null> {
    const [snapshot] = await db
      .select()
      .from(configSnapshots)
      .where(eq(configSnapshots.configType, configType))
      .orderBy(desc(configSnapshots.createdAt))
      .limit(1);
    return snapshot || null;
  }

  async getConfigSnapshotHistory(
    configType: string,
    limit: number = 10
  ): Promise<ConfigSnapshot[]> {
    return db
      .select()
      .from(configSnapshots)
      .where(eq(configSnapshots.configType, configType))
      .orderBy(desc(configSnapshots.createdAt))
      .limit(limit);
  }

  async getDeploymentStats(environment?: string): Promise<{
    total: number;
    successful: number;
    failed: number;
    lastDeployment: RemoteDeployment | null;
  }> {
    const whereClause = environment
      ? eq(remoteDeployments.environment, environment)
      : undefined;

    const [totalResult, successResult, failedResult] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(remoteDeployments)
        .where(whereClause),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(remoteDeployments)
        .where(
          whereClause
            ? and(whereClause, eq(remoteDeployments.status, "success"))
            : eq(remoteDeployments.status, "success")
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(remoteDeployments)
        .where(
          whereClause
            ? and(whereClause, eq(remoteDeployments.status, "failed"))
            : eq(remoteDeployments.status, "failed")
        ),
    ]);

    const lastDeployment = environment
      ? await this.getLatestDeployment(environment)
      : (
          await db
            .select()
            .from(remoteDeployments)
            .orderBy(desc(remoteDeployments.createdAt))
            .limit(1)
        )[0] || null;

    return {
      total: totalResult[0]?.count || 0,
      successful: successResult[0]?.count || 0,
      failed: failedResult[0]?.count || 0,
      lastDeployment,
    };
  }
}

export const deploymentStore = new DeploymentStore();
