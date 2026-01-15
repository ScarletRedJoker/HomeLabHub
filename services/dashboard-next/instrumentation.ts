export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
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
  }
}
