"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Terminal, Wifi, WifiOff, Loader2, Power, RefreshCw } from "lucide-react";

const SSHTerminal = dynamic(
  () => import("@/components/terminal/ssh-terminal").then((mod) => mod.SSHTerminal),
  { ssr: false }
);

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

const servers = [
  { id: "linode", name: "Linode Server", description: "root@linode.evindrake.net" },
  { id: "home", name: "Home Server", description: "evin@host.evindrake.net" },
];

export default function TerminalPage() {
  const [selectedServer, setSelectedServer] = useState<string>("linode");
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [sessionKey, setSessionKey] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  const handleConnect = useCallback(() => {
    setIsConnected(true);
    setSessionKey((prev) => prev + 1);
  }, []);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    setStatus("disconnected");
  }, []);

  const handleReconnect = useCallback(() => {
    setSessionKey((prev) => prev + 1);
  }, []);

  const handleStatusChange = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
  }, []);

  const getStatusIcon = () => {
    switch (status) {
      case "connecting":
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
      case "connected":
        return <Wifi className="h-4 w-4 text-green-500" />;
      case "error":
        return <WifiOff className="h-4 w-4 text-red-500" />;
      default:
        return <WifiOff className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "connecting":
        return "Connecting...";
      case "connected":
        return "Connected";
      case "error":
        return "Connection Error";
      default:
        return "Disconnected";
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "connecting":
        return "text-yellow-500";
      case "connected":
        return "text-green-500";
      case "error":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Terminal className="h-8 w-8" />
            SSH Terminal
          </h1>
          <p className="text-muted-foreground">
            Connect to remote servers via secure SSH
          </p>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="border-b py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Select
                value={selectedServer}
                onValueChange={setSelectedServer}
                disabled={isConnected}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select server" />
                </SelectTrigger>
                <SelectContent>
                  {servers.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      <div className="flex flex-col">
                        <span>{server.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {server.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className={`flex items-center gap-2 ${getStatusColor()}`}>
                {getStatusIcon()}
                <span className="text-sm font-medium">{getStatusText()}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isConnected ? (
                <Button onClick={handleConnect} className="gap-2">
                  <Terminal className="h-4 w-4" />
                  Connect
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleReconnect}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reconnect
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDisconnect}
                    className="gap-2"
                  >
                    <Power className="h-4 w-4" />
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          {isConnected ? (
            <SSHTerminal
              key={sessionKey}
              serverId={selectedServer}
              onStatusChange={handleStatusChange}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full bg-[#1a1a2e] text-white/60">
              <Terminal className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg">Select a server and click Connect</p>
              <p className="text-sm mt-2">
                Available servers: Linode, Home Server
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
