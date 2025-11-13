/**
 * TicketDetailView Component
 * 
 * A comprehensive, full-screen view for displaying and managing individual support tickets.
 * This component serves as the main interface for both users and staff to interact with tickets,
 * providing messaging, resolution tracking, and audit history in a tabbed interface.
 * 
 * Key Features:
 * - Real-time message updates via WebSocket subscriptions
 * - Tabbed interface (Messages, Resolution, History) for organized information display
 * - Live message thread with sender identification and timestamps
 * - Ticket status management (open/close/reopen)
 * - Resolution workflow integration
 * - Audit log history tracking
 * - Responsive design (Sheet for mobile, Dialog for desktop)
 * - Discord-style theming for consistent UX
 * 
 * Architecture:
 * - Uses React Query for data fetching and cache management
 * - Implements WebSocket subscriptions for real-time updates
 * - Separates concerns with helper components (TicketCreatorInfo, MessageSenderInfo)
 * - Optimistic UI updates for better perceived performance
 * 
 * @component
 * @example
 * ```tsx
 * <TicketDetailView
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   ticket={selectedTicket}
 * />
 * ```
 */

import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Ticket, TicketMessage, TicketResolution } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { useAuthContext } from "./AuthProvider";
import { useServerContext } from "@/contexts/ServerContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import TicketResolutionComponent from "./TicketResolution";
import TicketHistory from "./TicketHistory";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  X, 
  MessageSquare, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle,
  FileText,
  Send,
  MoreHorizontal,
  History,
  Ban,
  Paperclip,
  Smile,
  ChevronLeft,
  Shield,
  UserCog,
  Settings
} from "lucide-react";

/**
 * Props for the TicketDetailView component
 * @interface TicketDetailViewProps
 */
interface TicketDetailViewProps {
  /** Controls whether the detail view is visible */
  isOpen: boolean;
  /** Callback to close the detail view */
  onClose: () => void;
  /** The ticket object to display (null when no ticket is selected) */
  ticket: Ticket | null;
}

/**
 * TicketCreatorInfo - Helper Component
 * 
 * Displays the original ticket creator's information including their avatar,
 * display name, ticket creation time, and the original description.
 * This appears at the top of the ticket detail view to provide context.
 * 
 * Why this is a separate component:
 * - Encapsulates user data fetching logic
 * - Reusable across different views if needed
 * - Cleaner separation of concerns
 * - Easier to test independently
 * 
 * @param props - Creator information props
 */
function TicketCreatorInfo({ creatorId, createdAt, ticketId, description, priority }: {
  creatorId: string;
  createdAt: string | null;
  ticketId: number;
  description: string;
  priority: string | null;
}) {
  /**
   * Fetch creator details from Discord API
   * This query is enabled only when creatorId exists to prevent unnecessary requests.
   * User data is cached to avoid repeated API calls when viewing multiple tickets.
   */
  const { data: creator } = useQuery({
    queryKey: [`/api/discord/users/${creatorId}`],
    queryFn: () => fetch(`/api/discord/users/${creatorId}`).then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch user: ${res.statusText}`);
      }
      return res.json();
    }),
    enabled: !!creatorId,
  });

  /**
   * Get display name with priority fallback
   * Priority: displayName (if different) > nickname > username
   * This ensures we show the most meaningful name to users
   */
  const getDisplayName = (creator: any) => {
    if (!creator) return "Unknown User";
    if (creator.displayName && creator.displayName !== creator.username) {
      return creator.displayName;
    }
    if (creator.nickname) {
      return creator.nickname;
    }
    return creator.username || "Unknown User";
  };

  const creatorName = getDisplayName(creator);
  const avatarInitial = creatorName.charAt(0).toUpperCase();

  return (
    <div className="flex items-start gap-3">
      {/* 
        Creator avatar with gradient background
        The gradient provides visual interest when Discord avatars aren't loaded
        flex-shrink-0 prevents the avatar from being compressed
      */}
      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium flex-shrink-0">
        {avatarInitial}
      </div>
      
      <div className="flex-1 min-w-0">
        {/* Creator name, timestamp, and ticket ID */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-white">{creatorName}</span>
          
          {/* Relative time display for better UX than absolute timestamps */}
          <span className="text-xs text-discord-muted">
            {createdAt ? formatDistanceToNow(new Date(createdAt), { addSuffix: true }) : 'Unknown time'}
          </span>
          
          {/* Ticket ID badge for quick reference */}
          <Badge variant="outline" className="text-xs bg-discord-dark border-discord-dark text-discord-muted">
            #{ticketId}
          </Badge>
        </div>
        
        {/* 
          Original ticket description
          break-words ensures long words/URLs don't break the layout
        */}
        <div className="mt-2 text-discord-text break-words">{description}</div>
        
        {/* 
          Priority badge - only shown when priority is set
          Urgent uses destructive (red) variant to draw immediate attention
        */}
        {priority && (
          <div className="mt-3">
            <Badge 
              variant={priority === 'urgent' ? 'destructive' : 'secondary'}
              className="text-xs"
            >
              {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * MessageItem - Component for rendering individual message
 * 
 * This component handles fetching sender information using hooks properly.
 * By making this a separate component, we can use hooks at the top level
 * which follows React's Rules of Hooks.
 * 
 * @param message - The message to display
 * @param user - Current authenticated user object
 */
function MessageItem({ message, user }: { message: TicketMessage; user: any }) {
  /**
   * Fetch sender details from Discord API
   * Only fetches if senderId is different from current user (optimization)
   * This prevents unnecessary API calls for the user's own messages
   */
  const { data: sender } = useQuery({
    queryKey: [`/api/discord/users/${message.senderId}`],
    queryFn: () => fetch(`/api/discord/users/${message.senderId}`).then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch user: ${res.statusText}`);
      }
      return res.json();
    }),
    enabled: !!message.senderId && message.senderId !== user?.id,
  });

  /**
   * Get display name with special handling for current user
   * Shows "You" for current user's messages for better UX
   * Falls back through displayName > nickname > username hierarchy
   */
  const getDisplayName = () => {
    if (user && message.senderId === user.id) return "You";
    if (!sender) return message.senderId;
    if (sender.displayName && sender.displayName !== sender.username) {
      return sender.displayName;
    }
    if (sender.nickname) {
      return sender.nickname;
    }
    return sender.username || message.senderId;
  };

  const displayName = getDisplayName();
  const avatarInitial = displayName.charAt(0).toUpperCase();
  const isCurrentUser = user && message.senderId === user.id;
  const isStaff = user && message.senderId !== user.id;

  return (
    <div key={message.id} className="flex items-start gap-3">
      {/* Sender avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex-shrink-0 flex items-center justify-center text-white text-sm font-medium">
        {avatarInitial}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Sender name */}
          <span className="font-medium text-white">
            {displayName}
          </span>
          
          {/* 
            STAFF badge for non-user messages
            Helps users identify official support responses
            Uses Discord blue color for brand consistency
          */}
          {isStaff && (
            <Badge variant="default" className="text-xs bg-discord-blue">
              STAFF
            </Badge>
          )}
          
          {/* Relative timestamp */}
          <span className="text-xs text-discord-muted">
            {message.createdAt 
              ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true }) 
              : 'Unknown time'
            }
          </span>
        </div>
        
        {/* 
          Message content
          break-words prevents long URLs/words from breaking layout
        */}
        <div className="mt-1 text-discord-text break-words">{message.content}</div>
      </div>
    </div>
  );
}

export default function TicketDetailView({ 
  isOpen, 
  onClose, 
  ticket
}: TicketDetailViewProps) {
  // Core hooks for notifications and data management
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Local state for message input and UI controls
  const [messageContent, setMessageContent] = useState("");
  const [activeTab, setActiveTab] = useState("messages");
  const [showResolutionDialog, setShowResolutionDialog] = useState(false);
  
  /**
   * Moderation-specific state management
   * These states control the moderation panel features:
   * - showCloseConfirmation: Controls the confirmation dialog for closing tickets
   * - selectedStatus: Tracks the status selected in the dropdown (for optimistic UI updates)
   * - selectedAssignee: Tracks the assignee selected in the dropdown
   * - resolutionType: Selected resolution type for quick resolution
   * - resolutionNotes: Notes for quick resolution
   */
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>(ticket?.status || "open");
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(ticket?.assigneeId || null);
  const [resolutionType, setResolutionType] = useState<string>("resolved");
  const [resolutionNotes, setResolutionNotes] = useState("");
  
  // Context hooks for authentication and server management
  const { user } = useAuthContext();
  const { selectedServerId } = useServerContext();
  
  // WebSocket subscription for real-time updates
  const { subscribe } = useWebSocket();
  
  // Responsive design hook
  const isMobile = useIsMobile();
  
  /**
   * Fetch messages for this ticket using React Query
   * 
   * This query:
   * - Automatically fetches messages when ticket is opened
   * - Refetches when invalidated by WebSocket events or mutations
   * - Enables real-time updates without prop drilling
   * - Only runs when ticket exists and detail view is open
   * 
   * Why enabled condition includes isOpen:
   * - Prevents unnecessary fetches when detail view is closed
   * - Stops polling/refetching when user isn't viewing the ticket
   * - Reduces server load and improves performance
   */
  const { data: messages = [] } = useQuery<TicketMessage[]>({
    queryKey: [`/api/tickets/${ticket?.id}/messages`],
    enabled: !!ticket?.id && isOpen,
  });
  
  /**
   * WebSocket subscription for real-time message updates
   * 
   * This effect sets up a WebSocket listener that:
   * 1. Listens for MESSAGE_CREATED events
   * 2. Filters events for the current ticket
   * 3. Invalidates the message cache to trigger a refetch
   * 4. Shows a notification if the message is from someone else
   * 
   * Why WebSocket instead of polling:
   * - Instant updates without delay
   * - Reduces server load (no constant polling)
   * - Better UX for collaborative ticket resolution
   * - Critical for staff working on the same ticket simultaneously
   * 
   * The cleanup function (returned unsubscribe) is called when:
   * - The component unmounts
   * - The ticket changes
   * - Dependencies change
   */
  useEffect(() => {
    if (!ticket?.id) return;
    
    // Store values to avoid stale closures in the event handler
    // This prevents bugs where old values are used in callbacks
    const ticketId = ticket.id;
    const userId = user?.id;
    
    const unsubscribe = subscribe('MESSAGE_CREATED', (event) => {
      if (event.data?.ticketId === ticketId) {
        // Refetch messages when a new message is added
        // This triggers React Query to fetch fresh data
        queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticketId}/messages`] });
        
        // Show notification only if the message is from someone else
        // Prevents notification spam when sending your own messages
        if (event.data?.message?.senderId !== userId) {
          toast({
            title: "New message",
            description: "A new message has been added to the ticket",
          });
        }
      }
    });
    
    // Cleanup: unsubscribe when component unmounts or dependencies change
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id, user?.id]);
  
  /**
   * WebSocket subscription for ticket deletion events
   * 
   * This effect sets up a WebSocket listener that:
   * 1. Listens for TICKET_DELETED events
   * 2. Invalidates the tickets list cache
   * 3. Closes the detail view if the deleted ticket is currently open
   * 
   * Why this is important:
   * - Prevents viewing stale ticket data
   * - Updates the ticket list immediately
   * - Provides real-time sync across multiple admin sessions
   * - Prevents errors from attempting to interact with deleted tickets
   */
  useEffect(() => {
    if (!ticket?.id) return;
    
    const ticketId = ticket.id;
    
    const unsubscribe = subscribe('TICKET_DELETED', (event) => {
      // Refresh ticket list to remove deleted ticket
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      
      // Close detail view if this ticket was deleted
      if (event.data && event.data.id === ticketId) {
        onClose();
      }
    });
    
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);
  
  /**
   * Track previous values to detect actual changes
   * Using refs to avoid adding to dependency array
   */
  const prevStatusRef = useRef<string | null>(null);
  const prevAssigneeRef = useRef<string | null>(null);
  
  /**
   * Sync local state with ticket prop changes
   * 
   * When the ticket data actually changes, update local state.
   * We use refs to track previous values and only update when different.
   * 
   * This approach:
   * - Syncs on ticket.id change (new ticket selected)
   * - Syncs when status/assignee actually change
   * - Doesn't retrigger on same values (refs break the cycle)
   * - Handles WebSocket updates from other users
   */
  useEffect(() => {
    if (!ticket) return;
    
    const newStatus = ticket.status;
    const newAssignee = ticket.assigneeId || null;
    
    // Update status if changed
    if (newStatus !== prevStatusRef.current) {
      setSelectedStatus(newStatus);
      prevStatusRef.current = newStatus;
    }
    
    // Update assignee if changed
    if (newAssignee !== prevAssigneeRef.current) {
      setSelectedAssignee(newAssignee);
      prevAssigneeRef.current = newAssignee;
    }
  }, [ticket?.id, ticket?.status, ticket?.assigneeId]);

  /**
   * Fetch all resolutions for this ticket
   * 
   * Resolutions track how tickets were resolved (resolved, warned, punished, etc.)
   * This data is used to:
   * - Display resolution history in the Resolution tab
   * - Show resolution status badges in the header
   * - Determine if the ticket has been formally resolved
   */
  const { data: resolutions = [] } = useQuery({
    queryKey: [`/api/tickets/${ticket?.id}/resolutions`],
    queryFn: () => fetch(`/api/tickets/${ticket?.id}/resolutions`).then(res => {
      if (!res.ok) throw new Error('Failed to fetch resolutions');
      return res.json();
    }),
    enabled: !!ticket?.id
  });
  
  /**
   * Fetch audit logs for this ticket
   * 
   * Audit logs provide a complete history of all actions taken on the ticket.
   * Used in both the History tab and Moderation panel to show:
   * - Who did what and when
   * - Status changes, assignments, messages, resolutions
   * - Complete audit trail for compliance and debugging
   * 
   * Security note: Server filters logs based on user permissions
   */
  const { data: auditLogs = [] } = useQuery({
    queryKey: [`/api/tickets/${ticket?.id}/audit-logs`],
    queryFn: () => fetch(`/api/tickets/${ticket?.id}/audit-logs`).then(res => {
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      return res.json();
    }),
    enabled: !!ticket?.id
  });
  
  /**
   * Fetch available staff members (admins) for assignment
   * 
   * This query fetches all admin users from the dedicated backend endpoint.
   * The endpoint returns users marked as admins in the database, providing
   * a clean, reliable data source for the staff assignment feature.
   * 
   * Benefits of using the dedicated endpoint:
   * - Works reliably on fresh systems where no tickets have been assigned yet
   * - More efficient than building the list from ticket history
   * - Returns consistent data across all tickets
   * - Scales better as the system grows
   * - Reduces frontend complexity and API calls
   * 
   * The query always includes the current admin user at the top of the list
   * with "Assign to me" text, making self-assignment quick and easy.
   */
  const { data: availableStaff = [], isLoading: isLoadingStaff } = useQuery({
    queryKey: [`/api/admin/users`],
    queryFn: async () => {
      try {
        // Fetch all admin users from the dedicated backend endpoint
        const response = await fetch('/api/admin/users');
        if (!response.ok) {
          throw new Error('Failed to fetch admin users');
        }
        const adminUsers = await response.json();
        
        // Map admin users to the format expected by the assignment dropdown
        const staffList = adminUsers.map((admin: any) => ({
          id: admin.id,
          username: admin.username,
          displayName: admin.username, // Use username as display name
          discriminator: admin.discriminator,
          avatar: admin.avatar,
          isFallback: false
        }));
        
        // Always include current user at the top if not already in list
        // This ensures admins can always self-assign with "Assign to me"
        if (user?.id && !staffList.find((s: any) => s.id === user.id)) {
          staffList.unshift({
            id: user.id,
            username: user.username || user.id,
            displayName: user.username || user.id,
            isFallback: false
          });
        }
        
        return staffList;
      } catch (error) {
        console.error('Error fetching admin users:', error);
        // Fallback: Return at least the current user so self-assignment works
        if (user?.id) {
          return [{
            id: user.id,
            username: user.username || user.id,
            displayName: user.username || user.id,
            isFallback: false
          }];
        }
        return [];
      }
    },
    enabled: !!user?.isAdmin && !!ticket?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to reduce API calls
    retry: 1 // Retry once on failure
  });
  
  // Check if ticket has any resolutions and get the most recent one
  const isResolved = resolutions.length > 0;
  const latestResolution = resolutions[0] as TicketResolution;
  
  /**
   * Mutation for updating ticket status (open/closed)
   * 
   * This mutation:
   * 1. Creates an audit log entry for the status change
   * 2. Updates the ticket status via API
   * 3. Invalidates relevant queries to update the UI
   * 
   * Why create audit log first:
   * - Ensures we have a record even if the status update fails
   * - Maintains audit trail integrity
   * - Helps with debugging and compliance
   */
  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      if (!ticket) return;
      
      // Create audit log entry before changing status
      // This creates a permanent record of who changed the status and when
      await apiRequest("POST", `/api/tickets/${ticket.id}/audit-logs`, {
        action: status === 'open' ? 'reopened' : 'closed',
        serverId: selectedServerId
      });
      
      // Update the ticket status
      const response = await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate both tickets list and audit logs to reflect changes everywhere
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticket?.id}/audit-logs`] });
      
      toast({
        title: `Ticket ${ticket?.status === 'open' ? 'closed' : 'reopened'}`,
        description: `The ticket has been ${ticket?.status === 'open' ? 'closed' : 'reopened'} successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update ticket status: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  /**
   * Mutation for adding a new message to the ticket
   * 
   * This mutation:
   * 1. Creates an audit log entry (for tracking message activity)
   * 2. Sends the message to the API
   * 3. Clears the input field on success
   * 4. Invalidates message and audit log queries
   * 
   * Why audit log for messages:
   * - Provides complete activity history
   * - Helps identify communication patterns
   * - Useful for support quality metrics
   */
  const addMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!ticket || !user) return;
      
      // Create audit log with message preview (first 50 chars)
      // Preview helps in audit history without storing full duplicate content
      await apiRequest("POST", `/api/tickets/${ticket.id}/audit-logs`, {
        action: 'message',
        details: JSON.stringify({ preview: content.substring(0, 50) }),
        serverId: selectedServerId
      });
      
      // Send the actual message
      const response = await apiRequest("POST", `/api/tickets/${ticket.id}/messages`, { 
        content,
        senderId: user.id
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Clear input immediately for better UX
      setMessageContent("");
      
      // Invalidate queries to show the new message and update audit log
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticket?.id}/messages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticket?.id}/audit-logs`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to send message: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  /**
   * MODERATION MUTATIONS
   * These mutations are used exclusively in the admin moderation panel
   * They provide quick access to common administrative actions
   * 
   * Security considerations:
   * - All mutations include user authentication checks
   * - Server validates admin permissions before processing
   * - Audit logs are created for all actions for accountability
   * - Failed actions show clear error messages
   */
  
  /**
   * Mutation for changing ticket status (admin moderation)
   * 
   * This is separate from updateStatusMutation for moderation-specific behavior:
   * - Supports "pending" status (not available to regular users)
   * - Creates detailed audit logs with old and new status
   * - Optimistic UI updates for better perceived performance
   * - Confirmation required for closing (handled in UI)
   * 
   * Status flow:
   * - Open: Ticket is actively being worked on
   * - Pending: Waiting for user response or external action
   * - Closed: Ticket is resolved and no longer active
   * 
   * Why separate mutation:
   * - Different UI patterns (dropdown vs button)
   * - Additional audit logging details
   * - Optimistic updates with selectedStatus state
   */
  const changeStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      if (!ticket) return;
      
      // Create detailed audit log before changing status
      await apiRequest("POST", `/api/tickets/${ticket.id}/audit-logs`, {
        action: 'status_changed',
        details: JSON.stringify({ 
          from: ticket.status, 
          to: newStatus,
          changedBy: user?.username || user?.id
        }),
        serverId: selectedServerId
      });
      
      // Update ticket status via PATCH endpoint
      const response = await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { 
        status: newStatus 
      });
      return response.json();
    },
    onMutate: async (newStatus) => {
      // Optimistic update: immediately show new status in UI
      // This makes the UI feel responsive even before server confirms
      setSelectedStatus(newStatus);
    },
    onSuccess: (data, newStatus) => {
      // Invalidate all relevant queries to ensure UI is in sync
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticket?.id}/audit-logs`] });
      
      toast({
        title: "Status updated",
        description: `Ticket status changed to ${newStatus}`,
      });
    },
    onError: (error, newStatus) => {
      // Revert optimistic update on error
      if (ticket) {
        setSelectedStatus(ticket.status);
      }
      
      toast({
        title: "Error",
        description: `Failed to update status: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  /**
   * Mutation for assigning staff to ticket (admin moderation)
   * 
   * Staff assignment helps distribute workload and ensures accountability.
   * Assigned staff receive notifications and take ownership of the ticket.
   * 
   * Assignment workflow:
   * 1. Admin selects staff member from dropdown
   * 2. Creates audit log for assignment tracking
   * 3. Updates ticket with assigneeId
   * 4. Assigned staff can see ticket in their queue
   * 
   * Unassignment:
   * - Set assigneeId to null to unassign
   * - Useful when reassigning or removing assignments
   * 
   * Why track assignments:
   * - Prevents duplicate work
   * - Enables workload balancing
   * - Provides accountability
   * - Helps with performance metrics
   */
  const assignStaffMutation = useMutation({
    mutationFn: async (assigneeId: string | null) => {
      if (!ticket) return;
      
      // Create audit log for assignment
      await apiRequest("POST", `/api/tickets/${ticket.id}/audit-logs`, {
        action: assigneeId ? 'assigned' : 'unassigned',
        details: JSON.stringify({ 
          assigneeId,
          previousAssignee: ticket.assigneeId,
          assignedBy: user?.username || user?.id
        }),
        serverId: selectedServerId
      });
      
      // Update ticket with new assignee
      const response = await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { 
        assigneeId 
      });
      return response.json();
    },
    onMutate: async (assigneeId) => {
      // Optimistic update
      setSelectedAssignee(assigneeId);
    },
    onSuccess: (data, assigneeId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticket?.id}/audit-logs`] });
      
      toast({
        title: assigneeId ? "Staff assigned" : "Staff unassigned",
        description: assigneeId 
          ? "Ticket has been assigned successfully" 
          : "Ticket assignment removed",
      });
    },
    onError: (error, assigneeId) => {
      // Revert optimistic update
      if (ticket) {
        setSelectedAssignee(ticket.assigneeId || null);
      }
      
      toast({
        title: "Error",
        description: `Failed to ${assigneeId ? 'assign' : 'unassign'} staff: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  /**
   * Mutation for quick resolution submission (admin moderation)
   * 
   * Quick resolution allows admins to resolve tickets directly from moderation panel
   * without navigating to the Resolution tab. This streamlines the workflow for
   * simple tickets that don't require extended discussion.
   * 
   * Resolution types:
   * - resolved: Issue was successfully resolved
   * - punished: User was punished/banned for violation
   * - warned: User was warned about behavior
   * - noted: Issue was noted for reference/tracking
   * 
   * Optional close-on-resolve:
   * - Admin can choose to close ticket when resolving
   * - Useful for final resolutions
   * - Allows keeping ticket open for follow-up if needed
   * 
   * Why quick resolution:
   * - Saves time for admins
   * - Reduces clicks for common actions
   * - Maintains full audit trail
   * - Provides immediate feedback
   */
  const quickResolveMutation = useMutation({
    mutationFn: async ({ 
      closeTicket = false 
    }: { 
      closeTicket?: boolean 
    }) => {
      if (!ticket) return;
      
      // Create resolution entry
      const resolutionResponse = await apiRequest("POST", `/api/tickets/${ticket.id}/resolutions`, {
        resolutionType,
        resolutionNotes: resolutionNotes.trim() || undefined,
        serverId: selectedServerId
      });
      
      // Optionally close the ticket
      if (closeTicket) {
        await apiRequest("POST", `/api/tickets/${ticket.id}/audit-logs`, {
          action: 'closed',
          details: JSON.stringify({ 
            reason: 'Closed via quick resolution',
            resolutionType
          }),
          serverId: selectedServerId
        });
        
        await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { 
          status: 'closed' 
        });
      }
      
      return resolutionResponse.json();
    },
    onSuccess: (data, { closeTicket }) => {
      // Clear resolution form
      setResolutionNotes("");
      setResolutionType("resolved");
      
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticket?.id}/resolutions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticket?.id}/audit-logs`] });
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      
      toast({
        title: "Resolution added",
        description: closeTicket 
          ? "Ticket resolved and closed successfully" 
          : "Resolution added. Ticket remains open.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add resolution: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  /**
   * Mutation for deleting a ticket (admin moderation)
   * 
   * This mutation permanently deletes the ticket and all associated data.
   * This is a destructive action that requires confirmation.
   * 
   * Deleted data includes:
   * - The ticket itself
   * - All ticket messages
   * - All resolutions
   * - All audit logs
   * 
   * Security considerations:
   * - Only admins can delete tickets (server-side validation)
   * - Confirmation dialog prevents accidental deletion
   * - Action is permanent and cannot be undone
   * - User is immediately returned to ticket list after deletion
   */
  const deleteTicketMutation = useMutation({
    mutationFn: async () => {
      if (!ticket) return;
      return await apiRequest("DELETE", `/api/tickets/${ticket.id}`);
    },
    onSuccess: () => {
      toast({
        title: "Ticket deleted",
        description: "Ticket has been permanently deleted",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete ticket: ${error}`,
        variant: "destructive",
      });
    },
  });
  
  /**
   * Handle status change button click
   * Toggles ticket between open and closed states
   */
  const handleStatusChange = () => {
    if (!ticket) return;
    updateStatusMutation.mutate(ticket.status === 'open' ? 'closed' : 'open');
  };
  
  /**
   * Handle message form submission
   * Validates input and sends message
   * 
   * @param e - Form submit event
   */
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate message content (prevent sending empty/whitespace-only messages)
    if (!messageContent.trim()) return;
    
    addMessageMutation.mutate(messageContent);
  };
  
  /**
   * Handle resolution completion
   * Called when a resolution is successfully added
   * Closes the dialog and refreshes relevant data
   */
  const handleResolutionComplete = () => {
    setShowResolutionDialog(false);
    
    // Refresh resolution data to show the new resolution
    queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticket?.id}/resolutions`] });
    
    // Refresh tickets list in case resolution affects status
    queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
  };
  
  // Early return if component should not be displayed
  if (!isOpen || !ticket) return null;
  
  /**
   * Get appropriate icon and color for resolution type
   * Visual indicators help quickly identify resolution outcomes:
   * - Green checkmark: Successfully resolved
   * - Yellow alert: User was warned
   * - Red alert triangle: User was punished/banned
   * - Blue document: Issue was noted for reference
   * 
   * @param type - The resolution type
   * @returns JSX icon element with appropriate color
   */
  const getResolutionIcon = (type: string) => {
    switch (type) {
      case 'resolved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warned': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'punished': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'noted': return <FileText className="h-4 w-4 text-blue-500" />;
      default: return <CheckCircle className="h-4 w-4 text-gray-500" />;
    }
  };
  
  /**
   * Main content structure
   * This is used by both mobile (Sheet) and desktop (Dialog) views
   * Extracted to avoid code duplication
   */
  const content = (
    <div className="flex flex-col h-full">
      {/* 
        Header Section
        Shows ticket title, status, and resolution indicators
        flex-shrink-0 prevents this section from being compressed when content overflows
      */}
      <div className="p-4 border-b border-discord-dark flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {/* 
                Mobile back button
                Only shown on mobile devices for navigation
                ChevronLeft indicates this is a back action
              */}
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-discord-muted hover:text-white -ml-2"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              )}
              
              {/* Ticket title with truncation for long titles */}
              <h2 className="text-xl font-bold text-white truncate">{ticket.title}</h2>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* 
                Status badge with color coding
                Open tickets use default blue, closed use secondary gray
              */}
              <Badge 
                variant={ticket.status === 'open' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {ticket.status}
              </Badge>
              
              {/* 
                Resolution indicator
                Only shown when ticket has been resolved
                Helps distinguish between "closed" and "resolved with action"
              */}
              {isResolved && latestResolution && (
                <div className="flex items-center gap-1">
                  {getResolutionIcon(latestResolution.resolutionType)}
                  <span className="text-xs text-discord-muted">
                    {latestResolution.resolutionType}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* 
        Ticket Creator Info Section
        Shows who created the ticket and the original description
        This provides essential context for understanding the ticket
      */}
      <div className="p-4 bg-discord-sidebar border-b border-discord-dark flex-shrink-0">
        <TicketCreatorInfo 
          creatorId={ticket.creatorId}
          createdAt={ticket.createdAt ? ticket.createdAt.toString() : null}
          ticketId={ticket.id}
          description={ticket.description}
          priority={ticket.priority}
        />
      </div>
      
      {/* 
        Tabbed Content Area
        Organizes information into three categories:
        1. Messages - Communication thread
        2. Resolution - Resolution history and actions
        3. History - Audit log of all ticket activity
        
        flex-1 makes this take remaining vertical space
        overflow-hidden prevents content from breaking layout
      */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        {/* 
          Tab Navigation
          Custom styled to match Discord theme
          Shows badge counts for messages and resolutions
        */}
        <TabsList className="w-full justify-start rounded-none bg-discord-sidebar border-b border-discord-dark px-2 sm:px-4 h-auto flex-shrink-0">
          {/* Messages Tab - 44px minimum touch target */}
          <TabsTrigger 
            value="messages" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-discord-blue rounded-none px-2 sm:px-3 py-3 min-h-[44px] flex items-center gap-1 sm:gap-2"
            data-testid="tab-messages"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Messages</span>
            {/* Message count badge - helps users see activity at a glance */}
            {messages.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {messages.length}
              </Badge>
            )}
          </TabsTrigger>
          
          {/* Resolution Tab - 44px minimum touch target */}
          <TabsTrigger 
            value="resolution" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-discord-blue rounded-none px-2 sm:px-3 py-3 min-h-[44px] flex items-center gap-1 sm:gap-2"
            data-testid="tab-resolution"
          >
            <CheckCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Resolution</span>
            {/* Resolution count badge */}
            {resolutions.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {resolutions.length}
              </Badge>
            )}
          </TabsTrigger>
          
          {/* History Tab - 44px minimum touch target */}
          <TabsTrigger 
            value="history" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-discord-blue rounded-none px-2 sm:px-3 py-3 min-h-[44px] flex items-center gap-1 sm:gap-2"
            data-testid="tab-history"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          
          {/* 
            Moderation Tab (Admin-Only)
            
            This tab is exclusively for administrators and provides quick access to
            moderation tools without navigating away from the ticket view.
            
            Why admin-only:
            - Contains sensitive actions (status changes, assignments)
            - Prevents unauthorized users from accessing admin functions
            - Server-side validation provides additional security layer
            - UI-level hiding improves UX by reducing clutter for regular users
            
            Security considerations:
            - Only shown when user.isAdmin is true
            - All mutations validate permissions server-side
            - Audit logs track all actions for accountability
            - Failed actions show clear error messages
          */}
          {user?.isAdmin && (
            <TabsTrigger 
              value="moderation" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-discord-blue rounded-none px-2 sm:px-3 py-3 min-h-[44px] flex items-center gap-1 sm:gap-2"
              data-testid="tab-moderation"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Moderation</span>
              <Badge variant="secondary" className="text-xs ml-1 bg-discord-blue/20 text-discord-blue hidden sm:inline-flex">
                ADMIN
              </Badge>
            </TabsTrigger>
          )}
        </TabsList>
        
        {/* 
          Messages Tab Content
          Contains the message thread and input form
          flex-1 makes content scrollable while keeping input fixed at bottom
        */}
        <TabsContent value="messages" className="flex-1 flex flex-col overflow-hidden m-0">
          {/* 
            Scrollable message area
            ScrollArea component provides custom scrollbar styling
          */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {/* Empty state when no messages exist */}
              {messages.length === 0 ? (
                <div className="text-center text-discord-muted py-8">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No messages yet. Start the conversation by sending a message below.</p>
                </div>
              ) : (
                /* 
                  Message list
                  Each message shows sender info, timestamp, and content
                  STAFF badge helps users identify official responses
                */
                messages.map((message) => (
                  <MessageItem key={message.id} message={message} user={user} />
                ))
              )}
            </div>
          </ScrollArea>
          
          {/* 
            Message Input Area
            Fixed at bottom of messages tab
            Disabled when ticket is closed
            flex-shrink-0 prevents compression when messages overflow
            Responsive padding and button sizing for mobile
          */}
          <div className="p-3 sm:p-4 border-t border-discord-dark flex-shrink-0 bg-discord-bg sticky bottom-0">
            <form onSubmit={handleSendMessage} className="space-y-3">
              {/* 
                Text input area
                Placeholder changes based on ticket status to guide users
                Disabled state prevents input on closed tickets
                Responsive sizing for mobile
              */}
              <div className="relative">
                <Textarea 
                  placeholder={ticket.status === 'closed' ? "Ticket is closed" : "Type your message..."} 
                  className="w-full min-h-[80px] sm:min-h-[100px] bg-discord-dark border-discord-dark text-discord-text rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-discord-blue pr-12 text-sm sm:text-base"
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  disabled={ticket.status === 'closed'}
                  data-testid="textarea-message"
                />
                
                {/* 
                  Attachment and emoji buttons
                  Currently non-functional but included for future enhancement
                  Positioned absolutely in bottom-right of textarea
                  Hidden on mobile to save space
                */}
                <div className="absolute bottom-2 right-2 hidden sm:flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-discord-muted hover:text-white"
                    disabled={ticket.status === 'closed'}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-discord-muted hover:text-white"
                    disabled={ticket.status === 'closed'}
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Action buttons row - responsive layout */}
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
                <div className="flex gap-2 order-2 sm:order-1">
                  {/* 
                    Resolve button
                    Only shown for open tickets that haven't been resolved
                    Green color indicates positive action
                    Full-width on mobile for better touch targets
                  */}
                  {ticket.status === 'open' && !isResolved && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowResolutionDialog(true)}
                      className="bg-green-500/10 hover:bg-green-500/20 text-green-500 border-green-500/20 flex-1 sm:flex-none min-h-[44px] sm:min-h-0"
                      data-testid="button-resolve"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Resolve
                    </Button>
                  )}
                  
                  {/* 
                    Close/Reopen button
                    Toggles ticket status
                    Text changes based on current status
                    Full-width on mobile for better touch targets
                  */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleStatusChange}
                    disabled={updateStatusMutation.isPending}
                    className="bg-transparent border-discord-dark text-discord-text hover:bg-discord-dark hover:text-white flex-1 sm:flex-none min-h-[44px] sm:min-h-0"
                    data-testid="button-status-toggle"
                  >
                    {ticket.status === 'open' ? 'Close' : 'Reopen'}
                  </Button>
                </div>
                
                {/* 
                  Send button
                  Disabled when:
                  - Message is empty or whitespace-only
                  - Ticket is closed
                  - Mutation is in progress (prevents double-send)
                  Full-width on mobile for easy tapping
                */}
                <Button
                  type="submit"
                  size="sm"
                  disabled={!messageContent.trim() || ticket.status === 'closed' || addMessageMutation.isPending}
                  className="bg-discord-blue hover:bg-discord-blue/80 text-white w-full sm:w-auto min-h-[44px] sm:min-h-0 order-1 sm:order-2"
                  data-testid="button-send-message"
                >
                  <Send className="h-4 w-4 mr-1" />
                  Send
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>
        
        {/* 
          Resolution Tab Content
          Displays resolution history or option to add first resolution
          Resolutions track formal closure actions (resolved, warned, punished, etc.)
        */}
        <TabsContent value="resolution" className="flex-1 overflow-y-auto m-0 p-4">
          {resolutions.length > 0 ? (
            /* Resolution history list */
            <div className="space-y-4">
              {resolutions.map((resolution: TicketResolution, index: number) => (
                <div key={resolution.id} className="bg-discord-sidebar rounded-lg p-4 border border-discord-dark">
                  <div className="flex items-start gap-3">
                    {/* Resolution type icon with color coding */}
                    {getResolutionIcon(resolution.resolutionType)}
                    
                    <div className="flex-1">
                      {/* Resolution type and resolver info */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">
                          {resolution.resolutionType.charAt(0).toUpperCase() + resolution.resolutionType.slice(1)}
                        </span>
                        <span className="text-xs text-discord-muted">
                          by {resolution.resolvedByUsername || resolution.resolvedBy}
                        </span>
                      </div>
                      
                      {/* Resolution timestamp */}
                      <div className="text-xs text-discord-muted mb-2">
                        {resolution.resolvedAt && formatDistanceToNow(new Date(resolution.resolvedAt), { addSuffix: true })}
                      </div>
                      
                      {/* Action taken (optional field) */}
                      {resolution.actionTaken && (
                        <div className="mb-2">
                          <span className="text-xs text-discord-muted">Action: </span>
                          <span className="text-sm text-discord-text">{resolution.actionTaken}</span>
                        </div>
                      )}
                      
                      {/* Resolution notes (optional field) */}
                      {resolution.resolutionNotes && (
                        <div className="text-sm text-discord-text bg-discord-bg rounded p-2 mt-2">
                          {resolution.resolutionNotes}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty state with option to add first resolution */
            <div className="text-center py-8 text-discord-muted">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-4">No resolutions yet</p>
              
              {/* Only show add button for open tickets */}
              {ticket.status === 'open' && (
                <Button
                  onClick={() => setShowResolutionDialog(true)}
                  className="bg-discord-blue hover:bg-discord-blue/80 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Add Resolution
                </Button>
              )}
            </div>
          )}
        </TabsContent>
        
        {/* 
          History Tab Content
          Shows complete audit trail of all ticket actions
          Delegated to TicketHistory component for modularity
        */}
        <TabsContent value="history" className="flex-1 overflow-hidden m-0 p-4">
          <TicketHistory ticket={ticket} className="h-full" />
        </TabsContent>
        
        {/* 
          ===========================
          MODERATION TAB CONTENT
          ===========================
          
          This tab contains comprehensive moderation tools for administrators.
          It provides a centralized interface for all common ticket management actions
          without requiring navigation to multiple views.
          
          Panel Structure:
          1. Quick Status Actions - Change ticket status (open/pending/closed)
          2. Staff Assignment - Assign or unassign staff members
          3. Quick Resolution - Add resolutions with types and notes
          4. Audit Log Display - View complete action history
          
          Design Philosophy:
          - One-stop shop for all moderation needs
          - Clear visual hierarchy with sections and separators
          - Immediate feedback via toasts and loading states
          - Confirmation dialogs for destructive actions
          - Consistent Discord theming
          
          Security Model:
          - Only visible if user.isAdmin is true
          - All mutations validate permissions server-side
          - Audit logs created for all actions
          - Optimistic UI updates with error rollback
        */}
        {user?.isAdmin && (
          <TabsContent value="moderation" className="flex-1 overflow-y-auto m-0 p-4">
            <ScrollArea className="h-full">
              <div className="space-y-6 pr-4">
                {/* 
                  SECTION 1: QUICK STATUS ACTIONS
                  
                  Allows admins to quickly change ticket status without closing the view.
                  Supports three states:
                  - Open: Ticket is actively being worked on
                  - Pending: Waiting for user response or external dependency
                  - Closed: Ticket is resolved and no longer active
                  
                  Why three states:
                  - Open vs Pending helps prioritize workload
                  - Pending prevents tickets from appearing stale
                  - Closed provides final resolution state
                  
                  Confirmation for closing:
                  - Prevents accidental closure
                  - Gives admin chance to add resolution first
                  - Follows best practice for destructive actions
                */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-discord-blue" />
                    <h3 className="text-lg font-semibold text-white">Quick Status Actions</h3>
                  </div>
                  
                  <div className="bg-discord-sidebar rounded-lg p-4 border border-discord-dark space-y-4">
                    {/* Current status display */}
                    <div className="flex items-center justify-between">
                      <Label htmlFor="status-select" className="text-discord-text font-medium">
                        Ticket Status
                      </Label>
                      <Badge 
                        variant={selectedStatus === 'open' ? 'default' : selectedStatus === 'pending' ? 'secondary' : 'outline'}
                        className="text-xs"
                      >
                        Current: {selectedStatus}
                      </Badge>
                    </div>
                    
                    {/* Status change dropdown */}
                    <div className="space-y-2">
                      <Select 
                        value={selectedStatus} 
                        onValueChange={(value) => {
                          // Show confirmation for closing
                          if (value === 'closed' && selectedStatus !== 'closed') {
                            setShowCloseConfirmation(true);
                          } else {
                            changeStatusMutation.mutate(value);
                          }
                        }}
                        disabled={changeStatusMutation.isPending}
                      >
                        <SelectTrigger id="status-select" className="w-full bg-discord-dark border-discord-dark text-white">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent className="bg-discord-sidebar border-discord-dark">
                          <SelectItem value="open" className="text-white hover:bg-discord-dark">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span>Open</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="pending" className="text-white hover:bg-discord-dark">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-yellow-500" />
                              <span>Pending</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="closed" className="text-white hover:bg-discord-dark">
                            <div className="flex items-center gap-2">
                              <Ban className="h-4 w-4 text-red-500" />
                              <span>Closed</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <p className="text-xs text-discord-muted">
                        Change the ticket status. Closing requires confirmation.
                      </p>
                    </div>
                    
                    {/* Loading indicator */}
                    {changeStatusMutation.isPending && (
                      <div className="flex items-center gap-2 text-discord-blue text-sm">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-discord-blue"></div>
                        <span>Updating status...</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <Separator className="bg-discord-dark" />
                
                {/* 
                  SECTION 2: STAFF ASSIGNMENT
                  
                  Allows admins to assign tickets to specific staff members.
                  This helps with:
                  - Workload distribution
                  - Accountability
                  - Tracking who's working on what
                  - Performance metrics
                  
                  Assignment features:
                  - Shows currently assigned staff (if any)
                  - Option to unassign by selecting "Unassigned"
                  - Creates audit log entry for accountability
                  - Immediate feedback via toast notifications
                  
                  Future enhancement:
                  - Fetch real staff list from server
                  - Show staff avatars and names
                  - Display staff workload
                  - Auto-suggest least busy staff
                */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <UserCog className="h-5 w-5 text-discord-blue" />
                    <h3 className="text-lg font-semibold text-white">Staff Assignment</h3>
                  </div>
                  
                  <div className="bg-discord-sidebar rounded-lg p-4 border border-discord-dark space-y-4">
                    {/* Current assignment display */}
                    <div className="flex items-center justify-between">
                      <Label htmlFor="assignee-select" className="text-discord-text font-medium">
                        Assigned To
                      </Label>
                      {selectedAssignee && (
                        <Badge variant="outline" className="text-xs">
                          {selectedAssignee}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Assignment dropdown */}
                    <div className="space-y-2">
                      <Select 
                        value={selectedAssignee || "none"} 
                        onValueChange={(value) => {
                          const assigneeId = value === "none" ? null : value;
                          assignStaffMutation.mutate(assigneeId);
                        }}
                        disabled={assignStaffMutation.isPending}
                      >
                        <SelectTrigger id="assignee-select" className="w-full bg-discord-dark border-discord-dark text-white">
                          <SelectValue placeholder="Select staff member" />
                        </SelectTrigger>
                        <SelectContent className="bg-discord-sidebar border-discord-dark">
                          <SelectItem value="none" className="text-white hover:bg-discord-dark">
                            <div className="flex items-center gap-2">
                              <Ban className="h-4 w-4 text-gray-500" />
                              <span>Unassigned</span>
                            </div>
                          </SelectItem>
                          {/* 
                            Staff members list
                            Populated from existing ticket assignments + current user
                            Shows display name with fallback to username
                          */}
                          {availableStaff.map((staff: any) => {
                            // Skip if this is current user (handled separately below)
                            if (staff.id === user?.id) {
                              return (
                                <SelectItem key={staff.id} value={staff.id} className="text-white hover:bg-discord-dark">
                                  <div className="flex items-center gap-2">
                                    <UserCog className="h-4 w-4 text-discord-blue" />
                                    <span>Assign to me ({staff.displayName || staff.username || staff.id})</span>
                                  </div>
                                </SelectItem>
                              );
                            }
                            
                            // Display other staff members
                            const displayName = staff.displayName || staff.username || staff.id;
                            return (
                              <SelectItem key={staff.id} value={staff.id} className="text-white hover:bg-discord-dark">
                                <div className="flex items-center gap-2">
                                  <UserCog className="h-4 w-4 text-gray-400" />
                                  <span>{displayName}</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      
                      {/* Helper text and loading states */}
                      {isLoadingStaff ? (
                        <div className="flex items-center gap-2 text-discord-blue text-xs">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-discord-blue"></div>
                          <span>Loading available staff...</span>
                        </div>
                      ) : availableStaff.length <= 1 ? (
                        <p className="text-xs text-discord-muted">
                          Assign staff members by assigning them to tickets. Previously assigned staff will appear here.
                        </p>
                      ) : (
                        <p className="text-xs text-discord-muted">
                          Assign this ticket to a staff member. Showing {availableStaff.length} staff member{availableStaff.length !== 1 ? 's' : ''} from previous assignments.
                        </p>
                      )}
                    </div>
                    
                    {/* Assignment update loading indicator */}
                    {assignStaffMutation.isPending && (
                      <div className="flex items-center gap-2 text-discord-blue text-sm">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-discord-blue"></div>
                        <span>Updating assignment...</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <Separator className="bg-discord-dark" />
                
                {/* 
                  SECTION 3: QUICK RESOLUTION
                  
                  Streamlined resolution form for quick ticket closure.
                  This provides a faster alternative to the full resolution dialog
                  for straightforward tickets.
                  
                  Resolution types:
                  - resolved: Issue successfully resolved
                  - punished: User was punished/banned for violation
                  - warned: User was warned about behavior
                  - noted: Issue was noted for reference/tracking
                  
                  Features:
                  - Optional resolution notes for context
                  - Option to close ticket immediately
                  - Creates full resolution record
                  - Audit log entry for tracking
                  
                  Why quick resolution:
                  - Reduces administrative overhead
                  - Keeps admins in context (no tab switching)
                  - Maintains complete audit trail
                  - Provides immediate feedback
                */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <h3 className="text-lg font-semibold text-white">Quick Resolution</h3>
                  </div>
                  
                  <div className="bg-discord-sidebar rounded-lg p-4 border border-discord-dark space-y-4">
                    {/* Resolution type selector */}
                    <div className="space-y-2">
                      <Label htmlFor="resolution-type" className="text-discord-text font-medium">
                        Resolution Type
                      </Label>
                      <Select 
                        value={resolutionType} 
                        onValueChange={setResolutionType}
                        disabled={quickResolveMutation.isPending}
                      >
                        <SelectTrigger id="resolution-type" className="w-full bg-discord-dark border-discord-dark text-white">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent className="bg-discord-sidebar border-discord-dark">
                          <SelectItem value="resolved" className="text-white hover:bg-discord-dark">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span>Resolved</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="punished" className="text-white hover:bg-discord-dark">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                              <span>Punished</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="warned" className="text-white hover:bg-discord-dark">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-yellow-500" />
                              <span>Warned</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="noted" className="text-white hover:bg-discord-dark">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-blue-500" />
                              <span>Noted</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Resolution notes textarea */}
                    <div className="space-y-2">
                      <Label htmlFor="resolution-notes" className="text-discord-text font-medium">
                        Resolution Notes (Optional)
                      </Label>
                      <Textarea
                        id="resolution-notes"
                        placeholder="Add details about how this ticket was resolved..."
                        className="w-full min-h-[100px] bg-discord-dark border-discord-dark text-white resize-none"
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                        disabled={quickResolveMutation.isPending}
                      />
                      <p className="text-xs text-discord-muted">
                        Provide context about the resolution for future reference.
                      </p>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => quickResolveMutation.mutate({ closeTicket: false })}
                        disabled={quickResolveMutation.isPending}
                        className="bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/20"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Add Resolution
                      </Button>
                      
                      <Button
                        onClick={() => quickResolveMutation.mutate({ closeTicket: true })}
                        disabled={quickResolveMutation.isPending}
                        className="bg-discord-blue hover:bg-discord-blue/80 text-white"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Resolve & Close
                      </Button>
                    </div>
                    
                    {/* Loading indicator */}
                    {quickResolveMutation.isPending && (
                      <div className="flex items-center gap-2 text-discord-blue text-sm">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-discord-blue"></div>
                        <span>Adding resolution...</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Dangerous Actions - Delete Ticket */}
                <Separator className="bg-discord-dark" />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    <h3 className="text-lg font-semibold text-white">Dangerous Actions</h3>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                    <p className="text-sm text-discord-muted mb-3">
                      Permanently delete this ticket and all associated data. This action cannot be undone.
                    </p>
                    <Button
                      onClick={() => setShowDeleteConfirmation(true)}
                      variant="destructive"
                      className="w-full bg-red-500 hover:bg-red-600"
                      data-testid="button-delete-ticket"
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Delete Ticket Permanently
                    </Button>
                  </div>
                </div>
                
                <Separator className="bg-discord-dark" />
                
                {/* 
                  SECTION 4: AUDIT LOG DISPLAY
                  
                  Shows recent audit log entries for quick reference.
                  Full history is available in the History tab.
                  
                  This provides context without requiring tab switching:
                  - Recent actions on the ticket
                  - Who made changes and when
                  - What was changed
                  
                  Displays last 5 entries with:
                  - Action type with icon
                  - Performer name
                  - Timestamp (relative)
                  - Action details
                  
                  Why in moderation panel:
                  - Provides context for moderation decisions
                  - Shows recent activity at a glance
                  - Helps prevent duplicate actions
                  - Useful for handoff between staff
                */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="h-5 w-5 text-discord-blue" />
                      <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Last {Math.min(auditLogs.length, 5)}
                    </Badge>
                  </div>
                  
                  <div className="bg-discord-sidebar rounded-lg p-4 border border-discord-dark">
                    {auditLogs.length === 0 ? (
                      <div className="text-center py-4 text-discord-muted">
                        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No activity yet</p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-[300px]">
                        <div className="space-y-3 pr-4">
                          {/* Show last 5 audit log entries */}
                          {auditLogs.slice(0, 5).map((log: any) => (
                            <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-discord-dark last:border-b-0 last:pb-0">
                              {/* Action icon based on type */}
                              <div className="flex-shrink-0 mt-1">
                                {log.action === 'created' && <AlertCircle className="h-4 w-4 text-green-500" />}
                                {log.action === 'assigned' && <UserCog className="h-4 w-4 text-blue-500" />}
                                {log.action === 'unassigned' && <Ban className="h-4 w-4 text-gray-500" />}
                                {log.action === 'status_changed' && <Settings className="h-4 w-4 text-yellow-500" />}
                                {log.action === 'resolved' && <CheckCircle className="h-4 w-4 text-green-500" />}
                                {log.action === 'closed' && <Ban className="h-4 w-4 text-red-500" />}
                                {log.action === 'reopened' && <CheckCircle className="h-4 w-4 text-green-500" />}
                                {log.action === 'message' && <MessageSquare className="h-4 w-4 text-discord-blue" />}
                                {!['created', 'assigned', 'unassigned', 'status_changed', 'resolved', 'closed', 'reopened', 'message'].includes(log.action) && (
                                  <History className="h-4 w-4 text-discord-muted" />
                                )}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-medium text-white capitalize">
                                    {log.action.replace('_', ' ')}
                                  </span>
                                  <span className="text-xs text-discord-muted">
                                    by {log.performedByUsername || log.performedBy}
                                  </span>
                                </div>
                                <div className="text-xs text-discord-muted">
                                  {log.createdAt && formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                                </div>
                                {/* Show details if available */}
                                {log.details && (
                                  <div className="mt-1 text-xs text-discord-text bg-discord-dark rounded p-2">
                                    {typeof log.details === 'string' 
                                      ? (() => {
                                          try {
                                            const parsed = JSON.parse(log.details);
                                            return Object.entries(parsed).map(([key, value]) => (
                                              <div key={key}>
                                                <span className="text-discord-muted">{key}:</span> {String(value)}
                                              </div>
                                            ));
                                          } catch {
                                            return log.details;
                                          }
                                        })()
                                      : JSON.stringify(log.details)
                                    }
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                    
                    {/* Link to full history */}
                    {auditLogs.length > 5 && (
                      <div className="mt-3 pt-3 border-t border-discord-dark">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveTab('history')}
                          className="w-full text-discord-blue hover:text-white hover:bg-discord-dark"
                        >
                          View Full History ({auditLogs.length} total)
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        )}
      </Tabs>
      
      {/* 
        Resolution Dialog
        Modal for adding new resolutions
        Opens when "Resolve" button is clicked
        Separate component (TicketResolutionComponent) handles the form
      */}
      <Dialog open={showResolutionDialog} onOpenChange={setShowResolutionDialog}>
        <DialogContent className="max-w-2xl bg-discord-bg border-discord-dark" aria-describedby="resolution-dialog-description">
          <DialogHeader>
            <DialogTitle className="text-white">Resolve Ticket</DialogTitle>
          </DialogHeader>
          
          {/* Accessibility description for screen readers */}
          <div className="sr-only" id="resolution-dialog-description">
            Resolve the ticket by adding a resolution with description and tags
          </div>
          
          {/* Resolution form component */}
          <TicketResolutionComponent
            ticket={ticket}
            onClose={() => setShowResolutionDialog(false)}
            onResolved={handleResolutionComplete}
          />
        </DialogContent>
      </Dialog>
      
      {/* 
        Close Ticket Confirmation Dialog (Admin Moderation)
        
        This dialog appears when an admin attempts to close a ticket from
        the moderation panel. It provides a confirmation step to prevent
        accidental closures.
        
        Why confirmation for closing:
        - Closing is a destructive action (ticket moves out of active queue)
        - Gives admin a chance to reconsider
        - Reminds admin to add resolution if needed
        - Follows UX best practices for critical actions
        
        User experience:
        - Clear warning message
        - Option to cancel (safe action)
        - Option to confirm (destructive action in destructive color)
        - Keyboard accessible (Esc to cancel, Enter to confirm)
      */}
      <AlertDialog open={showCloseConfirmation} onOpenChange={setShowCloseConfirmation}>
        <AlertDialogContent className="bg-discord-bg border-discord-dark">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Confirm Close Ticket
            </AlertDialogTitle>
            <AlertDialogDescription className="text-discord-text">
              Are you sure you want to close this ticket? This will mark the ticket as resolved
              and remove it from the active queue.
              <br /><br />
              <span className="text-discord-muted text-sm">
                Tip: Consider adding a resolution before closing to document the outcome.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                // Reset status to previous value since user cancelled
                setSelectedStatus(ticket?.status || 'open');
                setShowCloseConfirmation(false);
              }}
              className="bg-discord-sidebar border-discord-dark text-white hover:bg-discord-dark"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                changeStatusMutation.mutate('closed');
                setShowCloseConfirmation(false);
              }}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Close Ticket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Delete Ticket Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent className="bg-discord-bg border-discord-dark">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Permanently Delete Ticket
            </AlertDialogTitle>
            <AlertDialogDescription className="text-discord-text">
              Are you sure you want to permanently delete this ticket? This will remove:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All ticket messages</li>
                <li>All resolutions and history</li>
                <li>All audit logs</li>
              </ul>
              <br />
              <span className="text-red-400 font-semibold">
                This action cannot be undone. The data will be permanently lost.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-discord-sidebar hover:bg-discord-dark text-white border-discord-dark">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteTicketMutation.mutate();
                setShowDeleteConfirmation(false);
              }}
              className="bg-red-500 hover:bg-red-600 text-white"
              data-testid="confirm-delete-ticket"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
  
  /**
   * Responsive Rendering
   * 
   * Uses Sheet (bottom drawer) for mobile devices and Dialog (modal) for desktop.
   * This provides optimal UX for each form factor:
   * - Mobile: Sheet slides up from bottom, uses full vertical space
   * - Desktop: Dialog appears centered, doesn't need full screen
   * 
   * Both render the same content but with different containers.
   */
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[95vh] max-w-7xl mx-auto bg-discord-bg border-discord-dark p-0" aria-describedby="ticket-detail-mobile-description">
          {/* Accessibility header for screen readers */}
          <SheetHeader className="sr-only">
            <SheetTitle>Ticket Details - {ticket?.title || "Loading..."}</SheetTitle>
          </SheetHeader>
          
          {/* Accessibility description for screen readers */}
          <div className="sr-only" id="ticket-detail-mobile-description">
            View and manage ticket details, messages, resolutions, and history
          </div>
          
          {content}
        </SheetContent>
      </Sheet>
    );
  }
  
  // Desktop view using Dialog
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] bg-discord-bg border-discord-dark p-0 flex flex-col" aria-describedby="ticket-detail-description">
        {/* Accessibility header for screen readers */}
        <DialogHeader className="sr-only">
          <DialogTitle>Ticket Details - {ticket?.title || "Loading..."}</DialogTitle>
        </DialogHeader>
        
        {/* Accessibility description for screen readers */}
        <div className="sr-only" id="ticket-detail-description">
          View and manage ticket details, messages, resolutions, and history
        </div>
        
        {content}
      </DialogContent>
    </Dialog>
  );
}
