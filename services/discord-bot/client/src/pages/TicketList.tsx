import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import TicketCard from "@/components/TicketCard";
import ServerSelector from "@/components/ServerSelector";
import { Ticket, TicketCategory } from "@shared/schema";
import { useAuthContext } from "@/components/AuthProvider";
import { useServerContext } from "@/contexts/ServerContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";

interface TicketListProps {
  onNewTicket: () => void;
  onViewTicket: (ticket: Ticket) => void;
}

export default function TicketList({ onNewTicket, onViewTicket }: TicketListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const { user, isAdmin } = useAuthContext();
  const { selectedServerId, setSelectedServerId, selectedServerName, isServerSpecific } = useServerContext();
  const { isConnected } = useWebSocket();
  const { toast } = useToast();

  // Fetch tickets - WebSocket will automatically invalidate this query when tickets are created/updated
  const { data: tickets = [], isLoading, refetch } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets'],
  });
  
  // Show connection status in development mode
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[TicketList] WebSocket connection status:', isConnected);
    }
  }, [isConnected]);

  // Fetch categories
  const { data: categories = [] } = useQuery<TicketCategory[]>({
    queryKey: ['/api/categories'],
  });

  // Filter tickets based on search query and filters
  const filteredTickets = (tickets as Ticket[]).filter((ticket: Ticket) => {
    // Apply server filter (most important filter)
    if (isServerSpecific) {
      // When a specific server is selected, show tickets that:
      // 1. Belong to that server, OR
      // 2. Have no server association (null, undefined, or empty string)
      const hasNoServer = ticket.serverId == null || ticket.serverId === '';
      if (!hasNoServer && ticket.serverId !== selectedServerId) {
        return false;
      }
    }

    // For non-admin users, only show their own tickets when no server is selected
    if (!isServerSpecific && !isAdmin && ticket.creatorId !== user?.id) {
      return false;
    }
    
    // Apply search query filter
    if (searchQuery && !ticket.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    // Apply category filter
    if (categoryFilter !== null && ticket.categoryId !== categoryFilter) {
      return false;
    }
    
    // Apply status filter
    if (statusFilter !== null && ticket.status !== statusFilter) {
      return false;
    }
    
    return true;
  });

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleFilterToggle = () => {
    // Simple implementation - just toggling between open and all tickets
    if (statusFilter === 'open') {
      setStatusFilter(null);
    } else {
      setStatusFilter('open');
    }
  };

  // Count tickets by status
  const totalTickets = (tickets as Ticket[]).length;
  const openTickets = (tickets as Ticket[]).filter((ticket: Ticket) => ticket.status === 'open').length;
  const closedTickets = totalTickets - openTickets;
  
  // Determine if any filters are active (not just search)
  const hasActiveFilters = categoryFilter !== null || statusFilter !== null;

  return (
    <>
      {/* Header */}
      <Header 
        title={isServerSpecific ? `${selectedServerName} Tickets` : "All Tickets"} 
        totalTickets={filteredTickets.length}
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
        onFilterToggle={handleFilterToggle}
        onNewTicket={onNewTicket}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Server Selector - Only show for admins with connected servers */}
      {user?.isAdmin && user?.connectedServers && user.connectedServers.length > 0 && (
        <div className="bg-discord-sidebar border-b border-discord-dark px-4 py-3">
          <ServerSelector 
            selectedServerId={selectedServerId}
            onServerSelect={setSelectedServerId}
          />
        </div>
      )}

      {/* Main ticket area */}
      <main className="flex-1 overflow-y-auto p-4 bg-discord-bg">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <div className="text-discord-text">Loading tickets...</div>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="flex flex-col justify-center items-center py-16">
            {searchQuery || categoryFilter || statusFilter ? (
              // Show filtered results empty state
              <div className="text-center max-w-md">
                <div className="w-16 h-16 mx-auto mb-4 bg-discord-dark rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-discord-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-discord-text mb-2">No tickets match your filters</h3>
                <p className="text-discord-muted mb-4">Try adjusting your search criteria or clearing the filters to see all tickets.</p>
                <button 
                  className="bg-discord-blue hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors"
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter(null);
                    setStatusFilter(null);
                  }}
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              // Show welcome message for new users
              <div className="text-center max-w-2xl">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-discord-blue to-purple-600 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-1l-4 4z" />
                  </svg>
                </div>
                
                <h2 className="text-2xl font-bold text-discord-text mb-4">
                  Welcome to your Support Dashboard!
                </h2>
                
                <p className="text-discord-muted text-lg mb-6">
                  This is where you'll manage and track all your support tickets. 
                  {isAdmin ? ' As an administrator, you can view and manage all user tickets.' : ' You can create tickets, track their progress, and communicate with support staff.'}
                </p>
                
                <div className="grid md:grid-cols-3 gap-6 mb-8 text-left">
                  <div className="bg-discord-sidebar p-4 rounded-lg border border-discord-dark">
                    <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mb-3">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-discord-text mb-2">Create Tickets</h3>
                    <p className="text-sm text-discord-muted">
                      Need help? Create a support ticket with your questions or issues.
                    </p>
                  </div>
                  
                  <div className="bg-discord-sidebar p-4 rounded-lg border border-discord-dark">
                    <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-3">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-discord-text mb-2">Track Progress</h3>
                    <p className="text-sm text-discord-muted">
                      Monitor the status of your tickets and see real-time updates from support.
                    </p>
                  </div>
                  
                  <div className="bg-discord-sidebar p-4 rounded-lg border border-discord-dark">
                    <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-3">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-discord-text mb-2">Get Responses</h3>
                    <p className="text-sm text-discord-muted">
                      Communicate directly with support staff through the ticket system.
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    className="bg-discord-blue hover:bg-blue-600 text-white px-6 py-3 rounded-md font-medium transition-colors flex items-center justify-center"
                    onClick={onNewTicket}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Your First Ticket
                  </button>
                  
                  {isAdmin && (
                    <a 
                      href="/admin"
                      className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-md font-medium transition-colors flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      View Admin Dashboard
                    </a>
                  )}
                </div>
                
                <div className="mt-8 text-left bg-discord-dark p-4 rounded-lg">
                  <h4 className="font-semibold text-discord-text mb-2 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Quick Tips:
                  </h4>
                  <ul className="text-sm text-discord-muted space-y-1 ml-7">
                    <li>• Be specific about your issue when creating a ticket</li>
                    <li>• Include relevant details like error messages or steps to reproduce problems</li>
                    <li>• You'll receive notifications when support responds to your ticket</li>
                    {categories.length > 1 && <li>• Choose the right category to help us route your ticket to the right team</li>}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTickets.map((ticket: Ticket) => (
              <TicketCard 
                key={ticket.id}
                ticket={ticket}
                onViewTicket={() => onViewTicket(ticket)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
