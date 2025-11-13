/**
 * NewTicketModal Component
 * 
 * A modal dialog that handles the complete ticket creation workflow, including
 * authentication checking, form validation, and submission. This component is
 * the primary entry point for users to create new support tickets.
 * 
 * Features:
 * - Three-state rendering: Loading, Unauthenticated, Authenticated
 * - Discord OAuth integration for authentication
 * - Category selection with dynamic category list
 * - Priority flagging (normal/urgent)
 * - Server selection validation for admin users
 * - Form validation and error handling
 * - Optimistic UI updates via React Query
 * 
 * Workflow:
 * 1. Check authentication status
 * 2. If not authenticated, show login prompt
 * 3. If authenticated, show ticket creation form
 * 4. Validate form data before submission
 * 5. Submit ticket and invalidate cache
 * 6. Close modal and show success notification
 * 
 * Why separate authentication states:
 * - Prevents unauthenticated users from submitting tickets
 * - Provides clear call-to-action for login
 * - Improves security by enforcing authentication
 * - Better UX than showing errors after form submission
 * 
 * @component
 * @example
 * ```tsx
 * <NewTicketModal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 * />
 * ```
 */

import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TicketCategory } from "@shared/schema";
import { useAuthContext } from "@/components/AuthProvider";
import { useServerContext } from "@/contexts/ServerContext";
import { Button } from "@/components/ui/button";

/**
 * Props for the NewTicketModal component
 * @interface NewTicketModalProps
 */
interface NewTicketModalProps {
  /** Controls whether the modal is visible */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
}

export default function NewTicketModal({ isOpen, onClose }: NewTicketModalProps) {
  // Toast notifications for user feedback
  const { toast } = useToast();
  
  // React Query client for cache invalidation after ticket creation
  const queryClient = useQueryClient();
  
  /**
   * Authentication context
   * Provides:
   * - isAuthenticated: Boolean flag for auth status
   * - isLoading: True while checking auth status
   * - login: Function to initiate Discord OAuth flow
   * - user: Current user object (includes isAdmin flag)
   */
  const { isAuthenticated, isLoading, login, user } = useAuthContext();
  
  /**
   * Server context
   * Admin users can view/manage tickets across multiple servers,
   * so they must select which server a ticket belongs to.
   * Regular users are automatically scoped to their server.
   */
  const { selectedServerId } = useServerContext();
  
  /**
   * Form state management
   * Using individual useState hooks instead of a single object because:
   * - Each field updates independently
   * - Simpler to read and maintain
   * - No need for spread operator complexity
   * - Better performance (no unnecessary re-renders)
   */
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  
  /**
   * Category ID state
   * Defaults to 1 (typically "General" category)
   * This provides a sensible default while allowing users to change it
   */
  const [categoryId, setCategoryId] = useState<number>(1);
  
  /**
   * Urgent flag state
   * Defaults to false (normal priority)
   * Users can check a box to mark tickets as urgent
   */
  const [isUrgent, setIsUrgent] = useState(false);
  
  /**
   * Fetch available ticket categories
   * Categories are defined by admins and determine how tickets are organized.
   * This query fetches the list to populate the category dropdown.
   * Empty array fallback prevents errors if query fails or returns null.
   */
  const { data: categories = [] } = useQuery<TicketCategory[]>({
    queryKey: ['/api/categories'],
  });
  
  /**
   * Ticket creation mutation
   * 
   * Handles the API request to create a new ticket.
   * Uses React Query's mutation for:
   * - Automatic error handling
   * - Loading state management
   * - Optimistic updates via cache invalidation
   * - Retry logic on network failures
   * 
   * Why we invalidate queries on success:
   * - Triggers refetch of ticket lists
   * - Ensures UI shows new ticket immediately
   * - Maintains consistency across components
   * - Prevents stale data issues
   */
  const createTicketMutation = useMutation({
    mutationFn: async (ticketData: any) => {
      return apiRequest("POST", "/api/tickets", ticketData);
    },
    onSuccess: () => {
      // Reset form to initial state for next use
      resetForm();
      
      // Close modal to return to ticket list
      onClose();
      
      /**
       * Invalidate tickets query
       * This tells React Query that the tickets data is now stale
       * and should be refetched, which will include our new ticket
       */
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      
      // Show success notification to user
      toast({
        title: "Ticket Created",
        description: "Your ticket has been created successfully.",
      });
    },
    onError: (error) => {
      /**
       * Error handling
       * Shows descriptive error message to help users understand what went wrong.
       * Using destructive variant makes the error visually distinct.
       */
      toast({
        title: "Error",
        description: `Failed to create ticket: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  /**
   * Reset form to initial state
   * 
   * Called after successful submission or when modal is closed.
   * Clears all form fields to prevent data from persisting between uses.
   * This prevents accidentally submitting duplicate tickets.
   */
  const resetForm = () => {
    setTitle("");
    setDescription("");
    setCategoryId(1);
    setIsUrgent(false);
  };
  
  /**
   * Handle form submission
   * 
   * Validation logic:
   * 1. Check if user is authenticated (prevents unauthenticated submissions)
   * 2. For admins, verify server is selected (admins must specify which server)
   * 3. If validation passes, submit ticket with all required data
   * 
   * Why we validate here instead of relying on form validation:
   * - Server selection is not a standard form field
   * - Authentication check is a business logic requirement
   * - Provides better error messages than browser validation
   * - Prevents unnecessary API calls with invalid data
   * 
   * @param e - Form submit event
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    /**
     * Authentication check
     * This should rarely fail (we hide the form for unauthenticated users)
     * but provides a safety net in case of race conditions or edge cases
     */
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to create a ticket.",
        variant: "destructive",
      });
      return;
    }
    
    /**
     * Server selection validation for admins
     * 
     * Why admins need to select a server:
     * - Admins can view tickets from multiple servers
     * - Each ticket must belong to a specific server
     * - Prevents tickets from being created in the wrong server
     * - Helps with organization and routing
     */
    if (user.isAdmin && !selectedServerId) {
      toast({
        title: "Server Required",
        description: "Please select a server before creating a ticket.",
        variant: "destructive",
      });
      return;
    }
    
    /**
     * Submit ticket with all required data
     * 
     * Priority logic:
     * - If isUrgent is checked, priority = "urgent"
     * - Otherwise, priority = "normal"
     * 
     * Status logic:
     * - All new tickets start as "open"
     * - Status will be changed as staff work on the ticket
     * 
     * Creator and server assignment:
     * - creatorId: Current user's Discord ID
     * - serverId: Selected server (for admins) or user's current server
     */
    createTicketMutation.mutate({
      title,
      description,
      categoryId,
      priority: isUrgent ? "urgent" : "normal",
      status: "open",
      creatorId: user.id,
      serverId: selectedServerId
    });
  };
  
  /**
   * Early return - Modal not open
   * Prevents rendering when modal should be hidden.
   * Returns null to avoid any DOM output.
   */
  if (!isOpen) return null;

  /**
   * Loading State
   * 
   * Shown while checking authentication status.
   * Uses a spinner to indicate activity.
   * 
   * Why we show a loading state:
   * - Auth check is asynchronous
   * - Prevents flickering between states
   * - Better UX than showing incorrect UI
   * - Indicates to user that something is happening
   */
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-10 bg-black bg-opacity-50 flex items-center justify-center p-4">
        <div className="bg-discord-sidebar rounded-lg shadow-lg w-full max-w-md p-8 text-center">
          {/* 
            Animated spinner using Tailwind's animate-spin
            border-b-2 creates the spinning effect with partial border
          */}
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-discord-blue mx-auto mb-4"></div>
          <p className="text-discord-text">Checking authentication...</p>
        </div>
      </div>
    );
  }

  /**
   * Unauthenticated State
   * 
   * Shown when user is not logged in.
   * Provides a clear path to authenticate via Discord OAuth.
   * 
   * Why we require authentication for ticket creation:
   * - Tracks who created the ticket
   * - Allows users to view their ticket history
   * - Prevents spam and abuse
   * - Enables staff to contact ticket creator
   * - Links tickets to Discord accounts for verification
   * 
   * Design considerations:
   * - Discord logo creates visual connection to auth method
   * - Clear explanation of why auth is needed
   * - One-click sign-in for minimal friction
   * - Cancel button allows users to back out
   */
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-10 bg-black bg-opacity-50 flex items-center justify-center p-4">
        <div className="bg-discord-sidebar rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
          {/* Modal header */}
          <div className="p-4 sm:p-6 border-b border-discord-dark">
            <div className="flex justify-between items-center">
              <h2 className="text-lg sm:text-xl font-bold text-white">Sign In Required</h2>
              
              {/* 
                Close button
                SVG icon provides a clear "X" to close the modal
                Accessible via click and keyboard
              */}
              <button 
                className="text-discord-muted hover:text-white"
                onClick={onClose}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Modal content */}
          <div className="p-4 sm:p-6 text-center">
            {/* 
              Discord logo
              Using official Discord brand color (#5865F2 - discord-blue)
              Creates immediate visual association with Discord login
            */}
            <div className="mb-4">
              <svg className="mx-auto h-12 w-12 text-discord-blue mb-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36">
                <path fill="currentColor" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
              </svg>
            </div>
            
            <h3 className="text-lg font-medium text-white mb-2">Authentication Required</h3>
            
            {/* 
              Explanation text
              Clear, user-friendly language explaining why authentication is needed.
              Emphasizes benefits rather than just stating requirements.
            */}
            <p className="text-discord-muted mb-6">
              Please sign in with your Discord account to create a support ticket. This helps us track your tickets and provide better support.
            </p>
            
            <div className="space-y-3">
              {/* 
                Sign in button
                Initiates Discord OAuth flow when clicked.
                Closes modal to allow OAuth redirect.
                
                Why we close the modal before login:
                - OAuth redirects to Discord and back
                - Modal state would be lost during redirect
                - Cleaner UX to close modal first
              */}
              <Button 
                onClick={() => {
                  login();
                  onClose();
                }}
                className="w-full bg-discord-blue hover:bg-blue-600 text-white h-11"
              >
                {/* Discord logo in button */}
                <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36">
                  <path
                    fill="currentColor"
                    d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"
                  />
                </svg>
                Sign in with Discord
              </Button>
              
              {/* 
                Cancel button
                Allows users to close modal without signing in.
                Text-only styling makes it visually secondary to sign-in button.
              */}
              <button 
                className="w-full px-4 py-2 h-11 text-discord-muted hover:text-white text-sm transition-colors"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  /**
   * Authenticated State - Ticket Creation Form
   * 
   * This is the main form for creating tickets.
   * Shown only when user is authenticated.
   * 
   * Form fields:
   * - Category: Dropdown with available categories
   * - Title: Short summary of the issue
   * - Description: Detailed explanation
   * - Urgent: Checkbox for priority flagging
   * 
   * Validation:
   * - Title and description are required (HTML5 validation)
   * - Category defaults to 1 (General)
   * - Server selection validated in handleSubmit
   */
  return (
    <div className="fixed inset-0 z-10 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-discord-sidebar rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="p-4 sm:p-6 border-b border-discord-dark">
          <div className="flex justify-between items-center">
            <h2 className="text-lg sm:text-xl font-bold text-white">Create New Ticket</h2>
            
            {/* Close button */}
            <button 
              className="text-discord-muted hover:text-white"
              onClick={onClose}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Form content */}
        <div className="p-4 sm:p-6">
          <form onSubmit={handleSubmit}>
            {/* 
              Category Selection
              Allows users to categorize their ticket (e.g., Technical, Billing, General).
              Categories help route tickets to appropriate staff and organize ticket lists.
            */}
            <div className="mb-4">
              <label className="block text-discord-text font-medium mb-2 text-sm sm:text-base" htmlFor="category">
                Category
              </label>
              <select 
                id="category" 
                name="category" 
                className="w-full bg-discord-dark border-none text-discord-text py-3 px-3 rounded-md focus:outline-none focus:ring-2 focus:ring-discord-blue h-11"
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
              >
                {/* 
                  Map through categories to create options
                  Each category has an id (value) and name (display text)
                */}
                {categories.map((category: TicketCategory) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* 
              Title Input
              Brief summary of the issue (e.g., "Cannot access account").
              Required field prevents empty submissions.
              Placeholder provides guidance on what to enter.
            */}
            <div className="mb-4">
              <label className="block text-discord-text font-medium mb-2 text-sm sm:text-base" htmlFor="title">
                Title
              </label>
              <input 
                type="text" 
                id="title" 
                name="title" 
                placeholder="Brief description of your issue" 
                className="w-full bg-discord-dark border-none text-discord-text py-3 px-3 rounded-md focus:outline-none focus:ring-2 focus:ring-discord-blue h-11"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            
            {/* 
              Description Textarea
              Detailed explanation of the issue.
              Larger input area (4 rows) encourages thorough descriptions.
              resize-none prevents layout breaking from user resizing.
            */}
            <div className="mb-4">
              <label className="block text-discord-text font-medium mb-2 text-sm sm:text-base" htmlFor="description">
                Description
              </label>
              <textarea 
                id="description" 
                name="description" 
                rows={4} 
                placeholder="Provide details about your issue..." 
                className="w-full bg-discord-dark border-none text-discord-text py-3 px-3 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-discord-blue min-h-[100px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              ></textarea>
            </div>
            
            {/* 
              Urgent Priority Checkbox
              Allows users to flag tickets that need immediate attention.
              
              When to use urgent:
              - System is completely down
              - Security issue
              - Revenue-impacting problem
              - Time-sensitive deadline
              
              Why we let users set this:
              - Users know their own urgency
              - Empowers users to prioritize
              - Staff can review and adjust if needed
            */}
            <div className="mb-4">
              <label className="flex items-center">
                <input 
                  type="checkbox" 
                  name="urgent" 
                  className="rounded bg-discord-dark border-none text-discord-blue focus:ring-discord-blue focus:ring-offset-0"
                  checked={isUrgent}
                  onChange={(e) => setIsUrgent(e.target.checked)}
                />
                <span className="ml-2 text-discord-text">Mark as urgent</span>
              </label>
            </div>
            
            {/* 
              Informational text
              Sets expectations about what happens after submission.
              Reduces anxiety by explaining the next steps.
            */}
            <div className="text-sm text-discord-muted mb-4">
              <p>A new ticket will be created in the server. Staff will respond as soon as possible.</p>
            </div>
            
            {/* Form action buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
              {/* 
                Cancel button
                Closes modal without submitting.
                Uses secondary styling to indicate it's not the primary action.
              */}
              <button 
                type="button" 
                className="w-full sm:w-auto px-4 py-2 h-11 bg-discord-dark text-discord-text hover:bg-gray-700 rounded-md text-sm font-medium order-2 sm:order-1"
                onClick={onClose}
              >
                Cancel
              </button>
              
              {/* 
                Submit button
                Creates the ticket when clicked.
                Disabled during submission to prevent duplicate tickets.
                
                Button text changes during submission:
                - Normal: "Create Ticket"
                - Submitting: "Creating..."
                
                This provides visual feedback that the action is in progress.
              */}
              <button 
                type="submit" 
                className="w-full sm:w-auto px-4 py-2 h-11 bg-discord-blue hover:bg-discord-darkBlue text-white rounded-md text-sm font-medium order-1 sm:order-2"
                disabled={createTicketMutation.isPending}
              >
                {createTicketMutation.isPending ? "Creating..." : "Create Ticket"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
