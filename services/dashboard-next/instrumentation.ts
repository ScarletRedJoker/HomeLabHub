export async function register() {
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' ||
                       !process.env.DATABASE_URL;
  
  if (isBuildPhase) {
    return;
  }
  
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const startTime = Date.now();
    const startupStatus: Record<string, 'success' | 'skipped' | 'failed'> = {};
    
    console.log("[Instrumentation] Starting service initialization...");

    // 1. Initialize observability FIRST so we can track other initialization
    try {
      const { initializeObservability } = await import("./lib/observability");
      await initializeObservability();
      startupStatus.observability = 'success';
    } catch (error) {
      console.warn("[Instrumentation] Observability initialization skipped:", error);
      startupStatus.observability = 'skipped';
    }

    // 2. Bootstrap secrets early
    try {
      const { bootstrapSecrets } = await import("./lib/secrets-manager");
      const secretsResult = await bootstrapSecrets();
      
      if (secretsResult.missing.length > 0) {
        console.warn(`[Instrumentation] Missing secrets: ${secretsResult.missing.join(", ")}`);
        startupStatus.secrets = 'skipped';
      } else {
        console.log(`[Instrumentation] Secrets loaded from ${secretsResult.source} for ${secretsResult.environment}`);
        startupStatus.secrets = 'success';
      }
    } catch (error) {
      console.warn("[Instrumentation] Secrets bootstrap skipped:", error);
      startupStatus.secrets = 'skipped';
    }

    // 3. Database connection and migration
    let dbConnected = false;
    try {
      const { autoMigrateDatabase, testDatabaseConnection } = await import("./lib/db/auto-migrate");
      
      dbConnected = await testDatabaseConnection();
      if (dbConnected) {
        const result = await autoMigrateDatabase();
        if (result.success) {
          console.log("[Instrumentation] Database auto-migration completed");
          if (result.adminCreated) {
            console.log("[Instrumentation] Admin user created (username: admin, password: admin123)");
          }
          startupStatus.database = 'success';
        } else {
          console.warn("[Instrumentation] Database auto-migration warning:", result.message);
          startupStatus.database = 'skipped';
        }
      } else {
        console.warn("[Instrumentation] Database connection failed, skipping auto-migration");
        startupStatus.database = 'failed';
      }
    } catch (error: any) {
      console.warn("[Instrumentation] Database auto-migration skipped:", error.message);
      startupStatus.database = 'failed';
    }

    // 4. Service registration (non-critical, don't block on failure)
    try {
      const { registerSelfWithCapabilities } = await import("./lib/peer-discovery");
      
      const port = parseInt(process.env.PORT || "5000", 10);
      const capabilities = ["dashboard", "api", "ui", "wol", "deploy"];
      
      const registered = await registerSelfWithCapabilities(
        "dashboard",
        capabilities,
        port,
        {
          version: "1.0.0",
          features: ["ai-orchestration", "server-management", "wol-relay", "windows-deploy"],
        }
      );
      
      if (registered) {
        console.log("[Instrumentation] Dashboard registered with service registry");
        startupStatus.serviceRegistry = 'success';
      } else {
        console.warn("[Instrumentation] Dashboard running without service registry");
        startupStatus.serviceRegistry = 'skipped';
      }
    } catch (error) {
      console.warn("[Instrumentation] Service registration skipped:", error);
      startupStatus.serviceRegistry = 'skipped';
    }

    // 5. AI configuration validation
    try {
      const { validateAIConfig, logConfigStatus } = await import("./lib/ai/config");
      logConfigStatus();
      
      const validation = validateAIConfig();
      if (!validation.valid) {
        console.error("[Instrumentation] AI Configuration errors:");
        validation.errors.forEach(e => console.error(`  - ${e}`));
        if (process.env.NODE_ENV === "production" && process.env.AI_CONFIG_STRICT === "true") {
          console.error("[Instrumentation] Strict mode enabled - AI services may not work correctly");
        }
        startupStatus.aiConfig = 'failed';
      } else {
        startupStatus.aiConfig = 'success';
      }
    } catch (error) {
      console.warn("[Instrumentation] AI config validation skipped:", error);
      startupStatus.aiConfig = 'skipped';
    }

    // 6. Register shutdown handlers for graceful cleanup
    const setupShutdownHandlers = async () => {
      const shutdown = async (signal: string) => {
        console.log(`[Instrumentation] Received ${signal}, initiating graceful shutdown...`);
        try {
          const { shutdownObservability } = await import("./lib/observability");
          shutdownObservability();
        } catch (e) {
          console.error("[Instrumentation] Error during shutdown:", e);
        }
      };
      
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    };
    
    await setupShutdownHandlers();

    // Startup summary
    const duration = Date.now() - startTime;
    const successCount = Object.values(startupStatus).filter(s => s === 'success').length;
    const totalCount = Object.keys(startupStatus).length;
    
    console.log(`[Instrumentation] Startup complete in ${duration}ms`);
    console.log(`[Instrumentation] Status: ${successCount}/${totalCount} services initialized`);
    Object.entries(startupStatus).forEach(([service, status]) => {
      const icon = status === 'success' ? '✓' : status === 'skipped' ? '○' : '✗';
      console.log(`  ${icon} ${service}: ${status}`);
    });
  }
}
