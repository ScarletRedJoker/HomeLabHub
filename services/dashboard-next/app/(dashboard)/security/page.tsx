"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  Search,
  Scan,
  Lock,
  Globe,
  Server,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  Network,
  Key,
  ShieldAlert,
  ShieldCheck,
  Eye,
  Terminal,
  Activity,
  Clock,
  User,
  AlertCircle,
  ExternalLink,
  Play,
  Monitor,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";

interface PortResult {
  port: number;
  open: boolean;
  service?: string;
}

interface SSLResult {
  valid: boolean;
  issuer?: any;
  subject?: any;
  validFrom?: string;
  validTo?: string;
  daysUntilExpiry?: number;
  expired?: boolean;
  expiringSoon?: boolean;
  protocol?: string;
  error?: string;
}

interface HeadersResult {
  url: string;
  statusCode?: number;
  headers?: Record<string, { present: boolean; value: string | null; recommendation: string }>;
  score?: number;
  grade?: string;
  error?: string;
}

interface DNSResult {
  hostname: string;
  a?: string[];
  aaaa?: string[];
  mx?: { exchange: string; priority: number }[];
  txt?: string[][];
  ns?: string[];
  cname?: string[];
  reverse?: string[];
  error?: string;
}

interface VulnerabilityResult {
  url: string;
  vulnerabilities: {
    severity: string;
    type: string;
    title: string;
    description: string;
  }[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    warning: number;
    total: number;
  };
}

interface SecurityEvent {
  id: number;
  action: string;
  username?: string;
  timestamp: string;
  status: string;
  details?: any;
}

export default function SecurityToolsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("scanning");
  const { toast } = useToast();
  
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [portTarget, setPortTarget] = useState("");
  const [portScanning, setPortScanning] = useState(false);
  const [portResults, setPortResults] = useState<PortResult[] | null>(null);
  
  const [sslTarget, setSslTarget] = useState("");
  const [sslScanning, setSslScanning] = useState(false);
  const [sslResults, setSslResults] = useState<SSLResult | null>(null);
  
  const [headersTarget, setHeadersTarget] = useState("");
  const [headersScanning, setHeadersScanning] = useState(false);
  const [headersResults, setHeadersResults] = useState<HeadersResult | null>(null);
  
  const [vulnTarget, setVulnTarget] = useState("");
  const [vulnScanning, setVulnScanning] = useState(false);
  const [vulnResults, setVulnResults] = useState<VulnerabilityResult | null>(null);
  
  const [dnsTarget, setDnsTarget] = useState("");
  const [dnsScanning, setDnsScanning] = useState(false);
  const [dnsResults, setDnsResults] = useState<DNSResult | null>(null);
  
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  
  const [vmStatus, setVmStatus] = useState<any>(null);
  const [vmLoading, setVmLoading] = useState(false);

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

  const runPortScan = async () => {
    if (!portTarget) {
      toast({ title: "Error", description: "Please enter a target host", variant: "destructive" });
      return;
    }
    
    setPortScanning(true);
    setPortResults(null);
    
    try {
      const res = await fetch("/api/security?action=port-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: portTarget }),
      });
      const data = await res.json();
      
      if (data.error) {
        toast({ title: "Scan Failed", description: data.error, variant: "destructive" });
      } else {
        setPortResults(data.results);
        toast({ title: "Scan Complete", description: `Found ${data.openPorts} open ports` });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setPortScanning(false);
    }
  };

  const runSSLCheck = async () => {
    if (!sslTarget) {
      toast({ title: "Error", description: "Please enter a hostname", variant: "destructive" });
      return;
    }
    
    setSslScanning(true);
    setSslResults(null);
    
    try {
      const res = await fetch("/api/security?action=ssl-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: sslTarget }),
      });
      const data = await res.json();
      setSslResults(data);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSslScanning(false);
    }
  };

  const runHeadersCheck = async () => {
    if (!headersTarget) {
      toast({ title: "Error", description: "Please enter a URL", variant: "destructive" });
      return;
    }
    
    setHeadersScanning(true);
    setHeadersResults(null);
    
    try {
      const res = await fetch("/api/security?action=headers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: headersTarget }),
      });
      const data = await res.json();
      setHeadersResults(data);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setHeadersScanning(false);
    }
  };

  const runVulnScan = async () => {
    if (!vulnTarget) {
      toast({ title: "Error", description: "Please enter a URL", variant: "destructive" });
      return;
    }
    
    setVulnScanning(true);
    setVulnResults(null);
    
    try {
      const res = await fetch("/api/security?action=vulnerability-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: vulnTarget }),
      });
      const data = await res.json();
      setVulnResults(data);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setVulnScanning(false);
    }
  };

  const runDnsLookup = async () => {
    if (!dnsTarget) {
      toast({ title: "Error", description: "Please enter a hostname", variant: "destructive" });
      return;
    }
    
    setDnsScanning(true);
    setDnsResults(null);
    
    try {
      const res = await fetch("/api/security?action=dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: dnsTarget }),
      });
      const data = await res.json();
      setDnsResults(data);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setDnsScanning(false);
    }
  };

  const fetchSecurityEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await fetch("/api/security/events?limit=50");
      if (res.ok) {
        const data = await res.json();
        setSecurityEvents(data.events || []);
      }
    } catch (error) {
      console.error("Failed to fetch security events:", error);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const fetchVMStatus = useCallback(async () => {
    setVmLoading(true);
    try {
      const res = await fetch("/api/vm");
      if (res.ok) {
        const data = await res.json();
        const securityVm = data.vms?.find((vm: any) => 
          vm.name.toLowerCase().includes("kali") || 
          vm.name.toLowerCase().includes("security") ||
          vm.name.toLowerCase().includes("pentest")
        );
        setVmStatus(securityVm || null);
      }
    } catch (error) {
      console.error("Failed to fetch VM status:", error);
    } finally {
      setVmLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSecurityEvents();
    fetchVMStatus();
  }, [fetchSecurityEvents, fetchVMStatus]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-500";
      case "high": return "bg-orange-500";
      case "medium": return "bg-yellow-500";
      case "warning": return "bg-blue-500";
      default: return "bg-gray-500";
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "A": return "text-green-500";
      case "B": return "text-lime-500";
      case "C": return "text-yellow-500";
      case "D": return "text-orange-500";
      case "F": return "text-red-500";
      default: return "text-gray-500";
    }
  };

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

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Security Tools
          </h1>
          <p className="text-muted-foreground mt-1">
            Penetration testing and security monitoring capabilities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchSecurityEvents(); fetchVMStatus(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Scan className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Port Scanner</p>
                <p className="font-medium">Ready</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Lock className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">SSL Checker</p>
                <p className="font-medium">Ready</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Globe className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">DNS Lookup</p>
                <p className="font-medium">Ready</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <ShieldAlert className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Security Events</p>
                <p className="font-medium">{securityEvents.length} recent</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="scanning">
            <Scan className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Vulnerability</span> Scanning
          </TabsTrigger>
          <TabsTrigger value="network">
            <Network className="h-4 w-4 mr-2" />
            Network Tools
          </TabsTrigger>
          <TabsTrigger value="monitoring">
            <Activity className="h-4 w-4 mr-2" />
            Monitoring
          </TabsTrigger>
          <TabsTrigger value="vm">
            <Server className="h-4 w-4 mr-2" />
            Security VM
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scanning" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scan className="h-5 w-5" />
                  Port Scanner
                </CardTitle>
                <CardDescription>Scan for open ports on a target host</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Target host (e.g., 192.168.1.1 or example.com)"
                    value={portTarget}
                    onChange={(e) => setPortTarget(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runPortScan()}
                  />
                  <Button onClick={runPortScan} disabled={portScanning}>
                    {portScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                </div>
                
                {portResults && (
                  <ScrollArea className="h-[200px] border rounded-lg p-3">
                    {portResults.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No open ports found</p>
                    ) : (
                      <div className="space-y-2">
                        {portResults.map((result) => (
                          <div key={result.port} className="flex items-center justify-between p-2 bg-muted rounded">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span className="font-mono">Port {result.port}</span>
                            </div>
                            {result.service && (
                              <Badge variant="secondary">{result.service}</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  SSL/TLS Certificate Checker
                </CardTitle>
                <CardDescription>Verify SSL certificate validity and details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Hostname (e.g., example.com)"
                    value={sslTarget}
                    onChange={(e) => setSslTarget(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runSSLCheck()}
                  />
                  <Button onClick={runSSLCheck} disabled={sslScanning}>
                    {sslScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                
                {sslResults && (
                  <div className="border rounded-lg p-4 space-y-3">
                    {sslResults.error ? (
                      <div className="flex items-center gap-2 text-red-500">
                        <XCircle className="h-5 w-5" />
                        <span>{sslResults.error}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          {sslResults.valid ? (
                            <ShieldCheck className="h-5 w-5 text-green-500" />
                          ) : (
                            <ShieldAlert className="h-5 w-5 text-red-500" />
                          )}
                          <span className={sslResults.valid ? "text-green-500" : "text-red-500"}>
                            {sslResults.valid ? "Valid Certificate" : "Invalid Certificate"}
                          </span>
                          {sslResults.expired && <Badge variant="destructive">Expired</Badge>}
                          {sslResults.expiringSoon && <Badge className="bg-yellow-500">Expiring Soon</Badge>}
                        </div>
                        
                        {sslResults.subject && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Subject: </span>
                            <span className="font-mono">{sslResults.subject.CN || JSON.stringify(sslResults.subject)}</span>
                          </div>
                        )}
                        
                        {sslResults.validTo && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Expires: </span>
                            <span>{sslResults.validTo}</span>
                            {sslResults.daysUntilExpiry !== undefined && (
                              <span className="ml-2 text-muted-foreground">
                                ({sslResults.daysUntilExpiry} days)
                              </span>
                            )}
                          </div>
                        )}
                        
                        {sslResults.protocol && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Protocol: </span>
                            <span>{sslResults.protocol}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  HTTP Security Headers
                </CardTitle>
                <CardDescription>Analyze security headers configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="URL (e.g., https://example.com)"
                    value={headersTarget}
                    onChange={(e) => setHeadersTarget(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runHeadersCheck()}
                  />
                  <Button onClick={runHeadersCheck} disabled={headersScanning}>
                    {headersScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                
                {headersResults && (
                  <div className="space-y-3">
                    {headersResults.error ? (
                      <div className="flex items-center gap-2 text-red-500">
                        <XCircle className="h-5 w-5" />
                        <span>{headersResults.error}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span>Security Score</span>
                          <div className="flex items-center gap-2">
                            <Progress value={headersResults.score} className="w-24" />
                            <span className={`font-bold text-2xl ${getGradeColor(headersResults.grade || "")}`}>
                              {headersResults.grade}
                            </span>
                          </div>
                        </div>
                        
                        <ScrollArea className="h-[180px]">
                          <div className="space-y-2">
                            {headersResults.headers && Object.entries(headersResults.headers).map(([name, info]) => (
                              <div key={name} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                                <span className="font-mono truncate flex-1">{name}</span>
                                {info.present ? (
                                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" />
                  Vulnerability Scanner
                </CardTitle>
                <CardDescription>Check for common security issues</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="URL to scan"
                    value={vulnTarget}
                    onChange={(e) => setVulnTarget(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runVulnScan()}
                  />
                  <Button onClick={runVulnScan} disabled={vulnScanning}>
                    {vulnScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
                  </Button>
                </div>
                
                {vulnResults && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      {vulnResults.summary.critical > 0 && (
                        <Badge variant="destructive">{vulnResults.summary.critical} Critical</Badge>
                      )}
                      {vulnResults.summary.high > 0 && (
                        <Badge className="bg-orange-500">{vulnResults.summary.high} High</Badge>
                      )}
                      {vulnResults.summary.medium > 0 && (
                        <Badge className="bg-yellow-500">{vulnResults.summary.medium} Medium</Badge>
                      )}
                      {vulnResults.summary.total === 0 && (
                        <Badge className="bg-green-500">No Issues Found</Badge>
                      )}
                    </div>
                    
                    <ScrollArea className="h-[160px]">
                      <div className="space-y-2">
                        {vulnResults.vulnerabilities.map((vuln, idx) => (
                          <div key={idx} className="p-3 border rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-2 h-2 rounded-full ${getSeverityColor(vuln.severity)}`} />
                              <span className="font-medium text-sm">{vuln.title}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{vuln.description}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="network" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  DNS Lookup
                </CardTitle>
                <CardDescription>Query DNS records for a domain</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Hostname (e.g., example.com)"
                    value={dnsTarget}
                    onChange={(e) => setDnsTarget(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runDnsLookup()}
                  />
                  <Button onClick={runDnsLookup} disabled={dnsScanning}>
                    {dnsScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                
                {dnsResults && (
                  <ScrollArea className="h-[300px] border rounded-lg p-3">
                    {dnsResults.error ? (
                      <div className="flex items-center gap-2 text-red-500">
                        <XCircle className="h-5 w-5" />
                        <span>{dnsResults.error}</span>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {dnsResults.a && dnsResults.a.length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">A Records (IPv4)</h4>
                            <div className="space-y-1">
                              {dnsResults.a.map((ip, idx) => (
                                <div key={idx} className="font-mono text-sm p-2 bg-muted rounded">{ip}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {dnsResults.aaaa && dnsResults.aaaa.length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">AAAA Records (IPv6)</h4>
                            <div className="space-y-1">
                              {dnsResults.aaaa.map((ip, idx) => (
                                <div key={idx} className="font-mono text-sm p-2 bg-muted rounded">{ip}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {dnsResults.mx && dnsResults.mx.length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">MX Records</h4>
                            <div className="space-y-1">
                              {dnsResults.mx.map((mx, idx) => (
                                <div key={idx} className="font-mono text-sm p-2 bg-muted rounded">
                                  {mx.priority} {mx.exchange}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {dnsResults.ns && dnsResults.ns.length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">NS Records</h4>
                            <div className="space-y-1">
                              {dnsResults.ns.map((ns, idx) => (
                                <div key={idx} className="font-mono text-sm p-2 bg-muted rounded">{ns}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {dnsResults.txt && dnsResults.txt.length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">TXT Records</h4>
                            <div className="space-y-1">
                              {dnsResults.txt.map((txt, idx) => (
                                <div key={idx} className="font-mono text-xs p-2 bg-muted rounded break-all">
                                  {Array.isArray(txt) ? txt.join("") : txt}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Network Tools
                </CardTitle>
                <CardDescription>Additional network utilities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Ping / Connectivity Test
                    </h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Use the port scanner above to test connectivity to specific ports.
                    </p>
                    <Badge variant="secondary">Available via Port Scanner</Badge>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Traceroute
                    </h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Traceroute requires system-level access. Use the terminal for full traceroute capabilities.
                    </p>
                    <Link href="/terminal">
                      <Button variant="outline" size="sm">
                        Open Terminal
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Whois Lookup
                    </h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Whois queries require external API access. Use the terminal or Domain Manager.
                    </p>
                    <Link href="/domain-manager">
                      <Button variant="outline" size="sm">
                        Domain Manager
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Recent Security Events
                  </CardTitle>
                  <CardDescription>Failed logins and security alerts</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={fetchSecurityEvents} disabled={eventsLoading}>
                  {eventsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {securityEvents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="font-medium">No Recent Events</h3>
                      <p className="text-muted-foreground text-sm mt-1">
                        No security events have been recorded
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {securityEvents.map((event) => (
                        <div key={event.id} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {event.status === "failure" ? (
                                <XCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                              <span className="font-medium text-sm">{event.action}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(event.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {event.username && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span>{event.username}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Access Monitoring
                </CardTitle>
                <CardDescription>SSH and authentication activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <Terminal className="h-4 w-4" />
                        SSH Access Logs
                      </h4>
                      <Badge variant="secondary">System Level</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      SSH access logs are available through the terminal or observability dashboards.
                    </p>
                    <div className="flex gap-2">
                      <Link href="/terminal">
                        <Button variant="outline" size="sm">Terminal</Button>
                      </Link>
                      <Link href="/observability">
                        <Button variant="outline" size="sm">Observability</Button>
                      </Link>
                    </div>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Audit Logs
                      </h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      View detailed audit logs for all system activities.
                    </p>
                    <Link href="/activity">
                      <Button variant="outline" size="sm">
                        View Activity
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                  
                  <div className="p-4 border rounded-lg bg-muted/50">
                    <h4 className="font-medium mb-2">Quick Stats</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Events (24h)</span>
                        <p className="font-medium text-lg">{securityEvents.filter(e => 
                          new Date(e.timestamp) > new Date(Date.now() - 86400000)
                        ).length}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Failed Attempts</span>
                        <p className="font-medium text-lg text-red-500">
                          {securityEvents.filter(e => e.status === "failure").length}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="vm" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Security VM Status
                </CardTitle>
                <CardDescription>Kali Linux or security testing VM</CardDescription>
              </CardHeader>
              <CardContent>
                {vmLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : vmStatus ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          vmStatus.status === "running" ? "bg-green-500/10" : "bg-gray-500/10"
                        }`}>
                          <Monitor className={`h-5 w-5 ${
                            vmStatus.status === "running" ? "text-green-500" : "text-gray-500"
                          }`} />
                        </div>
                        <div>
                          <h4 className="font-medium">{vmStatus.name}</h4>
                          <Badge className={vmStatus.status === "running" ? "bg-green-500" : ""}>
                            {vmStatus.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    
                    <Link href="/vms">
                      <Button className="w-full">
                        <Server className="h-4 w-4 mr-2" />
                        Manage VM
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-medium">No Security VM Found</h3>
                    <p className="text-muted-foreground text-sm mt-1 max-w-md">
                      No Kali Linux or security-focused VM was detected. You can create one from the VM Manager.
                    </p>
                    <Link href="/vms" className="mt-4">
                      <Button variant="outline">
                        <Server className="h-4 w-4 mr-2" />
                        VM Manager
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Kali Docker Container
                </CardTitle>
                <CardDescription>Run security tools in an isolated container</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg bg-muted/50">
                    <h4 className="font-medium mb-2">Kali Linux Container</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Spin up a Kali Linux container for penetration testing with all tools pre-installed.
                    </p>
                    <div className="bg-black/80 text-green-400 font-mono text-xs p-3 rounded mb-4">
                      docker run -it kalilinux/kali-rolling
                    </div>
                    <Badge variant="secondary">Docker Required</Badge>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Quick Access</h4>
                    <div className="flex flex-wrap gap-2">
                      <Link href="/terminal">
                        <Button variant="outline" size="sm">
                          <Terminal className="h-4 w-4 mr-2" />
                          Terminal
                        </Button>
                      </Link>
                      <Link href="/vms">
                        <Button variant="outline" size="sm">
                          <Server className="h-4 w-4 mr-2" />
                          VMs
                        </Button>
                      </Link>
                      <Link href="/services">
                        <Button variant="outline" size="sm">
                          <Activity className="h-4 w-4 mr-2" />
                          Services
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Security Tools Reference</CardTitle>
              <CardDescription>Common tools available in Kali Linux</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { name: "Nmap", desc: "Network scanner and security auditing" },
                  { name: "Metasploit", desc: "Penetration testing framework" },
                  { name: "Burp Suite", desc: "Web vulnerability scanner" },
                  { name: "Wireshark", desc: "Network protocol analyzer" },
                  { name: "Nikto", desc: "Web server scanner" },
                  { name: "SQLMap", desc: "SQL injection automation" },
                  { name: "Hydra", desc: "Password cracking tool" },
                  { name: "John the Ripper", desc: "Password recovery" },
                  { name: "Aircrack-ng", desc: "WiFi security auditing" },
                ].map((tool) => (
                  <div key={tool.name} className="p-3 border rounded-lg">
                    <h4 className="font-medium text-sm">{tool.name}</h4>
                    <p className="text-xs text-muted-foreground">{tool.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
