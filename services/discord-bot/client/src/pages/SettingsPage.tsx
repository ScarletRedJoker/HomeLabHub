/**
 * SettingsPage.tsx
 * 
 * Comprehensive settings management page for the Discord Ticket Bot.
 * NOW IMPLEMENTED AS A LEFT SLIDING PANEL (Sheet component)
 * 
 * Provides a tabbed interface for managing all bot configuration:
 * - General Settings: Basic bot behavior and preferences
 * - Server Configuration: Server-specific settings, channels, and roles
 * - Embed Panel: Customize ticket panel appearance
 * - Categories: Manage ticket categories
 * - Admin Controls: User management and permissions (admin-only)
 * 
 * Uses React Hook Form for efficient form state management and validation.
 * All changes are tracked and saved via API calls with toast feedback.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { useAuthContext } from "@/components/AuthProvider";
import { useServerContext } from "@/contexts/ServerContext";
import { useToast } from "@/hooks/use-toast";
import { HexColorPicker } from "react-colorful";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";

// Feature Components
import ServerSelector from "@/components/ServerSelector";
import OnboardingFlow from "@/components/OnboardingFlow";
import BotInviteCard from "@/components/BotInviteCard";
import ChannelsTab from "@/components/tabs/ChannelsTab";
import HealthTab from "@/components/tabs/HealthTab";
import ModerationPresets from "@/components/ModerationPresets";

// Icons
import { 
  ArrowLeft, Settings2, Server, FolderKanban, 
  Shield, Save, Loader2, Info, Trash2, Plus, Edit, 
  GripVertical, Send, Eye, AlertTriangle, MessageSquare, Layout, X,
  Copy, ExternalLink, Bot, Upload, Activity, Hash
} from "lucide-react";

/**
 * Type definitions for settings forms
 * These match the backend API schema expectations
 */

// General bot settings form data
interface GeneralSettingsForm {
  botName: string;
  botNickname: string;
  notificationsEnabled: boolean;
  autoCloseEnabled: boolean;
  autoCloseHours: string;
  defaultPriority: string;
  welcomeMessage: string;
  botPrefix: string;
}

// Server configuration form data
interface ServerConfigForm {
  adminChannelId: string;
  publicLogChannelId: string;
  adminRoleId: string;
  supportRoleId: string;
  adminNotificationsEnabled: boolean;
  sendCopyToAdminChannel: boolean;
}

// Embed panel customization form data
interface EmbedPanelForm {
  title: string;
  description: string;
  embedColor: string;
  footerText: string;
  showTimestamp: boolean;
}

// Thread integration settings form data
interface ThreadIntegrationForm {
  threadIntegrationEnabled: boolean;
  threadChannelId: string;
  threadAutoCreate: boolean;
  threadBidirectionalSync: boolean;
}

// Ticket category data structure
interface TicketCategory {
  id: number;
  name: string;
  emoji: string;
  color: string;
  serverId?: string;
}

// Discord channel data structure
interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

// Discord role data structure
interface DiscordRole {
  id: string;
  name: string;
  color: number;
}

// Component props
interface SettingsPageProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
}

/**
 * Main SettingsPage Component
 * 
 * This component manages all settings for the Discord Ticket Bot.
 * It uses a tabbed interface to organize different setting categories.
 * NOW RENDERED AS A LEFT SLIDING PANEL
 * 
 * State Management:
 * - Uses React Hook Form for form state in each tab
 * - Tracks unsaved changes to warn users before navigation
 * - Loads settings from API on mount
 * - Saves settings via PATCH/POST requests
 */
export default function SettingsPage({ isOpen, onClose, initialTab }: SettingsPageProps) {
  const { user, isAdmin } = useAuthContext();
  const { selectedServerId, setSelectedServerId, selectedServerName } = useServerContext();
  const { toast } = useToast();

  // Active tab tracking
  const [activeTab, setActiveTab] = useState(initialTab || "general");

  // Update active tab when initialTab prop changes
  useEffect(() => {
    if (initialTab && isOpen) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // Loading and saving states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Server data (channels, roles, etc.)
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<DiscordChannel[]>([]);

  // Categories management
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TicketCategory | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<TicketCategory | null>(null);
  const [showResetCategoriesDialog, setShowResetCategoriesDialog] = useState(false);

  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Color picker states
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCategoryColorPicker, setShowCategoryColorPicker] = useState(false);
  
  // Bot invite state
  const [botInviteURL, setBotInviteURL] = useState<string>("");
  
  // Onboarding flow state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Thread integration settings state
  const [threadSettings, setThreadSettings] = useState<ThreadIntegrationForm>({
    threadIntegrationEnabled: false,
    threadChannelId: "",
    threadAutoCreate: true,
    threadBidirectionalSync: true,
  });

  // Track if auto-selection has already been attempted (Bug Fix #1)
  const hasAutoSelectedRef = useRef(false);

  /**
   * Form initialization using React Hook Form
   * Separate form instances for each settings category for better organization
   */
  
  // General Settings Form
  const generalForm = useForm<GeneralSettingsForm>({
    defaultValues: {
      botName: "Ticket Bot",
      notificationsEnabled: true,
      autoCloseEnabled: false,
      autoCloseHours: "48",
      defaultPriority: "normal",
      welcomeMessage: "Thank you for creating a ticket. Our support team will assist you shortly.",
      botPrefix: "!",
    }
  });

  // Server Configuration Form
  const serverForm = useForm<ServerConfigForm>({
    defaultValues: {
      adminChannelId: "",
      publicLogChannelId: "",
      adminRoleId: "",
      supportRoleId: "",
      adminNotificationsEnabled: true,
      sendCopyToAdminChannel: false,
    }
  });

  // Embed Panel Form
  const embedForm = useForm<EmbedPanelForm>({
    defaultValues: {
      title: "🎫 Support Ticket System",
      description: "**Welcome to our support ticket system!**\n\nClick one of the buttons below to create a new support ticket.",
      embedColor: "#5865F2",
      footerText: "Click a button below to get started • Support Team",
      showTimestamp: true,
    }
  });

  // New category form state
  const [newCategory, setNewCategory] = useState({
    name: "",
    emoji: "🎫",
    color: "#5865F2",
  });

  /**
   * Auto-select server if user has only one connected server
   * This provides a better UX by eliminating the need to manually select when there's only one option
   * 
   * BUG FIX #1: Use a ref to track if auto-selection has already been attempted.
   * Only run once when component first receives user data with one server.
   * Don't re-run on subsequent isOpen changes to avoid overwriting manual selections.
   */
  useEffect(() => {
    if (!hasAutoSelectedRef.current && !selectedServerId && user?.connectedServers?.length === 1) {
      console.log("[SettingsPage] Auto-selecting only available server:", user.connectedServers[0]);
      setSelectedServerId(user.connectedServers[0]);
      hasAutoSelectedRef.current = true;
    }
  }, [selectedServerId, user, setSelectedServerId]);

  /**
   * Load all settings from the API when component mounts or server changes
   * This fetches:
   * - Bot settings (general + server config)
   * - Panel settings (embed customization)
   * - Categories list
   * - Server data (channels, roles) if server is selected
   */
  useEffect(() => {
    if (isOpen) {
      loadAllSettings();
    }
  }, [selectedServerId, isOpen]);

  const loadAllSettings = async () => {
    if (!selectedServerId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Load bot invite URL (doesn't require server ID)
      await loadBotInviteURL();
      
      // Load bot settings (includes both general and server config)
      await loadBotSettings();

      // Load panel settings
      await loadPanelSettings();

      // Load categories
      await loadCategories();

      // Load server data (channels and roles)
      await loadServerData();

      // Load thread integration settings
      await loadThreadSettings();

    } catch (error) {
      console.error("Error loading settings:", error);
      toast({
        title: "Error",
        description: "Failed to load some settings. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Load bot settings from API and populate forms
   * Bot settings include general settings and server configuration
   */
  const loadBotSettings = async () => {
    if (!selectedServerId) return;

    try {
      const response = await fetch(`/api/bot-settings/${selectedServerId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const settings = await response.json();
        
        // Populate general settings form
        generalForm.reset({
          botName: settings.botName || "Ticket Bot",
          notificationsEnabled: settings.notificationsEnabled ?? true,
          autoCloseEnabled: settings.autoCloseEnabled ?? false,
          autoCloseHours: settings.autoCloseHours?.toString() || "48",
          defaultPriority: settings.defaultPriority || "normal",
          welcomeMessage: settings.welcomeMessage || "Thank you for creating a ticket. Our support team will assist you shortly.",
          botPrefix: settings.botPrefix || "!",
        });

        // Populate server configuration form
        serverForm.reset({
          adminChannelId: settings.adminChannelId || "",
          publicLogChannelId: settings.publicLogChannelId || "",
          adminRoleId: settings.adminRoleId || "",
          supportRoleId: settings.supportRoleId || "",
          adminNotificationsEnabled: settings.adminNotificationsEnabled ?? true,
          sendCopyToAdminChannel: settings.sendCopyToAdminChannel ?? false,
        });
        
        // Clear unsaved changes flag after programmatic form reset
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error("Failed to load bot settings:", error);
    }
  };

  /**
   * Load panel settings from API
   * Panel settings control the appearance of the ticket creation embed
   */
  const loadPanelSettings = async () => {
    if (!selectedServerId) return;

    try {
      const response = await fetch(`/api/panel-settings/${selectedServerId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const settings = await response.json();
        
        embedForm.reset({
          title: settings.title || "🎫 Support Ticket System",
          description: settings.description || "**Welcome to our support ticket system!**\n\nClick one of the buttons below to create a new support ticket.",
          embedColor: settings.embedColor || "#5865F2",
          footerText: settings.footerText || "Click a button below to get started • Support Team",
          showTimestamp: settings.showTimestamp ?? true,
        });
        
        // Clear unsaved changes flag after programmatic form reset
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error("Failed to load panel settings:", error);
    }
  };

  /**
   * Load ticket categories from API
   * Categories are used to organize different types of support tickets
   */
  const loadCategories = async () => {
    if (!selectedServerId) return;

    try {
      const response = await fetch(`/api/categories/server/${selectedServerId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const categoriesData = await response.json();
        setCategories(categoriesData);
      }
    } catch (error) {
      console.error("Failed to load categories:", error);
    }
  };

  /**
   * Load server data (channels and roles) from Discord API
   * This data is used to populate dropdowns in server configuration
   * DEBUG LOGGING ADDED to identify channel population issues
   */
  const loadServerData = async () => {
    if (!selectedServerId) {
      console.log("[SettingsPage] No server selected, skipping server data load");
      return;
    }

    console.log(`[SettingsPage] Loading server data for server: ${selectedServerId}`);

    try {
      const response = await fetch(`/api/discord/server-info/${selectedServerId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        console.log("[SettingsPage] Received server data:", data);
        
        // Log raw channels data
        console.log("[SettingsPage] Raw channels from API:", data.channels);
        console.log("[SettingsPage] Number of raw channels:", data.channels?.length || 0);
        
        // Server already filters for text channels (type 0), so no need to filter again
        const textChannels = data.channels || [];
        
        console.log("[SettingsPage] Text channels from server:", textChannels);
        console.log("[SettingsPage] Number of text channels:", textChannels.length);
        
        setChannels(textChannels);
        
        console.log("[SettingsPage] Channels state updated. New length:", textChannels.length);
        
        // Log roles data
        console.log("[SettingsPage] Roles from API:", data.roles);
        console.log("[SettingsPage] Number of roles:", data.roles?.length || 0);
        
        setRoles(data.roles || []);
      } else {
        console.error("[SettingsPage] Failed to fetch server data. Status:", response.status);
      }
    } catch (error) {
      console.error("[SettingsPage] Error loading server data:", error);
    }
  };
  
  /**
   * Load bot invite URL
   * This URL allows users to invite the bot to their Discord server
   */
  const loadBotInviteURL = async () => {
    try {
      const response = await fetch('/api/bot/invite-url', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setBotInviteURL(data.inviteURL);
      }
    } catch (error) {
      console.error("[SettingsPage] Error loading bot invite URL:", error);
    }
  };

  /**
   * Load thread integration settings from API
   * These settings control thread-to-ticket integration behavior
   */
  const loadThreadSettings = async () => {
    if (!selectedServerId) return;

    try {
      const response = await fetch(`/api/bot-settings/${selectedServerId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const settings = await response.json();
        setThreadSettings({
          threadIntegrationEnabled: settings.threadIntegrationEnabled ?? false,
          threadChannelId: settings.threadChannelId || "",
          threadAutoCreate: settings.threadAutoCreate ?? true,
          threadBidirectionalSync: settings.threadBidirectionalSync ?? true,
        });
      }
    } catch (error) {
      console.error("[SettingsPage] Failed to load thread settings:", error);
    }
  };
  
  /**
   * Copy bot invite URL to clipboard
   */
  const copyInviteURL = async () => {
    if (!botInviteURL) {
      toast({
        title: "Error",
        description: "Bot invite URL not available.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(botInviteURL);
      toast({
        title: "Copied!",
        description: "Bot invite URL copied to clipboard.",
      });
    } catch (error) {
      console.error("Failed to copy invite URL:", error);
      toast({
        title: "Error",
        description: "Failed to copy URL. Please copy it manually.",
        variant: "destructive",
      });
    }
  };

  /**
   * Save general settings to the API
   * Updates bot behavior settings like notifications and auto-close
   */
  const saveGeneralSettings = async () => {
    if (!selectedServerId) {
      toast({
        title: "Error",
        description: "Please select a server first.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const formData = generalForm.getValues();
      
      const payload = {
        serverId: selectedServerId,
        botName: formData.botName,
        notificationsEnabled: formData.notificationsEnabled,
        autoCloseEnabled: formData.autoCloseEnabled,
        autoCloseHours: formData.autoCloseHours,
        defaultPriority: formData.defaultPriority,
        welcomeMessage: formData.welcomeMessage,
        botPrefix: formData.botPrefix,
      };

      // Try to update existing settings
      let response = await fetch(`/api/bot-settings/${selectedServerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      // If settings don't exist, create them
      if (response.status === 404) {
        response = await fetch('/api/bot-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
      }

      if (response.ok) {
        toast({
          title: "Settings saved",
          description: "General settings have been updated successfully.",
        });
        setHasUnsavedChanges(false);
        await loadBotSettings();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error("Failed to save general settings:", error);
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Save server configuration to the API
   * Updates server-specific settings like channels and roles
   */
  const saveServerConfig = async () => {
    if (!selectedServerId) {
      toast({
        title: "Error",
        description: "Please select a server first.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const formData = serverForm.getValues();
      
      const payload = {
        serverId: selectedServerId,
        adminChannelId: formData.adminChannelId,
        publicLogChannelId: formData.publicLogChannelId,
        adminRoleId: formData.adminRoleId,
        supportRoleId: formData.supportRoleId,
        adminNotificationsEnabled: formData.adminNotificationsEnabled,
        sendCopyToAdminChannel: formData.sendCopyToAdminChannel,
      };

      // Try to update existing settings
      let response = await fetch(`/api/bot-settings/${selectedServerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      // If settings don't exist, create them
      if (response.status === 404) {
        response = await fetch('/api/bot-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
      }

      if (response.ok) {
        toast({
          title: "Settings saved",
          description: "Server configuration has been updated successfully.",
        });
        setHasUnsavedChanges(false);
        await loadBotSettings();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error("Failed to save server config:", error);
      toast({
        title: "Error",
        description: "Failed to save server configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Save embed panel settings to the API
   * Updates the appearance of the ticket creation panel
   */
  const saveEmbedPanel = async () => {
    if (!selectedServerId) {
      toast({
        title: "Error",
        description: "Please select a server first.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const formData = embedForm.getValues();
      
      const payload = {
        serverId: selectedServerId,
        title: formData.title,
        description: formData.description,
        embedColor: formData.embedColor,
        footerText: formData.footerText,
        showTimestamp: formData.showTimestamp,
      };

      // Try to update existing panel settings
      let response = await fetch(`/api/panel-settings/${selectedServerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      // If settings don't exist, create them
      if (response.status === 404) {
        response = await fetch('/api/panel-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
      }

      if (response.ok) {
        toast({
          title: "Settings saved",
          description: "Embed panel settings have been updated successfully.",
        });
        setHasUnsavedChanges(false);
        await loadPanelSettings();
      } else {
        throw new Error('Failed to save panel settings');
      }
    } catch (error) {
      console.error("Failed to save embed panel:", error);
      toast({
        title: "Error",
        description: "Failed to save embed panel settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Send the ticket panel to a Discord channel
   * This creates the interactive embed with category buttons in Discord
   */
  const sendPanelToChannel = async (channelId: string) => {
    if (!selectedServerId || !channelId) {
      toast({
        title: "Error",
        description: "Please select a channel first.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/panel-settings/${selectedServerId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channelId })
      });

      if (response.ok) {
        toast({
          title: "Panel sent",
          description: "The ticket panel has been sent to the channel successfully.",
        });
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send panel');
      }
    } catch (error: any) {
      console.error("Failed to send panel:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send panel to channel. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Create a new ticket category
   * Categories help organize different types of support requests
   */
  const createCategory = async () => {
    if (!selectedServerId || !newCategory.name.trim()) {
      toast({
        title: "Error",
        description: "Please provide a category name.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newCategory.name,
          color: newCategory.color,
          serverId: selectedServerId,
        })
      });

      if (response.ok) {
        toast({
          title: "Category created",
          description: `Category "${newCategory.name}" has been created successfully.`,
        });
        
        // Reset form and reload categories
        setNewCategory({ name: "", emoji: "🎫", color: "#5865F2" });
        setIsAddingCategory(false);
        await loadCategories();
      } else {
        throw new Error('Failed to create category');
      }
    } catch (error) {
      console.error("Failed to create category:", error);
      toast({
        title: "Error",
        description: "Failed to create category. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Delete a ticket category
   * Shows confirmation dialog before deletion
   */
  const deleteCategory = async (categoryId: number) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        toast({
          title: "Category deleted",
          description: "The category has been deleted successfully.",
        });
        
        setCategoryToDelete(null);
        await loadCategories();
      } else {
        throw new Error('Failed to delete category');
      }
    } catch (error) {
      console.error("Failed to delete category:", error);
      toast({
        title: "Error",
        description: "Failed to delete category. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Reset categories to defaults
   * Deletes all existing categories and recreates the 4 default ones
   */
  const resetCategoriesToDefaults = async () => {
    if (!selectedServerId) {
      toast({
        title: "Error",
        description: "Please select a server first.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/categories/reset/${selectedServerId}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Categories reset",
          description: `Successfully reset to ${data.categories.length} default categories.`,
        });
        
        setShowResetCategoriesDialog(false);
        await loadCategories();
      } else {
        throw new Error('Failed to reset categories');
      }
    } catch (error) {
      console.error("Failed to reset categories:", error);
      toast({
        title: "Error",
        description: "Failed to reset categories. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Track form changes to show unsaved changes warning
   */
  useEffect(() => {
    const subscription = generalForm.watch(() => setHasUnsavedChanges(true));
    return () => subscription.unsubscribe();
  }, [generalForm]);

  useEffect(() => {
    const subscription = serverForm.watch(() => setHasUnsavedChanges(true));
    return () => subscription.unsubscribe();
  }, [serverForm]);

  useEffect(() => {
    const subscription = embedForm.watch(() => setHasUnsavedChanges(true));
    return () => subscription.unsubscribe();
  }, [embedForm]);

  /**
   * Reset unsaved changes when switching to action-only tabs
   * Health tab doesn't have forms - they only have action buttons
   */
  useEffect(() => {
    if (activeTab === 'health') {
      setHasUnsavedChanges(false);
    }
  }, [activeTab]);

  /**
   * Warn user about unsaved changes before closing panel
   */
  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (window.confirm("You have unsaved changes. Are you sure you want to close?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  /**
   * Debug effect to log channels state changes
   */
  useEffect(() => {
    console.log("[SettingsPage] Channels state changed:", channels);
    console.log("[SettingsPage] Current channels count:", channels.length);
    if (channels.length > 0) {
      console.log("[SettingsPage] First channel:", channels[0]);
    }
  }, [channels]);

  /**
   * Main component render
   * Wrapped in Sheet component for left sliding panel
   */
  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent 
        side="left" 
        className="w-full sm:max-w-[90vw] md:max-w-[1000px] lg:max-w-[1200px] overflow-y-auto p-0"
      >
        {/* Show server selection prompt if no server is selected */}
        {!selectedServerId ? (
          <div className="p-6">
            <SheetHeader className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle className="text-2xl">Settings</SheetTitle>
                  <SheetDescription>
                    Select a server to manage its settings
                  </SheetDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </div>
            </SheetHeader>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Server className="h-5 w-5 text-blue-500" />
                  <span>Server Selection Required</span>
                </CardTitle>
                <CardDescription>
                  Choose which Discord server you want to configure
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Settings are server-specific. Select a server below to manage its configuration.
                </p>
                
                {/* Server Selector */}
                <div className="flex items-center justify-center py-4">
                  <ServerSelector 
                    selectedServerId={selectedServerId}
                    onServerSelect={setSelectedServerId}
                  />
                </div>

                {!user?.connectedServers?.length && (
                  <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      You don't have any connected servers yet. Make sure the bot is added to your Discord server and you have admin permissions.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : isLoading ? (
          // Show loading state while fetching settings
          <div className="p-6 flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading settings...</span>
          </div>
        ) : (
          // Main settings content
          <div className="p-6">
            {/* Header with back button and server info */}
            <SheetHeader className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle className="text-2xl mb-2">Settings</SheetTitle>
                  <SheetDescription className="flex items-center space-x-2">
                    <Server className="h-4 w-4" />
                    <span>Managing: <strong>{selectedServerName || selectedServerId}</strong></span>
                  </SheetDescription>
                </div>

                <div className="flex items-center gap-3">
                  {/* Server Selector */}
                  <ServerSelector 
                    selectedServerId={selectedServerId}
                    onServerSelect={setSelectedServerId}
                  />
                  
                  {hasUnsavedChanges && (
                    <Badge variant="destructive" className="flex items-center space-x-1">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Unsaved</span>
                    </Badge>
                  )}

                  <Button variant="outline" size="sm" onClick={onClose}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </div>
              </div>
            </SheetHeader>

            {/* Tabbed Settings Interface */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              {/* Tab Navigation */}
              <div className="w-full overflow-x-auto">
                <TabsList className="inline-flex w-full min-w-max gap-1 h-11 bg-muted/50">
                  <TabsTrigger value="general" className="flex items-center justify-center space-x-1 text-xs sm:text-sm h-full px-2 sm:px-3" data-testid="tab-settings-general">
                    <Settings2 className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">General</span>
                  </TabsTrigger>
                  <TabsTrigger value="server-setup" className="flex items-center justify-center space-x-1 text-xs sm:text-sm h-full px-2 sm:px-3" data-testid="tab-settings-server">
                    <Server className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Server Setup</span>
                  </TabsTrigger>
                  <TabsTrigger value="categories" className="flex items-center justify-center space-x-1 text-xs sm:text-sm h-full px-2 sm:px-3" data-testid="tab-settings-categories">
                    <FolderKanban className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Categories</span>
                  </TabsTrigger>
                  <TabsTrigger value="channels" className="flex items-center justify-center space-x-1 text-xs sm:text-sm h-full px-2 sm:px-3" data-testid="tab-settings-channels">
                    <Hash className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Channels</span>
                  </TabsTrigger>
                  <TabsTrigger value="health" className="flex items-center justify-center space-x-1 text-xs sm:text-sm h-full px-2 sm:px-3" data-testid="tab-settings-health">
                    <Activity className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Health</span>
                  </TabsTrigger>
                  <TabsTrigger value="moderation" className="flex items-center justify-center space-x-1 text-xs sm:text-sm h-full px-2 sm:px-3" data-testid="tab-settings-moderation">
                    <Shield className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Moderation</span>
                  </TabsTrigger>
                  <TabsTrigger value="thread-integration" className="flex items-center justify-center space-x-1 text-xs sm:text-sm h-full px-2 sm:px-3" data-testid="tab-settings-thread-integration">
                    <MessageSquare className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Threads</span>
                  </TabsTrigger>
                  <TabsTrigger value="admin" className="flex items-center justify-center space-x-1 text-xs sm:text-sm h-full px-2 sm:px-3" disabled={!isAdmin} data-testid="tab-settings-admin">
                    <Shield className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Admin</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* General Settings Tab */}
              <TabsContent value="general" className="space-y-4">
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">General Settings</CardTitle>
                    <CardDescription className="text-sm">
                      Configure basic bot behavior and notification preferences
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 p-4 sm:p-6">
                    {/* Notifications Toggle */}
                    <div className="flex items-center justify-between space-x-4">
                      <div className="flex-1">
                        <Label htmlFor="notifications" className="text-base font-medium">
                          Enable Notifications
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Receive notifications when new tickets are created or updated
                        </p>
                      </div>
                      <Switch
                        id="notifications"
                        checked={generalForm.watch("notificationsEnabled")}
                        onCheckedChange={(checked) => generalForm.setValue("notificationsEnabled", checked)}
                      />
                    </div>

                    <Separator />

                    {/* Auto-close Settings */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between space-x-4">
                        <div className="flex-1">
                          <Label htmlFor="autoClose" className="text-base font-medium">
                            Auto-close Inactive Tickets
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            Automatically close tickets that have been inactive for a specified time
                          </p>
                        </div>
                        <Switch
                          id="autoClose"
                          checked={generalForm.watch("autoCloseEnabled")}
                          onCheckedChange={(checked) => generalForm.setValue("autoCloseEnabled", checked)}
                        />
                      </div>

                      {generalForm.watch("autoCloseEnabled") && (
                        <div className="ml-4 pl-4 border-l-2">
                          <Label htmlFor="autoCloseTimer">Auto-close Timer</Label>
                          <Select
                            value={generalForm.watch("autoCloseHours")}
                            onValueChange={(value) => generalForm.setValue("autoCloseHours", value)}
                          >
                            <SelectTrigger id="autoCloseTimer" className="mt-2">
                              <SelectValue placeholder="Select duration" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="24">24 hours</SelectItem>
                              <SelectItem value="48">48 hours</SelectItem>
                              <SelectItem value="72">72 hours</SelectItem>
                              <SelectItem value="168">7 days</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-1">
                            Tickets will be automatically closed after this period of inactivity
                          </p>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Default Priority */}
                    <div className="space-y-2">
                      <Label htmlFor="defaultPriority">Default Ticket Priority</Label>
                      <Select
                        value={generalForm.watch("defaultPriority")}
                        onValueChange={(value) => generalForm.setValue("defaultPriority", value)}
                      >
                        <SelectTrigger id="defaultPriority" className="h-11">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low - Minor issues</SelectItem>
                          <SelectItem value="normal">Normal - Standard support</SelectItem>
                          <SelectItem value="high">High - Important issues</SelectItem>
                          <SelectItem value="urgent">Urgent - Critical problems</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        New tickets will be created with this priority level by default
                      </p>
                    </div>

                    <Separator />

                    {/* Welcome Message */}
                    <div className="space-y-2">
                      <Label htmlFor="welcomeMessage">Welcome Message</Label>
                      <Textarea
                        id="welcomeMessage"
                        placeholder="Enter welcome message for new tickets..."
                        className="min-h-[100px] text-sm sm:text-base"
                        {...generalForm.register("welcomeMessage")}
                      />
                      <p className="text-xs text-muted-foreground">
                        This message will be sent when a new ticket is created
                      </p>
                    </div>

                    <Separator />

                    {/* Bot Name */}
                    <div className="space-y-2">
                      <Label htmlFor="botName">Bot Name</Label>
                      <Input
                        id="botName"
                        placeholder="Ticket Bot"
                        className="h-11"
                        data-testid="input-bot-name"
                        {...generalForm.register("botName")}
                      />
                      <p className="text-xs text-muted-foreground">
                        The name displayed in the dashboard and notifications
                      </p>
                    </div>

                    <Separator />

                    {/* Bot Nickname */}
                    <div className="space-y-2">
                      <Label htmlFor="botNickname">Bot Server Nickname (Optional)</Label>
                      <Input
                        id="botNickname"
                        placeholder="Leave empty to use bot's default name"
                        className="h-11"
                        data-testid="input-bot-nickname"
                        {...generalForm.register("botNickname")}
                      />
                      <p className="text-xs text-muted-foreground">
                        Custom nickname for the bot in this Discord server (requires "Change Nickname" permission)
                      </p>
                    </div>

                    <Separator />

                    {/* Bot Prefix */}
                    <div className="space-y-2">
                      <Label htmlFor="botPrefix">Bot Command Prefix</Label>
                      <Input
                        id="botPrefix"
                        placeholder="!"
                        className="max-w-[100px] h-11"
                        {...generalForm.register("botPrefix")}
                      />
                      <p className="text-xs text-muted-foreground">
                        The prefix used for bot commands (e.g., !help, !close)
                      </p>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      onClick={saveGeneralSettings} 
                      disabled={isSaving}
                      className="w-full sm:w-auto"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save General Settings
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>

                {/* Onboarding Restart Card */}
                {isAdmin && (
                  <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-900">
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="flex items-center space-x-2 text-base sm:text-lg">
                        <Settings2 className="h-5 w-5 text-purple-600" />
                        <span>Server Setup Wizard</span>
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Run the setup wizard again to connect new servers or update your configuration
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4 sm:p-6">
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        The setup wizard will help you:
                      </p>
                      <ul className="text-sm text-muted-foreground space-y-2 ml-4">
                        <li className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>Invite the bot to new Discord servers</span>
                        </li>
                        <li className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>Select which servers to manage from this dashboard</span>
                        </li>
                        <li className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>Check bot status and permissions</span>
                        </li>
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button
                        onClick={() => setShowOnboarding(true)}
                        variant="outline"
                        className="w-full sm:w-auto border-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                        data-testid="button-restart-onboarding"
                      >
                        <Settings2 className="mr-2 h-4 w-4" />
                        Run Setup Wizard
                      </Button>
                    </CardFooter>
                  </Card>
                )}

                {/* Export/Import Ticket Database Card */}
                {isAdmin && (
                  <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="flex items-center space-x-2 text-base sm:text-lg">
                        <Send className="h-5 w-5 text-blue-600" />
                        <span>Export & Import Tickets</span>
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Backup or restore your ticket database
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4 sm:p-6">
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm">Export Tickets</h4>
                            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                              Download all tickets, messages, categories, and history as a JSON file
                            </p>
                          </div>
                          <Button
                            onClick={async () => {
                              try {
                                const response = await fetch(`/api/tickets/export/${selectedServerId}`, {
                                  credentials: 'include'
                                });
                                
                                if (!response.ok) {
                                  throw new Error('Export failed');
                                }
                                
                                const blob = await response.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `tickets-export-${selectedServerId}-${Date.now()}.json`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                                
                                toast({
                                  title: "Export successful",
                                  description: "Ticket database has been downloaded"
                                });
                              } catch (error) {
                                toast({
                                  title: "Export failed",
                                  description: error instanceof Error ? error.message : "Failed to export tickets",
                                  variant: "destructive"
                                });
                              }
                            }}
                            variant="outline"
                            className="border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                            data-testid="button-export-tickets"
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Export
                          </Button>
                        </div>
                        
                        <Separator />
                        
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm">Import Tickets</h4>
                            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                              Upload a previously exported JSON file to restore tickets
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <input
                              type="file"
                              accept=".json"
                              id="import-file"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                
                                try {
                                  const text = await file.text();
                                  const data = JSON.parse(text);
                                  
                                  const response = await fetch(`/api/tickets/import/${selectedServerId}`, {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json'
                                    },
                                    credentials: 'include',
                                    body: JSON.stringify(data)
                                  });
                                  
                                  if (!response.ok) {
                                    throw new Error('Import failed');
                                  }
                                  
                                  const result = await response.json();
                                  
                                  toast({
                                    title: "Import successful",
                                    description: `Imported ${result.imported} tickets${result.failed > 0 ? `, ${result.failed} failed` : ''}`
                                  });
                                  
                                  // Reset file input
                                  e.target.value = '';
                                } catch (error) {
                                  toast({
                                    title: "Import failed",
                                    description: error instanceof Error ? error.message : "Failed to import tickets",
                                    variant: "destructive"
                                  });
                                  e.target.value = '';
                                }
                              }}
                            />
                            <Button
                              onClick={() => document.getElementById('import-file')?.click()}
                              variant="outline"
                              className="border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                              data-testid="button-import-tickets"
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Import
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-3">
                        <div className="flex gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                          <div className="text-xs sm:text-sm text-yellow-800 dark:text-yellow-200">
                            <strong>Warning:</strong> Importing tickets will add them to your existing database. This operation cannot be easily undone.
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Server Setup Tab */}
              <TabsContent value="server-setup" className="space-y-4">
                {/* Bot Invite Section - Using new BotInviteCard component */}
                <BotInviteCard variant="default" showDescription={true} />
                
                <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center space-x-2 text-base sm:text-lg">
                      <Info className="h-5 w-5 text-blue-600" />
                      <span>Bot Permissions</span>
                    </CardTitle>
                    <CardDescription className="text-sm">
                      The bot requires these permissions to function properly
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6">
                    <div className="bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border">
                      <ul className="text-sm text-muted-foreground space-y-2 ml-6 list-disc">
                        <li>Manage Channels - Create and organize ticket channels</li>
                        <li>Manage Messages - Pin and manage ticket messages</li>
                        <li>Send Messages - Respond in tickets and send notifications</li>
                        <li>Embed Links - Send rich embeds for ticket information</li>
                        <li>Read Message History - View ticket conversations</li>
                        <li>Manage Roles - Assign ticket-specific permissions</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">Server Configuration</CardTitle>
                    <CardDescription className="text-sm">
                      Configure server-specific settings, channels, and roles
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 p-4 sm:p-6">
                    {/* Admin Channel */}
                    <div className="space-y-2">
                      <Label htmlFor="adminChannel">Admin Notification Channel</Label>
                      <Select
                        value={serverForm.watch("adminChannelId") || "none"}
                        onValueChange={(value) => {
                          console.log("[SettingsPage] Admin channel selected:", value);
                          serverForm.setValue("adminChannelId", value === "none" ? "" : value);
                        }}
                      >
                        <SelectTrigger id="adminChannel" className="h-11">
                          <SelectValue placeholder="Select a channel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {channels.length > 0 ? (
                            channels.map((channel) => {
                              console.log("[SettingsPage] Rendering channel option:", channel);
                              return (
                                <SelectItem key={channel.id} value={channel.id}>
                                  # {channel.name}
                                </SelectItem>
                              );
                            })
                          ) : (
                            <SelectItem value="no-channels" disabled>
                              No text channels found
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Private channel where admins receive ticket notifications and copies
                      </p>
                      {/* Debug info */}
                      <p className="text-xs text-muted-foreground italic">
                        Debug: {channels.length} channel(s) available
                      </p>
                    </div>

                    {/* Public Log Channel */}
                    <div className="space-y-2">
                      <Label htmlFor="publicLogChannel">Public Log Channel</Label>
                      <Select
                        value={serverForm.watch("publicLogChannelId") || "none"}
                        onValueChange={(value) => {
                          console.log("[SettingsPage] Public log channel selected:", value);
                          serverForm.setValue("publicLogChannelId", value === "none" ? "" : value);
                        }}
                      >
                        <SelectTrigger id="publicLogChannel" className="h-11">
                          <SelectValue placeholder="Select a channel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {channels.length > 0 ? (
                            channels.map((channel) => (
                              <SelectItem key={channel.id} value={channel.id}>
                                # {channel.name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="no-channels" disabled>
                              No text channels found
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Public channel for logging ticket activity (opens, closes, etc.)
                      </p>
                    </div>

                    <Separator />

                    {/* Admin Role */}
                    <div className="space-y-2">
                      <Label htmlFor="adminRole">Admin Role</Label>
                      <Select
                        value={serverForm.watch("adminRoleId") || "none"}
                        onValueChange={(value) => serverForm.setValue("adminRoleId", value === "none" ? "" : value)}
                      >
                        <SelectTrigger id="adminRole" className="h-11">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {roles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              @ {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Members with this role can manage all tickets and bot settings
                      </p>
                    </div>

                    {/* Support Role */}
                    <div className="space-y-2">
                      <Label htmlFor="supportRole">Support Staff Role</Label>
                      <Select
                        value={serverForm.watch("supportRoleId") || "none"}
                        onValueChange={(value) => serverForm.setValue("supportRoleId", value === "none" ? "" : value)}
                      >
                        <SelectTrigger id="supportRole" className="h-11">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {roles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              @ {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Members with this role can view and respond to tickets
                      </p>
                    </div>

                    <Separator />

                    {/* Admin Notifications */}
                    <div className="flex items-center justify-between space-x-4">
                      <div className="flex-1">
                        <Label htmlFor="adminNotifications" className="text-base font-medium">
                          Admin Notifications
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Send notifications to the admin channel for all ticket events
                        </p>
                      </div>
                      <Switch
                        id="adminNotifications"
                        checked={serverForm.watch("adminNotificationsEnabled")}
                        onCheckedChange={(checked) => serverForm.setValue("adminNotificationsEnabled", checked)}
                      />
                    </div>

                    {/* Send Copy to Admin Channel */}
                    <div className="flex items-center justify-between space-x-4">
                      <div className="flex-1">
                        <Label htmlFor="sendCopyToAdmin" className="text-base font-medium">
                          Send Ticket Copy to Admin Channel
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Automatically post a copy of new tickets in the admin channel
                        </p>
                      </div>
                      <Switch
                        id="sendCopyToAdmin"
                        checked={serverForm.watch("sendCopyToAdminChannel")}
                        onCheckedChange={(checked) => serverForm.setValue("sendCopyToAdminChannel", checked)}
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      onClick={saveServerConfig} 
                      disabled={isSaving}
                      className="w-full sm:w-auto"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Server Configuration
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>

              {/* Categories Tab */}
              <TabsContent value="categories" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Ticket Categories</CardTitle>
                        <CardDescription>
                          Manage categories for organizing different types of support tickets
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => setShowResetCategoriesDialog(true)}
                          size="sm"
                          variant="outline"
                          disabled={isSaving}
                        >
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          Reset to Defaults
                        </Button>
                        <Button
                          onClick={() => setIsAddingCategory(true)}
                          size="sm"
                          disabled={isAddingCategory}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Category
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Add New Category Form */}
                    {isAddingCategory && (
                      <Card className="border-dashed border-2">
                        <CardHeader>
                          <CardTitle className="text-base">New Category</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="newCategoryName">Category Name</Label>
                            <Input
                              id="newCategoryName"
                              placeholder="General Support"
                              value={newCategory.name}
                              onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="newCategoryColor">Category Color</Label>
                            <div className="flex items-center space-x-2">
                              <Popover open={showCategoryColorPicker} onOpenChange={setShowCategoryColorPicker}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="w-[100px] justify-start"
                                    style={{ backgroundColor: newCategory.color }}
                                  >
                                    <div className="w-full h-6 rounded" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-3">
                                  <HexColorPicker
                                    color={newCategory.color}
                                    onChange={(color) => setNewCategory({ ...newCategory, color })}
                                  />
                                </PopoverContent>
                              </Popover>
                              <Input
                                id="newCategoryColor"
                                value={newCategory.color}
                                onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                                placeholder="#5865F2"
                                className="flex-1"
                              />
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter className="flex justify-end space-x-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsAddingCategory(false);
                              setNewCategory({ name: "", emoji: "🎫", color: "#5865F2" });
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={createCategory}
                            disabled={isSaving || !newCategory.name.trim()}
                          >
                            {isSaving ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating...
                              </>
                            ) : (
                              <>
                                <Plus className="mr-2 h-4 w-4" />
                                Create Category
                              </>
                            )}
                          </Button>
                        </CardFooter>
                      </Card>
                    )}

                    {/* Categories List */}
                    <div className="space-y-3">
                      {categories.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <FolderKanban className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No categories yet. Create one to get started!</p>
                        </div>
                      ) : (
                        categories.map((category) => (
                          <Card key={category.id}>
                            <CardContent className="flex items-center justify-between p-4">
                              <div className="flex items-center space-x-3">
                                <div
                                  className="w-4 h-4 rounded"
                                  style={{ backgroundColor: category.color }}
                                />
                                <div>
                                  <p className="font-medium">{category.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Color: {category.color}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setCategoryToDelete(category)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Channels Tab */}
              <TabsContent value="channels" className="space-y-4">
                <ChannelsTab />
              </TabsContent>

              {/* Health Tab */}
              <TabsContent value="health" className="space-y-4">
                <HealthTab />
              </TabsContent>

              {/* Moderation Presets Tab */}
              <TabsContent value="moderation" className="space-y-4">
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5 text-discord-blue" />
                      Moderation Presets
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Apply pre-configured moderation settings with one click
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6">
                    {selectedServerId && (
                      <ModerationPresets serverId={selectedServerId} />
                    )}
                    {!selectedServerId && (
                      <div className="text-center text-muted-foreground py-8">
                        Please select a server to manage moderation presets
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Thread Integration Tab */}
              <TabsContent value="thread-integration" className="space-y-4">
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-discord-blue" />
                      Thread Integration
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Automatically create and sync tickets from Discord threads
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 p-4 sm:p-6">
                    {/* Info Alert */}
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                      <div className="flex gap-3">
                        <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
                          <p className="font-semibold">About Thread Integration</p>
                          <p>
                            Thread integration allows you to automatically convert Discord threads into tickets in your dashboard. 
                            This enables seamless support management directly from Discord.
                          </p>
                          <ul className="list-disc ml-4 space-y-1 mt-2">
                            <li>New threads can automatically create tickets in your dashboard</li>
                            <li>Messages sync bidirectionally between Discord and the dashboard</li>
                            <li>Monitor specific channels or all channels in your server</li>
                            <li>Thread creators become ticket owners automatically</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Enable Thread Integration */}
                    <div className="flex items-center justify-between space-x-4">
                      <div className="flex-1">
                        <Label htmlFor="threadIntegrationEnabled" className="text-base font-medium">
                          Enable Thread Integration
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Automatically create tickets from Discord threads and sync messages bidirectionally
                        </p>
                      </div>
                      <Switch
                        id="threadIntegrationEnabled"
                        checked={threadSettings.threadIntegrationEnabled}
                        onCheckedChange={(checked) => setThreadSettings({ ...threadSettings, threadIntegrationEnabled: checked })}
                        data-testid="switch-thread-integration"
                      />
                    </div>

                    {/* Conditionally shown fields when thread integration is enabled */}
                    {threadSettings.threadIntegrationEnabled && (
                      <>
                        <Separator />

                        {/* Thread Monitoring Channel */}
                        <div className="space-y-2">
                          <Label htmlFor="threadChannel">Thread Monitoring Channel</Label>
                          <Select
                            value={threadSettings.threadChannelId || "all"}
                            onValueChange={(value) => setThreadSettings({ ...threadSettings, threadChannelId: value === "all" ? "" : value })}
                          >
                            <SelectTrigger id="threadChannel" className="h-11" data-testid="select-thread-channel">
                              <SelectValue placeholder="Select a channel" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border-border">
                              <SelectItem value="all">All Channels</SelectItem>
                              {channels.length > 0 ? (
                                channels.map((channel) => (
                                  <SelectItem key={channel.id} value={channel.id}>
                                    # {channel.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="no-channels" disabled>
                                  No text channels found
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Select a specific channel to monitor for threads, or leave empty to monitor all channels
                          </p>
                        </div>

                        <Separator />

                        {/* Auto-Create Tickets */}
                        <div className="flex items-center justify-between space-x-4">
                          <div className="flex-1">
                            <Label htmlFor="threadAutoCreate" className="text-base font-medium">
                              Auto-Create Tickets from Threads
                            </Label>
                            <p className="text-sm text-muted-foreground mt-1">
                              Automatically create a ticket when a new thread is created
                            </p>
                          </div>
                          <Switch
                            id="threadAutoCreate"
                            checked={threadSettings.threadAutoCreate}
                            onCheckedChange={(checked) => setThreadSettings({ ...threadSettings, threadAutoCreate: checked })}
                            data-testid="switch-thread-auto-create"
                          />
                        </div>

                        <Separator />

                        {/* Bidirectional Sync */}
                        <div className="flex items-center justify-between space-x-4">
                          <div className="flex-1">
                            <Label htmlFor="threadBidirectionalSync" className="text-base font-medium">
                              Bidirectional Message Sync
                            </Label>
                            <p className="text-sm text-muted-foreground mt-1">
                              Sync messages between Discord threads and dashboard tickets in both directions
                            </p>
                          </div>
                          <Switch
                            id="threadBidirectionalSync"
                            checked={threadSettings.threadBidirectionalSync}
                            onCheckedChange={(checked) => setThreadSettings({ ...threadSettings, threadBidirectionalSync: checked })}
                            data-testid="switch-thread-bidirectional-sync"
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button
                      onClick={async () => {
                        if (!selectedServerId) {
                          toast({
                            title: "Error",
                            description: "Please select a server first.",
                            variant: "destructive",
                          });
                          return;
                        }

                        setIsSaving(true);
                        try {
                          const payload = {
                            serverId: selectedServerId,
                            threadIntegrationEnabled: threadSettings.threadIntegrationEnabled,
                            threadChannelId: threadSettings.threadChannelId || null,
                            threadAutoCreate: threadSettings.threadAutoCreate,
                            threadBidirectionalSync: threadSettings.threadBidirectionalSync,
                          };

                          // Try to update existing settings
                          let response = await fetch(`/api/bot-settings/${selectedServerId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify(payload)
                          });

                          // If settings don't exist, create them
                          if (response.status === 404) {
                            response = await fetch('/api/bot-settings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify(payload)
                            });
                          }

                          if (response.ok) {
                            toast({
                              title: "Settings saved",
                              description: "Thread integration settings have been updated successfully.",
                            });
                          } else {
                            throw new Error('Failed to save settings');
                          }
                        } catch (error) {
                          console.error("Failed to save thread integration settings:", error);
                          toast({
                            title: "Error",
                            description: "Failed to save thread integration settings. Please try again.",
                            variant: "destructive",
                          });
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      disabled={isSaving || !selectedServerId}
                      className="w-full sm:w-auto"
                      data-testid="button-save-thread-settings"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Thread Settings
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>

              {/* Admin Controls Tab */}
              <TabsContent value="admin" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Shield className="h-5 w-5 text-yellow-500" />
                      <span>Admin Controls</span>
                    </CardTitle>
                    <CardDescription>
                      Advanced settings and user management (Admin only)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* User Info */}
                    <div className="space-y-2">
                      <h3 className="font-semibold">Current User</h3>
                      <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-lg font-bold">
                            {user?.username?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{user?.username}</p>
                          <p className="text-sm text-muted-foreground">
                            Role: {isAdmin ? 'Administrator' : 'User'}
                          </p>
                        </div>
                        <Badge className="ml-auto" variant={isAdmin ? "default" : "secondary"}>
                          {isAdmin ? 'Admin' : 'User'}
                        </Badge>
                      </div>
                    </div>

                    <Separator />

                    {/* Server Stats */}
                    <div className="space-y-2">
                      <h3 className="font-semibold">Server Statistics</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground">Total Categories</p>
                          <p className="text-2xl font-bold">{categories.length}</p>
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground">Channels</p>
                          <p className="text-2xl font-bold">{channels.length}</p>
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground">Roles</p>
                          <p className="text-2xl font-bold">{roles.length}</p>
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground">Server ID</p>
                          <p className="text-xs font-mono break-all">{selectedServerId}</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Debug Info */}
                    <div className="space-y-2">
                      <h3 className="font-semibold">System Information</h3>
                      <div className="p-3 bg-muted rounded-lg space-y-1 text-xs font-mono">
                        <p>User ID: {user?.id}</p>
                        <p>Server: {selectedServerName}</p>
                        <p>Admin Servers: {user?.adminGuilds?.length || 0}</p>
                        <p>Connected Servers: {user?.connectedServers?.length || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Delete Category Confirmation Dialog */}
            <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Category</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete the category "{categoryToDelete?.name}"? 
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => categoryToDelete && deleteCategory(categoryToDelete.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      'Delete'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Reset Categories Confirmation Dialog */}
            <AlertDialog open={showResetCategoriesDialog} onOpenChange={setShowResetCategoriesDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Categories to Defaults</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all current categories and replace them with the 4 default categories:
                    <ul className="mt-2 space-y-1 list-disc list-inside">
                      <li>💬 General Support</li>
                      <li>🛠️ Technical Issue</li>
                      <li>🐛 Bug Report</li>
                      <li>✨ Feature Request</li>
                    </ul>
                    <p className="mt-2 font-semibold text-destructive">
                      This action cannot be undone.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={resetCategoriesToDefaults}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      'Reset to Defaults'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </SheetContent>
      
      {/* Onboarding Flow Modal */}
      {showOnboarding && (
        <OnboardingFlow 
          onComplete={() => {
            setShowOnboarding(false);
            // Reload settings after onboarding completes
            loadAllSettings();
            toast({
              title: "Setup Complete",
              description: "Your server configuration has been updated.",
            });
          }} 
        />
      )}
    </Sheet>
  );
}
