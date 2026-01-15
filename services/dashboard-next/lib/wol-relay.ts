import { Client } from "ssh2";
import { getSSHPrivateKey, getServerById, ServerConfig } from "./server-config-store";
import wol from "wake_on_lan";
import { peerDiscovery } from "./peer-discovery";

export interface WolRelayResult {
  success: boolean;
  method: "relay" | "direct";
  message?: string;
  error?: string;
  discoverySource?: "registry" | "config" | "fallback";
}

export interface WolRelayOptions {
  macAddress: string;
  broadcastAddress?: string;
  relayServerId?: string;
  waitForOnline?: boolean;
  waitTimeoutMs?: number;
  useServiceDiscovery?: boolean;
}

async function executeSSHCommand(
  host: string,
  user: string,
  command: string,
  port: number = 22
): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const privateKey = getSSHPrivateKey();

    if (!privateKey) {
      resolve({ success: false, error: "SSH key not found" });
      return;
    }

    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ success: false, error: "Connection timeout" });
    }, 30000);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({ success: false, error: err.message });
          return;
        }

        let output = "";
        let errorOutput = "";

        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timeout);
          conn.end();
          if (code === 0) {
            resolve({ success: true, output: output.trim() });
          } else {
            resolve({
              success: false,
              error: errorOutput.trim() || output.trim() || `Command exited with code ${code}`,
            });
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });

    try {
      conn.connect({
        host,
        port,
        username: user,
        privateKey: privateKey,
        readyTimeout: 30000,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    }
  });
}

async function sendDirectWol(
  macAddress: string,
  broadcastAddress: string = "255.255.255.255"
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    wol.wake(macAddress, { address: broadcastAddress }, (err: Error | null) => {
      if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true });
      }
    });
  });
}

export async function sendWolViaRelay(
  options: WolRelayOptions
): Promise<WolRelayResult> {
  const { macAddress, broadcastAddress = "255.255.255.255", relayServerId, useServiceDiscovery = true } = options;

  if (!relayServerId) {
    console.log("[WoL Relay] No relay server specified, sending direct WoL packet");
    const result = await sendDirectWol(macAddress, broadcastAddress);
    return {
      success: result.success,
      method: "direct",
      message: result.success ? "Direct WoL packet sent" : undefined,
      error: result.error,
    };
  }

  let relayServer: ServerConfig | null = null;
  let discoverySource: "registry" | "config" | "fallback" = "config";

  if (useServiceDiscovery) {
    try {
      const wolRelay = await peerDiscovery.discoverWoLRelayServer();
      if (wolRelay && wolRelay.healthy) {
        const endpoint = wolRelay.endpoint.replace(/^(ssh|https?):\/\//, "");
        const [host, portStr] = endpoint.split(":");
        const port = portStr ? parseInt(portStr, 10) : 22;
        
        relayServer = {
          id: wolRelay.name,
          name: wolRelay.name,
          host: host,
          user: "evin",
          port: port,
        };
        discoverySource = "registry";
        console.log(`[WoL Relay] Discovered relay server via service registry: ${wolRelay.name} at ${host}:${port}`);
      }
    } catch (error) {
      console.warn("[WoL Relay] Service discovery failed, falling back to config:", error);
    }
  }

  if (!relayServer) {
    relayServer = await getServerById(relayServerId) || null;
    if (relayServer) {
      discoverySource = "config";
    }
  }

  if (!relayServer) {
    console.error(`[WoL Relay] Relay server '${relayServerId}' not found`);
    return {
      success: false,
      method: "relay",
      error: `Relay server '${relayServerId}' not found in configuration`,
    };
  }

  console.log(`[WoL Relay] Using relay server: ${relayServer.name} (${relayServer.host}) [source: ${discoverySource}]`);

  const wolCommands = [
    `wakeonlan ${macAddress}`,
    `etherwake ${macAddress}`,
    `/usr/sbin/etherwake ${macAddress}`,
    `sudo wakeonlan ${macAddress}`,
    `sudo etherwake ${macAddress}`,
  ];

  for (const command of wolCommands) {
    console.log(`[WoL Relay] Trying command: ${command}`);
    const result = await executeSSHCommand(
      relayServer.host,
      relayServer.user,
      command,
      relayServer.port || 22
    );

    if (result.success) {
      console.log(`[WoL Relay] Successfully sent WoL via: ${command}`);
      return {
        success: true,
        method: "relay",
        message: `WoL packet sent via ${relayServer.name} using ${command.split(" ")[0]}`,
        discoverySource,
      };
    }

    console.log(`[WoL Relay] Command failed: ${result.error}`);
  }

  console.log("[WoL Relay] Falling back to direct WoL");
  const directResult = await sendDirectWol(macAddress, broadcastAddress);
  return {
    success: directResult.success,
    method: "direct",
    message: directResult.success
      ? "WoL sent directly (relay commands failed)"
      : undefined,
    error: directResult.success
      ? undefined
      : `Relay failed and direct WoL also failed: ${directResult.error}`,
  };
}

export async function checkServerOnline(
  host: string,
  port: number = 22,
  timeoutMs: number = 5000
): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require("net");
    const socket = new net.Socket();

    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.on("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

export async function wakeAndWaitForOnline(
  options: WolRelayOptions & { targetHost: string; checkPort?: number }
): Promise<WolRelayResult & { online: boolean }> {
  const {
    targetHost,
    checkPort = 22,
    waitTimeoutMs = 120000,
  } = options;

  const isAlreadyOnline = await checkServerOnline(targetHost, checkPort);
  if (isAlreadyOnline) {
    return {
      success: true,
      method: "direct",
      message: "Server is already online",
      online: true,
    };
  }

  const wolResult = await sendWolViaRelay(options);
  if (!wolResult.success) {
    return { ...wolResult, online: false };
  }

  console.log(`[WoL Relay] Waiting for ${targetHost}:${checkPort} to come online...`);

  const startTime = Date.now();
  const pollInterval = 5000;

  while (Date.now() - startTime < waitTimeoutMs) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const online = await checkServerOnline(targetHost, checkPort);
    if (online) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[WoL Relay] Server came online after ${elapsed}s`);
      return {
        ...wolResult,
        message: `${wolResult.message} - Server online after ${elapsed}s`,
        online: true,
      };
    }

    console.log(`[WoL Relay] Still waiting... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
  }

  return {
    ...wolResult,
    message: `${wolResult.message} - Timed out waiting for server`,
    online: false,
  };
}

export async function getWolCapableServers(): Promise<ServerConfig[]> {
  const { getAllServers } = await import("./server-config-store");
  const servers = await getAllServers();
  return servers.filter((s) => s.supportsWol && s.macAddress);
}
