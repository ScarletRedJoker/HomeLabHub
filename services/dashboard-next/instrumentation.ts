export async function register() {
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' ||
                       !process.env.DATABASE_URL;
  
  if (isBuildPhase) {
    return;
  }
  
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { bootstrapSecrets } = await import("./lib/secrets-manager");
      const secretsResult = await bootstrapSecrets();
      
      if (secretsResult.missing.length > 0) {
        console.warn(`[Instrumentation] Missing secrets: ${secretsResult.missing.join(", ")}`);
      } else {
        console.log(`[Instrumentation] Secrets loaded from ${secretsResult.source} for ${secretsResult.environment}`);
      }
    } catch (error) {
      console.warn("[Instrumentation] Secrets bootstrap skipped:", error);
    }

    try {
      const { autoMigrateDatabase, testDatabaseConnection } = await import("./lib/db/auto-migrate");
      
      const dbConnected = await testDatabaseConnection();
      if (dbConnected) {
        const result = await autoMigrateDatabase();
        if (result.success) {
          console.log("[Instrumentation] Database auto-migration completed");
          if (result.adminCreated) {
            console.log("[Instrumentation] Admin user created (username: admin, password: admin123)");
          }
        } else {
          console.warn("[Instrumentation] Database auto-migration warning:", result.message);
        }
      } else {
        console.warn("[Instrumentation] Database connection failed, skipping auto-migration");
      }
    } catch (error: any) {
      console.warn("[Instrumentation] Database auto-migration skipped:", error.message);
    }

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
      } else {
        console.warn("[Instrumentation] Dashboard running without service registry");
      }
    } catch (error) {
      console.warn("[Instrumentation] Service registration skipped:", error);
    }

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
      }
    } catch (error) {
      console.warn("[Instrumentation] AI config validation skipped:", error);
    }
  }
}
