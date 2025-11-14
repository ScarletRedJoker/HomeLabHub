import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Users, MessageSquare, TrendingUp, Clock, Download, Eye, Trophy } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface StreamSession {
  id: string;
  userId: string;
  platform: string;
  startedAt: string;
  endedAt: string | null;
  peakViewers: number;
  totalMessages: number;
  uniqueChatters: number;
}

interface SessionStats extends StreamSession {
  duration: number;
  avgViewers: number;
  currentViewers?: number;
}

interface ViewerSnapshot {
  id: string;
  sessionId: string;
  viewerCount: number;
  timestamp: string;
}

interface TopChatter {
  username: string;
  messageCount: number;
  rank: number;
}

interface HeatmapData {
  hour: string;
  messageCount: number;
}

export default function Statistics() {
  const [selectedPlatform, setSelectedPlatform] = useState<string>("twitch");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Fetch current session stats
  const { data: currentStats, isLoading: currentLoading } = useQuery<SessionStats | null>({
    queryKey: ["/api/stream-stats/current", selectedPlatform],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch session history
  const { data: sessions, isLoading: sessionsLoading } = useQuery<StreamSession[]>({
    queryKey: ["/api/stream-stats/sessions", selectedPlatform],
  });

  // Fetch top chatters
  const { data: topChatters, isLoading: chattersLoading } = useQuery<TopChatter[]>({
    queryKey: [`/api/stream-stats/top-chatters?sessionId=${selectedSessionId || currentStats?.id || ''}`],
    enabled: !!(selectedSessionId || currentStats?.id),
  });

  // Fetch viewer history for selected session
  const { data: viewerHistory } = useQuery<ViewerSnapshot[]>({
    queryKey: [`/api/stream-stats/viewer-history/${selectedSessionId || currentStats?.id}`],
    enabled: !!(selectedSessionId || currentStats?.id),
  });

  // Fetch chat activity heatmap
  const { data: heatmapData } = useQuery<HeatmapData[]>({
    queryKey: [`/api/stream-stats/heatmap/${selectedSessionId || currentStats?.id}`],
    enabled: !!(selectedSessionId || currentStats?.id),
  });

  // Calculate uptime
  const calculateUptime = (startedAt: string, endedAt: string | null) => {
    const start = new Date(startedAt);
    const end = endedAt ? new Date(endedAt) : new Date();
    const diff = end.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Export data to CSV
  const exportToCSV = () => {
    if (!sessions || sessions.length === 0) return;

    const headers = ["Platform", "Started At", "Duration", "Peak Viewers", "Total Messages", "Unique Chatters"];
    const rows = sessions.map((session) => [
      session.platform,
      format(new Date(session.startedAt), "PPpp"),
      session.endedAt ? calculateUptime(session.startedAt, session.endedAt) : "Live",
      session.peakViewers,
      session.totalMessages,
      session.uniqueChatters,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stream-stats-${selectedPlatform}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Prepare viewer chart data
  const viewerChartData = viewerHistory?.map((snapshot) => ({
    time: format(new Date(snapshot.timestamp), "HH:mm"),
    viewers: snapshot.viewerCount,
  })) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Stream Statistics</h1>
          <p className="text-muted-foreground">Track your stream performance across platforms</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="twitch">Twitch</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="kick">Kick</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="current" className="space-y-4">
        <TabsList>
          <TabsTrigger value="current">Current Stream</TabsTrigger>
          <TabsTrigger value="history">Session History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Current Stream Tab */}
        <TabsContent value="current" className="space-y-4">
          {currentLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : currentStats ? (
            <>
              {/* Stats Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Live Viewers</CardTitle>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{currentStats.currentViewers || 0}</div>
                    <p className="text-xs text-muted-foreground">
                      Peak: {currentStats.peakViewers}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{currentStats.totalMessages}</div>
                    <p className="text-xs text-muted-foreground">
                      {currentStats.uniqueChatters} unique chatters
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Stream Uptime</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {calculateUptime(currentStats.startedAt, currentStats.endedAt)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Started {formatDistanceToNow(new Date(currentStats.startedAt), { addSuffix: true })}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Viewers</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{Math.round(currentStats.avgViewers || 0)}</div>
                    <p className="text-xs text-muted-foreground">
                      Based on snapshots
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Viewer Count Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Viewer Count Over Time</CardTitle>
                  <CardDescription>Real-time viewer tracking (5-minute intervals)</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={viewerChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="viewers" stroke="#8884d8" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Top Chatters */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Top Chatters
                  </CardTitle>
                  <CardDescription>Most active chatters this stream</CardDescription>
                </CardHeader>
                <CardContent>
                  {chattersLoading ? (
                    <Skeleton className="h-40" />
                  ) : topChatters && topChatters.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Username</TableHead>
                          <TableHead className="text-right">Messages</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topChatters.map((chatter, index) => (
                          <TableRow key={chatter.username}>
                            <TableCell>
                              <Badge variant={index === 0 ? "default" : "outline"}>
                                #{index + 1}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{chatter.username}</TableCell>
                            <TableCell className="text-right">{chatter.messageCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No chat activity yet</p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No active stream</p>
                <p className="text-sm text-muted-foreground">Start your bot to begin tracking statistics</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Session History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Past Streaming Sessions</CardTitle>
              <CardDescription>View your streaming history on {selectedPlatform}</CardDescription>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <Skeleton className="h-64" />
              ) : sessions && sessions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Peak Viewers</TableHead>
                      <TableHead>Messages</TableHead>
                      <TableHead>Chatters</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow 
                        key={session.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedSessionId(session.id)}
                      >
                        <TableCell>{format(new Date(session.startedAt), "PPp")}</TableCell>
                        <TableCell>{calculateUptime(session.startedAt, session.endedAt)}</TableCell>
                        <TableCell>{session.peakViewers}</TableCell>
                        <TableCell>{session.totalMessages}</TableCell>
                        <TableCell>{session.uniqueChatters}</TableCell>
                        <TableCell>
                          <Badge variant={session.endedAt ? "secondary" : "default"}>
                            {session.endedAt ? "Ended" : "Live"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No session history yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Chat Activity Heatmap</CardTitle>
              <CardDescription>Messages per hour for selected session</CardDescription>
            </CardHeader>
            <CardContent>
              {heatmapData && heatmapData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={heatmapData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="messageCount" fill="#82ca9d" name="Messages" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  {selectedSessionId || currentStats?.id ? "No activity data yet" : "Select a session to view analytics"}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Session Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {(selectedSessionId || currentStats) ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Platform:</span>
                      <span className="font-medium capitalize">{selectedPlatform}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant={currentStats?.endedAt ? "secondary" : "default"}>
                        {currentStats?.endedAt ? "Ended" : "Live"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Snapshots:</span>
                      <span className="font-medium">{viewerHistory?.length || 0}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">No session selected</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
              </CardHeader>
              <CardContent>
                {sessions && sessions.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Sessions:</span>
                      <span className="font-medium">{sessions.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Session Length:</span>
                      <span className="font-medium">
                        {Math.round(
                          sessions.reduce((acc, s) => {
                            const duration = new Date(s.endedAt || new Date()).getTime() - new Date(s.startedAt).getTime();
                            return acc + duration / (1000 * 60);
                          }, 0) / sessions.length
                        )} min
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Messages:</span>
                      <span className="font-medium">
                        {sessions.reduce((acc, s) => acc + s.totalMessages, 0)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">No data available</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
