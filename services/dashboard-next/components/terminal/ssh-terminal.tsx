"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface SSHTerminalProps {
  serverId: string;
  onStatusChange?: (status: "connecting" | "connected" | "disconnected" | "error") => void;
  onDisconnect?: () => void;
}

export function SSHTerminal({ serverId, onStatusChange, onDisconnect }: SSHTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(async () => {
    if (!terminalRef.current) return;

    onStatusChange?.("connecting");

    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.dispose();
    }

    const terminal = new Terminal({
      cursorBlink: true,
      theme: {
        background: "#1a1a2e",
        foreground: "#eee",
        cursor: "#fff",
        cursorAccent: "#1a1a2e",
        selectionBackground: "#5a5a8e",
        black: "#1a1a2e",
        red: "#ff6b6b",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#f1f5f9",
      },
      fontFamily: '"Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.open(terminalRef.current);
    
    setTimeout(() => {
      fitAddon.fit();
    }, 100);

    terminal.writeln("\x1b[1;34m╔════════════════════════════════════════╗\x1b[0m");
    terminal.writeln("\x1b[1;34m║\x1b[0m    \x1b[1;32mNebula Command SSH Terminal\x1b[0m         \x1b[1;34m║\x1b[0m");
    terminal.writeln("\x1b[1;34m╚════════════════════════════════════════╝\x1b[0m");
    terminal.writeln("");
    terminal.writeln(`\x1b[33mConnecting to ${serverId}...\x1b[0m`);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

    try {
      const tokenRes = await fetch("/api/terminal");
      if (!tokenRes.ok) {
        terminal.writeln("\x1b[31mFailed to get terminal auth token\x1b[0m");
        onStatusChange?.("error");
        return;
      }
      const { token } = await tokenRes.json();
      
      const wsHost = window.location.host;
      const wsUrl = `${protocol}//${wsHost}/terminal-ws/terminal?server=${serverId}&token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        terminal.writeln("\x1b[32mWebSocket connected, establishing SSH session...\x1b[0m");
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === "connected") {
          terminal.writeln(`\x1b[32mSSH session established to ${data.host}\x1b[0m\r\n`);
          setIsConnected(true);
          onStatusChange?.("connected");
          
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
          }
        } else if (data.type === "data") {
          terminal.write(data.data);
        } else if (data.type === "error") {
          terminal.writeln(`\x1b[31mError: ${data.message}\x1b[0m`);
          onStatusChange?.("error");
        } else if (data.type === "closed") {
          terminal.writeln("\r\n\x1b[33mSSH session closed\x1b[0m");
          setIsConnected(false);
          onStatusChange?.("disconnected");
        }
      };

      ws.onerror = () => {
        terminal.writeln("\x1b[31mWebSocket connection error\x1b[0m");
        onStatusChange?.("error");
      };

      ws.onclose = () => {
        terminal.writeln("\r\n\x1b[33mConnection closed\x1b[0m");
        setIsConnected(false);
        onStatusChange?.("disconnected");
      };

      terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

    } catch (error) {
      terminal.writeln(`\x1b[31mFailed to connect: ${error}\x1b[0m`);
      onStatusChange?.("error");
    }
  }, [serverId, onStatusChange]);

  useEffect(() => {
    connect();

    const handleResize = () => {
      if (fitAddonRef.current && terminalInstanceRef.current) {
        fitAddonRef.current.fit();
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
        }
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose();
      }
    };
  }, [connect]);

  useEffect(() => {
    if (onDisconnect) {
      const disconnect = () => {
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
      return () => disconnect();
    }
  }, [onDisconnect]);

  return (
    <div 
      ref={terminalRef} 
      className="w-full h-full min-h-[400px] bg-[#1a1a2e] rounded-lg overflow-hidden"
      style={{ padding: "8px" }}
    />
  );
}

export function disconnectTerminal() {
  return () => {};
}
