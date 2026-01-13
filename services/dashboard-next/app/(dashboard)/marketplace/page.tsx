"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Package,
  Loader2,
  RefreshCw,
  Download,
  Brain,
  Database,
  Activity,
  Wrench,
  Globe,
  Film,
  Box,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  Sparkles,
  HardDrive,
  Network,
  Shield,
  Code2,
  Play,
  ExternalLink,
  Server,
  Info,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";

interface PackageVariable {
  name: string;
  description: string;
  default?: string;
  required?: boolean;
  secret?: boolean;
}

interface PackagePort {
  container: number;
  host: number;
  description?: string;
}

interface PackageVolume {
  container: string;
  description?: string;
}

interface MarketplacePackage {
  id: string;
  name: string;
  version: string;
  displayName: string;
  description: string;
  category: string;
  categoryInfo?: {
    name: string;
    color: string;
  };
  icon?: string;
  repository: string;
  variables?: PackageVariable[];
  ports?: PackagePort[];
  volumes?: PackageVolume[];
  tags?: string[];
  featured?: boolean;
  installed?: boolean;
  installationStatus?: string;
}

interface Category {
  id: string;
  name: string;
  count: number;
  color?: string;
  icon?: string;
}

interface InstalledPackage {
  id: string;
  packageId: string;
  packageName: string;
  displayName: string;
  status: string;
  serverId: string;
  port?: number;
  installedAt: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  all: <Box className="h-4 w-4" />,
  ai: <Brain className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  monitoring: <Activity className="h-4 w-4" />,
  tools: <Wrench className="h-4 w-4" />,
  web: <Globe className="h-4 w-4" />,
  media: <Film className="h-4 w-4" />,
  development: <Code2 className="h-4 w-4" />,
  networking: <Network className="h-4 w-4" />,
  storage: <HardDrive className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
};

const categoryColors: Record<string, string> = {
  ai: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  database: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  monitoring: "bg-green-500/10 text-green-500 border-green-500/20",
  tools: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  web: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  media: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  development: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  networking: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  storage: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  security: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function MarketplacePage() {
  const [packages, setPackages] = useState<MarketplacePackage[]>([]);
  const [installedPackages, setInstalledPackages] = useState<InstalledPackage[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedPackage, setSelectedPackage] = useState<MarketplacePackage | null>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState<"idle" | "success" | "error">("idle");
  const [selectedServer, setSelectedServer] = useState("linode");
  const [activeTab, setActiveTab] = useState<"available" | "installed">("available");

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== "all") params.set("category", activeCategory);
      if (search) params.set("search", search);

      const res = await fetch(`/api/marketplace?${params}`);
      if (!res.ok) throw new Error("Failed to fetch packages");

      const data = await res.json();
      setPackages(data.packages || []);
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Failed to fetch packages:", error);
      toast.error("Failed to load marketplace packages");
    } finally {
      setLoading(false);
    }
  };

  const fetchInstalled = async () => {
    try {
      const res = await fetch("/api/marketplace/installed");
      if (!res.ok) throw new Error("Failed to fetch installed packages");
      const data = await res.json();
      setInstalledPackages(data.installations || []);
    } catch (error) {
      console.error("Failed to fetch installed packages:", error);
    }
  };

  useEffect(() => {
    fetchPackages();
    fetchInstalled();
  }, [activeCategory]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchPackages();
    }, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const openInstallDialog = (pkg: MarketplacePackage) => {
    setSelectedPackage(pkg);
    const defaults: Record<string, string> = {};
    pkg.variables?.forEach((v) => {
      if (v.default) defaults[v.name] = v.default;
    });
    setVariableValues(defaults);
    setShowSecrets({});
    setInstallStatus("idle");
    setShowInstallDialog(true);
  };

  const openDetailsDialog = (pkg: MarketplacePackage) => {
    setSelectedPackage(pkg);
    setShowDetailsDialog(true);
  };

  const handleInstall = async () => {
    if (!selectedPackage) return;

    const missingRequired = selectedPackage.variables?.filter(
      (v) => v.required && !variableValues[v.name]
    );

    if (missingRequired && missingRequired.length > 0) {
      toast.error(`Missing required fields: ${missingRequired.map((v) => v.name).join(", ")}`);
      return;
    }

    setInstalling(true);
    try {
      const res = await fetch(`/api/marketplace/${selectedPackage.id}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: variableValues,
          serverId: selectedServer,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Installation failed");
      }

      setInstallStatus("success");
      toast.success(`${selectedPackage.displayName} deployment started`);
      fetchInstalled();
      fetchPackages();
    } catch (error: any) {
      setInstallStatus("error");
      toast.error(error.message || "Installation failed");
    } finally {
      setInstalling(false);
    }
  };

  const toggleSecretVisibility = (name: string) => {
    setShowSecrets((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Running</Badge>;
      case "installing":
        return <Badge variant="warning" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Installing</Badge>;
      case "error":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Error</Badge>;
      case "stopped":
        return <Badge variant="secondary" className="gap-1">Stopped</Badge>;
      default:
        return <Badge variant="outline" className="gap-1">{status}</Badge>;
    }
  };

  if (loading && packages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading marketplace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-purple-500" />
            Docker Marketplace
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Deploy Docker packages to your homelab with one click
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { fetchPackages(); fetchInstalled(); }} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "available" | "installed")}>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <TabsList>
            <TabsTrigger value="available" className="gap-2">
              <Package className="h-4 w-4" />
              Available ({packages.length})
            </TabsTrigger>
            <TabsTrigger value="installed" className="gap-2">
              <Server className="h-4 w-4" />
              Installed ({installedPackages.length})
            </TabsTrigger>
          </TabsList>

          {activeTab === "available" && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search packages..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          )}
        </div>

        <TabsContent value="available" className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={activeCategory === category.id ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCategory(category.id)}
                className="gap-2"
              >
                {categoryIcons[category.id] || <Box className="h-4 w-4" />}
                <span className="hidden sm:inline">{category.name}</span>
                <span className="text-xs opacity-70">({category.count})</span>
              </Button>
            ))}
          </div>

          {packages.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No packages found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try a different search or category
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {packages.map((pkg) => (
                <Card
                  key={pkg.id}
                  className="group relative overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-primary/50"
                >
                  {pkg.installed && (
                    <div className="absolute top-2 right-2 z-10">
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Installed
                      </Badge>
                    </div>
                  )}
                  {pkg.featured && !pkg.installed && (
                    <div className="absolute top-2 right-2 z-10">
                      <Badge variant="secondary" className="gap-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20">
                        <Sparkles className="h-3 w-3" />
                        Featured
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 p-2.5 group-hover:from-primary/30 group-hover:to-primary/10 transition-colors">
                        {categoryIcons[pkg.category] || <Package className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{pkg.displayName}</CardTitle>
                        <span className="text-xs text-muted-foreground">v{pkg.version}</span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                          categoryColors[pkg.category] || "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {categoryIcons[pkg.category]}
                        {pkg.categoryInfo?.name || pkg.category}
                      </span>
                      {pkg.tags?.slice(0, 2).map((tag) => (
                        <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                      {pkg.description}
                    </CardDescription>

                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {pkg.ports && pkg.ports.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Network className="h-3 w-3" />
                          {pkg.ports.length} port{pkg.ports.length > 1 ? "s" : ""}
                        </span>
                      )}
                      {pkg.volumes && pkg.volumes.length > 0 && (
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          {pkg.volumes.length} volume{pkg.volumes.length > 1 ? "s" : ""}
                        </span>
                      )}
                      {pkg.variables && pkg.variables.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Wrench className="h-3 w-3" />
                          {pkg.variables.filter((v) => v.required).length} required
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        variant="outline"
                        size="sm"
                        onClick={() => openDetailsDialog(pkg)}
                      >
                        <Info className="h-4 w-4 mr-1" />
                        Details
                      </Button>
                      <Button
                        className="flex-1"
                        size="sm"
                        onClick={() => openInstallDialog(pkg)}
                        disabled={pkg.installed}
                      >
                        {pkg.installed ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Deployed
                          </>
                        ) : (
                          <>
                            <Rocket className="h-4 w-4 mr-1" />
                            Deploy
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="installed" className="mt-6">
          {installedPackages.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Server className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No packages installed</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Deploy packages from the Available tab
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setActiveTab("available")}
                >
                  Browse Packages
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {installedPackages.map((inst) => (
                <Card key={inst.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{inst.displayName}</CardTitle>
                      {getStatusBadge(inst.status)}
                    </div>
                    <CardDescription>
                      {inst.port && `Port: ${inst.port}`}
                      {inst.serverId && ` • Server: ${inst.serverId}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Installed: {new Date(inst.installedAt).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPackage && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 p-3">
                    {categoryIcons[selectedPackage.category] || <Package className="h-6 w-6 text-primary" />}
                  </div>
                  <div>
                    <DialogTitle className="text-xl">{selectedPackage.displayName}</DialogTitle>
                    <DialogDescription className="text-sm flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${categoryColors[selectedPackage.category] || ""}`}>
                        {selectedPackage.categoryInfo?.name || selectedPackage.category}
                      </span>
                      <span>v{selectedPackage.version}</span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div>
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground">{selectedPackage.description}</p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Docker Image</h4>
                  <code className="text-sm bg-muted px-2 py-1 rounded">{selectedPackage.repository}</code>
                </div>

                {selectedPackage.ports && selectedPackage.ports.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Network className="h-4 w-4" />
                      Ports
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedPackage.ports.map((port, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                          <span className="text-sm font-mono">{port.host}:{port.container}</span>
                          {port.description && (
                            <span className="text-xs text-muted-foreground">{port.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPackage.volumes && selectedPackage.volumes.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <HardDrive className="h-4 w-4" />
                      Volumes
                    </h4>
                    <div className="space-y-2">
                      {selectedPackage.volumes.map((vol, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                          <code className="text-sm">{vol.container}</code>
                          {vol.description && (
                            <span className="text-xs text-muted-foreground">{vol.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPackage.variables && selectedPackage.variables.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Environment Variables
                    </h4>
                    <div className="space-y-2">
                      {selectedPackage.variables.map((v, idx) => (
                        <div key={idx} className="bg-muted/50 rounded px-3 py-2">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-medium">{v.name}</code>
                            {v.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                            {v.secret && <Lock className="h-3 w-3 text-yellow-500" />}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{v.description}</p>
                          {v.default && (
                            <p className="text-xs text-muted-foreground">Default: {v.default}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPackage.tags && selectedPackage.tags.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPackage.tags.map((tag) => (
                        <Badge key={tag} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                  Close
                </Button>
                <Button onClick={() => { setShowDetailsDialog(false); openInstallDialog(selectedPackage); }}>
                  <Rocket className="h-4 w-4 mr-2" />
                  Deploy
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showInstallDialog} onOpenChange={setShowInstallDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedPackage && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 p-3">
                    {categoryIcons[selectedPackage.category] || <Package className="h-6 w-6 text-primary" />}
                  </div>
                  <div>
                    <DialogTitle className="text-xl">Deploy {selectedPackage.displayName}</DialogTitle>
                    <DialogDescription className="text-sm">
                      Configure and deploy to your server
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Target Server</Label>
                  <Select value={selectedServer} onValueChange={setSelectedServer}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select server" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="linode">Linode (Remote)</SelectItem>
                      <SelectItem value="local">Local Server</SelectItem>
                      <SelectItem value="truenas">TrueNAS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {selectedPackage.variables && selectedPackage.variables.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Configuration
                    </h4>

                    {selectedPackage.variables.map((variable) => (
                      <div key={variable.name} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={variable.name} className="flex items-center gap-2">
                            {variable.name}
                            {variable.required && <span className="text-xs text-red-500">*</span>}
                            {variable.secret && <Lock className="h-3 w-3 text-yellow-500" />}
                          </Label>
                          {variable.secret && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2"
                              onClick={() => toggleSecretVisibility(variable.name)}
                            >
                              {showSecrets[variable.name] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                          )}
                        </div>
                        <Input
                          id={variable.name}
                          type={variable.secret && !showSecrets[variable.name] ? "password" : "text"}
                          placeholder={variable.default || variable.description}
                          value={variableValues[variable.name] || ""}
                          onChange={(e) =>
                            setVariableValues((prev) => ({
                              ...prev,
                              [variable.name]: e.target.value,
                            }))
                          }
                          className={variable.required && !variableValues[variable.name] ? "border-red-500/50" : ""}
                        />
                        <p className="text-xs text-muted-foreground">{variable.description}</p>
                      </div>
                    ))}
                  </div>
                )}

                {installStatus === "success" && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 border border-green-500/20">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-medium">Deployment started successfully!</span>
                  </div>
                )}

                {installStatus === "error" && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">Deployment failed. Check logs for details.</span>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowInstallDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleInstall} disabled={installing || installStatus === "success"}>
                  {installing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deploying...
                    </>
                  ) : installStatus === "success" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Deployed
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4 mr-2" />
                      Deploy
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
