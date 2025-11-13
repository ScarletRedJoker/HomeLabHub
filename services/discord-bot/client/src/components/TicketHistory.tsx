import { useQuery } from "@tanstack/react-query";
import { Ticket, TicketResolution, TicketAuditLog } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Ban, 
  FileText, 
  MessageSquare, 
  User, 
  Activity,
  Download,
  Filter,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface TicketHistoryProps {
  ticket: Ticket;
  className?: string;
}

type HistoryEvent = {
  id: string;
  type: 'resolution' | 'audit' | 'message';
  timestamp: Date;
  data: TicketResolution | TicketAuditLog | any;
};

const ACTION_ICONS: Record<string, any> = {
  created: FileText,
  updated: Activity,
  assigned: User,
  resolved: CheckCircle,
  reopened: AlertCircle,
  deleted: Ban,
  message: MessageSquare,
};

const RESOLUTION_ICONS: Record<string, any> = {
  resolved: CheckCircle,
  warned: AlertCircle,
  punished: Ban,
  noted: FileText,
};

export default function TicketHistory({ ticket, className }: TicketHistoryProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'resolutions' | 'actions' | 'messages'>('all');
  
  // Fetch resolutions
  const { data: resolutions = [], isLoading: resolutionsLoading } = useQuery({
    queryKey: [`/api/tickets/${ticket.id}/resolutions`],
    queryFn: () => fetch(`/api/tickets/${ticket.id}/resolutions`).then(res => {
      if (!res.ok) throw new Error('Failed to fetch resolutions');
      return res.json();
    })
  });
  
  // Fetch audit logs
  const { data: auditLogs = [], isLoading: auditLogsLoading } = useQuery({
    queryKey: [`/api/tickets/${ticket.id}/audit-logs`],
    queryFn: () => fetch(`/api/tickets/${ticket.id}/audit-logs`).then(res => {
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      return res.json();
    })
  });
  
  // Fetch messages for history
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: [`/api/tickets/${ticket.id}/messages`],
    queryFn: () => fetch(`/api/tickets/${ticket.id}/messages`).then(res => {
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    })
  });
  
  // Combine all events into a single timeline
  const historyEvents: HistoryEvent[] = [
    ...resolutions.map((r: TicketResolution) => ({
      id: `resolution-${r.id}`,
      type: 'resolution' as const,
      timestamp: new Date(r.resolvedAt!),
      data: r,
    })),
    ...auditLogs.map((log: TicketAuditLog) => ({
      id: `audit-${log.id}`,
      type: 'audit' as const,
      timestamp: new Date(log.createdAt!),
      data: log,
    })),
    ...messages.map((msg: any) => ({
      id: `message-${msg.id}`,
      type: 'message' as const,
      timestamp: new Date(msg.createdAt!),
      data: msg,
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  // Filter events
  const filteredEvents = historyEvents.filter(event => {
    if (filterType === 'all') return true;
    if (filterType === 'resolutions') return event.type === 'resolution';
    if (filterType === 'actions') return event.type === 'audit';
    if (filterType === 'messages') return event.type === 'message';
    return true;
  });
  
  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };
  
  const exportToCSV = () => {
    const headers = ['Timestamp', 'Type', 'Action', 'User', 'Details'];
    const rows = historyEvents.map(event => {
      const timestamp = event.timestamp.toISOString();
      const type = event.type;
      let action = '';
      let user = '';
      let details = '';
      
      if (event.type === 'resolution') {
        const res = event.data as TicketResolution;
        action = res.resolutionType;
        user = res.resolvedByUsername || res.resolvedBy;
        details = res.resolutionNotes || res.actionTaken || '';
      } else if (event.type === 'audit') {
        const log = event.data as TicketAuditLog;
        action = log.action;
        user = log.performedByUsername || log.performedBy;
        details = log.details || '';
      } else if (event.type === 'message') {
        action = 'message';
        user = event.data.senderUsername || event.data.senderId;
        details = event.data.content;
      }
      
      return [timestamp, type, action, user, details].map(val => 
        `"${String(val).replace(/"/g, '""')}"`
      ).join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${ticket.id}-history.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const isLoading = resolutionsLoading || auditLogsLoading || messagesLoading;
  
  return (
    <Card className={cn("bg-discord-sidebar border-discord-dark", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-discord-blue" />
            <CardTitle className="text-white">Ticket History</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={historyEvents.length === 0}
              className="bg-transparent border-discord-dark text-discord-text hover:bg-discord-dark hover:text-white"
            >
              <Download className="h-3 w-3 mr-1" />
              Export
            </Button>
          </div>
        </div>
        
        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('all')}
            className={cn(
              "text-xs",
              filterType === 'all' 
                ? "bg-discord-blue hover:bg-discord-blue/80 text-white" 
                : "bg-transparent border-discord-dark text-discord-text hover:bg-discord-dark hover:text-white"
            )}
          >
            All ({historyEvents.length})
          </Button>
          <Button
            variant={filterType === 'resolutions' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('resolutions')}
            className={cn(
              "text-xs",
              filterType === 'resolutions' 
                ? "bg-discord-blue hover:bg-discord-blue/80 text-white" 
                : "bg-transparent border-discord-dark text-discord-text hover:bg-discord-dark hover:text-white"
            )}
          >
            Resolutions ({resolutions.length})
          </Button>
          <Button
            variant={filterType === 'actions' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('actions')}
            className={cn(
              "text-xs",
              filterType === 'actions' 
                ? "bg-discord-blue hover:bg-discord-blue/80 text-white" 
                : "bg-transparent border-discord-dark text-discord-text hover:bg-discord-dark hover:text-white"
            )}
          >
            Actions ({auditLogs.length})
          </Button>
          <Button
            variant={filterType === 'messages' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('messages')}
            className={cn(
              "text-xs",
              filterType === 'messages' 
                ? "bg-discord-blue hover:bg-discord-blue/80 text-white" 
                : "bg-transparent border-discord-dark text-discord-text hover:bg-discord-dark hover:text-white"
            )}
          >
            Messages ({messages.length})
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full bg-discord-dark" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32 bg-discord-dark" />
                    <Skeleton className="h-3 w-full bg-discord-dark" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-8 text-discord-muted">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No history events found</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-discord-dark" />
              
              {/* Events */}
              <div className="space-y-4">
                {filteredEvents.map((event, index) => {
                  const isExpanded = expandedItems.has(event.id);
                  let icon, title, subtitle, content, color;
                  
                  if (event.type === 'resolution') {
                    const res = event.data as TicketResolution;
                    const ResIcon = RESOLUTION_ICONS[res.resolutionType] || FileText;
                    icon = <ResIcon className="h-4 w-4" />;
                    title = `Ticket ${res.resolutionType}`;
                    subtitle = `by ${res.resolvedByUsername || res.resolvedBy}`;
                    content = res.resolutionNotes || res.actionTaken;
                    color = res.resolutionType === 'resolved' ? 'bg-green-500' :
                           res.resolutionType === 'warned' ? 'bg-yellow-500' :
                           res.resolutionType === 'punished' ? 'bg-red-500' : 'bg-blue-500';
                  } else if (event.type === 'audit') {
                    const log = event.data as TicketAuditLog;
                    const ActionIcon = ACTION_ICONS[log.action] || Activity;
                    icon = <ActionIcon className="h-4 w-4" />;
                    title = `Ticket ${log.action}`;
                    subtitle = `by ${log.performedByUsername || log.performedBy}`;
                    content = log.details;
                    color = 'bg-purple-500';
                  } else {
                    icon = <MessageSquare className="h-4 w-4" />;
                    title = 'Message sent';
                    subtitle = `by ${event.data.senderUsername || event.data.senderId}`;
                    content = event.data.content;
                    color = 'bg-gray-500';
                  }
                  
                  return (
                    <div key={event.id} className="relative flex gap-3 group">
                      {/* Timeline dot */}
                      <div className={cn(
                        "relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-white",
                        color
                      )}>
                        {icon}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 pb-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">{title}</span>
                              <span className="text-xs text-discord-muted">
                                {subtitle}
                              </span>
                            </div>
                            <div className="text-xs text-discord-muted mt-1">
                              {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                            </div>
                            
                            {content && (
                              <div className="mt-2">
                                <div className={cn(
                                  "text-sm text-discord-text bg-discord-bg rounded p-2",
                                  !isExpanded && "line-clamp-2"
                                )}>
                                  {typeof content === 'string' ? (
                                    content
                                  ) : (
                                    <pre className="whitespace-pre-wrap font-sans">
                                      {JSON.stringify(JSON.parse(content), null, 2)}
                                    </pre>
                                  )}
                                </div>
                                {content.length > 100 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleExpanded(event.id)}
                                    className="mt-1 h-6 text-xs text-discord-muted hover:text-white p-0"
                                  >
                                    {isExpanded ? (
                                      <>Show less <ChevronUp className="ml-1 h-3 w-3" /></>
                                    ) : (
                                      <>Show more <ChevronDown className="ml-1 h-3 w-3" /></>
                                    )}
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}