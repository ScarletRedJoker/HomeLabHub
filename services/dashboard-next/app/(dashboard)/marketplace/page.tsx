"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface PackageVariable {
  name: string;
  description: string;
  default?: string;
  required?: boolean;
  secret?: boolean;
}

interface MarketplacePackage {
  name: string;
  version: string;
  displayName: string;
  description: string;
  category: string;
  icon?: string;
  repository: string;
  variables?: PackageVariable[];
}

interface Category {
  id: string;
  name: string;
  count: number;
}

const categoryIcons: Record<string, React.ReactNode> = {
  all: <Box className="h-4 w-4" />,
  ai: <Brain className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  monitoring: <Activity className="h-4 w-4" />,
  tools: <Wrench className="h-4 w-4" />,
  web: <Globe className="h-4 w-4" />,
  media: <Film className="h-4 w-4" />,
};

const categoryColors: Record<string, string> = {
  ai: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  database: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  monitoring: "bg-green-500/10 text-green-500 border-green-500/20",
  tools: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  web: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  media: "bg-pink-500/10 text-pink-500 border-pink-500/20",
};

export default function MarketplacePage() {
  const [packages, setPackages] = useState<MarketplacePackage[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedPackage, setSelectedPackage] = useState<MarketplacePackage | null>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState<"idle" | "success" | "error">("idle");
  const { toast } = useToast();

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
      toast({
        title: "Error",
        description: "Failed to load marketplace packages",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
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

  const handleInstall = async () => {
    if (!selectedPackage) return;

    const missingRequired = selectedPackage.variables?.filter(
      (v) => v.required && !variableValues[v.name]
    );

    if (missingRequired && missingRequired.length > 0) {
      toast({
        title: "Missing required fields",
        description: `Please fill in: ${missingRequired.map((v) => v.name).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setInstalling(true);
    try {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package: selectedPackage.name,
          variables: variableValues,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Installation failed");
      }

      setInstallStatus("success");
      toast({
        title: "Success",
        description: `${selectedPackage.displayName} installation started`,
      });
    } catch (error: any) {
      setInstallStatus("error");
      toast({
        title: "Installation failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setInstalling(false);
    }
  };

  const toggleSecretVisibility = (name: string) => {
    setShowSecrets((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  if (loading && packages.length === 0) {
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
            <Sparkles className="h-7 w-7 text-purple-500" />
            Marketplace
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Discover and deploy Docker packages for your homelab
          </p>
        </div>
        <Button onClick={fetchPackages} variant="outline" size="sm" className="self-start sm:self-auto">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search packages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          {categories.map((category) => (
            <TabsTrigger
              key={category.id}
              value={category.id}
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {categoryIcons[category.id] || <Box className="h-4 w-4" />}
              <span className="hidden sm:inline">{category.name}</span>
              <span className="text-xs opacity-70">({category.count})</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6">
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
                  key={pkg.name}
                  className="group relative overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-primary/50"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 p-2.5 group-hover:from-primary/30 group-hover:to-primary/10 transition-colors">
                          {categoryIcons[pkg.category] || <Package className="h-5 w-5 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">{pkg.displayName}</CardTitle>
                          <span className="text-xs text-muted-foreground">v{pkg.version}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                          categoryColors[pkg.category] || "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {categoryIcons[pkg.category]}
                        {pkg.category.charAt(0).toUpperCase() + pkg.category.slice(1)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                      {pkg.description}
                    </CardDescription>

                    {pkg.variables && pkg.variables.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Wrench className="h-3 w-3" />
                        {pkg.variables.filter((v) => v.required).length} required,{" "}
                        {pkg.variables.filter((v) => !v.required).length} optional vars
                      </div>
                    )}

                    <Button
                      className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                      variant="outline"
                      onClick={() => openInstallDialog(pkg)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Install
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
                    <DialogTitle className="text-xl">{selectedPackage.displayName}</DialogTitle>
                    <DialogDescription className="text-sm">
                      {selectedPackage.repository}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">{selectedPackage.description}</p>
                </div>

                {selectedPackage.variables && selectedPackage.variables.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Configuration Variables
                    </h4>

                    {selectedPackage.variables.map((variable) => (
                      <div key={variable.name} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={variable.name} className="flex items-center gap-2">
                            {variable.name}
                            {variable.required && (
                              <span className="text-xs text-red-500">*</span>
                            )}
                            {variable.secret && (
                              <Lock className="h-3 w-3 text-yellow-500" />
                            )}
                          </Label>
                          {variable.secret && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2"
                              onClick={() => toggleSecretVisibility(variable.name)}
                            >
                              {showSecrets[variable.name] ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
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
                    <span className="text-sm font-medium">Installation started successfully!</span>
                  </div>
                )}

                {installStatus === "error" && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">Installation failed. Check logs for details.</span>
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
                      Installing...
                    </>
                  ) : installStatus === "success" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Installed
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Install Package
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
