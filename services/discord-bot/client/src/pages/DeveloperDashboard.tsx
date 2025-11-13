import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  Database, 
  Server, 
  Users, 
  BarChart3, 
  FileText, 
  Settings,
  RefreshCw,
  Play,
  Square,
  Trash2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Cpu,
  HardDrive,
  Container
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SystemStats {
  cpu: { count: number; model: string; usage: string[] };
  memory: { total: number; free: number; used: number; usagePercent: string };
  system: { platform: string; arch: string; hostname: string; uptime: number };
}

interface ProcessInfo {
  pid: number;
  uptime: number;
  memory: { heapUsed: number; heapTotal: number; rss: number };
  cpu: { user: number; system: number };
  version: string;
  nodeVersion: string;
  v8Version: string;
}

interface DockerContainer {
  id: string;
  name: string;
  status: string;
  state: string;
  image: string;
  created: number;
}

interface DockerData {
  dockerAvailable: boolean;
  containers?: DockerContainer[];
  message?: string;
}

interface ContainerStat {
  id: string;
  name: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

interface DockerStats {
  dockerAvailable: boolean;
  stats?: ContainerStat[];
  message?: string;
}

interface DatabaseTable {
  name: string;
  rowCount: number;
  columnCount: number;
}

interface DatabaseTables {
  tables: DatabaseTable[];
}

interface DatabaseStats {
  databaseSize: string;
  timestamp: Date;
}

interface BotStats {
  totalServers: number;
  activeServers: number;
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  totalUsers: number;
}

interface BotServer {
  id: string;
  name: string;
  memberCount: number;
  icon: string | null;
  isActive: boolean;
  hasSettings: boolean;
}

interface BotServers {
  servers: BotServer[];
}

interface Developer {
  id: number;
  discordId: string;
  username: string;
  isActive: boolean;
  addedAt: Date;
  addedBy: string | null;
}

interface DevelopersResponse {
  developers: Developer[];
}

interface DeveloperAuditLog {
  id: number;
  developerId: string;
  action: string;
  metadata: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

interface AuditLogsResponse {
  logs: DeveloperAuditLog[];
}

interface QueryResult {
  rows: any[];
  rowCount: number;
}

export default function DeveloperDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("system");
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM tickets LIMIT 10;");
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);

  const { data: systemStats, refetch: refetchSystemStats } = useQuery<SystemStats>({
    queryKey: ['/api/dev/system/stats'],
    refetchInterval: 5000,
  });

  const { data: processInfo } = useQuery<ProcessInfo>({
    queryKey: ['/api/dev/system/process'],
    refetchInterval: 5000,
  });

  const { data: dockerData } = useQuery<DockerData>({
    queryKey: ['/api/dev/docker/containers'],
  });

  const { data: dockerStats } = useQuery<DockerStats>({
    queryKey: ['/api/dev/docker/stats'],
    refetchInterval: 5000,
  });

  const { data: botStats } = useQuery<BotStats>({
    queryKey: ['/api/dev/bot/global-stats'],
  });

  const { data: botServers } = useQuery<BotServers>({
    queryKey: ['/api/dev/bot/servers'],
  });

  const { data: dbTables } = useQuery<DatabaseTables>({
    queryKey: ['/api/dev/database/tables'],
  });

  const { data: dbStats } = useQuery<DatabaseStats>({
    queryKey: ['/api/dev/database/stats'],
  });

  const { data: developers } = useQuery<DevelopersResponse>({
    queryKey: ['/api/dev/developers'],
  });

  const { data: auditLogs } = useQuery<AuditLogsResponse>({
    queryKey: ['/api/dev/audit-log'],
  });

  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const executeQueryMutation = useMutation<QueryResult, Error, string>({
    mutationFn: async (query: string) => {
      const res = await apiRequest('POST', '/api/dev/database/query', { query });
      return res.json();
    },
    onSuccess: (data) => {
      setQueryResult(data);
      setQueryError(null);
      toast({ title: "Query executed successfully", description: `${data.rowCount} rows returned` });
    },
    onError: (error: any) => {
      setQueryError(error.message || "Failed to execute query");
      toast({ title: "Query failed", description: error.message, variant: "destructive" });
    }
  });

  const restartContainerMutation = useMutation({
    mutationFn: (containerId: string) => apiRequest('POST', `/api/dev/docker/restart/${containerId}`),
    onSuccess: () => {
      toast({ title: "Container restarted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/dev/docker/containers'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to restart container", description: error.message, variant: "destructive" });
    }
  });

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-background p-8" data-testid="developer-dashboard">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="dashboard-title">
            🛠️ Developer Dashboard
          </h1>
          <p className="text-muted-foreground">
            System monitoring, database tools, and bot management
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-7 w-full" data-testid="dashboard-tabs">
            <TabsTrigger value="system" data-testid="tab-system">
              <Activity className="w-4 h-4 mr-2" />
              System
            </TabsTrigger>
            <TabsTrigger value="docker" data-testid="tab-docker">
              <Container className="w-4 h-4 mr-2" />
              Docker
            </TabsTrigger>
            <TabsTrigger value="database" data-testid="tab-database">
              <Database className="w-4 h-4 mr-2" />
              Database
            </TabsTrigger>
            <TabsTrigger value="bot" data-testid="tab-bot">
              <Server className="w-4 h-4 mr-2" />
              Bot
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="logs" data-testid="tab-logs">
              <FileText className="w-4 h-4 mr-2" />
              Audit Logs
            </TabsTrigger>
            <TabsTrigger value="devs" data-testid="tab-devs">
              <Users className="w-4 h-4 mr-2" />
              Developers
            </TabsTrigger>
          </TabsList>

          {/* System Monitor Tab */}
          <TabsContent value="system" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <Cpu className="w-5 h-5 text-blue-500" />
                      <span className="text-2xl font-bold">
                        {systemStats?.cpu?.usage?.[0] || '0'}%
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {systemStats?.cpu?.count || 0} cores • {systemStats?.cpu?.model || 'Unknown'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <HardDrive className="w-5 h-5 text-green-500" />
                      <span className="text-2xl font-bold">
                        {systemStats?.memory?.usagePercent || '0'}%
                      </span>
                    </div>
                    <Progress value={parseFloat(systemStats?.memory?.usagePercent || '0')} className="h-2" />
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(systemStats?.memory?.used || 0)} / {formatBytes(systemStats?.memory?.total || 0)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">System Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    <div><strong>Platform:</strong> {systemStats?.system?.platform || 'Unknown'}</div>
                    <div><strong>Arch:</strong> {systemStats?.system?.arch || 'Unknown'}</div>
                    <div><strong>Uptime:</strong> {formatUptime(systemStats?.system?.uptime || 0)}</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Process Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">PID</div>
                    <div className="font-mono font-bold">{processInfo?.pid}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Uptime</div>
                    <div className="font-mono font-bold">{formatUptime(processInfo?.uptime || 0)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Heap Used</div>
                    <div className="font-mono font-bold">{formatBytes(processInfo?.memory?.heapUsed || 0)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Node Version</div>
                    <div className="font-mono font-bold">{processInfo?.nodeVersion}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Docker Manager Tab */}
          <TabsContent value="docker" className="space-y-4">
            {dockerData?.dockerAvailable === false ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Docker is not available in this environment. Container management features are disabled.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Docker Containers</CardTitle>
                    <CardDescription>{dockerData?.containers?.length || 0} containers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Image</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>State</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dockerData?.containers?.map((container: any) => (
                          <TableRow key={container.id}>
                            <TableCell className="font-mono text-sm">{container.name}</TableCell>
                            <TableCell className="text-sm">{container.image}</TableCell>
                            <TableCell>
                              <Badge variant={container.state === 'running' ? 'default' : 'secondary'}>
                                {container.state}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{container.status}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => restartContainerMutation.mutate(container.id)}
                                disabled={restartContainerMutation.isPending}
                                data-testid={`restart-container-${container.id}`}
                              >
                                <RefreshCw className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {dockerStats?.stats && dockerStats.stats.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Container Stats</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Container</TableHead>
                            <TableHead>CPU %</TableHead>
                            <TableHead>Memory</TableHead>
                            <TableHead>Network RX/TX</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dockerStats.stats.map((stat: any) => (
                            <TableRow key={stat.id}>
                              <TableCell className="font-mono text-sm">{stat.name}</TableCell>
                              <TableCell>{stat.cpuPercent}%</TableCell>
                              <TableCell>
                                {formatBytes(stat.memoryUsage)} / {formatBytes(stat.memoryLimit)}
                                <div className="text-xs text-muted-foreground">({stat.memoryPercent}%)</div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatBytes(stat.networkRx)} / {formatBytes(stat.networkTx)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* Database Tools Tab */}
          <TabsContent value="database" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Database Size</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dbStats?.databaseSize || 'Unknown'}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Total Tables</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dbTables?.tables?.length || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Total Rows</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {dbTables?.tables?.reduce((sum: number, t: any) => sum + parseInt(t.rowCount || 0), 0) || 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>SQL Query Runner</CardTitle>
                <CardDescription>Execute SELECT queries only (security restriction)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="Enter SQL query..."
                  className="font-mono text-sm min-h-[120px]"
                  data-testid="sql-query-input"
                />
                <div className="flex gap-2">
                  <Button 
                    onClick={() => executeQueryMutation.mutate(sqlQuery)}
                    disabled={executeQueryMutation.isPending}
                    data-testid="execute-query-button"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Execute Query
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setSqlQuery("SELECT * FROM tickets LIMIT 10;")}
                  >
                    Load Example
                  </Button>
                </div>

                {queryError && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>{queryError}</AlertDescription>
                  </Alert>
                )}

                {queryResult && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted px-4 py-2 text-sm font-medium">
                      Results ({queryResult.rowCount} rows)
                    </div>
                    <ScrollArea className="h-[400px]">
                      <div className="p-4">
                        <pre className="text-xs font-mono bg-background p-4 rounded">
                          {JSON.stringify(queryResult.rows, null, 2)}
                        </pre>
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Database Tables</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table Name</TableHead>
                      <TableHead>Row Count</TableHead>
                      <TableHead>Columns</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dbTables?.tables?.map((table: any) => (
                      <TableRow key={table.name}>
                        <TableCell className="font-mono text-sm">{table.name}</TableCell>
                        <TableCell>{table.rowCount}</TableCell>
                        <TableCell>{table.columnCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bot Management Tab */}
          <TabsContent value="bot" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Total Servers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{botStats?.totalServers || 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {botStats?.activeServers || 0} active
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Total Tickets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{botStats?.totalTickets || 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {botStats?.openTickets || 0} open • {botStats?.closedTickets || 0} closed
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Total Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{botStats?.totalUsers || 0}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Connected Servers</CardTitle>
                <CardDescription>{botServers?.servers?.length || 0} servers</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Server Name</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Settings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {botServers?.servers?.map((server: any) => (
                      <TableRow key={server.id}>
                        <TableCell className="font-medium">{server.name}</TableCell>
                        <TableCell>{server.memberCount}</TableCell>
                        <TableCell>
                          <Badge variant={server.isActive ? 'default' : 'secondary'}>
                            {server.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {server.hasSettings ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-gray-400" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Analytics Dashboard</CardTitle>
                <CardDescription>Coming soon - ticket trends and response time analytics</CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Analytics visualizations will be added in the next update. Use the Database tab to run custom analytics queries.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Developer Audit Log</CardTitle>
                <CardDescription>{auditLogs?.logs?.length || 0} actions logged</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Developer</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Metadata</TableHead>
                        <TableHead>IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs?.logs?.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">
                            {new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{log.developerId}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{log.action}</Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">
                            {log.metadata || '-'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{log.ipAddress || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Developers Management Tab */}
          <TabsContent value="devs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Developers</CardTitle>
                <CardDescription>{developers?.developers?.length || 0} developers</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Discord ID</TableHead>
                      <TableHead>Added By</TableHead>
                      <TableHead>Added At</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {developers?.developers?.map((dev: any) => (
                      <TableRow key={dev.id}>
                        <TableCell className="font-medium">{dev.username}</TableCell>
                        <TableCell className="font-mono text-sm">{dev.discordId}</TableCell>
                        <TableCell className="font-mono text-sm">{dev.addedBy || '-'}</TableCell>
                        <TableCell className="text-sm">
                          {new Date(dev.addedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={dev.isActive ? 'default' : 'secondary'}>
                            {dev.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
