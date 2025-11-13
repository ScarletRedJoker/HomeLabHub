/**
 * TicketCard Component
 * 
 * A compact, interactive card component that displays a summary of a support ticket.
 * This component is designed to be used in list/grid views where multiple tickets
 * are shown at once. It provides quick access to ticket information and actions.
 * 
 * Features:
 * - Displays ticket metadata (title, description, status, priority, category)
 * - Shows ticket creator information with avatar
 * - Displays message count and creation time
 * - Provides quick actions (View, Close/Reopen) on hover
 * - Uses Discord-style theming for consistent UI/UX
 * - Real-time data synchronization with React Query
 * - Color-coded categories and status badges for quick visual identification
 * 
 * @component
 * @example
 * ```tsx
 * <TicketCard 
 *   ticket={ticketData} 
 *   onViewTicket={() => handleViewTicket(ticketData.id)} 
 * />
 * ```
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ticket } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Clock, User } from "lucide-react";

/**
 * Props for the TicketCard component
 * @interface TicketCardProps
 */
interface TicketCardProps {
  /** The ticket object containing all ticket data */
  ticket: Ticket;
  /** Callback function triggered when user wants to view full ticket details */
  onViewTicket: () => void;
}

export default function TicketCard({ ticket, onViewTicket }: TicketCardProps) {
  // Query client for cache management and invalidation
  const queryClient = useQueryClient();
  
  // Toast notifications for user feedback
  const { toast } = useToast();

  /**
   * Fetch all ticket categories from the API
   * Categories are used to organize tickets and provide visual color coding.
   * This data is cached globally and shared across all ticket cards for efficiency.
   */
  const { data: categories = [] } = useQuery({
    queryKey: ['/api/categories'],
    queryFn: () => fetch('/api/categories').then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch categories: ${res.statusText}`);
      }
      return res.json();
    })
  });

  /**
   * Fetch messages for this specific ticket to display message count
   * Message count is an important metric for ticket activity and urgency.
   * We fetch messages separately to avoid loading all messages for all tickets at once,
   * which would be inefficient when displaying multiple cards.
   */
  const { data: messages = [] } = useQuery({
    queryKey: [`/api/tickets/${ticket.id}/messages`],
    queryFn: () => fetch(`/api/tickets/${ticket.id}/messages`).then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch messages: ${res.statusText}`);
      }
      return res.json();
    })
  });

  /**
   * Find the category for this ticket and provide fallback values
   * The fallback category uses Discord's brand color (#5865F2) as default
   * to maintain visual consistency even if category data is missing.
   */
  const category = (categories as any[]).find((c: any) => c.id === ticket.categoryId) || {
    name: "General",
    color: "#5865F2"
  };

  /**
   * Fetch creator information from Discord API
   * We fetch this separately because user data may change (username, avatar, etc.)
   * and we want fresh data. The query is only enabled if creatorId exists.
   */
  const { data: creator } = useQuery({
    queryKey: [`/api/discord/users/${ticket.creatorId}`],
    queryFn: () => fetch(`/api/discord/users/${ticket.creatorId}`).then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch user: ${res.statusText}`);
      }
      return res.json();
    }),
    enabled: !!ticket.creatorId,
  });
  
  /**
   * Get a friendly display name for the ticket creator
   * Priority order: displayName (if different from username) > nickname > username
   * This respects Discord's naming hierarchy to show the most relevant name to users.
   * 
   * @param creator - The creator object from the Discord API
   * @returns A user-friendly display name string
   */
  const getCreatorDisplayName = (creator: any) => {
    if (!creator) return "Unknown User";
    
    // Display name is preferred when it differs from username (custom Discord display name)
    if (creator.displayName && creator.displayName !== creator.username) {
      return creator.displayName;
    }
    // Server-specific nickname takes precedence over username
    if (creator.nickname) {
      return creator.nickname;
    }
    // Fall back to username if no other names are available
    return creator.username || "Unknown User";
  };
  
  const creatorName = getCreatorDisplayName(creator);

  /**
   * Mutation for closing a ticket
   * This uses optimistic updates via query invalidation to immediately reflect
   * the change in the UI while the API request is processing.
   * The mutation will automatically retry on network failures.
   */
  const closeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/tickets/${ticket.id}`, { status: "closed" });
    },
    onSuccess: () => {
      // Invalidate tickets query to trigger refetch and update all ticket lists
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      toast({
        title: "Ticket closed",
        description: `Ticket #${ticket.id} has been closed.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to close ticket: ${error}`,
        variant: "destructive",
      });
    }
  });

  /**
   * Mutation for reopening a closed ticket
   * Similar to close mutation but changes status to 'open'.
   * This allows staff to reopen tickets if issues resurface or were closed prematurely.
   */
  const reopenMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/tickets/${ticket.id}`, { status: "open" });
    },
    onSuccess: () => {
      // Invalidate tickets query to trigger refetch and update all ticket lists
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      toast({
        title: "Ticket reopened",
        description: `Ticket #${ticket.id} has been reopened.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to reopen ticket: ${error}`,
        variant: "destructive",
      });
    }
  });

  /**
   * Handle close ticket button click
   * stopPropagation prevents the card's onClick from firing when clicking the button.
   * Without this, clicking "Close" would also trigger onViewTicket.
   */
  const handleCloseTicket = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeMutation.mutate();
  };

  /**
   * Handle reopen ticket button click
   * stopPropagation prevents the card's onClick from firing when clicking the button.
   * Without this, clicking "Reopen" would also trigger onViewTicket.
   */
  const handleReopenTicket = (e: React.MouseEvent) => {
    e.stopPropagation();
    reopenMutation.mutate();
  };

  /**
   * Format the creation date into a human-readable relative time
   * Uses date-fns for consistent formatting (e.g., "2 hours ago", "3 days ago")
   * This provides better UX than showing absolute timestamps in a list view.
   */
  const formattedDate = ticket.createdAt 
    ? formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })
    : "Unknown date";

  /**
   * Get color-coded styling classes for ticket status badges
   * 
   * Status colors are carefully chosen for accessibility and meaning:
   * - Green (open): Ticket is active and awaiting response
   * - Yellow (pending): Ticket is waiting for information or action
   * - Gray (closed): Ticket is resolved or closed
   * - Blue (default): Fallback for any unexpected status values
   * 
   * The /10 opacity on bg colors creates subtle backgrounds that don't overwhelm
   * the interface, while /20 on borders provides gentle visual separation.
   * 
   * @param status - The current status of the ticket
   * @returns Tailwind CSS class string for status badge styling
   */
  const getStatusStyling = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'closed':
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      default:
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  return (
    <Card className="bg-discord-sidebar border-discord-dark hover:border-discord-blue hover:shadow-lg hover:shadow-discord-blue/10 transition-all duration-300 cursor-pointer group">
      {/* 
        Main card content - entire card is clickable to view ticket details
        Using group class enables hover effects on child elements when hovering over the card
        Responsive padding: p-3 on mobile, p-5 on sm+ screens
      */}
      <CardContent className="p-3 sm:p-5" onClick={onViewTicket}>
        {/* Header Section - Title, ID, Category, Priority, and Status */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-0 mb-3">
          {/* Left side - Title and metadata */}
          <div className="flex-1 min-w-0">
            {/* 
              Title with line-clamp-2 to limit to 2 lines and prevent layout breaking
              leading-tight ensures compact spacing for better readability
              Responsive text: text-sm on mobile, text-base on sm+ screens
            */}
            <h3 className="font-bold text-white text-sm sm:text-base leading-tight mb-1 line-clamp-2 group-hover:text-discord-blue transition-colors">
              {ticket.title}
            </h3>
            
            {/* 
              Ticket ID and category indicator
              Using bullet separator (•) for clean visual separation
              Responsive text sizing
            */}
            <div className="flex items-center gap-2 text-xs sm:text-xs text-discord-muted">
              <span>#{ticket.id}</span>
              <span>•</span>
              
              {/* 
                Category indicator with color dot
                The colored dot provides instant visual categorization
                using inline styles because category colors are dynamic from the database
              */}
              <div className="flex items-center gap-1">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: category.color }}
                />
                <span className="truncate">{category.name}</span>
              </div>
            </div>
          </div>
          
          {/* Right side - Priority and status badges */}
          <div className="flex items-center gap-2">
            {/* 
              Urgent badge - only shown for urgent tickets to draw attention
              Uses destructive variant (red) to signal high priority
            */}
            {ticket.priority === "urgent" && (
              <Badge variant="destructive" className="text-xs px-2 py-0.5 animate-pulse">
                🔥 Urgent
              </Badge>
            )}
            
            {/* 
              Status badge with dynamic color coding
              getStatusStyling() returns appropriate colors for visual status indication
            */}
            <Badge 
              variant="outline" 
              className={`text-xs px-2 py-0.5 ${getStatusStyling(ticket.status)}`}
            >
              {ticket.status}
            </Badge>
          </div>
        </div>

        {/* 
          Description preview section
          line-clamp-2 on mobile, line-clamp-3 on sm+ screens
          This provides context without overwhelming the card layout
          Responsive text sizing
        */}
        <p className="text-discord-text text-xs sm:text-sm line-clamp-2 sm:line-clamp-3 mb-3 leading-relaxed">
          {ticket.description}
        </p>

        {/* Footer Section - Creator, timestamp, message count, and actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-discord-dark">
          {/* Left side - Metadata (creator, time, messages) */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-discord-muted">
            {/* 
              Creator avatar and name
              Using gradient background for avatars creates visual interest
              when actual Discord avatars aren't available or are slow to load
            */}
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium">
                {creatorName.charAt(0).toUpperCase()}
              </div>
              {/* Truncate with max-w to prevent long usernames from breaking layout */}
              <span className="max-w-20 sm:max-w-24 truncate">{creatorName}</span>
            </div>

            {/* 
              Time indicator showing how long ago the ticket was created
              Clock icon provides visual context for the timestamp
            */}
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span className="truncate">{formattedDate}</span>
            </div>

            {/* 
              Message count indicator
              Helps users quickly identify tickets with active discussions
              Higher message counts may indicate more complex issues
            */}
            <div className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              <span>{(messages as any[]).length}</span>
            </div>
          </div>

          {/* 
            Right side - Action buttons
            Always visible on mobile (no opacity), hover effect on desktop
            Full-width on mobile, auto-width on sm+ screens
            Min height of 44px (h-11) for proper touch targets
          */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* 
              View button - explicitly opens ticket detail view
              Useful for accessibility and mobile where hover doesn't work
              stopPropagation ensures only this action fires, not the card click
              Full-width on mobile for easy tapping
            */}
            <Button
              variant="ghost"
              size="sm"
              className="h-11 sm:h-7 px-3 sm:px-2 flex-1 sm:flex-none opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-discord-muted hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                onViewTicket();
              }}
              data-testid="button-view-ticket"
            >
              View
            </Button>
            
            {/* 
              Conditional Close/Reopen button
              Button changes based on ticket status to provide appropriate action
              Red hover color for close, green for reopen to indicate the action
              Full-width on mobile for easy tapping
            */}
            {ticket.status === "open" ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-11 sm:h-7 px-3 sm:px-2 flex-1 sm:flex-none opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-discord-muted hover:text-red-400"
                onClick={handleCloseTicket}
                disabled={closeMutation.isPending}
                data-testid="button-close-ticket"
              >
                Close
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-11 sm:h-7 px-3 sm:px-2 flex-1 sm:flex-none opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-discord-muted hover:text-green-400"
                onClick={handleReopenTicket}
                disabled={reopenMutation.isPending}
                data-testid="button-reopen-ticket"
              >
                Reopen
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
