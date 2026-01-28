"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Globe,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Server,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Rocket,
  Wifi,
  WifiOff,
  Activity,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface DomainStatus {
  domain: string;
  service: string;
  backend: string;
  dnsStatus: "checking" | "resolved" | "failed" | "pending";
  dnsIp: string | null;
  httpsStatus: "checking" | "valid" | "invalid" | "pending";
  httpsExpiry: string | null;
  backendStatus: "checking" | "online" | "offline" | "pending";
  lastChecked: string | null;
}

const CONFIGURED_DOMAINS: { domain: string; service: string; backend: string }[] = [
  { domain: "bot.evindrake.net", service: "Discord Bot", backend: "discord-bot:4000" },
  { domain: "stream.evindrake.net", service: "Stream Bot", backend: "stream-bot:5001" },
  { domain: "discord.evindrake.net", service: "Discord Bot", backend: "discord-bot:4000" },
  { domain: "rig-city.com", service: "Static Site", backend: "rig-city-site:80" },
  { domain: "host.evindrake.net", service: "Dashboard", backend: "dockerhost:5000" },
  { domain: "dashboard.evindrake.net", service: "Dashboard", backend: "dockerhost:5000" },
  { domain: "n8n.evindrake.net", service: "N8N", backend: "n8n:5678" },
  { domain: "code.evindrake.net", service: "Code Server", backend: "code-server-proxy:8080" },
  { domain: "scarletredjoker.com", service: "Static Site", backend: "scarletredjoker-web:80" },
  { domain: "plex.evindrake.net", service: "Plex", backend: "10.200.0.2:32400" },
  { domain: "home.evindrake.net", service: "Home Assistant", backend: "10.200.0.2:8123" },
  { domain: "game.evindrake.net", service: "Game Streaming", backend: "10.200.0.2:47990" },
  { domain: "grafana.evindrake.net", service: "Grafana", backend: "homelab-grafana:3000" },
  { domain: "dns.evindrake.net", service: "DNS Manager", backend: "dns-manager:8001" },
  { domain: "dash.evindrake.net", service: "Dashboard", backend: "dockerhost:5000" },
  { domain: "mail.evindrake.net", service: "Mail", backend: "localhost:8025" },
  { domain: "webmail.evindrake.net", service: "Webmail", backend: "localhost:8025" },
];

export default function DomainsVerifyPage() {
  const router = useRouter();
  const [domains, setDomains] = useState<DomainStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/users/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user?.role === "admin") {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
            setAuthError("Admin access required to view this page");
          }
        } else if (res.status === 401) {
          router.push("/login");
        } else {
          setIsAdmin(false);
          setAuthError("Failed to verify permissions");
        }
      } catch (error) {
        setIsAdmin(false);
        setAuthError("Failed to verify permissions");
      }
    };
    checkAuth();
  }, [router]);

  const initializeDomains = useCallback(() => {
    const initialDomains: DomainStatus[] = CONFIGURED_DOMAINS.map((d) => ({
      domain: d.domain,
      service: d.service,
      backend: d.backend,
      dnsStatus: "pending",
      dnsIp: null,
      httpsStatus: "pending",
      httpsExpiry: null,
      backendStatus: "pending",
      lastChecked: null,
    }));
    setDomains(initialDomains);
    setLoading(false);
  }, []);

  useEffect(() => {
    initializeDomains();
  }, [initializeDomains]);

  const verifyDomain = async (domain: string): Promise<DomainStatus | null> => {
    try {
      const res = await fetch("/api/domains-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });

      if (!res.ok) throw new Error("Verification failed");
      const data = await res.json();
      return data;
    } catch (error) {
      console.error(`Failed to verify ${domain}:`, error);
      return null;
    }
  };

  const handleVerifySingle = async (domain: string) => {
    setVerifyingDomain(domain);

    setDomains((prev) =>
      prev.map((d) =>
        d.domain === domain
          ? {
              ...d,
              dnsStatus: "checking",
              httpsStatus: "checking",
              backendStatus: "checking",
            }
          : d
      )
    );

    const result = await verifyDomain(domain);

    if (result) {
      setDomains((prev) =>
        prev.map((d) => (d.domain === domain ? { ...d, ...result } : d))
      );
      toast({
        title: "Verification Complete",
        description: `${domain} has been verified`,
      });
    } else {
      setDomains((prev) =>
        prev.map((d) =>
          d.domain === domain
            ? {
                ...d,
                dnsStatus: "failed",
                httpsStatus: "invalid",
                backendStatus: "offline",
                lastChecked: new Date().toISOString(),
              }
            : d
        )
      );
      toast({
        title: "Verification Failed",
        description: `Failed to verify ${domain}`,
        variant: "destructive",
      });
    }

    setVerifyingDomain(null);
  };

  const handleVerifyAll = async () => {
    setVerifyingAll(true);

    setDomains((prev) =>
      prev.map((d) => ({
        ...d,
        dnsStatus: "checking",
        httpsStatus: "checking",
        backendStatus: "checking",
      }))
    );

    try {
      const res = await fetch("/api/domains-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifyAll: true }),
      });

      if (!res.ok) throw new Error("Verification failed");
      const data = await res.json();

      if (data.results) {
        setDomains((prev) =>
          prev.map((d) => {
            const result = data.results.find(
              (r: DomainStatus) => r.domain === d.domain
            );
            return result ? { ...d, ...result } : d;
          })
        );
      }

      const successCount = data.results?.filter(
        (r: DomainStatus) => r.dnsStatus === "resolved"
      ).length || 0;

      toast({
        title: "Verification Complete",
        description: `${successCount}/${domains.length} domains verified successfully`,
      });
    } catch (error) {
      toast({
        title: "Verification Failed",
        description: "Failed to verify domains",
        variant: "destructive",
      });
    } finally {
      setVerifyingAll(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);

    try {
      const res = await fetch("/api/deploy/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "linode",
          services: ["caddy"],
        }),
      });

      if (!res.ok) throw new Error("Deployment failed");

      toast({
        title: "Deployment Started",
        description: "Caddy configuration is being deployed",
      });
    } catch (error) {
      toast({
        title: "Deployment Failed",
        description: "Failed to trigger deployment",
        variant: "destructive",
      });
    } finally {
      setDeploying(false);
    }
  };

  const getDnsStatusBadge = (status: string, ip: string | null) => {
    switch (status) {
      case "resolved":
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            {ip || "Resolved"}
          </Badge>
        );
      case "checking":
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Checking
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
    }
  };

  const getHttpsStatusBadge = (status: string, expiry: string | null) => {
    let expiryText = "";
    if (expiry) {
      const days = Math.ceil(
        (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      expiryText = days > 0 ? ` (${days}d)` : " (Expired)";
    }

    switch (status) {
      case "valid":
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            <ShieldCheck className="mr-1 h-3 w-3" />
            Valid{expiryText}
          </Badge>
        );
      case "checking":
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Checking
          </Badge>
        );
      case "invalid":
        return (
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
            <ShieldAlert className="mr-1 h-3 w-3" />
            Invalid
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">
            <Shield className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
    }
  };

  const getBackendStatusBadge = (status: string) => {
    switch (status) {
      case "online":
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            <Wifi className="mr-1 h-3 w-3" />
            Online
          </Badge>
        );
      case "checking":
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Checking
          </Badge>
        );
      case "offline":
        return (
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
            <WifiOff className="mr-1 h-3 w-3" />
            Offline
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">
            <Server className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
    }
  };

  const formatLastChecked = (timestamp: string | null) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const resolvedCount = domains.filter((d) => d.dnsStatus === "resolved").length;
  const httpsValidCount = domains.filter((d) => d.httpsStatus === "valid").length;
  const onlineCount = domains.filter((d) => d.backendStatus === "online").length;

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground">{authError || "Admin access required to view this page"}</p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
            <Activity className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Domain Verification
            </h1>
            <p className="text-sm text-muted-foreground">
              Check DNS, SSL, and backend status for all configured domains
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleVerifyAll}
            disabled={verifyingAll}
            variant="outline"
          >
            {verifyingAll ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Verify All
          </Button>
          <Button onClick={handleDeploy} disabled={deploying}>
            {deploying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            Deploy Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Domains</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{domains.length}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">DNS Resolved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {resolvedCount}/{domains.length}
            </div>
            <Progress
              value={(resolvedCount / domains.length) * 100}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Valid SSL</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {httpsValidCount}/{domains.length}
            </div>
            <Progress
              value={(httpsValidCount / domains.length) * 100}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-cyan-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Backends Online</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-500">
              {onlineCount}/{domains.length}
            </div>
            <Progress
              value={(onlineCount / domains.length) * 100}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Domains</CardTitle>
          <CardDescription>
            Domains from Caddyfile configuration with their current status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Backend</TableHead>
                  <TableHead>DNS</TableHead>
                  <TableHead>HTTPS/SSL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Checked</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((domain) => (
                  <TableRow key={domain.domain}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        <a
                          href={`https://${domain.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline flex items-center gap-1"
                        >
                          {domain.domain}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{domain.service}</Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {domain.backend}
                      </code>
                    </TableCell>
                    <TableCell>
                      {getDnsStatusBadge(domain.dnsStatus, domain.dnsIp)}
                    </TableCell>
                    <TableCell>
                      {getHttpsStatusBadge(domain.httpsStatus, domain.httpsExpiry)}
                    </TableCell>
                    <TableCell>
                      {getBackendStatusBadge(domain.backendStatus)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatLastChecked(domain.lastChecked)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVerifySingle(domain.domain)}
                        disabled={verifyingDomain === domain.domain || verifyingAll}
                      >
                        {verifyingDomain === domain.domain ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
