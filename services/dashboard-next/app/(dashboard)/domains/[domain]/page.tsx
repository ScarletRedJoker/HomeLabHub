"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Globe,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Server,
  Trash2,
  Edit,
  ExternalLink,
  Cloud,
  Loader2,
  ArrowLeft,
  Download,
  Copy,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle2,
  Clock,
  Settings,
  FileText,
  Zap,
  Activity,
  Play,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Textarea } from "@/components/ui/textarea";

interface Domain {
  id: string;
  name: string;
  provider: string | null;
  zoneId: string | null;
  sslStatus: string | null;
  sslExpiresAt: string | null;
  createdAt: string | null;
}

interface DnsRecord {
  id: string;
  domainId: string;
  recordType: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  providerId: string | null;
  createdAt: string | null;
}

interface Service {
  id: string;
  name: string;
  displayName: string | null;
  url: string | null;
  status: string | null;
}

interface SSLDetails {
  status: string;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  autoRenew: boolean;
  cloudflare: {
    verification: any;
    settings: any;
    certificates: any;
  } | null;
}

interface VerifyResult {
  propagated: boolean;
  records: Array<{
    name: string;
    type: string;
    expected: string;
    actual: string[];
    propagated: boolean;
  }>;
}

const DNS_TEMPLATES = [
  {
    id: "basic-web",
    name: "Basic Website",
    description: "A records for root and www",
    records: [
      { type: "A", name: "@", content: "" },
      { type: "CNAME", name: "www", content: "@" },
    ],
  },
  {
    id: "email-mx",
    name: "Email (Gmail/Google Workspace)",
    description: "MX and verification records",
    records: [
      { type: "MX", name: "@", content: "aspmx.l.google.com", priority: 1 },
      { type: "MX", name: "@", content: "alt1.aspmx.l.google.com", priority: 5 },
      { type: "TXT", name: "@", content: "v=spf1 include:_spf.google.com ~all" },
    ],
  },
  {
    id: "homelab-full",
    name: "Full Homelab Setup",
    description: "Common subdomains for homelab",
    records: [
      { type: "A", name: "@", content: "" },
      { type: "CNAME", name: "www", content: "@" },
      { type: "A", name: "plex", content: "" },
      { type: "A", name: "jellyfin", content: "" },
      { type: "A", name: "dash", content: "" },
      { type: "A", name: "api", content: "" },
      { type: "A", name: "auth", content: "" },
    ],
  },
];

export default function DomainDetailPage() {
  const router = useRouter();
  const params = useParams();
  const domainId = params.domain as string;

  const [domain, setDomain] = useState<Domain | null>(null);
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cloudflareEnabled, setCloudflareEnabled] = useState(false);
  const [sslDetails, setSslDetails] = useState<SSLDetails | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [activeTab, setActiveTab] = useState("dns");

  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [editRecordOpen, setEditRecordOpen] = useState(false);
  const [mapServiceOpen, setMapServiceOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [caddyConfigOpen, setCaddyConfigOpen] = useState(false);

  const [newRecord, setNewRecord] = useState({
    recordType: "A",
    name: "",
    content: "",
    ttl: 3600,
    proxied: true,
    priority: 10,
  });

  const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null);

  const [serviceMapping, setServiceMapping] = useState({
    subdomain: "",
    serviceId: "",
    targetIp: "",
    port: 80,
    proxied: true,
    healthCheck: "",
  });

  const [caddyConfig, setCaddyConfig] = useState("");

  const { toast } = useToast();

  const fetchDomain = useCallback(async () => {
    try {
      const res = await fetch(`/api/domains/${domainId}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast({
            title: "Error",
            description: "Domain not found",
            variant: "destructive",
          });
          router.push("/domains");
          return;
        }
        throw new Error("Failed to fetch domain");
      }
      const data = await res.json();
      setDomain(data.domain);
      setRecords(data.records || []);
      setCloudflareEnabled(data.cloudflareEnabled || false);
    } catch (error) {
      console.error("Failed to fetch domain:", error);
      toast({
        title: "Error",
        description: "Failed to fetch domain details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [domainId, toast, router]);

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch(`/api/domains/${domainId}/map-service`);
      if (!res.ok) return;
      const data = await res.json();
      setServices(data.availableServices || []);
    } catch (error) {
      console.error("Failed to fetch services:", error);
    }
  }, [domainId]);

  const fetchSSLDetails = useCallback(async () => {
    try {
      const res = await fetch(`/api/domains/${domainId}/ssl`);
      if (!res.ok) return;
      const data = await res.json();
      setSslDetails(data);
    } catch (error) {
      console.error("Failed to fetch SSL details:", error);
    }
  }, [domainId]);

  useEffect(() => {
    fetchDomain();
    fetchServices();
    fetchSSLDetails();
  }, [fetchDomain, fetchServices, fetchSSLDetails]);

  const handleAddRecord = async () => {
    if (!domain || !newRecord.name || !newRecord.content) {
      toast({
        title: "Error",
        description: "Name and content are required",
        variant: "destructive",
      });
      return;
    }

    setActionLoading("add-record");
    try {
      const res = await fetch(`/api/domains/${domainId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRecord),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add record");

      toast({
        title: "Success",
        description: `Record added${data.cloudflareSync ? " and synced to Cloudflare" : ""}`,
      });

      setAddRecordOpen(false);
      setNewRecord({
        recordType: "A",
        name: "",
        content: "",
        ttl: 3600,
        proxied: true,
        priority: 10,
      });
      fetchDomain();
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

  const handleUpdateRecord = async () => {
    if (!editingRecord) return;

    setActionLoading("update-record");
    try {
      const res = await fetch(`/api/domains/${domainId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: editingRecord.id,
          recordType: editingRecord.recordType,
          name: editingRecord.name,
          content: editingRecord.content,
          ttl: editingRecord.ttl,
          proxied: editingRecord.proxied,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update record");

      toast({ title: "Success", description: "Record updated" });
      setEditRecordOpen(false);
      setEditingRecord(null);
      fetchDomain();
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

  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm("Delete this DNS record?")) return;

    setActionLoading(`delete-record-${recordId}`);
    try {
      const res = await fetch(
        `/api/domains/${domainId}/records?recordId=${recordId}`,
        { method: "DELETE" }
      );

      if (!res.ok) throw new Error("Failed to delete record");

      toast({ title: "Success", description: "Record deleted" });
      fetchDomain();
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

  const handleSyncDomain = async () => {
    setActionLoading("sync");
    try {
      const res = await fetch(`/api/domains/${domainId}/sync`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync");

      toast({
        title: "Success",
        description: data.message || "Synced with Cloudflare",
      });
      fetchDomain();
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

  const handleVerifyDNS = async () => {
    setActionLoading("verify");
    try {
      const res = await fetch(`/api/domains/${domainId}/verify`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify");

      setVerifyResult(data);
      toast({
        title: data.propagated ? "DNS Propagated" : "DNS Pending",
        description: data.propagated
          ? "All records have propagated"
          : "Some records are still propagating",
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

  const handleMapService = async () => {
    if (!serviceMapping.subdomain) {
      toast({
        title: "Error",
        description: "Subdomain is required",
        variant: "destructive",
      });
      return;
    }

    setActionLoading("map-service");
    try {
      const res = await fetch(`/api/domains/${domainId}/map-service`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serviceMapping),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to map service");

      toast({
        title: "Success",
        description: `Subdomain mapped${data.cloudflareSync ? " and synced to Cloudflare" : ""}`,
      });

      if (data.caddyConfig) {
        setCaddyConfig(data.caddyConfig);
        setCaddyConfigOpen(true);
      }

      setMapServiceOpen(false);
      setServiceMapping({
        subdomain: "",
        serviceId: "",
        targetIp: "",
        port: 80,
        proxied: true,
        healthCheck: "",
      });
      fetchDomain();
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

  const handleApplyTemplate = async (template: (typeof DNS_TEMPLATES)[0]) => {
    const serverIp = prompt("Enter your server IP address:");
    if (!serverIp) return;

    setActionLoading("apply-template");
    try {
      for (const record of template.records) {
        const content = record.content || serverIp;
        const name =
          record.name === "@"
            ? domain?.name || ""
            : `${record.name}.${domain?.name}`;

        await fetch(`/api/domains/${domainId}/records`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordType: record.type,
            name,
            content,
            ttl: 3600,
            proxied: record.type === "A" || record.type === "CNAME",
            priority: (record as any).priority,
          }),
        });
      }

      toast({
        title: "Success",
        description: `Template "${template.name}" applied`,
      });

      setTemplateOpen(false);
      fetchDomain();
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

  const handleRefreshSSL = async () => {
    setActionLoading("refresh-ssl");
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
        description: `Status: ${data.status}`,
      });
      fetchSSLDetails();
      fetchDomain();
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

  const exportZoneFile = () => {
    if (!domain || records.length === 0) return;

    let zoneFile = `; Zone file for ${domain.name}\n`;
    zoneFile += `; Exported ${new Date().toISOString()}\n\n`;
    zoneFile += `$ORIGIN ${domain.name}.\n`;
    zoneFile += `$TTL 3600\n\n`;

    for (const record of records) {
      const name = record.name.replace(`.${domain.name}`, "") || "@";
      zoneFile += `${name}\t${record.ttl}\tIN\t${record.recordType}\t${record.content}\n`;
    }

    const blob = new Blob([zoneFile], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${domain.name}.zone`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: "Exported", description: "Zone file downloaded" });
  };

  const generateCaddyConfig = () => {
    if (!domain || records.length === 0) return "";

    let config = `# Caddy configuration for ${domain.name}\n\n`;
    
    const aRecords = records.filter(
      (r) => r.recordType === "A" || r.recordType === "CNAME"
    );

    for (const record of aRecords) {
      config += `${record.name} {\n`;
      config += `    reverse_proxy localhost:80\n`;
      config += `    tls {\n`;
      config += `        dns cloudflare {env.CLOUDFLARE_API_TOKEN}\n`;
      config += `    }\n`;
      config += `}\n\n`;
    }

    return config;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <p className="text-lg font-medium">Domain not found</p>
        <Button onClick={() => router.push("/domains")} className="mt-4">
          Back to Domains
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push("/domains")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Globe className="h-8 w-8 text-primary" />
              {domain.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className={
                  domain.sslStatus === "valid"
                    ? "bg-green-500/10 text-green-500"
                    : "bg-yellow-500/10 text-yellow-500"
                }
              >
                {domain.sslStatus === "valid" ? (
                  <ShieldCheck className="mr-1 h-3 w-3" />
                ) : (
                  <Shield className="mr-1 h-3 w-3" />
                )}
                SSL: {domain.sslStatus || "Unknown"}
              </Badge>
              <Badge
                variant="outline"
                className="bg-orange-500/10 text-orange-500"
              >
                <Cloud className="mr-1 h-3 w-3" />
                {domain.provider || "Manual"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleVerifyDNS}
            disabled={actionLoading === "verify"}
          >
            {actionLoading === "verify" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Activity className="mr-2 h-4 w-4" />
            )}
            Verify DNS
          </Button>
          {cloudflareEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncDomain}
              disabled={actionLoading === "sync"}
            >
              {actionLoading === "sync" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`https://${domain.name}`, "_blank")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Visit
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dns">DNS Records</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="ssl">SSL</TabsTrigger>
          <TabsTrigger value="deploy">Deploy</TabsTrigger>
        </TabsList>

        <TabsContent value="dns" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                  <CardTitle>DNS Records</CardTitle>
                  <CardDescription>
                    Manage A, AAAA, CNAME, MX, and TXT records
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <FileText className="mr-2 h-4 w-4" />
                        Templates
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>DNS Templates</DialogTitle>
                        <DialogDescription>
                          Apply a predefined set of DNS records
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        {DNS_TEMPLATES.map((template) => (
                          <div
                            key={template.id}
                            className="p-3 border rounded-lg hover:bg-muted cursor-pointer"
                            onClick={() => handleApplyTemplate(template)}
                          >
                            <p className="font-medium">{template.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {template.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="outline" size="sm" onClick={exportZoneFile}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                  <Dialog open={addRecordOpen} onOpenChange={setAddRecordOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Record
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add DNS Record</DialogTitle>
                        <DialogDescription>
                          Create a new DNS record for {domain.name}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Type</Label>
                          <Select
                            value={newRecord.recordType}
                            onValueChange={(v) =>
                              setNewRecord({ ...newRecord, recordType: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A">A</SelectItem>
                              <SelectItem value="AAAA">AAAA</SelectItem>
                              <SelectItem value="CNAME">CNAME</SelectItem>
                              <SelectItem value="MX">MX</SelectItem>
                              <SelectItem value="TXT">TXT</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Name</Label>
                          <Input
                            placeholder={`@ or subdomain.${domain.name}`}
                            value={newRecord.name}
                            onChange={(e) =>
                              setNewRecord({ ...newRecord, name: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label>Content</Label>
                          <Input
                            placeholder={
                              newRecord.recordType === "A"
                                ? "IP Address"
                                : newRecord.recordType === "CNAME"
                                ? "Target domain"
                                : "Value"
                            }
                            value={newRecord.content}
                            onChange={(e) =>
                              setNewRecord({ ...newRecord, content: e.target.value })
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>TTL (seconds)</Label>
                            <Select
                              value={String(newRecord.ttl)}
                              onValueChange={(v) =>
                                setNewRecord({ ...newRecord, ttl: parseInt(v) })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">Auto</SelectItem>
                                <SelectItem value="300">5 min</SelectItem>
                                <SelectItem value="3600">1 hour</SelectItem>
                                <SelectItem value="86400">1 day</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {newRecord.recordType === "MX" && (
                            <div>
                              <Label>Priority</Label>
                              <Input
                                type="number"
                                value={newRecord.priority}
                                onChange={(e) =>
                                  setNewRecord({
                                    ...newRecord,
                                    priority: parseInt(e.target.value),
                                  })
                                }
                              />
                            </div>
                          )}
                        </div>
                        {["A", "AAAA", "CNAME"].includes(newRecord.recordType) &&
                          cloudflareEnabled && (
                            <div className="flex items-center justify-between">
                              <Label>Cloudflare Proxy</Label>
                              <Switch
                                checked={newRecord.proxied}
                                onCheckedChange={(v) =>
                                  setNewRecord({ ...newRecord, proxied: v })
                                }
                              />
                            </div>
                          )}
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setAddRecordOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAddRecord}
                          disabled={actionLoading === "add-record"}
                        >
                          {actionLoading === "add-record" && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Add Record
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {records.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No DNS records</p>
                  <p className="text-sm">Add your first record or apply a template</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Content</TableHead>
                        <TableHead>TTL</TableHead>
                        <TableHead>Proxy</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            <Badge variant="outline">{record.recordType}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {record.name}
                          </TableCell>
                          <TableCell className="font-mono text-sm max-w-[200px] truncate">
                            {record.content}
                          </TableCell>
                          <TableCell>
                            {record.ttl === 1 ? "Auto" : `${record.ttl}s`}
                          </TableCell>
                          <TableCell>
                            {["A", "AAAA", "CNAME"].includes(record.recordType) ? (
                              <Badge
                                variant={record.proxied ? "default" : "secondary"}
                                className={
                                  record.proxied
                                    ? "bg-orange-500/10 text-orange-500"
                                    : ""
                                }
                              >
                                {record.proxied ? "On" : "Off"}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingRecord(record);
                                  setEditRecordOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteRecord(record.id)}
                                disabled={
                                  actionLoading === `delete-record-${record.id}`
                                }
                              >
                                {actionLoading === `delete-record-${record.id}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {verifyResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  DNS Propagation Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {verifyResult.records.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div>
                        <p className="font-medium">
                          {r.name} ({r.type})
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Expected: {r.expected}
                        </p>
                      </div>
                      {r.propagated ? (
                        <Badge className="bg-green-500/10 text-green-500">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Propagated
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-500/10 text-yellow-500">
                          <Clock className="mr-1 h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between">
                <div>
                  <CardTitle>Service Mappings</CardTitle>
                  <CardDescription>
                    Link subdomains to services with automatic proxy configuration
                  </CardDescription>
                </div>
                <Dialog open={mapServiceOpen} onOpenChange={setMapServiceOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <LinkIcon className="mr-2 h-4 w-4" />
                      Map Service
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Map Subdomain to Service</DialogTitle>
                      <DialogDescription>
                        Create a DNS record and generate proxy configuration
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Subdomain</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="subdomain"
                            value={serviceMapping.subdomain}
                            onChange={(e) =>
                              setServiceMapping({
                                ...serviceMapping,
                                subdomain: e.target.value,
                              })
                            }
                          />
                          <span className="text-muted-foreground">
                            .{domain.name}
                          </span>
                        </div>
                      </div>
                      <div>
                        <Label>Service (optional)</Label>
                        <Select
                          value={serviceMapping.serviceId}
                          onValueChange={(v) =>
                            setServiceMapping({
                              ...serviceMapping,
                              serviceId: v,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select service" />
                          </SelectTrigger>
                          <SelectContent>
                            {services.map((service) => (
                              <SelectItem key={service.id} value={service.id}>
                                {service.displayName || service.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Target IP (if no service selected)</Label>
                        <Input
                          placeholder="192.168.1.100"
                          value={serviceMapping.targetIp}
                          onChange={(e) =>
                            setServiceMapping({
                              ...serviceMapping,
                              targetIp: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Port</Label>
                        <Input
                          type="number"
                          value={serviceMapping.port}
                          onChange={(e) =>
                            setServiceMapping({
                              ...serviceMapping,
                              port: parseInt(e.target.value),
                            })
                          }
                        />
                      </div>
                      {cloudflareEnabled && (
                        <div className="flex items-center justify-between">
                          <Label>Cloudflare Proxy</Label>
                          <Switch
                            checked={serviceMapping.proxied}
                            onCheckedChange={(v) =>
                              setServiceMapping({
                                ...serviceMapping,
                                proxied: v,
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setMapServiceOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleMapService}
                        disabled={actionLoading === "map-service"}
                      >
                        {actionLoading === "map-service" && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Map Service
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="flex items-center gap-4 p-4 rounded-lg border"
                  >
                    <Server className="h-10 w-10 text-primary" />
                    <div className="flex-1">
                      <p className="font-medium">
                        {service.displayName || service.name}
                      </p>
                      {service.url && (
                        <p className="text-sm text-muted-foreground">
                          {service.url}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        service.status === "online" ? "default" : "secondary"
                      }
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

          <Card>
            <CardHeader>
              <CardTitle>Reverse Proxy Configuration</CardTitle>
              <CardDescription>
                Generate Caddy or nginx configuration for your services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const config = generateCaddyConfig();
                      setCaddyConfig(config);
                      setCaddyConfigOpen(true);
                    }}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Generate Caddy Config
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ssl" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between">
                <div>
                  <CardTitle>SSL Certificate</CardTitle>
                  <CardDescription>
                    Manage SSL/TLS certificates for secure connections
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshSSL}
                  disabled={actionLoading === "refresh-ssl"}
                >
                  {actionLoading === "refresh-ssl" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Refresh Status
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6">
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-4">
                    {domain.sslStatus === "valid" ? (
                      <ShieldCheck className="h-10 w-10 text-green-500" />
                    ) : (
                      <ShieldAlert className="h-10 w-10 text-yellow-500" />
                    )}
                    <div>
                      <p className="font-medium">Certificate Status</p>
                      <p className="text-sm text-muted-foreground">
                        {domain.sslStatus === "valid"
                          ? "Your SSL certificate is valid and active"
                          : "Certificate status pending or needs attention"}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      domain.sslStatus === "valid"
                        ? "bg-green-500/10 text-green-500"
                        : "bg-yellow-500/10 text-yellow-500"
                    }
                  >
                    {domain.sslStatus || "Unknown"}
                  </Badge>
                </div>

                {sslDetails && (
                  <>
                    {sslDetails.daysUntilExpiry !== null && (
                      <div className="p-4 rounded-lg border">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Expiration</p>
                            <p className="text-sm text-muted-foreground">
                              {sslDetails.expiresAt
                                ? new Date(sslDetails.expiresAt).toLocaleDateString()
                                : "Unknown"}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              sslDetails.daysUntilExpiry > 30
                                ? "bg-green-500/10 text-green-500"
                                : sslDetails.daysUntilExpiry > 7
                                ? "bg-yellow-500/10 text-yellow-500"
                                : "bg-red-500/10 text-red-500"
                            }
                          >
                            {sslDetails.daysUntilExpiry} days
                          </Badge>
                        </div>
                      </div>
                    )}

                    <div className="p-4 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Auto-Renewal</p>
                          <p className="text-sm text-muted-foreground">
                            {sslDetails.autoRenew
                              ? "Enabled via Cloudflare/Let's Encrypt"
                              : "Manual renewal required"}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            sslDetails.autoRenew
                              ? "bg-green-500/10 text-green-500"
                              : "bg-yellow-500/10 text-yellow-500"
                          }
                        >
                          {sslDetails.autoRenew ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                    </div>
                  </>
                )}

                {cloudflareEnabled && (
                  <div className="p-4 rounded-lg border bg-orange-500/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Cloud className="h-5 w-5 text-orange-500" />
                      <p className="font-medium">Cloudflare SSL</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      SSL is managed by Cloudflare. Enable Full (Strict) mode for
                      end-to-end encryption.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deploy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Deployment Integration</CardTitle>
              <CardDescription>
                Quick deploy and health check for services linked to this domain
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {services.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No services available</p>
                    <p className="text-sm">
                      Configure services to enable deployment integration
                    </p>
                  </div>
                ) : (
                  services.map((service) => (
                    <div
                      key={service.id}
                      className="flex items-center justify-between p-4 rounded-lg border"
                    >
                      <div className="flex items-center gap-4">
                        <Server className="h-8 w-8 text-primary" />
                        <div>
                          <p className="font-medium">
                            {service.displayName || service.name}
                          </p>
                          {service.url && (
                            <p className="text-sm text-muted-foreground">
                              {service.url}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            service.status === "online" ? "default" : "secondary"
                          }
                          className={
                            service.status === "online"
                              ? "bg-green-500/10 text-green-500"
                              : ""
                          }
                        >
                          {service.status || "unknown"}
                        </Badge>
                        <Button variant="outline" size="sm">
                          <Activity className="mr-2 h-4 w-4" />
                          Health Check
                        </Button>
                        <Button size="sm">
                          <Play className="mr-2 h-4 w-4" />
                          Deploy
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editRecordOpen} onOpenChange={setEditRecordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit DNS Record</DialogTitle>
          </DialogHeader>
          {editingRecord && (
            <div className="space-y-4">
              <div>
                <Label>Type</Label>
                <Input value={editingRecord.recordType} disabled />
              </div>
              <div>
                <Label>Name</Label>
                <Input
                  value={editingRecord.name}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Content</Label>
                <Input
                  value={editingRecord.content}
                  onChange={(e) =>
                    setEditingRecord({
                      ...editingRecord,
                      content: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label>TTL</Label>
                <Select
                  value={String(editingRecord.ttl)}
                  onValueChange={(v) =>
                    setEditingRecord({ ...editingRecord, ttl: parseInt(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Auto</SelectItem>
                    <SelectItem value="300">5 min</SelectItem>
                    <SelectItem value="3600">1 hour</SelectItem>
                    <SelectItem value="86400">1 day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {["A", "AAAA", "CNAME"].includes(editingRecord.recordType) &&
                cloudflareEnabled && (
                  <div className="flex items-center justify-between">
                    <Label>Cloudflare Proxy</Label>
                    <Switch
                      checked={editingRecord.proxied}
                      onCheckedChange={(v) =>
                        setEditingRecord({ ...editingRecord, proxied: v })
                      }
                    />
                  </div>
                )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRecordOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateRecord}
              disabled={actionLoading === "update-record"}
            >
              {actionLoading === "update-record" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={caddyConfigOpen} onOpenChange={setCaddyConfigOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Caddy Configuration</DialogTitle>
            <DialogDescription>
              Copy this configuration to your Caddyfile
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Textarea
              value={caddyConfig}
              readOnly
              className="font-mono text-sm min-h-[300px]"
            />
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => {
                navigator.clipboard.writeText(caddyConfig);
                toast({ title: "Copied to clipboard" });
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCaddyConfigOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
