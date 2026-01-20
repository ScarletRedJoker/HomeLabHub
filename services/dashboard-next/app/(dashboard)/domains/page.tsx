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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Globe,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Server,
  Trash2,
  ExternalLink,
  Cloud,
  Loader2,
  Search,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  AlertCircle,
  Settings,
  Zap,
  Activity,
  Link as LinkIcon,
  FileText,
  Eye,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface Domain {
  id: string;
  name: string;
  provider: string | null;
  zoneId: string | null;
  status: string;
  sslStatus: string | null;
  sslExpiresAt: string | null;
  recordCount: number;
  createdAt: string | null;
}

interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

interface CloudflareStatus {
  configured: boolean;
  connected: boolean;
  error: string | null;
  zonesAvailable: number;
}

interface Service {
  id: string;
  name: string;
  displayName: string | null;
  url: string | null;
  status: string | null;
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [cloudflareZones, setCloudflareZones] = useState<CloudflareZone[]>([]);
  const [cloudflareEnabled, setCloudflareEnabled] = useState(false);
  const [cloudflareStatus, setCloudflareStatus] = useState<CloudflareStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [verifyResults, setVerifyResults] = useState<Record<string, any>>({});

  const [newDomain, setNewDomain] = useState({
    name: "",
    provider: "cloudflare",
    zoneId: "",
    importFromCloudflare: true,
  });

  const { toast } = useToast();
  const router = useRouter();

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/domains");
      if (!res.ok) throw new Error("Failed to fetch domains");
      const data = await res.json();
      setDomains(data.domains || []);
      setCloudflareZones(data.cloudflareZones || []);
      setCloudflareEnabled(data.cloudflareEnabled || false);
      setCloudflareStatus(data.cloudflareStatus || null);
    } catch (error) {
      console.error("Failed to fetch domains:", error);
      toast({
        title: "Error",
        description: "Failed to fetch domains",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch("/api/services");
      if (res.ok) {
        const data = await res.json();
        setServices(data.services || []);
      }
    } catch (error) {
      console.error("Failed to fetch services:", error);
    }
  }, []);

  useEffect(() => {
    fetchDomains();
    fetchServices();
  }, [fetchDomains, fetchServices]);

  const handleAddDomain = async () => {
    if (!newDomain.name) {
      toast({
        title: "Error",
        description: "Domain name is required",
        variant: "destructive",
      });
      return;
    }

    setActionLoading("add-domain");
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDomain),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add domain");

      toast({
        title: "Success",
        description: `Domain ${newDomain.name} added successfully`,
      });

      setAddDomainOpen(false);
      setNewDomain({
        name: "",
        provider: "cloudflare",
        zoneId: "",
        importFromCloudflare: true,
      });
      fetchDomains();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteDomain = async (domainId: string, domainName: string) => {
    if (!confirm(`Are you sure you want to delete ${domainName} and all its records?`)) {
      return;
    }

    setActionLoading(`delete-${domainId}`);
    try {
      const res = await fetch(`/api/domains/${domainId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete domain");

      toast({ title: "Success", description: `Domain ${domainName} deleted` });
      fetchDomains();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSyncDomain = async (domainId: string) => {
    if (!cloudflareStatus?.configured) {
      toast({
        title: "Cloudflare Not Configured",
        description: "Add CLOUDFLARE_API_TOKEN in Secrets Manager to enable sync",
        variant: "destructive",
      });
      return;
    }

    setActionLoading(`sync-${domainId}`);
    try {
      const res = await fetch(`/api/domains/${domainId}/sync`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === "CLOUDFLARE_NOT_CONFIGURED") {
          toast({
            title: "Cloudflare Not Configured",
            description: data.message || "Add CLOUDFLARE_API_TOKEN to enable sync",
            variant: "destructive",
          });
          return;
        }
        if (data.code === "ZONE_NOT_LINKED") {
          toast({
            title: "Zone Not Linked",
            description: data.message || "Link this domain to a Cloudflare zone first",
            variant: "destructive",
          });
          return;
        }
        throw new Error(data.error || "Failed to sync");
      }

      toast({
        title: "Success",
        description: data.message || "Synced with Cloudflare",
      });
      fetchDomains();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerifyDomain = async (domainId: string, domainName: string) => {
    setActionLoading(`verify-${domainId}`);
    try {
      const res = await fetch(`/api/domains/${domainId}/verify`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify");

      setVerifyResults((prev) => ({ ...prev, [domainId]: data }));

      toast({
        title: data.propagated ? "DNS Propagated" : "DNS Pending",
        description: data.propagated
          ? `${domainName} is fully propagated`
          : `${domainName} is still propagating`,
        variant: data.propagated ? "default" : "destructive",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefreshSSL = async (domainId: string) => {
    setActionLoading(`ssl-${domainId}`);
    try {
      const res = await fetch(`/api/domains/${domainId}/ssl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to refresh SSL");

      toast({
        title: "SSL Status Updated",
        description: `SSL status: ${data.status}`,
      });
      fetchDomains();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredDomains = domains.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Active
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
            <Clock className="mr-1 h-3 w-3" /> Pending
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
            <AlertCircle className="mr-1 h-3 w-3" /> Error
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSSLBadge = (status: string | null, expiresAt: string | null) => {
    let daysUntilExpiry = null;
    if (expiresAt) {
      const now = new Date();
      const expiry = new Date(expiresAt);
      daysUntilExpiry = Math.ceil(
        (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    if (status === "valid" && daysUntilExpiry !== null && daysUntilExpiry <= 30) {
      return (
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
          <Shield className="mr-1 h-3 w-3" /> Expiring ({daysUntilExpiry}d)
        </Badge>
      );
    }

    switch (status) {
      case "valid":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
            <ShieldCheck className="mr-1 h-3 w-3" /> Valid
          </Badge>
        );
      case "expiring":
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
            <Shield className="mr-1 h-3 w-3" /> Expiring
          </Badge>
        );
      case "expired":
      case "error":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
            <ShieldAlert className="mr-1 h-3 w-3" /> {status}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/20">
            <Shield className="mr-1 h-3 w-3" /> Unknown
          </Badge>
        );
    }
  };

  const getProviderBadge = (provider: string | null) => {
    switch (provider) {
      case "cloudflare":
        return (
          <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
            <Cloud className="mr-1 h-3 w-3" /> Cloudflare
          </Badge>
        );
      case "manual":
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            <Settings className="mr-1 h-3 w-3" /> Manual
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-gray-500/10 text-gray-500">
            {provider || "Unknown"}
          </Badge>
        );
    }
  };

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
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Globe className="h-8 w-8 text-primary" />
            Domain Management
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Manage DNS records, SSL certificates, and service mappings for your domains
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchDomains} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={addDomainOpen} onOpenChange={setAddDomainOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Domain
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Domain</DialogTitle>
                <DialogDescription>
                  Add a new domain to manage its DNS records and SSL certificates
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="domain-name">Domain Name</Label>
                  <Input
                    id="domain-name"
                    placeholder="example.com"
                    value={newDomain.name}
                    onChange={(e) =>
                      setNewDomain({ ...newDomain, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="provider">DNS Provider</Label>
                  <Select
                    value={newDomain.provider}
                    onValueChange={(v) =>
                      setNewDomain({ ...newDomain, provider: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloudflare">Cloudflare</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {cloudflareEnabled && newDomain.provider === "cloudflare" && (
                  <div>
                    <Label htmlFor="zone-id">Cloudflare Zone</Label>
                    <Select
                      value={newDomain.zoneId}
                      onValueChange={(v) =>
                        setNewDomain({ ...newDomain, zoneId: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select zone" />
                      </SelectTrigger>
                      <SelectContent>
                        {cloudflareZones.map((zone) => (
                          <SelectItem key={zone.id} value={zone.id}>
                            {zone.name} ({zone.status})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDomainOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddDomain}
                  disabled={actionLoading === "add-domain"}
                >
                  {actionLoading === "add-domain" && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Add Domain
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Domains
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{domains.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active SSL
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {domains.filter((d) => d.sslStatus === "valid").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cloudflare Zones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {domains.filter((d) => d.provider === "cloudflare").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total DNS Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {domains.reduce((acc, d) => acc + d.recordCount, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <CardTitle>Managed Domains</CardTitle>
              <CardDescription>
                Click on a domain to view and edit DNS records
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search domains..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredDomains.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No domains found</p>
              <p className="text-sm">Add your first domain to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>SSL</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-center">Records</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDomains.map((domain) => (
                    <TableRow
                      key={domain.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/domains/${domain.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-primary" />
                          <span className="font-medium">{domain.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(domain.status)}</TableCell>
                      <TableCell>
                        {getSSLBadge(domain.sslStatus, domain.sslExpiresAt)}
                      </TableCell>
                      <TableCell>{getProviderBadge(domain.provider)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{domain.recordCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            asChild
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/domains/${domain.id}`);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVerifyDomain(domain.id, domain.name);
                              }}
                              disabled={actionLoading === `verify-${domain.id}`}
                            >
                              {actionLoading === `verify-${domain.id}` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Activity className="mr-2 h-4 w-4" />
                              )}
                              Verify DNS
                            </DropdownMenuItem>
                            {domain.provider === "cloudflare" && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSyncDomain(domain.id);
                                }}
                                disabled={actionLoading === `sync-${domain.id}`}
                              >
                                {actionLoading === `sync-${domain.id}` ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                )}
                                Sync Cloudflare
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRefreshSSL(domain.id);
                              }}
                              disabled={actionLoading === `ssl-${domain.id}`}
                            >
                              {actionLoading === `ssl-${domain.id}` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <ShieldCheck className="mr-2 h-4 w-4" />
                              )}
                              Refresh SSL
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`https://${domain.name}`, "_blank");
                              }}
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Visit Site
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDomain(domain.id, domain.name);
                              }}
                              disabled={actionLoading === `delete-${domain.id}`}
                              className="text-red-600"
                            >
                              {actionLoading === `delete-${domain.id}` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                              )}
                              Delete Domain
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {services.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Available Services
            </CardTitle>
            <CardDescription>
              Services that can be linked to your domains
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.slice(0, 6).map((service) => (
                <div
                  key={service.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  <Server className="h-8 w-8 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {service.displayName || service.name}
                    </p>
                    {service.url && (
                      <p className="text-xs text-muted-foreground truncate">
                        {service.url}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={service.status === "online" ? "default" : "secondary"}
                    className={
                      service.status === "online"
                        ? "bg-green-500/10 text-green-500"
                        : ""
                    }
                  >
                    {service.status || "unknown"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {cloudflareStatus && !cloudflareStatus.configured && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-yellow-600">
              <Cloud className="h-5 w-5" />
              Cloudflare Not Configured
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cloudflare API credentials are not configured. Some features are unavailable:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>DNS record sync from Cloudflare</li>
              <li>Cloudflare analytics and traffic data</li>
              <li>Proxy status and SSL management</li>
              <li>Automatic zone detection</li>
            </ul>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/secrets-manager")}
                className="border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/10"
              >
                <Settings className="mr-2 h-4 w-4" />
                Configure Cloudflare
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {cloudflareStatus && cloudflareStatus.configured && !cloudflareStatus.connected && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Cloudflare Connection Error
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {cloudflareStatus.error || "Failed to connect to Cloudflare API. Please check your API token."}
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/secrets-manager")}
                className="border-red-500/50 text-red-600 hover:bg-red-500/10"
              >
                <Settings className="mr-2 h-4 w-4" />
                Update Credentials
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {cloudflareStatus?.configured && cloudflareStatus?.connected && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-green-600 text-base">
                <Cloud className="h-5 w-5" />
                Cloudflare Connected
              </CardTitle>
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                {cloudflareStatus.zonesAvailable} zones available
              </Badge>
            </div>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
