"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Server,
  Power,
  PowerOff,
  RotateCcw,
  RefreshCw,
  Loader2,
  Play,
  Square,
  Pause,
  CheckCircle,
  XCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  Settings,
  Zap,
  ShieldAlert,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface VMInfo {
  name: string;
  status: 'running' | 'stopped' | 'paused' | 'starting' | 'stopping' | 'unknown';
  autostart: boolean;
}

interface VMListResponse {
  success: boolean;
  vms: VMInfo[];
  error?: string;
}

export default function VMManagementPage() {
  const router = useRouter();
  const [vms, setVms] = useState<VMInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; vmName: string; action: string } | null>(null);
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

  const fetchVMs = useCallback(async () => {
    try {
      const res = await fetch("/api/vm");
      const data: VMListResponse = await res.json();
      
      if (data.success) {
        setVms(data.vms || []);
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
        toast({
          title: "Connection Error",
          description: data.error || "Failed to connect to VM host",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to fetch VMs:", error);
      setConnectionStatus('disconnected');
      toast({
        title: "Error",
        description: "Failed to fetch VM list",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchVMs();
    const interval = setInterval(fetchVMs, 30000);
    return () => clearInterval(interval);
  }, [fetchVMs]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchVMs();
  };

  const executeVMAction = async (vmName: string, action: 'start' | 'stop' | 'restart' | 'force-stop') => {
    setActionLoading(`${vmName}-${action}`);
    
    try {
      const res = await fetch("/api/vm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vmName, action }),
      });
      const result = await res.json();
      
      if (result.success) {
        toast({
          title: "Success",
          description: `VM ${vmName} ${action} command executed`,
        });
        setTimeout(fetchVMs, 2000);
      } else {
        toast({
          title: "Action Failed",
          description: result.error || `Failed to ${action} VM`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} VM`,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  };

  const toggleAutostart = async (vmName: string, currentValue: boolean) => {
    setActionLoading(`${vmName}-autostart`);
    
    try {
      const res = await fetch("/api/vm/autostart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vmName, enabled: !currentValue }),
      });
      const result = await res.json();
      
      if (result.success) {
        toast({
          title: "Success",
          description: `Autostart ${!currentValue ? "enabled" : "disabled"} for ${vmName}`,
        });
        setVms(prev => prev.map(vm => 
          vm.name === vmName ? { ...vm, autostart: !currentValue } : vm
        ));
      } else {
        toast({
          title: "Failed",
          description: result.error || "Failed to toggle autostart",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle autostart",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: VMInfo['status']) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Running</Badge>;
      case 'stopped':
        return <Badge variant="secondary"><Square className="h-3 w-3 mr-1" />Stopped</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600"><Pause className="h-3 w-3 mr-1" />Paused</Badge>;
      case 'starting':
        return <Badge className="bg-blue-500 hover:bg-blue-600"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Starting</Badge>;
      case 'stopping':
        return <Badge className="bg-orange-500 hover:bg-orange-600"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Stopping</Badge>;
      default:
        return <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" />Unknown</Badge>;
    }
  };

  const getConnectionBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Badge className="bg-green-500 hover:bg-green-600"><Wifi className="h-3 w-3 mr-1" />Connected</Badge>;
      case 'disconnected':
        return <Badge variant="destructive"><WifiOff className="h-3 w-3 mr-1" />Disconnected</Badge>;
      default:
        return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Checking</Badge>;
    }
  };

  const runningCount = vms.filter(vm => vm.status === 'running').length;
  const stoppedCount = vms.filter(vm => vm.status === 'stopped').length;
  const otherCount = vms.filter(vm => !['running', 'stopped'].includes(vm.status)).length;

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
          <h1 className="text-2xl md:text-3xl font-bold">VM Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage libvirt virtual machines on the Ubuntu home server
          </p>
        </div>
        <div className="flex items-center gap-3">
          {getConnectionBadge()}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Power className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{runningCount}</p>
                <p className="text-sm text-muted-foreground">Running</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-500/10">
                <PowerOff className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stoppedCount}</p>
                <p className="text-sm text-muted-foreground">Stopped</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{otherCount}</p>
                <p className="text-sm text-muted-foreground">Other States</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Virtual Machines
          </CardTitle>
          <CardDescription>
            {vms.length} VM{vms.length !== 1 ? 's' : ''} found on the host
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : connectionStatus === 'disconnected' ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <WifiOff className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Connection Failed</h3>
              <p className="text-muted-foreground mt-1">
                Unable to connect to the VM host. Check SSH connectivity.
              </p>
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={handleRefresh}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Connection
              </Button>
            </div>
          ) : vms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Server className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No VMs Found</h3>
              <p className="text-muted-foreground mt-1">
                No virtual machines are configured on the host.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {vms.map((vm) => (
                  <Card key={vm.name} className="border shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${
                            vm.status === 'running' ? 'bg-green-500/10' : 
                            vm.status === 'paused' ? 'bg-yellow-500/10' : 'bg-gray-500/10'
                          }`}>
                            <Server className={`h-5 w-5 ${
                              vm.status === 'running' ? 'text-green-500' : 
                              vm.status === 'paused' ? 'text-yellow-500' : 'text-gray-500'
                            }`} />
                          </div>
                          <div>
                            <h3 className="font-medium text-lg">{vm.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              {getStatusBadge(vm.status)}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
                            <Settings className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Autostart</span>
                            <Switch
                              checked={vm.autostart}
                              onCheckedChange={() => toggleAutostart(vm.name, vm.autostart)}
                              disabled={actionLoading === `${vm.name}-autostart`}
                            />
                            {actionLoading === `${vm.name}-autostart` && (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {vm.status === 'stopped' && (
                              <Button
                                size="sm"
                                onClick={() => executeVMAction(vm.name, 'start')}
                                disabled={!!actionLoading}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                {actionLoading === `${vm.name}-start` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                                <span className="ml-1">Start</span>
                              </Button>
                            )}

                            {vm.status === 'running' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setConfirmDialog({ open: true, vmName: vm.name, action: 'stop' })}
                                  disabled={!!actionLoading}
                                >
                                  {actionLoading === `${vm.name}-stop` ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Square className="h-4 w-4" />
                                  )}
                                  <span className="ml-1">Stop</span>
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => executeVMAction(vm.name, 'restart')}
                                  disabled={!!actionLoading}
                                >
                                  {actionLoading === `${vm.name}-restart` ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}
                                  <span className="ml-1">Restart</span>
                                </Button>
                              </>
                            )}

                            {vm.status === 'paused' && (
                              <Button
                                size="sm"
                                onClick={() => executeVMAction(vm.name, 'start')}
                                disabled={!!actionLoading}
                                className="bg-blue-600 hover:bg-blue-700"
                              >
                                {actionLoading === `${vm.name}-start` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                                <span className="ml-1">Resume</span>
                              </Button>
                            )}

                            {['running', 'paused', 'starting', 'stopping'].includes(vm.status) && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setConfirmDialog({ open: true, vmName: vm.name, action: 'force-stop' })}
                                disabled={!!actionLoading}
                              >
                                {actionLoading === `${vm.name}-force-stop` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Zap className="h-4 w-4" />
                                )}
                                <span className="ml-1">Force</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Host Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Server className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Host Address</p>
                <p className="font-medium">100.66.61.51</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Wifi className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Connection Method</p>
                <p className="font-medium">SSH (libvirt/virsh)</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.action === 'force-stop' ? 'Force Stop VM?' : 'Stop VM?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.action === 'force-stop' 
                ? `This will forcefully terminate ${confirmDialog?.vmName}. Any unsaved data may be lost.`
                : `This will gracefully shut down ${confirmDialog?.vmName}.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDialog && executeVMAction(confirmDialog.vmName, confirmDialog.action as any)}
              className={confirmDialog?.action === 'force-stop' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {confirmDialog?.action === 'force-stop' ? 'Force Stop' : 'Stop'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
