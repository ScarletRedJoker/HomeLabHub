import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

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

async function timeTest<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, duration: Date.now() - start };
}

async function testEndpoint(url: string, name: string, timeout = 5000): Promise<TestResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      cache: "no-store"
    });
    clearTimeout(timeoutId);
    
    const duration = Date.now() - start;
    
    if (response.ok) {
      return { name, status: "pass", message: `HTTP ${response.status}`, duration };
    } else {
      return { 
        name, 
        status: "fail", 
        message: `HTTP ${response.status} ${response.statusText}`, 
        duration,
        details: `Endpoint returned non-OK status`
      };
    }
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : "Unknown error";
    
    if (message.includes("abort") || message.includes("timeout")) {
      return { name, status: "warning", message: "Request timed out", duration, details: `Timeout after ${timeout}ms` };
    }
    if (message.includes("ECONNREFUSED")) {
      return { name, status: "fail", message: "Connection refused", duration, details: "Service may not be running" };
    }
    
    return { name, status: "fail", message, duration, details: "Network or connection error" };
  }
}

async function runServiceHealthTests(): Promise<CategoryResult> {
  const start = Date.now();
  const tests: TestResult[] = [];
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5000";
  const discordBotUrl = process.env.DISCORD_BOT_URL || "http://localhost:4000";
  const streamBotUrl = process.env.STREAM_BOT_URL || "http://localhost:3000";
  const windowsVmIp = process.env.WINDOWS_VM_IP || "192.168.1.100";
  
  const endpoints = [
    { url: `${baseUrl}/health`, name: "Dashboard /health" },
    { url: `${baseUrl}/api/health`, name: "Dashboard /api/health" },
    { url: `${discordBotUrl}/health`, name: "Discord Bot /health" },
    { url: `${streamBotUrl}/health`, name: "Stream Bot /health" },
    { url: `http://${windowsVmIp}:9765/health`, name: "Nebula Agent (Windows VM)" },
  ];
  
  for (const endpoint of endpoints) {
    tests.push(await testEndpoint(endpoint.url, endpoint.name));
  }
  
  const failCount = tests.filter(t => t.status === "fail").length;
  const warnCount = tests.filter(t => t.status === "warning").length;
  
  return {
    category: "Service Health",
    status: failCount > 0 ? "fail" : warnCount > 0 ? "warning" : "pass",
    tests,
    duration: Date.now() - start,
  };
}

async function runDatabaseTests(): Promise<CategoryResult> {
  const start = Date.now();
  const tests: TestResult[] = [];
  
  const testStart = Date.now();
  try {
    if (!process.env.DATABASE_URL) {
      tests.push({
        name: "PostgreSQL Connection",
        status: "skip",
        message: "DATABASE_URL not configured",
        duration: Date.now() - testStart,
      });
    } else {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const client = await pool.connect();
      
      try {
        const result = await client.query("SELECT NOW() as time, current_database() as db");
        tests.push({
          name: "PostgreSQL Connection",
          status: "pass",
          message: `Connected to ${result.rows[0].db}`,
          duration: Date.now() - testStart,
        });
        
        const tablesResult = await client.query(`
          SELECT COUNT(*) as count FROM information_schema.tables 
          WHERE table_schema = 'public'
        `);
        tests.push({
          name: "Database Schema",
          status: "pass",
          message: `${tablesResult.rows[0].count} tables in public schema`,
          duration: Date.now() - testStart,
        });
      } finally {
        client.release();
        await pool.end();
      }
    }
  } catch (error) {
    tests.push({
      name: "PostgreSQL Connection",
      status: "fail",
      message: error instanceof Error ? error.message : "Connection failed",
      duration: Date.now() - testStart,
      details: "Check DATABASE_URL environment variable",
    });
  }
  
  const failCount = tests.filter(t => t.status === "fail").length;
  const skipCount = tests.filter(t => t.status === "skip").length;
  
  return {
    category: "Database Connectivity",
    status: failCount > 0 ? "fail" : skipCount === tests.length ? "skip" : "pass",
    tests,
    duration: Date.now() - start,
  };
}

async function runOAuthTests(): Promise<CategoryResult> {
  const start = Date.now();
  const tests: TestResult[] = [];
  
  const oauthConfigs = [
    { name: "Discord OAuth", clientIdEnv: "DISCORD_CLIENT_ID", redirectEnv: "DISCORD_REDIRECT_URI" },
    { name: "Twitch OAuth", clientIdEnv: "TWITCH_CLIENT_ID", redirectEnv: "TWITCH_REDIRECT_URI" },
    { name: "Google OAuth", clientIdEnv: "GOOGLE_CLIENT_ID", redirectEnv: "GOOGLE_REDIRECT_URI" },
    { name: "Spotify OAuth", clientIdEnv: "SPOTIFY_CLIENT_ID", redirectEnv: "SPOTIFY_REDIRECT_URI" },
  ];
  
  for (const config of oauthConfigs) {
    const testStart = Date.now();
    const clientId = process.env[config.clientIdEnv];
    const redirectUri = process.env[config.redirectEnv];
    
    if (!clientId) {
      tests.push({
        name: config.name,
        status: "skip",
        message: `${config.clientIdEnv} not configured`,
        duration: Date.now() - testStart,
      });
    } else if (!redirectUri) {
      tests.push({
        name: config.name,
        status: "warning",
        message: "Client ID set but redirect URI missing",
        duration: Date.now() - testStart,
        details: `Set ${config.redirectEnv} for production`,
      });
    } else {
      const isProduction = redirectUri.includes("https://");
      tests.push({
        name: config.name,
        status: isProduction ? "pass" : "warning",
        message: isProduction ? "Configured for production" : "Using non-HTTPS redirect",
        duration: Date.now() - testStart,
        details: isProduction ? undefined : "Consider using HTTPS for production",
      });
    }
  }
  
  const failCount = tests.filter(t => t.status === "fail").length;
  const warnCount = tests.filter(t => t.status === "warning").length;
  const skipCount = tests.filter(t => t.status === "skip").length;
  
  return {
    category: "OAuth Flows",
    status: failCount > 0 ? "fail" : skipCount === tests.length ? "skip" : warnCount > 0 ? "warning" : "pass",
    tests,
    duration: Date.now() - start,
  };
}

async function runAIServicesTests(): Promise<CategoryResult> {
  const start = Date.now();
  const tests: TestResult[] = [];
  
  const windowsVmIp = process.env.WINDOWS_VM_IP || "192.168.1.100";
  const ollamaUrl = process.env.OLLAMA_URL || `http://${windowsVmIp}:11434`;
  const sdWebuiUrl = process.env.SD_WEBUI_URL || `http://${windowsVmIp}:7860`;
  const comfyuiUrl = process.env.COMFYUI_URL || `http://${windowsVmIp}:8188`;
  
  const aiEndpoints = [
    { url: `${ollamaUrl}/api/tags`, name: "Ollama LLM" },
    { url: `${sdWebuiUrl}/sdapi/v1/sd-models`, name: "Stable Diffusion WebUI" },
    { url: `${comfyuiUrl}/system_stats`, name: "ComfyUI" },
  ];
  
  for (const endpoint of aiEndpoints) {
    tests.push(await testEndpoint(endpoint.url, endpoint.name, 10000));
  }
  
  if (process.env.OPENAI_API_KEY) {
    tests.push({
      name: "OpenAI API Key",
      status: "pass",
      message: "API key configured",
      duration: 0,
    });
  } else {
    tests.push({
      name: "OpenAI API Key",
      status: "skip",
      message: "Not configured",
      duration: 0,
    });
  }
  
  const failCount = tests.filter(t => t.status === "fail").length;
  const warnCount = tests.filter(t => t.status === "warning").length;
  
  return {
    category: "AI Services",
    status: failCount > 0 ? "fail" : warnCount > 0 ? "warning" : "pass",
    tests,
    duration: Date.now() - start,
  };
}

async function runSSLTests(): Promise<CategoryResult> {
  const start = Date.now();
  const tests: TestResult[] = [];
  
  const domain = process.env.DOMAIN || process.env.NEXT_PUBLIC_DOMAIN;
  
  if (!domain || domain === "localhost" || domain.includes("replit")) {
    tests.push({
      name: "SSL Certificate Check",
      status: "skip",
      message: "Not applicable in development",
      duration: 0,
      details: "Set DOMAIN env var for production SSL checks",
    });
  } else {
    const productionUrls = [
      `https://dashboard.${domain}`,
      `https://api.${domain}`,
      `https://auth.${domain}`,
    ];
    
    for (const url of productionUrls) {
      const testStart = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, { 
          signal: controller.signal,
          cache: "no-store"
        });
        clearTimeout(timeoutId);
        
        tests.push({
          name: new URL(url).hostname,
          status: "pass",
          message: "SSL/TLS valid",
          duration: Date.now() - testStart,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        
        if (message.includes("certificate") || message.includes("SSL") || message.includes("TLS")) {
          tests.push({
            name: new URL(url).hostname,
            status: "fail",
            message: "SSL/TLS error",
            duration: Date.now() - testStart,
            details: message,
          });
        } else if (message.includes("ENOTFOUND") || message.includes("getaddrinfo")) {
          tests.push({
            name: new URL(url).hostname,
            status: "warning",
            message: "DNS not resolving",
            duration: Date.now() - testStart,
            details: "Domain may not be configured yet",
          });
        } else {
          tests.push({
            name: new URL(url).hostname,
            status: "warning",
            message: "Connection error",
            duration: Date.now() - testStart,
            details: message,
          });
        }
      }
    }
  }
  
  const failCount = tests.filter(t => t.status === "fail").length;
  const warnCount = tests.filter(t => t.status === "warning").length;
  const skipCount = tests.filter(t => t.status === "skip").length;
  
  return {
    category: "SSL/TLS",
    status: failCount > 0 ? "fail" : skipCount === tests.length ? "skip" : warnCount > 0 ? "warning" : "pass",
    tests,
    duration: Date.now() - start,
  };
}

const testRunners: Record<string, () => Promise<CategoryResult>> = {
  "service-health": runServiceHealthTests,
  "database": runDatabaseTests,
  "oauth": runOAuthTests,
  "ai-services": runAIServicesTests,
  "ssl": runSSLTests,
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get("category");
  
  const start = Date.now();
  
  try {
    let results: CategoryResult[];
    
    if (category && testRunners[category]) {
      results = [await testRunners[category]()];
    } else {
      results = await Promise.all([
        runServiceHealthTests(),
        runDatabaseTests(),
        runOAuthTests(),
        runAIServicesTests(),
        runSSLTests(),
      ]);
    }
    
    const totalTests = results.reduce((sum, r) => sum + r.tests.length, 0);
    const passedTests = results.reduce((sum, r) => sum + r.tests.filter(t => t.status === "pass").length, 0);
    const failedTests = results.reduce((sum, r) => sum + r.tests.filter(t => t.status === "fail").length, 0);
    const warningTests = results.reduce((sum, r) => sum + r.tests.filter(t => t.status === "warning").length, 0);
    const skippedTests = results.reduce((sum, r) => sum + r.tests.filter(t => t.status === "skip").length, 0);
    
    const overallStatus = failedTests > 0 ? "fail" : warningTests > 0 ? "warning" : "pass";
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      summary: {
        status: overallStatus,
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        warnings: warningTests,
        skipped: skippedTests,
      },
      categories: results,
    });
  } catch (error) {
    console.error("[Deploy Test] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Test execution failed",
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const categories = body.categories as string[] | undefined;
  
  const start = Date.now();
  
  try {
    let results: CategoryResult[];
    
    if (categories && categories.length > 0) {
      const validCategories = categories.filter(c => testRunners[c]);
      results = await Promise.all(validCategories.map(c => testRunners[c]()));
    } else {
      results = await Promise.all([
        runServiceHealthTests(),
        runDatabaseTests(),
        runOAuthTests(),
        runAIServicesTests(),
        runSSLTests(),
      ]);
    }
    
    const totalTests = results.reduce((sum, r) => sum + r.tests.length, 0);
    const passedTests = results.reduce((sum, r) => sum + r.tests.filter(t => t.status === "pass").length, 0);
    const failedTests = results.reduce((sum, r) => sum + r.tests.filter(t => t.status === "fail").length, 0);
    const warningTests = results.reduce((sum, r) => sum + r.tests.filter(t => t.status === "warning").length, 0);
    const skippedTests = results.reduce((sum, r) => sum + r.tests.filter(t => t.status === "skip").length, 0);
    
    const overallStatus = failedTests > 0 ? "fail" : warningTests > 0 ? "warning" : "pass";
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      summary: {
        status: overallStatus,
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        warnings: warningTests,
        skipped: skippedTests,
      },
      categories: results,
    });
  } catch (error) {
    console.error("[Deploy Test] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Test execution failed",
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
      },
      { status: 500 }
    );
  }
}
