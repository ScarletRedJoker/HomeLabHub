import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search, Filter } from "lucide-react";
import type { MessageHistory } from "@shared/schema";

export default function History() {
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [triggerFilter, setTriggerFilter] = useState<string>("all");

  const { data: messages, isLoading } = useQuery<MessageHistory[]>({
    queryKey: ["/api/messages"],
  });

  const filteredMessages = messages?.filter((message) => {
    const matchesSearch = message.factContent
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesPlatform =
      platformFilter === "all" || message.platform === platformFilter;
    const matchesTrigger =
      triggerFilter === "all" || message.triggerType === triggerFilter;
    return matchesSearch && matchesPlatform && matchesTrigger;
  });

  const handleExport = () => {
    if (!filteredMessages) return;

    const csv = [
      ["Date", "Platform", "Trigger", "Fact", "Status"].join(","),
      ...filteredMessages.map((m) =>
        [
          new Date(m.postedAt).toLocaleString(),
          m.platform,
          m.triggerType,
          `"${m.factContent.replace(/"/g, '""')}"`,
          m.status,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snapple-facts-${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Message History</h1>
          <p className="text-muted-foreground mt-1">
            Complete log of all posted facts
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={!filteredMessages || filteredMessages.length === 0}
          data-testid="button-export"
        >
          <Download className="h-4 w-4" />
          <span>Export CSV</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search facts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={platformFilter} onValueChange={setPlatformFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-platform-filter">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="twitch">Twitch</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="kick">Kick</SelectItem>
                </SelectContent>
              </Select>
              <Select value={triggerFilter} onValueChange={setTriggerFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-trigger-filter">
                  <SelectValue placeholder="Trigger" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Triggers</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="chat_command">Chat Command</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredMessages && filteredMessages.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Date & Time</TableHead>
                    <TableHead className="w-[120px]">Platform</TableHead>
                    <TableHead className="w-[120px]">Trigger</TableHead>
                    <TableHead>Fact</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMessages.map((message) => (
                    <TableRow key={message.id} data-testid={`history-row-${message.id}`}>
                      <TableCell className="font-mono text-xs">
                        {new Date(message.postedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {message.platform}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {message.triggerType.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <div className="max-w-md truncate">
                          {message.factContent}
                        </div>
                      </TableCell>
                      <TableCell>
                        {message.status === "success" ? (
                          <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                            Success
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No messages found</p>
              <p className="text-sm mt-1">
                {searchQuery || platformFilter !== "all" || triggerFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Start posting facts to see history"}
              </p>
            </div>
          )}

          {filteredMessages && filteredMessages.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground text-center">
              Showing {filteredMessages.length} message(s)
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
