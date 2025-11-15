import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoginRequired } from '@/components/LoginRequired';
import { useToast } from '@/hooks/use-toast';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  RefreshCw,
  Server,
  Signal,
  TrendingUp,
  Users,
  Zap,
  MessageSquare,
  Bell,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BotMetrics {
  isConnected: boolean;
  connectionState: string;
  lastConnectionChange: Date | null;
  disconnectionCount: number;
  startTime: Date;
  uptime: number;
  latency: number;
  guildsCount: number;
  totalMembers: number;
  activeTickets: {
    open: number;
    inProgress: number;
    resolved: number;
    total: number;
  };
  ticketStats: {
    today: number;
    thisWeek: number;
    allTime: number;
  };
  errorRate: number;
  totalErrors: number;
  recentErrors: ErrorLogEntry[];
  streamNotifications: {
    sentToday: number;
    failedToday: number;
    totalSent: number;
    totalFailed: number;
  };
  healthStatus: 'healthy' | 'degraded' | 'critical';
}

interface ErrorLogEntry {
  timestamp: string;
  message: string;
  stack?: string;
  context?: string;
  severity: 'error' | 'warning' | 'critical';
}

interface TicketTrend {
  date: string;
  count: number;
  open_count: number;
  in_progress_count: number;
  resolved_count: number;
}

export default function StatusDashboard() {
  const { toast } = useToast();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [errorSeverityFilter, setErrorSeverityFilter] = useState<string>('all');
  const [expandedError, setExpandedError] = useState<number | null>(null);
  
  // Fetch bot status
  const { 
    data: metrics, 
    isLoading, 
    refetch,
    dataUpdatedAt
  } = useQuery<BotMetrics>({
    queryKey: ['/api/admin/status'],
    queryFn: () => fetch('/api/admin/status').then(res => {
      if (!res.ok) throw new Error('Failed to fetch bot status');
      return res.json();
    }),
    refetchInterval: autoRefresh ? 10000 : false, // Auto-refresh every 10 seconds
    retry: 2
  });
  
  // Fetch ticket trends
  const { data: trendsData } = useQuery<{ trends: TicketTrend[] }>({
    queryKey: ['/api/admin/status/ticket-trends'],
    queryFn: () => fetch('/api/admin/status/ticket-trends?days=7').then(res => {
      if (!res.ok) throw new Error('Failed to fetch ticket trends');
      return res.json();
    }),
    refetchInterval: autoRefresh ? 30000 : false, // Refresh every 30 seconds
  });
  
  const handleRefresh = () => {
    refetch();
    toast({
      title: 'Status refreshed',
      description: 'Bot status has been updated',
    });
  };
  
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    
    return parts.join(' ');
  };
  
  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-500';
      case 'degraded':
        return 'text-yellow-500';
      case 'critical':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };
  
  const getHealthStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-8 w-8 text-yellow-500" />;
      case 'critical':
        return <AlertCircle className="h-8 w-8 text-red-500" />;
      default:
        return <Activity className="h-8 w-8 text-gray-500" />;
    }
  };
  
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'error':
        return <Badge variant="destructive" className="bg-orange-500">Error</Badge>;
      case 'warning':
        return <Badge variant="secondary">Warning</Badge>;
      default:
        return <Badge>{severity}</Badge>;
    }
  };
  
  const filteredErrors = metrics?.recentErrors.filter(error => 
    errorSeverityFilter === 'all' || error.severity === errorSeverityFilter
  ) || [];
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading bot status...</p>
        </div>
      </div>
    );
  }
  
  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Failed to load bot status</p>
          <Button onClick={handleRefresh} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <LoginRequired>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Bot Status Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Real-time health monitoring and metrics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <Activity className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
              Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
            </Button>
            <Button onClick={handleRefresh} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
        
        {/* Health Status Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {getHealthStatusIcon(metrics.healthStatus)}
              <div>
                <div className="text-2xl">System Health</div>
                <div className={`text-sm font-normal ${getHealthStatusColor(metrics.healthStatus)}`}>
                  {metrics.healthStatus.toUpperCase()}
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">Connection</span>
                <div className="flex items-center gap-2 mt-1">
                  <Signal className={`h-4 w-4 ${metrics.isConnected ? 'text-green-500' : 'text-red-500'}`} />
                  <span className="font-semibold">
                    {metrics.isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">Uptime</span>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold">{formatUptime(metrics.uptime)}</span>
                </div>
              </div>
              
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">Latency</span>
                <div className="flex items-center gap-2 mt-1">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  <span className="font-semibold">{metrics.latency}ms</span>
                </div>
              </div>
              
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">Error Rate</span>
                <div className="flex items-center gap-2 mt-1">
                  <AlertCircle className={`h-4 w-4 ${metrics.errorRate > 5 ? 'text-red-500' : 'text-gray-500'}`} />
                  <span className="font-semibold">{metrics.errorRate}/hr</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Servers</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.guildsCount}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.totalMembers.toLocaleString()} total members
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Tickets</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.activeTickets.total}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.activeTickets.open} open · {metrics.activeTickets.inProgress} in progress
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tickets Today</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.ticketStats.today}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.ticketStats.thisWeek} this week
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Notifications</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.streamNotifications.sentToday}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.streamNotifications.failedToday} failed today
              </p>
            </CardContent>
          </Card>
        </div>
        
        {/* Detailed Views */}
        <Tabs defaultValue="tickets" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tickets">Active Tickets</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="errors">Error Log</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>
          
          {/* Active Tickets Tab */}
          <TabsContent value="tickets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ticket Breakdown</CardTitle>
                <CardDescription>Current ticket status distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Open</Badge>
                      <span className="text-sm text-muted-foreground">Awaiting response</span>
                    </div>
                    <span className="font-bold text-lg">{metrics.activeTickets.open}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">In Progress</Badge>
                      <span className="text-sm text-muted-foreground">Being worked on</span>
                    </div>
                    <span className="font-bold text-lg">{metrics.activeTickets.inProgress}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-green-500 text-green-500">Resolved</Badge>
                      <span className="text-sm text-muted-foreground">Completed</span>
                    </div>
                    <span className="font-bold text-lg">{metrics.activeTickets.resolved}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ticket Trends (Last 7 Days)</CardTitle>
                <CardDescription>Daily ticket creation and resolution</CardDescription>
              </CardHeader>
              <CardContent>
                {trendsData && trendsData.trends.length > 0 ? (
                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Open</TableHead>
                          <TableHead className="text-right">In Progress</TableHead>
                          <TableHead className="text-right">Resolved</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trendsData.trends.map((trend, index) => (
                          <TableRow key={index}>
                            <TableCell>{new Date(trend.date).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right font-medium">{trend.count}</TableCell>
                            <TableCell className="text-right">{trend.open_count}</TableCell>
                            <TableCell className="text-right">{trend.in_progress_count}</TableCell>
                            <TableCell className="text-right">{trend.resolved_count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No trend data available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Error Log Tab */}
          <TabsContent value="errors" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Error Log</CardTitle>
                    <CardDescription>Recent errors and warnings ({filteredErrors.length} entries)</CardDescription>
                  </div>
                  <Select value={errorSeverityFilter} onValueChange={setErrorSeverityFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredErrors.length > 0 ? (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {filteredErrors.map((error, index) => (
                        <Card key={index} className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {getSeverityBadge(error.severity)}
                                <span className="text-xs text-muted-foreground">
                                  {new Date(error.timestamp).toLocaleString()}
                                </span>
                                {error.context && (
                                  <Badge variant="outline" className="text-xs">{error.context}</Badge>
                                )}
                              </div>
                              <p className="text-sm font-medium">{error.message}</p>
                              {error.stack && expandedError === index && (
                                <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                                  {error.stack}
                                </pre>
                              )}
                            </div>
                            {error.stack && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpandedError(expandedError === index ? null : index)}
                              >
                                {expandedError === index ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No errors found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Stream Notifications</CardTitle>
                <CardDescription>Notification delivery statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Sent Today</p>
                    <p className="text-3xl font-bold text-green-500">
                      {metrics.streamNotifications.sentToday}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Failed Today</p>
                    <p className="text-3xl font-bold text-red-500">
                      {metrics.streamNotifications.failedToday}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Total Sent</p>
                    <p className="text-2xl font-semibold">
                      {metrics.streamNotifications.totalSent}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Total Failed</p>
                    <p className="text-2xl font-semibold">
                      {metrics.streamNotifications.totalFailed}
                    </p>
                  </div>
                </div>
                
                {metrics.streamNotifications.totalSent > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground mb-2">Success Rate</p>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{
                          width: `${(metrics.streamNotifications.totalSent / (metrics.streamNotifications.totalSent + metrics.streamNotifications.totalFailed)) * 100}%`
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {((metrics.streamNotifications.totalSent / (metrics.streamNotifications.totalSent + metrics.streamNotifications.totalFailed)) * 100).toFixed(1)}% success rate
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
        </div>
      </div>
    </LoginRequired>
  );
}
