import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ticket, TicketMessage } from "@shared/schema";
import { connectWebSocket } from "@/lib/ticketUtils";
import { useAuthContext } from "@/components/AuthProvider";
import { useServerContext } from "@/contexts/ServerContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TicketCard from "@/components/TicketCard";
import NewTicketModal from "@/components/NewTicketModal";
import TicketDetailView from "@/components/TicketDetailView";
import LiveServerStatus from "@/components/LiveServerStatus";
import { Plus, MessageSquare, Clock, CheckCircle, Search, Users, AlertCircle } from "lucide-react";

/**
 * OverviewTab Component
 * 
 * Main ticket overview dashboard for both admins and regular users.
 * Displays ticket statistics and a filterable list of tickets.
 */
export default function OverviewTab() {
  // State Management
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
  const [isTicketDetailOpen, setIsTicketDetailOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Hooks
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuthContext();
  const { selectedServerId, selectedServerName } = useServerContext();
  const socketRef = useRef<WebSocket | null>(null);

  // Data Fetching
  const { data: tickets = [], isLoading, error } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets'],
  });

  interface AdminStats {
    totalUsers?: number;
    connectedServers?: number;
  }

  const { data: adminStats } = useQuery<AdminStats>({
    queryKey: ['/api/admin/stats'],
    enabled: isAdmin,
  });

  // Ticket Filtering
  const userTickets = (() => {
    let roleFilteredTickets = isAdmin
      ? (tickets as Ticket[])
      : (tickets as Ticket[]).filter((ticket: Ticket) => ticket.creatorId === user?.id);
    
    if (selectedServerId) {
      roleFilteredTickets = roleFilteredTickets.filter((ticket: Ticket) => 
        ticket.serverId === selectedServerId
      );
    }
    
    return roleFilteredTickets;
  })();

  const filteredTickets = userTickets.filter((ticket: Ticket) => {
    const matchesSearch = searchQuery === "" || 
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Statistics
  const stats = {
    total: userTickets.length,
    open: userTickets.filter(ticket => ticket.status === 'open').length,
    pending: userTickets.filter(ticket => ticket.status === 'pending').length,
    closed: userTickets.filter(ticket => ticket.status === 'closed').length,
    urgent: userTickets.filter(ticket => ticket.priority === 'urgent').length,
  };

  // WebSocket Real-time Updates
  useEffect(() => {
    const handleWebSocketMessage = (data: any) => {
      if (data.type === 'TICKET_CREATED' || data.type === 'TICKET_UPDATED') {
        queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
        
        setSelectedTicket(prevTicket => {
          if (prevTicket && data.data && data.data.id === prevTicket.id) {
            return data.data;
          }
          return prevTicket;
        });
        
        if (data.data) {
          queryClient.invalidateQueries({ 
            queryKey: [`/api/tickets/${data.data.id}/messages`] 
          });
        }
      } 
      else if (data.type === 'TICKET_DELETED') {
        queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
        
        if (selectedTicket && data.data && data.data.id === selectedTicket.id) {
          handleCloseTicketDetail();
        }
      }
      else if (data.type === 'MESSAGE_CREATED') {
        if (data.data && data.data.ticketId) {
          queryClient.invalidateQueries({ 
            queryKey: [`/api/tickets/${data.data.ticketId}/messages`] 
          });
        }
      }
    };
    
    if (user) {
      socketRef.current = connectWebSocket(handleWebSocketMessage, user.id);
    }
    
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [user, queryClient]);

  // Event Handlers
  const handleOpenNewTicket = () => {
    setIsNewTicketModalOpen(true);
  };

  const handleCloseNewTicket = () => {
    setIsNewTicketModalOpen(false);
  };

  const handleViewTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setIsTicketDetailOpen(true);
  };

  const handleCloseTicketDetail = () => {
    setIsTicketDetailOpen(false);
    setSelectedTicket(null);
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-discord-text">Loading your dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Live Server Status Widget - Prominently displayed at top */}
      {selectedServerId && (
        <LiveServerStatus 
          serverId={selectedServerId}
          className="mb-6"
        />
      )}

      {/* Server Context Indicator */}
      {selectedServerId && (
        <div className="bg-discord-sidebar border border-discord-dark rounded-lg px-3 sm:px-4 py-3 sm:py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-discord-blue/20 text-discord-blue border-discord-blue/30">
              Server
            </Badge>
            <span className="text-sm sm:text-base text-discord-text font-medium">
              {selectedServerName || 'Selected Server'}
            </span>
          </div>
          <span className="text-xs text-discord-muted">
            Viewing tickets and data for this server only
          </span>
        </div>
      )}
      
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-discord-sidebar to-discord-bg border-discord-dark hover:border-discord-blue hover:shadow-lg hover:shadow-discord-blue/20 transition-all duration-300" data-testid="card-total-tickets">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-discord-muted mb-2 font-medium">Total Tickets</p>
                <p className="text-3xl font-bold text-white" data-testid="text-total-tickets">{stats.total}</p>
              </div>
              <div className="p-3 bg-discord-blue/20 rounded-xl">
                <MessageSquare className="h-7 w-7 text-discord-blue" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-discord-sidebar to-discord-bg border-discord-dark hover:border-green-500 hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300" data-testid="card-open-tickets">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-discord-muted mb-2 font-medium">Open</p>
                <p className="text-3xl font-bold text-green-400" data-testid="text-open-tickets">{stats.open}</p>
              </div>
              <div className="p-3 bg-green-500/20 rounded-xl">
                <AlertCircle className="h-7 w-7 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-discord-sidebar to-discord-bg border-discord-dark hover:border-yellow-500 hover:shadow-lg hover:shadow-yellow-500/20 transition-all duration-300" data-testid="card-pending-tickets">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-discord-muted mb-2 font-medium">Pending</p>
                <p className="text-3xl font-bold text-yellow-400" data-testid="text-pending-tickets">{stats.pending}</p>
              </div>
              <div className="p-3 bg-yellow-500/20 rounded-xl">
                <Clock className="h-7 w-7 text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-discord-sidebar to-discord-bg border-discord-dark hover:border-gray-500 hover:shadow-lg hover:shadow-gray-500/20 transition-all duration-300" data-testid="card-closed-tickets">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-discord-muted mb-2 font-medium">Closed</p>
                <p className="text-3xl font-bold text-gray-400" data-testid="text-closed-tickets">{stats.closed}</p>
              </div>
              <div className="p-3 bg-gray-500/20 rounded-xl">
                <CheckCircle className="h-7 w-7 text-gray-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-discord-sidebar to-discord-bg border-discord-dark hover:border-red-500 hover:shadow-lg hover:shadow-red-500/20 transition-all duration-300" data-testid="card-urgent-tickets">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-discord-muted mb-2 font-medium">Urgent</p>
                <p className="text-3xl font-bold text-red-400" data-testid="text-urgent-tickets">{stats.urgent}</p>
              </div>
              <div className="p-3 bg-red-500/20 rounded-xl animate-pulse">
                <AlertCircle className="h-7 w-7 text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Stats */}
      {isAdmin && adminStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {adminStats.totalUsers !== undefined && (
            <Card className="bg-discord-sidebar border-discord-dark hover:bg-discord-sidebar/80 transition-all duration-200" data-testid="card-total-users">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-discord-muted mb-1">Total Users</p>
                    <p className="text-2xl font-bold text-white" data-testid="text-total-users">{adminStats.totalUsers}</p>
                  </div>
                  <Users className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          )}

          {adminStats.connectedServers !== undefined && (
            <Card className="bg-discord-sidebar border-discord-dark hover:bg-discord-sidebar/80 transition-all duration-200" data-testid="card-connected-servers">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-discord-muted mb-1">Servers Connected</p>
                    <p className="text-2xl font-bold text-white" data-testid="text-connected-servers">{adminStats.connectedServers}</p>
                  </div>
                  <MessageSquare className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Action Buttons & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <Button 
          onClick={handleOpenNewTicket}
          className="bg-discord-blue hover:bg-blue-600 text-white px-6 h-11 w-full sm:w-auto transition-all duration-200"
          data-testid="button-create-ticket"
        >
          <Plus className="h-5 w-5 mr-2" />
          Create New Ticket
        </Button>

        <div className="flex-1 relative min-w-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-discord-muted" />
          <input
            type="text"
            placeholder="Search tickets..."
            className="w-full bg-discord-dark border border-discord-dark text-discord-text text-sm sm:text-base pl-10 pr-4 h-11 rounded-lg focus:outline-none focus:ring-2 focus:ring-discord-blue focus:border-transparent transition-all duration-200"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-tickets"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48 h-11 bg-discord-dark border-discord-dark text-discord-text" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tickets</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tickets Display */}
      {filteredTickets.length === 0 ? (
        <div className="text-center py-12 sm:py-16 px-4">
          {userTickets.length === 0 ? (
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 mx-auto bg-discord-blue rounded-full flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-white">
                {isAdmin ? 'No Tickets Yet' : 'Welcome to Support!'}
              </h3>
              <p className="text-sm sm:text-base text-discord-muted">
                {isAdmin 
                  ? 'No support tickets have been created yet.' 
                  : 'Get help by creating your first support ticket.'}
              </p>
              <Button 
                onClick={handleOpenNewTicket}
                className="bg-discord-blue hover:bg-blue-600 text-white h-11 w-full sm:w-auto"
                data-testid="button-create-first-ticket"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Ticket
              </Button>
            </div>
          ) : (
            <div className="max-w-md mx-auto space-y-4">
              <Search className="h-12 w-12 mx-auto text-discord-muted" />
              <h3 className="text-lg sm:text-xl font-semibold text-white">No Results Found</h3>
              <p className="text-sm sm:text-base text-discord-muted">
                No tickets match your search criteria. Try adjusting your filters.
              </p>
              <Button 
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
                className="border-discord-blue text-discord-blue hover:bg-discord-blue hover:text-white h-11 w-full sm:w-auto"
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredTickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onViewTicket={() => handleViewTicket(ticket)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <NewTicketModal
        isOpen={isNewTicketModalOpen}
        onClose={handleCloseNewTicket}
      />

      {selectedTicket && (
        <TicketDetailView
          isOpen={isTicketDetailOpen}
          onClose={handleCloseTicketDetail}
          ticket={selectedTicket}
        />
      )}
    </div>
  );
}
