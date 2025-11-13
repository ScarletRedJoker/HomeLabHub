import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useServerContext } from '@/contexts/ServerContext';
import { apiRequest, queryClient as globalQueryClient } from '@/lib/queryClient';
import {
  Loader2, Plus, Trash2, Edit, Save, X, Eye, Hash, Send, Palette,
  GripVertical, Layout, MessageSquare, Image, User, Type, Link2,
  Copy, Calendar, ChevronDown, ChevronUp, Info, Sparkles, Settings, Filter, ArrowUpDown
} from 'lucide-react';

// Validation schemas
const panelSettingsSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
  embedColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
  footerText: z.string().max(100, 'Footer text too long'),
  showTimestamp: z.boolean(),
});

const templateFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  type: z.enum(['custom', 'ticket', 'announcement', 'rules', 'info']),
  
  embedTitle: z.string().max(256, 'Title too long').optional(),
  embedDescription: z.string().max(4096, 'Description too long').optional(),
  embedColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
  embedUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  showTimestamp: z.boolean(),
  
  authorName: z.string().max(256, 'Author name too long').optional(),
  authorIconUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  authorUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  
  thumbnailUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  imageUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  
  footerText: z.string().max(2048, 'Footer text too long').optional(),
  footerIconUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  
  fields: z.array(z.object({
    name: z.string().min(1).max(256),
    value: z.string().min(1).max(1024),
    inline: z.boolean(),
  })).max(25, 'Maximum 25 fields allowed'),
  
  buttons: z.array(z.object({
    label: z.string().min(1).max(80),
    emoji: z.string().max(10).optional(),
    style: z.enum(['Primary', 'Secondary', 'Success', 'Danger', 'Link']),
    url: z.string().url('Invalid URL').optional().or(z.literal('')),
    customId: z.string().max(100),
    row: z.number().min(1).max(5),
    position: z.number().min(0).max(4),
  })).max(25, 'Maximum 25 buttons allowed'),
});

type PanelSettings = z.infer<typeof panelSettingsSchema>;
type TemplateFormData = z.infer<typeof templateFormSchema>;

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  permissions: {
    canSendMessages: boolean;
    canEmbedLinks: boolean;
  };
}

interface Server {
  id: string;
  name: string;
  channels: DiscordChannel[];
}

const EmojiPicker: React.FC<{
  value: string;
  onChange: (emoji: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const commonEmojis = [
    '🎫', '👤', '📋', '🔒', '🔓', '👁️', '🚫', '⚠️',
    '✅', '❌', '🔔', '📧', '💬', '📝', '🎯', '⭐',
    '🛠️', '🐛', '💡', '❓', '❗', '🚀', '🔥', '💰',
    '📊', '📈', '📉', '🏆', '🎉', '🎮', '🎵', '🎨',
    '👍', '👎', '👋', '🙏', '💪', '🤝', '💼', '📱'
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-10 px-3 font-normal"
          disabled={disabled}
          type="button"
          data-testid="emoji-picker-trigger"
        >
          <span className="text-xl mr-2">{value || '➕'}</span>
          <span className="text-sm text-muted-foreground">
            {value ? 'Change' : 'Add'} Emoji
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">
              Common Discord Emojis
            </Label>
            <div className="grid grid-cols-8 gap-1">
              {commonEmojis.map((emoji) => (
                <Button
                  key={emoji}
                  type="button"
                  variant={value === emoji ? "default" : "ghost"}
                  className="h-9 w-9 p-0 text-xl"
                  onClick={() => onChange(emoji)}
                  data-testid={`emoji-preset-${emoji.codePointAt(0)}`}
                >
                  {emoji}
                </Button>
              ))}
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Or enter custom emoji
            </Label>
            <Input
              type="text"
              placeholder="Type emoji..."
              value={value}
              onChange={(e) => onChange(e.target.value)}
              maxLength={10}
              data-testid="emoji-picker-custom-input"
            />
          </div>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange('')}
              data-testid="emoji-picker-clear"
            >
              Clear Emoji
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ButtonStyleSelector: React.FC<{
  value: string;
  onChange: (style: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const buttonStyles = [
    { value: 'Primary', label: 'Primary', color: '#5865F2', description: 'Blurple - Main actions' },
    { value: 'Secondary', label: 'Secondary', color: '#4E5D94', description: 'Gray - Secondary actions' },
    { value: 'Success', label: 'Success', color: '#57F287', description: 'Green - Positive actions' },
    { value: 'Danger', label: 'Danger', color: '#ED4245', description: 'Red - Destructive actions' },
    { value: 'Link', label: 'Link', color: '#5865F2', description: 'Hyperlink - External URLs' }
  ];

  const selectedStyle = buttonStyles.find(s => s.value === value);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full" data-testid="button-style-selector-trigger">
        <SelectValue>
          <div className="flex items-center gap-2">
            <div 
              className="h-3 w-3 rounded-sm" 
              style={{ backgroundColor: selectedStyle?.color }}
            />
            <span>{selectedStyle?.label || 'Select style'}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {buttonStyles.map((style) => (
          <SelectItem key={style.value} value={style.value} data-testid={`button-style-${style.value.toLowerCase()}`}>
            <div className="flex items-center gap-2">
              <div 
                className="h-3 w-3 rounded-sm" 
                style={{ backgroundColor: style.color }}
              />
              <div className="flex flex-col">
                <span className="font-medium">{style.label}</span>
                <span className="text-xs text-muted-foreground">{style.description}</span>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const ColorPicker: React.FC<{
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}> = ({ color, onChange, disabled }) => {
  const presetColors = [
    '#5865F2', '#57F287', '#FEE75C', '#ED4245', '#EB459E',
    '#9146FF', '#00D166', '#FF6B6B', '#4ECDC4', '#45B7D1',
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-20 h-11 p-0 border-2"
          style={{ backgroundColor: color }}
          disabled={disabled}
          data-testid="color-picker-trigger"
        >
          <span className="sr-only">Pick color</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4">
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Input
              type="color"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              className="w-16 h-8 p-0 border-0"
              data-testid="color-picker-input"
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
              data-testid="color-picker-hex"
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
                data-testid={`color-preset-${preset}`}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const LivePreview: React.FC<{
  settings: PanelSettings;
  categories: any[];
}> = ({ settings, categories }) => {
  const getButtonStyleClass = (style: string) => {
    switch (style) {
      case 'primary': return 'bg-[#5865f2] hover:bg-[#4752c4] text-white';
      case 'secondary': return 'bg-[#4f545c] hover:bg-[#5d6269] text-white';
      case 'success': return 'bg-[#3ba55c] hover:bg-[#2d7d46] text-white';
      case 'danger': return 'bg-[#ed4245] hover:bg-[#c03537] text-white';
      default: return 'bg-[#5865f2] hover:bg-[#4752c4] text-white';
    }
  };

  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Live Preview
        </CardTitle>
        <CardDescription>Real-time preview of your panel</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-[#2b2d31] rounded-lg p-4 shadow-lg">
          <div className="bg-[#2b2d31] rounded-lg border-l-4" style={{ borderColor: settings.embedColor }}>
            <div className="p-4">
              {settings.title && (
                <h3 className="text-white text-lg font-bold mb-2">{settings.title}</h3>
              )}
              {settings.description && (
                <div className="text-[#dcddde] text-sm mb-3 whitespace-pre-wrap">
                  {settings.description}
                </div>
              )}
              {(settings.footerText || settings.showTimestamp) && (
                <div className="flex items-center gap-2 text-xs text-[#72767d] mt-3">
                  {settings.footerText && <span>{settings.footerText}</span>}
                  {settings.footerText && settings.showTimestamp && <span>•</span>}
                  {settings.showTimestamp && <span>{new Date().toLocaleString()}</span>}
                </div>
              )}
            </div>
          </div>

          {categories.length > 0 && (
            <div className="mt-3 space-y-2">
              {categories.map((category, idx) => (
                <button
                  key={idx}
                  className={`w-full px-4 py-2 rounded flex items-center justify-center gap-2 text-sm font-medium transition-colors ${getButtonStyleClass(category.buttonStyle)}`}
                >
                  {category.emoji && <span>{category.emoji}</span>}
                  {category.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Template Live Preview Component
const TemplateLivePreview: React.FC<{
  template: Partial<TemplateFormData>;
}> = ({ template }) => {
  const getButtonStyleClass = (style: string) => {
    const styleMap: Record<string, string> = {
      'Primary': 'bg-[#5865f2] hover:bg-[#4752c4] text-white',
      'Secondary': 'bg-[#4f545c] hover:bg-[#5d6269] text-white',
      'Success': 'bg-[#3ba55c] hover:bg-[#2d7d46] text-white',
      'Danger': 'bg-[#ed4245] hover:bg-[#c03537] text-white',
      'Link': 'bg-transparent hover:bg-[#5865f2]/10 text-[#00aff4]',
    };
    return styleMap[style] || styleMap['Primary'];
  };

  const groupButtonsByRow = (buttons: any[] = []) => {
    const rows: any[][] = [[], [], [], [], []];
    buttons.forEach((button) => {
      const rowIndex = (button.row || 1) - 1;
      if (rowIndex >= 0 && rowIndex < 5) {
        rows[rowIndex].push(button);
      }
    });
    return rows.filter(row => row.length > 0);
  };

  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Template Preview
        </CardTitle>
        <CardDescription>How your template will appear in Discord</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="bg-[#2b2d31] rounded-lg p-4 shadow-lg">
            <div className="bg-[#2b2d31] rounded-lg border-l-4" style={{ borderColor: template.embedColor || '#5865F2' }}>
              <div className="p-4 space-y-3">
                {/* Author */}
                {template.authorName && (
                  <div className="flex items-center gap-2 mb-2">
                    {template.authorIconUrl && (
                      <img src={template.authorIconUrl} alt="" className="w-6 h-6 rounded-full" />
                    )}
                    <span className="text-white text-sm font-semibold">{template.authorName}</span>
                  </div>
                )}

                {/* Title and Description */}
                <div className="flex justify-between">
                  <div className="flex-1">
                    {template.embedTitle && (
                      <h3 className="text-white text-lg font-bold mb-2">
                        {template.embedUrl ? (
                          <a href={template.embedUrl} className="text-[#00aff4] hover:underline">
                            {template.embedTitle}
                          </a>
                        ) : template.embedTitle}
                      </h3>
                    )}
                    {template.embedDescription && (
                      <div className="text-[#dcddde] text-sm mb-3 whitespace-pre-wrap">
                        {template.embedDescription}
                      </div>
                    )}

                    {/* Fields */}
                    {template.fields && template.fields.length > 0 && (
                      <div className="grid grid-cols-1 gap-2 mb-3">
                        {template.fields.map((field, idx) => (
                          <div key={idx} className={field.inline ? 'inline-block w-[48%] mr-[2%]' : 'w-full'}>
                            <div className="font-semibold text-white text-sm">{field.name}</div>
                            <div className="text-[#dcddde] text-sm whitespace-pre-wrap">{field.value}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Image */}
                    {template.imageUrl && (
                      <img src={template.imageUrl} alt="" className="rounded mt-2 max-w-full" />
                    )}
                  </div>

                  {/* Thumbnail */}
                  {template.thumbnailUrl && (
                    <img src={template.thumbnailUrl} alt="" className="w-20 h-20 rounded ml-4 object-cover" />
                  )}
                </div>

                {/* Footer */}
                {(template.footerText || template.showTimestamp) && (
                  <div className="flex items-center gap-2 text-xs text-[#72767d] mt-3 pt-2 border-t border-[#3f4147]">
                    {template.footerIconUrl && (
                      <img src={template.footerIconUrl} alt="" className="w-5 h-5 rounded-full" />
                    )}
                    {template.footerText && <span>{template.footerText}</span>}
                    {template.footerText && template.showTimestamp && <span>•</span>}
                    {template.showTimestamp && <span>{new Date().toLocaleString()}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Buttons */}
            {template.buttons && template.buttons.length > 0 && (
              <div className="mt-3 space-y-1">
                {groupButtonsByRow(template.buttons).map((row, rowIdx) => (
                  <div key={rowIdx} className="flex gap-2">
                    {row.map((button, btnIdx) => (
                      <button
                        key={btnIdx}
                        className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1 ${getButtonStyleClass(button.style)}`}
                      >
                        {button.emoji && <span>{button.emoji}</span>}
                        {button.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default function PanelEmbedManager() {
  const { selectedServerId } = useServerContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeSubTab, setActiveSubTab] = useState('design');
  const [templateView, setTemplateView] = useState<'list' | 'create' | 'edit'>('list');
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'lastUsed' | 'useCount'>('name');
  const [deployMode, setDeployMode] = useState<'panel' | 'template'>('panel');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [authorCollapsed, setAuthorCollapsed] = useState(true);
  const [imagesCollapsed, setImagesCollapsed] = useState(true);
  const [footerCollapsed, setFooterCollapsed] = useState(true);

  // Panel form
  const panelForm = useForm<PanelSettings>({
    resolver: zodResolver(panelSettingsSchema),
    defaultValues: {
      title: '🎫 Support Ticket System',
      description: '**Welcome to our support ticket system!**\n\nClick one of the buttons below to create a new support ticket.',
      embedColor: '#5865F2',
      footerText: 'Click a button below to get started • Support Team',
      showTimestamp: true,
    }
  });

  // Template form
  const templateForm = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: '',
      description: '',
      type: 'custom',
      embedTitle: '',
      embedDescription: '',
      embedColor: '#5865F2',
      embedUrl: '',
      showTimestamp: false,
      authorName: '',
      authorIconUrl: '',
      authorUrl: '',
      thumbnailUrl: '',
      imageUrl: '',
      footerText: '',
      footerIconUrl: '',
      fields: [],
      buttons: [],
    }
  });

  const { fields: templateFields, append: appendField, remove: removeField, move: moveField } = useFieldArray({
    control: templateForm.control,
    name: 'fields',
  });

  const { fields: templateButtons, append: appendButton, remove: removeButton } = useFieldArray({
    control: templateForm.control,
    name: 'buttons',
  });

  // Queries
  const { data: panelSettings, isLoading: isLoadingPanel } = useQuery({
    queryKey: [`/api/panel-settings/${selectedServerId}`],
    enabled: !!selectedServerId,
  });

  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: [`/api/categories/server/${selectedServerId}`],
    enabled: !!selectedServerId,
  });

  const { data: templates = [], isLoading: isLoadingTemplates } = useQuery({
    queryKey: [`/api/templates/${selectedServerId}`],
    enabled: !!selectedServerId && activeSubTab === 'templates',
  });

  const { data: channelData } = useQuery<{ servers: Server[] }>({
    queryKey: ['/api/discord/channels'],
    enabled: !!selectedServerId,
  });

  React.useEffect(() => {
    if (panelSettings) {
      panelForm.reset({
        title: panelSettings.title || '🎫 Support Ticket System',
        description: panelSettings.description || '**Welcome to our support ticket system!**\n\nClick one of the buttons below to create a new support ticket.',
        embedColor: panelSettings.embedColor || '#5865F2',
        footerText: panelSettings.footerText || 'Click a button below to get started • Support Team',
        showTimestamp: panelSettings.showTimestamp ?? true,
      });
    }
  }, [panelSettings, panelForm]);

  // Mutations
  const savePanelMutation = useMutation({
    mutationFn: async (data: PanelSettings) => {
      const payload = { serverId: selectedServerId, ...data };
      let response = await fetch(`/api/panel-settings/${selectedServerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.status === 404) {
        response = await fetch('/api/panel-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) throw new Error('Failed to save panel settings');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Settings saved', description: 'Panel settings have been updated successfully.' });
      queryClient.invalidateQueries({ queryKey: [`/api/panel-settings/${selectedServerId}`] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save panel settings. Please try again.', variant: 'destructive' });
    }
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      const { fields, buttons, ...templateData } = data;
      
      if (editingTemplateId) {
        // Update existing template
        const response = await apiRequest(`/api/templates/${editingTemplateId}`, {
          method: 'PATCH',
          body: JSON.stringify(templateData),
        });
        
        // Delete existing fields and buttons, then recreate
        const existingTemplate: any = await apiRequest(`/api/templates/detail/${editingTemplateId}`);
        
        // Delete old fields
        await Promise.all(
          (existingTemplate.fields || []).map((f: any) => 
            apiRequest(`/api/templates/fields/${f.id}`, { method: 'DELETE' })
          )
        );
        
        // Delete old buttons
        await Promise.all(
          (existingTemplate.buttons || []).map((b: any) => 
            apiRequest(`/api/templates/buttons/${b.id}`, { method: 'DELETE' })
          )
        );
        
        // Create new fields
        await Promise.all(
          fields.map((field, idx) => 
            apiRequest(`/api/templates/${editingTemplateId}/fields`, {
              method: 'POST',
              body: JSON.stringify({ ...field, sortOrder: idx }),
            })
          )
        );
        
        // Create new buttons
        await Promise.all(
          buttons.map((button) => 
            apiRequest(`/api/templates/${editingTemplateId}/buttons`, {
              method: 'POST',
              body: JSON.stringify(button),
            })
          )
        );
        
        return response;
      } else {
        // Create new template
        const response: any = await apiRequest('/api/templates', {
          method: 'POST',
          body: JSON.stringify({ serverId: selectedServerId, ...templateData }),
        });
        
        // Create fields
        await Promise.all(
          fields.map((field, idx) => 
            apiRequest(`/api/templates/${response.id}/fields`, {
              method: 'POST',
              body: JSON.stringify({ ...field, sortOrder: idx }),
            })
          )
        );
        
        // Create buttons
        await Promise.all(
          buttons.map((button) => 
            apiRequest(`/api/templates/${response.id}/buttons`, {
              method: 'POST',
              body: JSON.stringify(button),
            })
          )
        );
        
        return response;
      }
    },
    onSuccess: () => {
      toast({ 
        title: editingTemplateId ? 'Template updated' : 'Template created', 
        description: `Template has been ${editingTemplateId ? 'updated' : 'created'} successfully.` 
      });
      queryClient.invalidateQueries({ queryKey: [`/api/templates/${selectedServerId}`] });
      setTemplateView('list');
      setEditingTemplateId(null);
      templateForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save template. Please try again.', 
        variant: 'destructive' 
      });
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/templates/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: 'Template deleted', description: 'Template has been deleted successfully.' });
      queryClient.invalidateQueries({ queryKey: [`/api/templates/${selectedServerId}`] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete template.', variant: 'destructive' });
    }
  });

  const duplicateTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/templates/${id}/duplicate`, { method: 'POST' });
    },
    onSuccess: (data: any) => {
      toast({ title: 'Template duplicated', description: 'Template has been duplicated successfully.' });
      queryClient.invalidateQueries({ queryKey: [`/api/templates/${selectedServerId}`] });
      // Load duplicate into edit mode
      loadTemplateForEdit(data);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to duplicate template.', variant: 'destructive' });
    }
  });

  const sendPanelMutation = useMutation({
    mutationFn: async ({ channelId, guildId }: { channelId: string; guildId: string }) => {
      const response = await fetch('/api/discord/send-ticket-panel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, guildId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send ticket panel');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success!', description: 'Ticket panel sent successfully to the channel' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to send ticket panel', description: error.message, variant: 'destructive' });
    }
  });

  const deployTemplateMutation = useMutation({
    mutationFn: async ({ templateId, channelId }: { templateId: number; channelId: string }) => {
      const response = await apiRequest(`/api/templates/${templateId}/deploy`, {
        method: 'POST',
        body: JSON.stringify({ channelId }),
      });
      return response;
    },
    onSuccess: () => {
      toast({ title: 'Success!', description: 'Template deployed successfully to the channel' });
      queryClient.invalidateQueries({ queryKey: [`/api/templates/${selectedServerId}`] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to deploy template', description: error.message, variant: 'destructive' });
    }
  });

  // Handlers
  const handleSavePanel = () => {
    const data = panelForm.getValues();
    savePanelMutation.mutate(data);
  };

  const handleSendPanel = (channelId: string, guildId: string) => {
    sendPanelMutation.mutate({ channelId, guildId });
  };

  const handleSaveTemplate = (data: TemplateFormData) => {
    saveTemplateMutation.mutate(data);
  };

  const handleClearTemplate = () => {
    templateForm.reset({
      name: '',
      description: '',
      type: 'custom',
      embedTitle: '',
      embedDescription: '',
      embedColor: '#5865F2',
      embedUrl: '',
      showTimestamp: false,
      authorName: '',
      authorIconUrl: '',
      authorUrl: '',
      thumbnailUrl: '',
      imageUrl: '',
      footerText: '',
      footerIconUrl: '',
      fields: [],
      buttons: [],
    });
  };

  const loadTemplateForEdit = async (template: any) => {
    // Fetch full template details with fields and buttons
    const fullTemplate: any = await apiRequest(`/api/templates/detail/${template.id}`);
    
    setEditingTemplateId(template.id);
    setTemplateView('edit');
    
    templateForm.reset({
      name: fullTemplate.name,
      description: fullTemplate.description || '',
      type: fullTemplate.type,
      embedTitle: fullTemplate.embedTitle || '',
      embedDescription: fullTemplate.embedDescription || '',
      embedColor: fullTemplate.embedColor || '#5865F2',
      embedUrl: fullTemplate.embedUrl || '',
      showTimestamp: fullTemplate.showTimestamp || false,
      authorName: fullTemplate.authorName || '',
      authorIconUrl: fullTemplate.authorIconUrl || '',
      authorUrl: fullTemplate.authorUrl || '',
      thumbnailUrl: fullTemplate.thumbnailUrl || '',
      imageUrl: fullTemplate.imageUrl || '',
      footerText: fullTemplate.footerText || '',
      footerIconUrl: fullTemplate.footerIconUrl || '',
      fields: (fullTemplate.fields || []).map((f: any) => ({
        name: f.name,
        value: f.value,
        inline: f.inline,
      })),
      buttons: (fullTemplate.buttons || []).map((b: any) => ({
        label: b.label,
        emoji: b.emoji || '',
        style: b.buttonStyle,
        url: b.url || '',
        customId: b.customId,
        row: b.row || 1,
        position: b.position || 0,
      })),
    });
  };

  const handleFieldDragEnd = (result: any) => {
    if (!result.destination) return;
    moveField(result.source.index, result.destination.index);
  };

  const handleAddField = () => {
    if (templateFields.length >= 25) {
      toast({ title: 'Limit reached', description: 'Maximum 25 fields allowed', variant: 'destructive' });
      return;
    }
    appendField({ name: '', value: '', inline: false });
  };

  const handleAddButton = () => {
    if (templateButtons.length >= 25) {
      toast({ title: 'Limit reached', description: 'Maximum 25 buttons allowed', variant: 'destructive' });
      return;
    }
    appendButton({ 
      label: '', 
      emoji: '', 
      style: 'Primary', 
      url: '', 
      customId: `button_${Date.now()}`,
      row: 1,
      position: 0,
    });
  };

  const handleDeployTemplate = (channelId: string) => {
    if (deployMode === 'panel') {
      handleSendPanel(channelId, selectedServerId!);
    } else if (selectedTemplateId) {
      deployTemplateMutation.mutate({ 
        templateId: parseInt(selectedTemplateId), 
        channelId 
      });
    }
  };

  const watchedPanelValues = panelForm.watch();
  const previewData: PanelSettings = {
    title: watchedPanelValues.title,
    description: watchedPanelValues.description,
    embedColor: watchedPanelValues.embedColor,
    footerText: watchedPanelValues.footerText,
    showTimestamp: watchedPanelValues.showTimestamp,
  };

  const watchedTemplateValues = templateForm.watch();

  // Filter and sort templates
  const filteredTemplates = templates.filter((t: any) => 
    filterType === 'all' || t.type === filterType
  ).sort((a: any, b: any) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'lastUsed') return (b.lastUsed || 0) - (a.lastUsed || 0);
    if (sortBy === 'useCount') return (b.useCount || 0) - (a.useCount || 0);
    return 0;
  });

  if (!selectedServerId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500" />
            No Server Selected
          </CardTitle>
          <CardDescription>
            Please select a server to manage panel and embed settings.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isLoading = isLoadingPanel || isLoadingCategories;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading panel settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Panel & Embeds Management</h2>
        <p className="text-muted-foreground">
          Customize your ticket panel, manage templates, and deploy to Discord channels
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="design" className="flex items-center gap-2" data-testid="tab-design">
                <Palette className="h-4 w-4" />
                <span className="hidden sm:inline">Panel Design</span>
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex items-center gap-2" data-testid="tab-categories">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Categories</span>
              </TabsTrigger>
              <TabsTrigger value="templates" className="flex items-center gap-2" data-testid="tab-templates">
                <Layout className="h-4 w-4" />
                <span className="hidden sm:inline">Templates</span>
              </TabsTrigger>
              <TabsTrigger value="deploy" className="flex items-center gap-2" data-testid="tab-deploy">
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Deploy</span>
              </TabsTrigger>
            </TabsList>

            {/* PANEL DESIGN TAB */}
            <TabsContent value="design" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Panel Design Settings</CardTitle>
                  <CardDescription>
                    Customize the appearance of your ticket creation panel
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Panel Title</Label>
                    <Input
                      id="title"
                      placeholder="🎫 Support Ticket System"
                      {...panelForm.register('title')}
                      data-testid="input-panel-title"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Panel Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Enter panel description..."
                      className="min-h-[120px]"
                      {...panelForm.register('description')}
                      data-testid="input-panel-description"
                    />
                    <p className="text-xs text-muted-foreground">
                      Supports Discord markdown formatting
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Panel Color</Label>
                    <ColorPicker
                      color={panelForm.watch('embedColor')}
                      onChange={(color) => panelForm.setValue('embedColor', color)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="footerText">Footer Text</Label>
                    <Input
                      id="footerText"
                      placeholder="Click a button below to get started • Support Team"
                      {...panelForm.register('footerText')}
                      data-testid="input-panel-footer"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Show Timestamp</Label>
                      <p className="text-sm text-muted-foreground">
                        Display current timestamp in footer
                      </p>
                    </div>
                    <Switch
                      checked={panelForm.watch('showTimestamp')}
                      onCheckedChange={(checked) => panelForm.setValue('showTimestamp', checked)}
                      data-testid="switch-panel-timestamp"
                    />
                  </div>

                  <Separator />

                  <Button 
                    onClick={handleSavePanel} 
                    disabled={savePanelMutation.isPending}
                    className="w-full"
                    data-testid="button-save-panel"
                  >
                    {savePanelMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Panel Design
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* CATEGORIES TAB */}
            <TabsContent value="categories" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Category Buttons</CardTitle>
                  <CardDescription>
                    Manage category buttons shown in the panel (managed in Categories tab)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {categories.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Settings className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No categories found</p>
                      <p className="text-sm">Create categories in the Categories tab</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {categories.map((category: any) => (
                        <div key={category.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{category.emoji}</span>
                            <div>
                              <h4 className="font-medium">{category.name}</h4>
                              {category.description && (
                                <p className="text-sm text-muted-foreground">{category.description}</p>
                              )}
                            </div>
                          </div>
                          <Badge variant="secondary">{category.color}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TEMPLATES TAB */}
            <TabsContent value="templates" className="space-y-4 mt-4">
              {templateView === 'list' ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Templates</CardTitle>
                        <CardDescription>
                          Create and manage Discord embed templates
                        </CardDescription>
                      </div>
                      <Button 
                        onClick={() => {
                          setTemplateView('create');
                          setEditingTemplateId(null);
                          handleClearTemplate();
                        }}
                        data-testid="button-create-template"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create New Template
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Filters */}
                      <div className="flex gap-2">
                        <Select value={filterType} onValueChange={setFilterType}>
                          <SelectTrigger className="w-[180px]" data-testid="select-filter-type">
                            <Filter className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Filter by type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                            <SelectItem value="ticket">Ticket</SelectItem>
                            <SelectItem value="announcement">Announcement</SelectItem>
                            <SelectItem value="rules">Rules</SelectItem>
                            <SelectItem value="info">Info</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                          <SelectTrigger className="w-[180px]" data-testid="select-sort-by">
                            <ArrowUpDown className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Sort by" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="name">Name</SelectItem>
                            <SelectItem value="lastUsed">Last Used</SelectItem>
                            <SelectItem value="useCount">Use Count</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Template List */}
                      {isLoadingTemplates ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : filteredTemplates.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Layout className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No templates found</p>
                          <p className="text-sm">Create your first template to get started</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredTemplates.map((template: any) => (
                            <div key={template.id} className="p-4 border rounded-lg hover:bg-accent/50 transition-colors" data-testid={`template-item-${template.id}`}>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-medium text-lg">{template.name}</h4>
                                    <Badge variant="outline" data-testid={`badge-type-${template.type}`}>{template.type}</Badge>
                                  </div>
                                  {template.description && (
                                    <p className="text-sm text-muted-foreground mb-2">{template.description}</p>
                                  )}
                                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    {template.lastUsed && (
                                      <span>Last used: {new Date(template.lastUsed).toLocaleDateString()}</span>
                                    )}
                                    <span>Used {template.useCount || 0} times</span>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => loadTemplateForEdit(template)}
                                    data-testid={`button-edit-${template.id}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => duplicateTemplateMutation.mutate(template.id)}
                                    disabled={duplicateTemplateMutation.isPending}
                                    data-testid={`button-duplicate-${template.id}`}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        data-testid={`button-delete-${template.id}`}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Template?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will permanently delete "{template.name}". This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteTemplateMutation.mutate(template.id)}
                                          data-testid="button-confirm-delete"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <form onSubmit={templateForm.handleSubmit(handleSaveTemplate)} className="space-y-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>{editingTemplateId ? 'Edit Template' : 'Create Template'}</CardTitle>
                          <CardDescription>
                            Design a custom Discord embed template
                          </CardDescription>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setTemplateView('list');
                            setEditingTemplateId(null);
                          }}
                          data-testid="button-back-to-list"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Template Metadata */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Template Metadata</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="template-name">Name *</Label>
                            <Input
                              id="template-name"
                              placeholder="My Custom Template"
                              {...templateForm.register('name')}
                              data-testid="input-template-name"
                            />
                            {templateForm.formState.errors.name && (
                              <p className="text-sm text-destructive">{templateForm.formState.errors.name.message}</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="template-type">Type *</Label>
                            <Select
                              value={templateForm.watch('type')}
                              onValueChange={(value: any) => templateForm.setValue('type', value)}
                            >
                              <SelectTrigger id="template-type" data-testid="select-template-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="custom">Custom</SelectItem>
                                <SelectItem value="ticket">Ticket</SelectItem>
                                <SelectItem value="announcement">Announcement</SelectItem>
                                <SelectItem value="rules">Rules</SelectItem>
                                <SelectItem value="info">Info</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="template-description">Description</Label>
                          <Textarea
                            id="template-description"
                            placeholder="Describe what this template is for..."
                            {...templateForm.register('description')}
                            data-testid="input-template-description"
                          />
                        </div>
                      </div>

                      <Separator />

                      {/* Basic Embed Properties */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Embed Properties</h3>
                        <div className="space-y-2">
                          <Label htmlFor="embed-title">Embed Title (max 256 chars)</Label>
                          <Input
                            id="embed-title"
                            placeholder="Title goes here..."
                            {...templateForm.register('embedTitle')}
                            maxLength={256}
                            data-testid="input-embed-title"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="embed-description">Embed Description (max 4096 chars)</Label>
                          <Textarea
                            id="embed-description"
                            placeholder="Description goes here..."
                            className="min-h-[120px]"
                            {...templateForm.register('embedDescription')}
                            maxLength={4096}
                            data-testid="input-embed-description"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Embed Color</Label>
                            <ColorPicker
                              color={templateForm.watch('embedColor')}
                              onChange={(color) => templateForm.setValue('embedColor', color)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="embed-url">Embed URL (optional)</Label>
                            <Input
                              id="embed-url"
                              type="url"
                              placeholder="https://example.com"
                              {...templateForm.register('embedUrl')}
                              data-testid="input-embed-url"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Show Timestamp</Label>
                          <Switch
                            checked={templateForm.watch('showTimestamp')}
                            onCheckedChange={(checked) => templateForm.setValue('showTimestamp', checked)}
                            data-testid="switch-embed-timestamp"
                          />
                        </div>
                      </div>

                      <Separator />

                      {/* Author Section */}
                      <Collapsible open={!authorCollapsed} onOpenChange={(open) => setAuthorCollapsed(!open)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full justify-between" type="button" data-testid="toggle-author-section">
                            <span className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              Author Section (Optional)
                            </span>
                            {authorCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-4 space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="author-name">Author Name</Label>
                            <Input
                              id="author-name"
                              placeholder="Author name..."
                              {...templateForm.register('authorName')}
                              maxLength={256}
                              data-testid="input-author-name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="author-icon">Author Icon URL</Label>
                            <Input
                              id="author-icon"
                              type="url"
                              placeholder="https://example.com/icon.png"
                              {...templateForm.register('authorIconUrl')}
                              data-testid="input-author-icon-url"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="author-url">Author URL</Label>
                            <Input
                              id="author-url"
                              type="url"
                              placeholder="https://example.com"
                              {...templateForm.register('authorUrl')}
                              data-testid="input-author-url"
                            />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                      {/* Images Section */}
                      <Collapsible open={!imagesCollapsed} onOpenChange={(open) => setImagesCollapsed(!open)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full justify-between" type="button" data-testid="toggle-images-section">
                            <span className="flex items-center gap-2">
                              <Image className="h-4 w-4" />
                              Images Section (Optional)
                            </span>
                            {imagesCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-4 space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="thumbnail-url">Thumbnail URL (shows on right)</Label>
                            <Input
                              id="thumbnail-url"
                              type="url"
                              placeholder="https://example.com/thumb.png"
                              {...templateForm.register('thumbnailUrl')}
                              data-testid="input-thumbnail-url"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="image-url">Main Image URL (shows below description)</Label>
                            <Input
                              id="image-url"
                              type="url"
                              placeholder="https://example.com/image.png"
                              {...templateForm.register('imageUrl')}
                              data-testid="input-image-url"
                            />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                      {/* Footer Section */}
                      <Collapsible open={!footerCollapsed} onOpenChange={(open) => setFooterCollapsed(!open)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full justify-between" type="button" data-testid="toggle-footer-section">
                            <span className="flex items-center gap-2">
                              <Type className="h-4 w-4" />
                              Footer Section (Optional)
                            </span>
                            {footerCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-4 space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="footer-text">Footer Text (max 2048 chars)</Label>
                            <Input
                              id="footer-text"
                              placeholder="Footer text..."
                              {...templateForm.register('footerText')}
                              maxLength={2048}
                              data-testid="input-footer-text"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="footer-icon">Footer Icon URL</Label>
                            <Input
                              id="footer-icon"
                              type="url"
                              placeholder="https://example.com/footer-icon.png"
                              {...templateForm.register('footerIconUrl')}
                              data-testid="input-footer-icon-url"
                            />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                      <Separator />

                      {/* Fields Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold">Fields ({templateFields.length}/25)</h3>
                            <p className="text-sm text-muted-foreground">Add embed fields to organize information</p>
                          </div>
                          <Button
                            type="button"
                            onClick={handleAddField}
                            disabled={templateFields.length >= 25}
                            size="sm"
                            data-testid="button-add-field"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Field
                          </Button>
                        </div>

                        {templateFields.length > 0 && (
                          <DragDropContext onDragEnd={handleFieldDragEnd}>
                            <Droppable droppableId="fields">
                              {(provided) => (
                                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                  {templateFields.map((field, index) => (
                                    <Draggable key={field.id} draggableId={field.id} index={index}>
                                      {(provided) => (
                                        <div
                                          ref={provided.innerRef}
                                          {...provided.draggableProps}
                                          className="border rounded-lg p-4 space-y-3 bg-card"
                                          data-testid={`field-item-${index}`}
                                        >
                                          <div className="flex items-start gap-2">
                                            <div {...provided.dragHandleProps} className="mt-2">
                                              <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />
                                            </div>
                                            <div className="flex-1 space-y-3">
                                              <div className="grid grid-cols-2 gap-2">
                                                <Input
                                                  placeholder="Field name (max 256)"
                                                  {...templateForm.register(`fields.${index}.name`)}
                                                  maxLength={256}
                                                  data-testid={`input-field-name-${index}`}
                                                />
                                                <div className="flex items-center gap-2">
                                                  <Label className="text-sm whitespace-nowrap">Inline</Label>
                                                  <Switch
                                                    checked={templateForm.watch(`fields.${index}.inline`)}
                                                    onCheckedChange={(checked) => templateForm.setValue(`fields.${index}.inline`, checked)}
                                                    data-testid={`switch-field-inline-${index}`}
                                                  />
                                                </div>
                                              </div>
                                              <Textarea
                                                placeholder="Field value (max 1024)"
                                                {...templateForm.register(`fields.${index}.value`)}
                                                maxLength={1024}
                                                data-testid={`input-field-value-${index}`}
                                              />
                                            </div>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => removeField(index)}
                                              data-testid={`button-remove-field-${index}`}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          </DragDropContext>
                        )}
                      </div>

                      <Separator />

                      {/* Buttons Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold">Buttons ({templateButtons.length}/25)</h3>
                            <p className="text-sm text-muted-foreground">Add interactive buttons below the embed</p>
                          </div>
                          <Button
                            type="button"
                            onClick={handleAddButton}
                            disabled={templateButtons.length >= 25}
                            size="sm"
                            data-testid="button-add-button"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Button
                          </Button>
                        </div>
                        
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                          <div className="flex gap-2">
                            <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div className="space-y-1 text-sm">
                              <p className="font-medium text-blue-500">Discord Button Limitations</p>
                              <p className="text-muted-foreground">
                                Discord provides 5 preset button styles with fixed colors. Custom hex colors are not supported by Discord's API. 
                                The 5 styles are: <strong>Primary</strong> (blurple), <strong>Secondary</strong> (gray), <strong>Success</strong> (green), 
                                <strong>Danger</strong> (red), and <strong>Link</strong> (for external URLs).
                              </p>
                            </div>
                          </div>
                        </div>

                        {templateButtons.length > 0 && (
                          <div className="space-y-2">
                            {templateButtons.map((button, index) => (
                              <div key={button.id} className="border rounded-lg p-4 space-y-3 bg-card" data-testid={`button-item-${index}`}>
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 space-y-3">
                                    <div className="space-y-2">
                                      <Label className="text-sm font-medium">Button Label & Emoji</Label>
                                      <div className="grid grid-cols-2 gap-2">
                                        <Input
                                          placeholder="Label (max 80)"
                                          {...templateForm.register(`buttons.${index}.label`)}
                                          maxLength={80}
                                          data-testid={`input-button-label-${index}`}
                                        />
                                        <EmojiPicker
                                          value={templateForm.watch(`buttons.${index}.emoji`) || ''}
                                          onChange={(emoji) => templateForm.setValue(`buttons.${index}.emoji`, emoji)}
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-sm font-medium">Button Style (Discord Colors)</Label>
                                      <ButtonStyleSelector
                                        value={templateForm.watch(`buttons.${index}.style`)}
                                        onChange={(style) => templateForm.setValue(`buttons.${index}.style`, style)}
                                      />
                                      <p className="text-xs text-muted-foreground">
                                        ⓘ Discord only supports 5 preset button styles. Custom hex colors are not available.
                                      </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="space-y-2">
                                        <Label className="text-xs">Row (1-5)</Label>
                                        <Input
                                          type="number"
                                          placeholder="Row"
                                          min={1}
                                          max={5}
                                          {...templateForm.register(`buttons.${index}.row`, { valueAsNumber: true })}
                                          data-testid={`input-button-row-${index}`}
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-xs">Position (0-4)</Label>
                                        <Input
                                          type="number"
                                          placeholder="Position"
                                          min={0}
                                          max={4}
                                          {...templateForm.register(`buttons.${index}.position`, { valueAsNumber: true })}
                                          data-testid={`input-button-position-${index}`}
                                        />
                                      </div>
                                    </div>
                                    {templateForm.watch(`buttons.${index}.style`) === 'Link' && (
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium">Link URL</Label>
                                        <Input
                                          type="url"
                                          placeholder="https://example.com (required for Link style)"
                                          {...templateForm.register(`buttons.${index}.url`)}
                                          data-testid={`input-button-url-${index}`}
                                        />
                                      </div>
                                    )}
                                    <div className="space-y-2">
                                      <Label className="text-sm font-medium">Custom ID</Label>
                                      <Input
                                        placeholder="button_custom_action"
                                        {...templateForm.register(`buttons.${index}.customId`)}
                                        maxLength={100}
                                        data-testid={`input-button-customId-${index}`}
                                      />
                                      <p className="text-xs text-muted-foreground">
                                        Used to identify button clicks in Discord interactions
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeButton(index)}
                                    data-testid={`button-remove-button-${index}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          className="flex-1"
                          disabled={saveTemplateMutation.isPending}
                          data-testid="button-save-template"
                        >
                          {saveTemplateMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              {editingTemplateId ? 'Update Template' : 'Save Template'}
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleClearTemplate}
                          data-testid="button-clear-template"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Clear Form
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </form>
              )}
            </TabsContent>

            {/* DEPLOY TAB */}
            <TabsContent value="deploy" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Deploy to Discord</CardTitle>
                  <CardDescription>
                    Send your customized panel or template to Discord channels
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Deployment Mode Selection */}
                  <div className="space-y-2">
                    <Label>Deployment Type</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={deployMode === 'panel' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => setDeployMode('panel')}
                        data-testid="button-deploy-mode-panel"
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Ticket Panel
                      </Button>
                      <Button
                        type="button"
                        variant={deployMode === 'template' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => setDeployMode('template')}
                        data-testid="button-deploy-mode-template"
                      >
                        <Layout className="h-4 w-4 mr-2" />
                        Custom Template
                      </Button>
                    </div>
                  </div>

                  {/* Template Selection */}
                  {deployMode === 'template' && (
                    <div className="space-y-2">
                      <Label htmlFor="template-select">Select Template</Label>
                      <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                        <SelectTrigger id="template-select" data-testid="select-template-deploy">
                          <SelectValue placeholder="Choose a template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template: any) => (
                            <SelectItem key={template.id} value={template.id.toString()}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedTemplateId && (
                        <p className="text-sm text-muted-foreground">
                          Selected: {templates.find((t: any) => t.id.toString() === selectedTemplateId)?.name}
                        </p>
                      )}
                    </div>
                  )}

                  <Separator />

                  {/* Channel List */}
                  {!channelData?.servers?.length ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No Discord servers found</p>
                      <p className="text-sm">Invite the bot to your server first</p>
                    </div>
                  ) : (
                    channelData.servers.map((server) => (
                      <div key={server.id} className="space-y-3">
                        <h4 className="font-medium">{server.name}</h4>
                        <div className="space-y-2">
                          {server.channels.map((channel) => (
                            <div key={channel.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-2">
                                <Hash className="h-4 w-4" />
                                <span className="font-medium">{channel.name}</span>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleDeployTemplate(channel.id)}
                                disabled={
                                  !channel.permissions?.canSendMessages || 
                                  !channel.permissions?.canEmbedLinks ||
                                  (deployMode === 'template' && !selectedTemplateId) ||
                                  sendPanelMutation.isPending ||
                                  deployTemplateMutation.isPending
                                }
                                data-testid={`button-deploy-channel-${channel.id}`}
                              >
                                {(sendPanelMutation.isPending || deployTemplateMutation.isPending) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Send className="h-4 w-4 mr-1" />
                                    Deploy
                                  </>
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="lg:col-span-1">
          {activeSubTab === 'templates' && (templateView === 'create' || templateView === 'edit') ? (
            <TemplateLivePreview template={watchedTemplateValues} />
          ) : (
            <LivePreview settings={previewData} categories={categories} />
          )}
        </div>
      </div>
    </div>
  );
}
