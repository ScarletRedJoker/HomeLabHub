import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from '@/components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LoginRequired } from '@/components/LoginRequired';
import { useServerContext } from '@/contexts/ServerContext';
import { useToast } from '@/hooks/use-toast';
import ServerSelector from '@/components/ServerSelector';
import {
  Settings,
  Palette,
  Plus,
  Edit,
  Trash2,
  GripVertical,
  Save,
  RotateCcw,
  Eye,
  Clock,
  Hash,
  Smile,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

// Validation schemas
const panelSettingsSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
  embedColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
  footerText: z.string().max(100, 'Footer text too long'),
  showTimestamp: z.boolean(),
  maxCategories: z.number().min(1).max(25).default(25),
});

const categorySchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Category name is required').max(50, 'Name too long'),
  emoji: z.string().min(1, 'Emoji is required').max(10, 'Emoji too long'),
  buttonStyle: z.enum(['primary', 'secondary', 'success', 'danger']).default('primary'),
  description: z.string().max(200, 'Description too long').optional(),
  displayOrder: z.number().optional(),
});

type PanelSettings = z.infer<typeof panelSettingsSchema>;
type Category = z.infer<typeof categorySchema>;

// Color picker component
const ColorPicker: React.FC<{
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}> = ({ color, onChange, disabled }) => {
  const presetColors = [
    '#5865F2', // Discord blue
    '#57F287', // Green
    '#FEE75C', // Yellow
    '#ED4245', // Red
    '#EB459E', // Pink
    '#9146FF', // Purple
    '#00D166', // Bright green
    '#FF6B6B', // Coral
    '#4ECDC4', // Teal
    '#45B7D1', // Light blue
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-16 h-8 p-0 border-2"
          style={{ backgroundColor: color }}
          disabled={disabled}
        >
          <span className="sr-only">Pick color</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Input
              type="color"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              className="w-16 h-8 p-0 border-0"
            />
            <Input
              type="text"
              value={color.toUpperCase()}
              onChange={(e) => {
                const val = e.target.value;
                if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                  onChange(val);
                }
              }}
              className="text-xs font-mono"
              placeholder="#5865F2"
            />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {presetColors.map((preset) => (
              <button
                key={preset}
                type="button"
                className="w-8 h-8 rounded border-2 border-gray-300 hover:border-gray-500 transition-colors"
                style={{ backgroundColor: preset }}
                onClick={() => onChange(preset)}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Emoji picker component (simplified)
const EmojiPicker: React.FC<{
  emoji: string;
  onChange: (emoji: string) => void;
  disabled?: boolean;
}> = ({ emoji, onChange, disabled }) => {
  const commonEmojis = [
    '🎫', '💬', '🔧', '🐛', '💡', '❓', '📝', '🎮', '💰', '🎨',
    '🚀', '⚡', '🔐', '📊', '🎯', '🏆', '🔥', '💼', '🛡️', '📞',
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-16 h-8 text-lg" disabled={disabled}>
          {emoji || '😀'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <div className="space-y-3">
          <Input
            type="text"
            value={emoji}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter emoji"
            className="text-center"
            maxLength={10}
          />
          <div className="grid grid-cols-5 gap-1">
            {commonEmojis.map((commonEmoji) => (
              <button
                key={commonEmoji}
                type="button"
                className="w-8 h-8 text-lg hover:bg-gray-100 rounded transition-colors"
                onClick={() => onChange(commonEmoji)}
              >
                {commonEmoji}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Category item component for drag and drop
const CategoryItem: React.FC<{
  category: Category & { id: number };
  index: number;
  onEdit: (category: Category & { id: number }) => void;
  onDelete: (id: number) => void;
  isDragging?: boolean;
}> = ({ category, index, onEdit, onDelete, isDragging }) => {
  const getButtonStyleColor = (style: string) => {
    switch (style) {
      case 'primary': return 'bg-blue-500 text-white';
      case 'secondary': return 'bg-gray-500 text-white';
      case 'success': return 'bg-green-500 text-white';
      case 'danger': return 'bg-red-500 text-white';
      default: return 'bg-blue-500 text-white';
    }
  };

  return (
    <Draggable draggableId={category.id.toString()} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`
            p-4 border rounded-lg bg-white transition-shadow
            ${snapshot.isDragging ? 'shadow-lg' : 'shadow-sm'}
            ${isDragging ? 'opacity-50' : ''}
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                {...provided.dragHandleProps}
                className="cursor-grab hover:cursor-grabbing text-gray-400 hover:text-gray-600"
              >
                <GripVertical className="h-4 w-4" />
              </div>
              <div className="text-2xl">{category.emoji}</div>
              <div>
                <h4 className="font-medium">{category.name}</h4>
                {category.description && (
                  <p className="text-sm text-gray-500">{category.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className={getButtonStyleColor(category.buttonStyle)}>
                {category.buttonStyle}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(category)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Category</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{category.name}"? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(category.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
};

// Panel preview component
const PanelPreview: React.FC<{
  settings: PanelSettings;
  categories: (Category & { id: number })[];
}> = ({ settings, categories }) => {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center" style={{ borderColor: settings.embedColor }}>
        <div className="w-1 h-full absolute left-0 top-0" style={{ backgroundColor: settings.embedColor }} />
        <CardTitle className="text-lg">{settings.title}</CardTitle>
        <CardDescription>{settings.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {categories.slice(0, Math.min(categories.length, settings.maxCategories)).map((category) => {
          const getPreviewButtonClass = (style: string) => {
            switch (style) {
              case 'primary': return 'bg-blue-500 hover:bg-blue-600 text-white';
              case 'secondary': return 'bg-gray-500 hover:bg-gray-600 text-white';
              case 'success': return 'bg-green-500 hover:bg-green-600 text-white';
              case 'danger': return 'bg-red-500 hover:bg-red-600 text-white';
              default: return 'bg-blue-500 hover:bg-blue-600 text-white';
            }
          };

          return (
            <Button
              key={category.id}
              variant="outline"
              className={`w-full justify-start text-left h-auto p-3 ${getPreviewButtonClass(category.buttonStyle)}`}
              disabled
            >
              <span className="mr-2 text-lg">{category.emoji}</span>
              <div>
                <div className="font-medium">{category.name}</div>
                {category.description && (
                  <div className="text-xs opacity-75 mt-1">{category.description}</div>
                )}
              </div>
            </Button>
          );
        })}
        {settings.footerText && (
          <>
            <Separator className="my-3" />
            <p className="text-xs text-center text-gray-500">{settings.footerText}</p>
          </>
        )}
        {settings.showTimestamp && (
          <p className="text-xs text-center text-gray-400 flex items-center justify-center">
            <Clock className="h-3 w-3 mr-1" />
            {new Date().toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default function PanelCustomizer() {
  const { selectedServerId, setSelectedServerId } = useServerContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState<(Category & { id: number }) | null>(null);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);

  // Forms
  const settingsForm = useForm<PanelSettings>({
    resolver: zodResolver(panelSettingsSchema),
    defaultValues: {
      title: '🎫 Support Ticket System',
      description: 'Select a category below to create a support ticket. Our team will assist you promptly.',
      embedColor: '#5865F2',
      footerText: 'Need help? Contact our support team!',
      showTimestamp: true,
      maxCategories: 25,
    },
  });

  const categoryForm = useForm<Category>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      emoji: '🎫',
      buttonStyle: 'primary',
      description: '',
    },
  });

  // Check if server is selected
  if (!selectedServerId) {
    return (
      <LoginRequired adminOnly>
        <div className="container mx-auto p-4 mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <ServerSelector 
                selectedServerId={selectedServerId}
                onServerSelect={setSelectedServerId}
              />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
                Server Selection Required
              </CardTitle>
              <CardDescription>
                Please select a server above to customize panel settings.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </LoginRequired>
    );
  }

  // Queries
  const { 
    data: panelSettings, 
    isLoading: isLoadingSettings,
    error: settingsError 
  } = useQuery({
    queryKey: [`/api/panel-settings/${selectedServerId}`],
    queryFn: () => fetch(`/api/panel-settings/${selectedServerId}`, {
      credentials: 'include'
    }).then(res => {
      if (!res.ok) throw new Error('Failed to fetch panel settings');
      return res.json();
    }),
    enabled: !!selectedServerId,
  });

  const { 
    data: categories = [], 
    isLoading: isLoadingCategories,
    error: categoriesError 
  } = useQuery<(Category & { id: number })[]>({
    queryKey: [`/api/panel-categories/${selectedServerId}`],
    queryFn: () => fetch(`/api/panel-categories/${selectedServerId}`, {
      credentials: 'include'
    }).then(res => {
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    }),
    enabled: !!selectedServerId,
  });

  // Mutations
  const updateSettingsMutation = useMutation({
    mutationFn: (data: PanelSettings) =>
      fetch(`/api/panel-settings/${selectedServerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
      }).then(res => {
        if (!res.ok) throw new Error('Failed to update settings');
        return res.json();
      }),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Panel settings updated successfully' });
      queryClient.invalidateQueries({ queryKey: [`/api/panel-settings/${selectedServerId}`] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update panel settings', variant: 'destructive' });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data: Omit<Category, 'id'>) =>
      fetch(`/api/panel-categories/${selectedServerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
      }).then(res => {
        if (!res.ok) throw new Error('Failed to create category');
        return res.json();
      }),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Category created successfully' });
      queryClient.invalidateQueries({ queryKey: [`/api/panel-categories/${selectedServerId}`] });
      setIsAddCategoryOpen(false);
      categoryForm.reset();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create category', variant: 'destructive' });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, ...data }: Category & { id: number }) =>
      fetch(`/api/panel-categories/${selectedServerId}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
      }).then(res => {
        if (!res.ok) throw new Error('Failed to update category');
        return res.json();
      }),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Category updated successfully' });
      queryClient.invalidateQueries({ queryKey: [`/api/panel-categories/${selectedServerId}`] });
      setEditingCategory(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update category', variant: 'destructive' });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/panel-categories/${selectedServerId}/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      }).then(res => {
        if (!res.ok) throw new Error('Failed to delete category');
        return res.json();
      }),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Category deleted successfully' });
      queryClient.invalidateQueries({ queryKey: [`/api/panel-categories/${selectedServerId}`] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete category', variant: 'destructive' });
    },
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/panel-settings/${selectedServerId}/reset`, {
        method: 'POST',
        credentials: 'include'
      }).then(res => {
        if (!res.ok) throw new Error('Failed to reset settings');
        return res.json();
      }),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Panel settings reset to defaults' });
      queryClient.invalidateQueries({ queryKey: [`/api/panel-settings/${selectedServerId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/panel-categories/${selectedServerId}`] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to reset settings', variant: 'destructive' });
    },
  });

  // Initialize form with fetched data
  useEffect(() => {
    if (panelSettings) {
      settingsForm.reset(panelSettings);
    }
  }, [panelSettings, settingsForm]);

  // Handle form submissions
  const onSubmitSettings = (data: PanelSettings) => {
    updateSettingsMutation.mutate(data);
  };

  const onSubmitCategory = (data: Category) => {
    if (editingCategory) {
      updateCategoryMutation.mutate({ ...data, id: editingCategory.id });
    } else {
      createCategoryMutation.mutate(data);
    }
  };

  // Handle category operations
  const handleEditCategory = (category: Category & { id: number }) => {
    setEditingCategory(category);
    categoryForm.reset(category);
  };

  const handleDeleteCategory = (id: number) => {
    deleteCategoryMutation.mutate(id);
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    
    // TODO: Implement category reordering API call
    const items = Array.from(categories);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update display order for all categories
    const updates = items.map((item, index) => ({
      ...item,
      displayOrder: index,
    }));
    
    // For now, just show a toast that reordering isn't implemented
    toast({ 
      title: 'Info', 
      description: 'Category reordering will be implemented in the API', 
    });
  };

  const handleResetSettings = () => {
    resetSettingsMutation.mutate();
  };

  // Get current form values for preview
  const currentSettings = settingsForm.watch();

  if (isLoadingSettings || isLoadingCategories) {
    return (
      <LoginRequired adminOnly>
        <div className="container mx-auto p-4 mt-4">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg">Loading panel customizer...</span>
          </div>
        </div>
      </LoginRequired>
    );
  }

  if (settingsError || categoriesError) {
    return (
      <LoginRequired adminOnly>
        <div className="container mx-auto p-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-red-500">Error Loading Panel Settings</CardTitle>
              <CardDescription>
                {(settingsError as Error)?.message || (categoriesError as Error)?.message}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </LoginRequired>
    );
  }

  return (
    <LoginRequired adminOnly>
      <div className="container mx-auto p-4 mt-4 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center">
              <Settings className="h-8 w-8 mr-3 text-primary" />
              Panel Customizer
            </h1>
            <p className="text-muted-foreground">
              Customize your server's ticket panel settings and categories
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => window.location.href = '/admin'}
            >
              ← Back to Dashboard
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset to Defaults
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Panel Settings</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset all panel settings and categories to their default values. 
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleResetSettings}
                    disabled={resetSettingsMutation.isPending}
                  >
                    {resetSettingsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-1" />
                    )}
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="settings" className="w-full">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="settings" className="flex items-center">
                  <Palette className="h-4 w-4 mr-2" />
                  Panel Settings
                </TabsTrigger>
                <TabsTrigger value="categories" className="flex items-center">
                  <Hash className="h-4 w-4 mr-2" />
                  Categories
                </TabsTrigger>
              </TabsList>

              {/* Panel Settings Tab */}
              <TabsContent value="settings">
                <Card>
                  <CardHeader>
                    <CardTitle>Panel Settings</CardTitle>
                    <CardDescription>
                      Configure the appearance and behavior of your ticket panel
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...settingsForm}>
                      <form onSubmit={settingsForm.handleSubmit(onSubmitSettings)} className="space-y-4">
                        <FormField
                          control={settingsForm.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Panel Title</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="🎫 Support Ticket System" />
                              </FormControl>
                              <FormDescription>
                                The main title displayed at the top of the ticket panel
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={settingsForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Panel Description</FormLabel>
                              <FormControl>
                                <Textarea 
                                  {...field} 
                                  placeholder="Select a category below to create a support ticket..."
                                  rows={3}
                                />
                              </FormControl>
                              <FormDescription>
                                A helpful description explaining how to use the ticket system
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={settingsForm.control}
                          name="embedColor"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Embed Color</FormLabel>
                              <FormControl>
                                <div className="flex items-center space-x-2">
                                  <ColorPicker
                                    color={field.value}
                                    onChange={field.onChange}
                                    disabled={updateSettingsMutation.isPending}
                                  />
                                  <Input 
                                    {...field} 
                                    className="font-mono text-sm"
                                    placeholder="#5865F2"
                                  />
                                </div>
                              </FormControl>
                              <FormDescription>
                                The accent color used for the panel embed border and highlights
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={settingsForm.control}
                          name="footerText"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Footer Text (Optional)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Need help? Contact our support team!" />
                              </FormControl>
                              <FormDescription>
                                Optional text displayed at the bottom of the panel
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={settingsForm.control}
                          name="showTimestamp"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">Show Timestamp</FormLabel>
                                <FormDescription>
                                  Display current date and time in the panel footer
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  disabled={updateSettingsMutation.isPending}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={settingsForm.control}
                          name="maxCategories"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Maximum Categories</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  type="number"
                                  min="1"
                                  max="25"
                                  onChange={e => field.onChange(parseInt(e.target.value) || 1)}
                                />
                              </FormControl>
                              <FormDescription>
                                Maximum number of categories to display (1-25)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex justify-end">
                          <Button 
                            type="submit" 
                            disabled={updateSettingsMutation.isPending}
                            className="min-w-[120px]"
                          >
                            {updateSettingsMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4 mr-2" />
                            )}
                            Save Settings
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Categories Tab */}
              <TabsContent value="categories">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>Category Management</CardTitle>
                        <CardDescription>
                          Add, edit, and organize ticket categories ({categories.length}/25)
                        </CardDescription>
                      </div>
                      <Dialog open={isAddCategoryOpen} onOpenChange={setIsAddCategoryOpen}>
                        <DialogTrigger asChild>
                          <Button
                            disabled={categories.length >= 25}
                            onClick={() => {
                              setEditingCategory(null);
                              categoryForm.reset({
                                name: '',
                                emoji: '🎫',
                                buttonStyle: 'primary',
                                description: '',
                              });
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Category
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>
                              {editingCategory ? 'Edit Category' : 'Add New Category'}
                            </DialogTitle>
                            <DialogDescription>
                              {editingCategory 
                                ? 'Update the category details below'
                                : 'Create a new ticket category with custom styling'
                              }
                            </DialogDescription>
                          </DialogHeader>
                          <Form {...categoryForm}>
                            <form onSubmit={categoryForm.handleSubmit(onSubmitCategory)} className="space-y-4">
                              <FormField
                                control={categoryForm.control}
                                name="name"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Category Name *</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="General Support" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={categoryForm.control}
                                name="emoji"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Emoji *</FormLabel>
                                    <FormControl>
                                      <div className="flex items-center space-x-2">
                                        <EmojiPicker
                                          emoji={field.value}
                                          onChange={field.onChange}
                                          disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}
                                        />
                                        <Input {...field} placeholder="🎫" className="flex-1" />
                                      </div>
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={categoryForm.control}
                                name="buttonStyle"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Button Style</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select button style" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="primary">Primary (Blue)</SelectItem>
                                        <SelectItem value="secondary">Secondary (Gray)</SelectItem>
                                        <SelectItem value="success">Success (Green)</SelectItem>
                                        <SelectItem value="danger">Danger (Red)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={categoryForm.control}
                                name="description"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Description (Optional)</FormLabel>
                                    <FormControl>
                                      <Textarea 
                                        {...field} 
                                        placeholder="Brief description of this category"
                                        rows={2}
                                      />
                                    </FormControl>
                                    <FormDescription>
                                      Optional description shown below the category name
                                    </FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <DialogFooter>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    setIsAddCategoryOpen(false);
                                    setEditingCategory(null);
                                    categoryForm.reset();
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="submit"
                                  disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}
                                >
                                  {(createCategoryMutation.isPending || updateCategoryMutation.isPending) ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : editingCategory ? (
                                    <Check className="h-4 w-4 mr-2" />
                                  ) : (
                                    <Plus className="h-4 w-4 mr-2" />
                                  )}
                                  {editingCategory ? 'Update' : 'Create'} Category
                                </Button>
                              </DialogFooter>
                            </form>
                          </Form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {categories.length === 0 ? (
                      <div className="text-center py-8">
                        <Hash className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Categories Yet</h3>
                        <p className="text-gray-500 mb-4">
                          Create your first ticket category to get started
                        </p>
                        <Button
                          onClick={() => setIsAddCategoryOpen(true)}
                          className="mx-auto"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add First Category
                        </Button>
                      </div>
                    ) : (
                      <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="categories">
                          {(provided, snapshot) => (
                            <div
                              {...provided.droppableProps}
                              ref={provided.innerRef}
                              className={`space-y-3 ${snapshot.isDraggingOver ? 'bg-gray-50' : ''}`}
                            >
                              {categories.map((category, index) => (
                                <CategoryItem
                                  key={category.id}
                                  category={category}
                                  index={index}
                                  onEdit={(cat) => {
                                    handleEditCategory(cat);
                                    setIsAddCategoryOpen(true);
                                  }}
                                  onDelete={handleDeleteCategory}
                                />
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </DragDropContext>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Eye className="h-5 w-5 mr-2" />
                    Live Preview
                  </CardTitle>
                  <CardDescription>
                    See how your panel will appear to users
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PanelPreview 
                    settings={currentSettings} 
                    categories={categories}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </LoginRequired>
  );
}