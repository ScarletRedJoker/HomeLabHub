import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useServerContext } from '@/contexts/ServerContext';
import { 
  Loader2, Plus, Trash2, Edit, Save, X, Eye, EyeOff, 
  Copy, Calendar, Hash, Link2, Image as ImageIcon, User, Type,
  ChevronUp, ChevronDown, GripVertical, Info, Palette, Send, Upload
} from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Custom sanitize schema to allow span tags with style attributes for channel mentions
const customSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'span'],
  attributes: {
    ...defaultSchema.attributes,
    span: ['style', 'className']
  },
  css: {
    properties: ['color', 'cursor', 'background-color', 'font-weight', 'text-decoration']
  }
};

// Schema for panel template validation
const panelTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  type: z.enum(['custom', 'ticket', 'announcement', 'rules', 'info']),
  embedTitle: z.string().max(256, 'Title too long').optional(),
  embedDescription: z.string().max(4096, 'Description too long').optional(),
  embedColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
  embedUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  authorName: z.string().max(256, 'Author name too long').optional(),
  authorIconUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  authorUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  thumbnailUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  imageUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  footerText: z.string().max(2048, 'Footer text too long').optional(),
  footerIconUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  showTimestamp: z.boolean(),
  isEnabled: z.boolean(),
  isTicketPanel: z.boolean(),
  fields: z.array(z.object({
    name: z.string().min(1, 'Field name is required').max(256),
    value: z.string().min(1, 'Field value is required').max(1024),
    inline: z.boolean(),
    isEnabled: z.boolean()
  })),
  buttons: z.array(z.object({
    customId: z.string().min(1, 'Custom ID is required').max(100),
    label: z.string().min(1, 'Label is required').max(80),
    emoji: z.string().max(100).optional(),
    buttonStyle: z.enum(['Primary', 'Secondary', 'Success', 'Danger', 'Link']),
    url: z.string().url('Invalid URL').optional().or(z.literal('')),
    actionType: z.enum(['custom', 'role_toggle', 'url', 'ticket_create']),
    actionData: z.string().optional(),
    row: z.number().min(1).max(5),
    position: z.number().min(0),
    isEnabled: z.boolean(),
    requiresRole: z.string().optional()
  }))
});

type PanelTemplate = z.infer<typeof panelTemplateSchema> & {
  id?: number;
  useCount?: number;
  lastUsed?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

// Utility function to process channel mentions in text
function processChannelMentions(text: string, channels: Array<{id: string, name: string}>): string {
  if (!text) return text;
  
  // Regex to find <#channelId> patterns
  const channelMentionRegex = /<#(\d+)>/g;
  
  return text.replace(channelMentionRegex, (match, channelId) => {
    const channel = channels.find(c => c.id === channelId);
    if (channel) {
      // Return styled channel name with Discord blue color
      return `<span style="color: #00b0f4; cursor: pointer;">#${channel.name}</span>`;
    }
    // If channel not found, keep original format
    return match;
  });
}

// Image Upload Field Component
interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  label: string;
  id: string;
  error?: string;
}

function ImageUploadField({ value, onChange, label, id, error }: ImageUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(value || null);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setPreviewUrl(value || null);
    if (value) {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
      };
      img.src = value;
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file');
      toast({
        title: 'Invalid File',
        description: 'Please select an image file (JPEG, PNG, GIF, or WebP)',
        variant: 'destructive'
      });
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setUploadError('Image must be less than 8MB');
      toast({
        title: 'File Too Large',
        description: 'Image must be less than 8MB for Discord embeds',
        variant: 'destructive'
      });
      return;
    }

    // Create instant preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Get image dimensions
    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.width, height: img.height });
    };
    img.src = objectUrl;

    setUploadError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/uploads/embed-image', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
      }

      const data = await response.json();
      
      if (data.url) {
        onChange(data.url);
        setPreviewUrl(data.url);
        toast({
          title: 'Success',
          description: 'Image uploaded successfully'
        });
      } else {
        throw new Error('No URL returned from server');
      }
    } catch (error: any) {
      setUploadError(error.message || 'Upload failed');
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload image',
        variant: 'destructive'
      });
      // Revert to original value
      setPreviewUrl(value || null);
    } finally {
      setIsUploading(false);
      // Clean up object URL if it was created
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  };

  const handleRemoveImage = () => {
    onChange('');
    setPreviewUrl(null);
    setImageDimensions(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      
      <div className="flex gap-2">
        <Input
          id={id}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/image.png or upload an image"
          data-testid={`input-${id}`}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          data-testid={`file-input-${id}`}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          data-testid={`button-upload-${id}`}
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
        </Button>
        {previewUrl && (
          <Button
            type="button"
            variant="outline"
            onClick={handleRemoveImage}
            disabled={isUploading}
            data-testid={`button-remove-${id}`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {uploadError && (
        <p className="text-sm text-destructive" data-testid={`error-${id}`}>
          {uploadError}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {previewUrl && (
        <div className="relative rounded-lg border p-2 bg-muted" data-testid={`preview-${id}`}>
          <img
            src={previewUrl}
            alt="Preview"
            className="w-full max-w-xs rounded"
            data-testid={`preview-image-${id}`}
          />
          {imageDimensions && (
            <p className="text-xs text-muted-foreground mt-2" data-testid={`dimensions-${id}`}>
              {imageDimensions.width} × {imageDimensions.height}
            </p>
          )}
        </div>
      )}

      {isUploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid={`uploading-${id}`}>
          <Loader2 className="h-3 w-3 animate-spin" />
          Uploading...
        </div>
      )}
    </div>
  );
}

function TemplatePreview({ template, channels = [] }: { template: PanelTemplate; channels?: Array<{id: string, name: string}> }) {
  return (
    <div className="bg-[#2b2d31] rounded-lg p-4 shadow-lg">
      <div className="bg-[#2b2d31] rounded-lg border-l-4" style={{ borderColor: template.embedColor }}>
        <div className="p-4">
          {/* Author */}
          {template.authorName && (
            <div className="flex items-center gap-2 mb-2">
              {template.authorIconUrl && (
                <img src={template.authorIconUrl} alt="" className="w-6 h-6 rounded-full" />
              )}
              <span className="text-sm font-semibold text-white">
                {template.authorUrl ? (
                  <a href={template.authorUrl} className="hover:underline" target="_blank" rel="noopener noreferrer">
                    {template.authorName}
                  </a>
                ) : (
                  template.authorName
                )}
              </span>
            </div>
          )}

          {/* Title */}
          {template.embedTitle && (
            <div className="mb-2">
              {template.embedUrl ? (
                <a href={template.embedUrl} className="text-[#00b0f4] hover:underline text-lg font-bold [&>*]:inline" target="_blank" rel="noopener noreferrer">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, customSanitizeSchema]]}>
                    {template.embedTitle}
                  </ReactMarkdown>
                </a>
              ) : (
                <h3 className="text-white text-lg font-bold [&>*]:inline">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, customSanitizeSchema]]}>
                    {template.embedTitle}
                  </ReactMarkdown>
                </h3>
              )}
            </div>
          )}

          {/* Thumbnail (float right) */}
          {template.thumbnailUrl && (
            <img src={template.thumbnailUrl} alt="" className="float-right ml-4 mb-2 w-20 h-20 rounded object-cover" />
          )}

          {/* Description */}
          {template.embedDescription && (
            <div className="text-[#dcddde] text-sm mb-3 whitespace-pre-wrap">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, customSanitizeSchema]]}>
                {processChannelMentions(template.embedDescription, channels)}
              </ReactMarkdown>
            </div>
          )}

          {/* Fields */}
          {template.fields.filter(f => f.isEnabled).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
              {template.fields.filter(f => f.isEnabled).map((field, idx) => (
                <div key={idx} className={field.inline ? '' : 'col-span-full'}>
                  <div className="text-[#f2f3f5] text-xs font-semibold mb-1 [&>*]:inline">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, customSanitizeSchema]]}>
                      {field.name}
                    </ReactMarkdown>
                  </div>
                  <div className="text-[#dcddde] text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, customSanitizeSchema]]}>
                      {processChannelMentions(field.value, channels)}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Image */}
          {template.imageUrl && (
            <img src={template.imageUrl} alt="" className="w-full max-w-md rounded mb-3" />
          )}

          {/* Footer */}
          {(template.footerText || template.showTimestamp) && (
            <div className="flex items-center gap-2 text-xs text-[#72767d] mt-3">
              {template.footerIconUrl && (
                <img src={template.footerIconUrl} alt="" className="w-5 h-5 rounded-full" />
              )}
              {template.footerText && (
                <span className="[&>*]:inline">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, customSanitizeSchema]]}>
                    {processChannelMentions(template.footerText, channels)}
                  </ReactMarkdown>
                </span>
              )}
              {template.footerText && template.showTimestamp && <span>•</span>}
              {template.showTimestamp && <span>{new Date().toLocaleString()}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Buttons */}
      {template.buttons.filter(b => b.isEnabled).length > 0 && (
        <div className="mt-3 space-y-2">
          {[1, 2, 3, 4, 5].map(row => {
            const rowButtons = template.buttons
              .filter(b => b.isEnabled && b.row === row)
              .sort((a, b) => a.position - b.position);
            
            if (rowButtons.length === 0) return null;
            
            return (
              <div key={row} className="flex gap-2">
                {rowButtons.map((button, idx) => {
                  const styleClasses = {
                    Primary: 'bg-[#5865f2] hover:bg-[#4752c4] text-white',
                    Secondary: 'bg-[#4f545c] hover:bg-[#5d6269] text-white',
                    Success: 'bg-[#3ba55c] hover:bg-[#2d7d46] text-white',
                    Danger: 'bg-[#ed4245] hover:bg-[#c03537] text-white',
                    Link: 'bg-[#4f545c] hover:bg-[#5d6269] text-[#00b0f4]'
                  };
                  
                  return (
                    <button
                      key={idx}
                      className={`px-4 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors ${styleClasses[button.buttonStyle]}`}
                    >
                      {button.emoji && <span>{button.emoji}</span>}
                      {button.label}
                      {button.buttonStyle === 'Link' && <Link2 className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

interface Server {
  id: string;
  name: string;
  channels: Channel[];
}

export default function PanelTemplates() {
  const { selectedServerId } = useServerContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [editingTemplate, setEditingTemplate] = useState<PanelTemplate | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [activeTab, setActiveTab] = useState('templates');
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PanelTemplate | null>(null);
  const [selectedTargetServer, setSelectedTargetServer] = useState<string>('');
  const [selectedTargetChannel, setSelectedTargetChannel] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  
  // Fetch templates
  const { data: templates, isLoading } = useQuery({
    queryKey: [`/api/panel-templates/${selectedServerId}`],
    queryFn: () => fetch(`/api/panel-templates/${selectedServerId}`).then(res => res.json()),
    enabled: !!selectedServerId
  });
  
  // Fetch available Discord channels for send dialog
  const { data: channelData } = useQuery<{ servers: Server[] }>({
    queryKey: ['/api/discord/channels'],
    queryFn: () => fetch('/api/discord/channels').then(res => res.json()),
    enabled: sendDialogOpen
  });

  // Fetch server info with channels for current server (for preview)
  const { data: serverInfo } = useQuery<{ channels: Channel[] }>({
    queryKey: [`/api/discord/server-info/${selectedServerId}`],
    queryFn: () => fetch(`/api/discord/server-info/${selectedServerId}`, {
      credentials: 'include'
    }).then(res => res.json()),
    enabled: !!selectedServerId && activeTab === 'editor'
  });
  
  // Form setup
  const form = useForm<PanelTemplate>({
    resolver: zodResolver(panelTemplateSchema),
    defaultValues: {
      name: '',
      description: '',
      type: 'custom',
      embedTitle: '',
      embedDescription: '',
      embedColor: '#5865F2',
      embedUrl: '',
      authorName: '',
      authorIconUrl: '',
      authorUrl: '',
      thumbnailUrl: '',
      imageUrl: '',
      footerText: '',
      footerIconUrl: '',
      showTimestamp: false,
      isEnabled: true,
      isTicketPanel: false,
      fields: [],
      buttons: []
    }
  });
  
  const { fields: formFields, append: appendField, remove: removeField, move: moveField } = useFieldArray({
    control: form.control,
    name: 'fields'
  });
  
  const { fields: formButtons, append: appendButton, remove: removeButton, move: moveButton } = useFieldArray({
    control: form.control,
    name: 'buttons'
  });
  
  // Create/Update template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: PanelTemplate) => {
      const url = editingTemplate?.id 
        ? `/api/panel-templates/${selectedServerId}/${editingTemplate.id}`
        : `/api/panel-templates/${selectedServerId}`;
      
      const response = await fetch(url, {
        method: editingTemplate?.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          template: data, 
          fields: data.fields, 
          buttons: data.buttons 
        }),
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to save template');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Template saved successfully' });
      queryClient.invalidateQueries({ queryKey: [`/api/panel-templates/${selectedServerId}`] });
      setEditingTemplate(null);
      form.reset();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
    }
  });
  
  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await fetch(`/api/panel-templates/${selectedServerId}/${templateId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete template');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Template deleted successfully' });
      queryClient.invalidateQueries({ queryKey: [`/api/panel-templates/${selectedServerId}`] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete template', variant: 'destructive' });
    }
  });
  
  const handleEditTemplate = (template: PanelTemplate) => {
    setEditingTemplate(template);
    form.reset(template);
    setActiveTab('editor');
  };
  
  const handleNewTemplate = () => {
    setEditingTemplate(null);
    form.reset();
    setActiveTab('editor');
  };
  
  const handleOpenSendDialog = (template: PanelTemplate) => {
    setSelectedTemplate(template);
    setSendDialogOpen(true);
    setSelectedTargetServer('');
    setSelectedTargetChannel('');
  };
  
  const handleSendTemplate = async () => {
    if (!selectedTemplate || !selectedTargetChannel || !selectedTargetServer) {
      toast({
        title: 'Missing Information',
        description: 'Please select both a server and channel.',
        variant: 'destructive'
      });
      return;
    }
    
    setIsSending(true);
    try {
      const response = await fetch('/api/discord/send-panel-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          channelId: selectedTargetChannel,
          guildId: selectedTargetServer,
          templateId: selectedTemplate.id
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send template');
      }
      
      toast({
        title: 'Success!',
        description: 'Template sent to channel successfully.'
      });
      
      setSendDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Failed to send template',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsSending(false);
    }
  };
  
  const handleSaveTemplate = form.handleSubmit((data) => {
    saveTemplateMutation.mutate(data);
  });
  
  const handleCancelEdit = () => {
    setEditingTemplate(null);
    form.reset();
    setActiveTab('templates');
  };
  
  const addField = () => {
    appendField({
      name: 'Field Name',
      value: 'Field Value',
      inline: false,
      isEnabled: true
    });
  };
  
  const addButton = () => {
    const newRow = Math.min(Math.ceil((formButtons.length + 1) / 5), 5);
    const position = formButtons.filter(b => b.row === newRow).length;
    
    appendButton({
      customId: `button_${Date.now()}`,
      label: 'Button',
      emoji: '',
      buttonStyle: 'Primary',
      url: '',
      actionType: 'custom',
      actionData: '',
      row: newRow,
      position: position,
      isEnabled: true,
      requiresRole: ''
    });
  };
  
  if (!selectedServerId) {
    return (
      <Alert>
        <AlertDescription>Please select a server to manage panel templates.</AlertDescription>
      </Alert>
    );
  }
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Panel Templates</span>
            <Button onClick={handleNewTemplate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="editor" disabled={!editingTemplate && activeTab !== 'editor'}>
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="templates" className="space-y-4">
              {templates?.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    No templates created yet. Click "New Template" to create your first panel template.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {templates?.map((template: PanelTemplate) => (
                    <Card key={template.id} className="relative">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold">{template.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {template.type}
                              </Badge>
                              {template.isTicketPanel && (
                                <Badge variant="secondary" className="text-xs">
                                  Ticket Panel
                                </Badge>
                              )}
                              {!template.isEnabled && (
                                <Badge variant="destructive" className="text-xs">
                                  Disabled
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenSendDialog(template)}
                              title="Send to Channel"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditTemplate(template)}
                              title="Edit Template"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteTemplateMutation.mutate(template.id!)}
                              title="Delete Template"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {template.useCount !== undefined && (
                            <span>Used {template.useCount} times</span>
                          )}
                          {template.lastUsed && (
                            <span>Last: {new Date(template.lastUsed).toLocaleDateString()}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="editor" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Editor Section */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Template Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Template Name*</Label>
                        <Input
                          id="name"
                          {...form.register('name')}
                          placeholder="My Custom Panel"
                        />
                        {form.formState.errors.name && (
                          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                        )}
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          {...form.register('description')}
                          placeholder="Describe this template..."
                          rows={2}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="type">Type</Label>
                          <Select value={form.watch('type')} onValueChange={(value) => form.setValue('type', value as any)}>
                            <SelectTrigger>
                              <SelectValue />
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
                        
                        <div className="grid gap-2">
                          <Label htmlFor="embedColor">Embed Color</Label>
                          <div className="flex gap-2">
                            <Input
                              id="embedColor"
                              {...form.register('embedColor')}
                              placeholder="#5865F2"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setShowColorPicker(!showColorPicker)}
                            >
                              <Palette className="h-4 w-4" />
                            </Button>
                          </div>
                          {showColorPicker && (
                            <div className="absolute z-10 mt-2">
                              <div className="fixed inset-0" onClick={() => setShowColorPicker(false)} />
                              <HexColorPicker color={form.watch('embedColor')} onChange={(color: string) => form.setValue('embedColor', color)} />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="showTimestamp"
                            checked={form.watch('showTimestamp')}
                            onCheckedChange={(checked) => form.setValue('showTimestamp', checked)}
                          />
                          <Label htmlFor="showTimestamp">Show Timestamp</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="isEnabled"
                            checked={form.watch('isEnabled')}
                            onCheckedChange={(checked) => form.setValue('isEnabled', checked)}
                          />
                          <Label htmlFor="isEnabled">Enabled</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="isTicketPanel"
                            checked={form.watch('isTicketPanel')}
                            onCheckedChange={(checked) => form.setValue('isTicketPanel', checked)}
                          />
                          <Label htmlFor="isTicketPanel">Ticket Panel</Label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Embed Content</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="embedTitle">Title</Label>
                        <Input
                          id="embedTitle"
                          {...form.register('embedTitle')}
                          placeholder="Panel Title"
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="embedDescription">Description</Label>
                        <Textarea
                          id="embedDescription"
                          {...form.register('embedDescription')}
                          placeholder="Panel description..."
                          rows={4}
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="embedUrl">Title URL</Label>
                        <Input
                          id="embedUrl"
                          {...form.register('embedUrl')}
                          placeholder="https://example.com"
                        />
                      </div>
                      
                      <Separator />
                      
                      <div className="grid gap-2">
                        <Label htmlFor="authorName">Author Name</Label>
                        <Input
                          id="authorName"
                          {...form.register('authorName')}
                          placeholder="Author"
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="authorIconUrl">Author Icon URL</Label>
                        <Input
                          id="authorIconUrl"
                          {...form.register('authorIconUrl')}
                          placeholder="https://example.com/icon.png"
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="authorUrl">Author URL</Label>
                        <Input
                          id="authorUrl"
                          {...form.register('authorUrl')}
                          placeholder="https://example.com"
                        />
                      </div>
                      
                      <Separator />
                      
                      <div className="grid gap-2">
                        <Label htmlFor="thumbnailUrl">Thumbnail URL</Label>
                        <Input
                          id="thumbnailUrl"
                          {...form.register('thumbnailUrl')}
                          placeholder="https://example.com/thumb.png"
                        />
                      </div>
                      
                      <ImageUploadField
                        id="imageUrl"
                        label="Image URL"
                        value={form.watch('imageUrl') || ''}
                        onChange={(url) => form.setValue('imageUrl', url)}
                        error={form.formState.errors.imageUrl?.message}
                      />
                      
                      <Separator />
                      
                      <div className="grid gap-2">
                        <Label htmlFor="footerText">Footer Text</Label>
                        <Input
                          id="footerText"
                          {...form.register('footerText')}
                          placeholder="Footer text"
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="footerIconUrl">Footer Icon URL</Label>
                        <Input
                          id="footerIconUrl"
                          {...form.register('footerIconUrl')}
                          placeholder="https://example.com/footer-icon.png"
                        />
                      </div>
                    </CardContent>
                  </Card>
                  
                  {!form.watch('isTicketPanel') && (
                    <>
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle>Fields</CardTitle>
                            <Button onClick={addField} size="sm" variant="outline">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {formFields.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No fields added yet</p>
                          ) : (
                            formFields.map((field, index) => (
                              <Card key={field.id} className="p-3">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => index > 0 && moveField(index, index - 1)}
                                        disabled={index === 0}
                                      >
                                        <ChevronUp className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => index < formFields.length - 1 && moveField(index, index + 1)}
                                        disabled={index === formFields.length - 1}
                                      >
                                        <ChevronDown className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={form.watch(`fields.${index}.isEnabled`)}
                                        onCheckedChange={(checked) => form.setValue(`fields.${index}.isEnabled`, checked)}
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeField(index)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="grid gap-2">
                                    <Input
                                      {...form.register(`fields.${index}.name`)}
                                      placeholder="Field Name"
                                    />
                                    <Textarea
                                      {...form.register(`fields.${index}.value`)}
                                      placeholder="Field Value"
                                      rows={2}
                                    />
                                    <div className="flex items-center space-x-2">
                                      <Switch
                                        id={`fields.${index}.inline`}
                                        checked={form.watch(`fields.${index}.inline`)}
                                        onCheckedChange={(checked) => form.setValue(`fields.${index}.inline`, checked)}
                                      />
                                      <Label htmlFor={`fields.${index}.inline`}>Inline</Label>
                                    </div>
                                  </div>
                                </div>
                              </Card>
                            ))
                          )}
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle>Buttons</CardTitle>
                            <Button onClick={addButton} size="sm" variant="outline" disabled={formButtons.length >= 25}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {formButtons.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No buttons added yet</p>
                          ) : (
                            formButtons.map((button, index) => (
                              <Card key={button.id} className="p-3">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Row {form.watch(`buttons.${index}.row`)}, Position {form.watch(`buttons.${index}.position`)}</span>
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={form.watch(`buttons.${index}.isEnabled`)}
                                        onCheckedChange={(checked) => form.setValue(`buttons.${index}.isEnabled`, checked)}
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeButton(index)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      {...form.register(`buttons.${index}.label`)}
                                      placeholder="Button Label"
                                    />
                                    <Input
                                      {...form.register(`buttons.${index}.emoji`)}
                                      placeholder="Emoji (optional)"
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      {...form.register(`buttons.${index}.customId`)}
                                      placeholder="Custom ID"
                                    />
                                    <Select 
                                      value={form.watch(`buttons.${index}.buttonStyle`)} 
                                      onValueChange={(value) => form.setValue(`buttons.${index}.buttonStyle`, value as any)}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Primary">Primary (Blue)</SelectItem>
                                        <SelectItem value="Secondary">Secondary (Gray)</SelectItem>
                                        <SelectItem value="Success">Success (Green)</SelectItem>
                                        <SelectItem value="Danger">Danger (Red)</SelectItem>
                                        <SelectItem value="Link">Link</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  {form.watch(`buttons.${index}.buttonStyle`) === 'Link' && (
                                    <Input
                                      {...form.register(`buttons.${index}.url`)}
                                      placeholder="URL (for Link buttons)"
                                    />
                                  )}
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      type="number"
                                      {...form.register(`buttons.${index}.row`, { valueAsNumber: true })}
                                      placeholder="Row (1-5)"
                                      min={1}
                                      max={5}
                                    />
                                    <Input
                                      type="number"
                                      {...form.register(`buttons.${index}.position`, { valueAsNumber: true })}
                                      placeholder="Position"
                                      min={0}
                                    />
                                  </div>
                                </div>
                              </Card>
                            ))
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>
                
                {/* Preview Section */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Live Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Alert className="mb-4">
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Channel Linking:</strong> Use <code>&lt;#channelId&gt;</code> to link to a channel. 
                          The preview will show the channel name styled in Discord blue.
                        </AlertDescription>
                      </Alert>
                      <ScrollArea className="h-[600px] w-full">
                        <TemplatePreview template={form.watch()} channels={serverInfo?.channels || []} />
                      </ScrollArea>
                    </CardContent>
                  </Card>
                  
                  <div className="flex gap-2">
                    <Button onClick={handleSaveTemplate} className="flex-1">
                      <Save className="h-4 w-4 mr-2" />
                      {editingTemplate ? 'Update Template' : 'Create Template'}
                    </Button>
                    <Button onClick={handleCancelEdit} variant="outline">
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Send to Channel Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Send Template to Discord Channel</DialogTitle>
            <DialogDescription>
              Select a server and channel to send the "{selectedTemplate?.name}" template.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Server Selection */}
            <div className="space-y-2">
              <Label htmlFor="server-select">Server</Label>
              <Select 
                value={selectedTargetServer} 
                onValueChange={setSelectedTargetServer}
                disabled={!channelData?.servers?.length}
              >
                <SelectTrigger id="server-select">
                  <SelectValue placeholder={
                    !channelData?.servers?.length 
                      ? "No servers available" 
                      : "Select a server"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {channelData?.servers?.map(server => (
                    <SelectItem key={server.id} value={server.id}>
                      {server.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Channel Selection */}
            {selectedTargetServer && (
              <div className="space-y-2">
                <Label htmlFor="channel-select">Channel</Label>
                <Select 
                  value={selectedTargetChannel} 
                  onValueChange={setSelectedTargetChannel}
                >
                  <SelectTrigger id="channel-select">
                    <SelectValue placeholder="Select a channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channelData?.servers
                      ?.find(s => s.id === selectedTargetServer)
                      ?.channels
                      ?.filter(c => c.type === 0) // Only text channels
                      ?.map(channel => (
                        <SelectItem key={channel.id} value={channel.id}>
                          <div className="flex items-center gap-2">
                            <Hash className="h-3 w-3" />
                            {channel.name}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Template Preview Summary */}
            {selectedTemplate && (
              <div className="rounded-lg bg-muted p-3 space-y-1">
                <div className="text-sm font-medium">{selectedTemplate.name}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedTemplate.description || 'No description'}
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {selectedTemplate.type}
                  </Badge>
                  {selectedTemplate.isTicketPanel && (
                    <Badge variant="secondary" className="text-xs">
                      Ticket Panel
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setSendDialogOpen(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSendTemplate}
              disabled={!selectedTargetChannel || !selectedTargetServer || isSending}
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Template
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}