import React, { useState, useEffect, useCallback } from 'react';
import { useServerContext } from '@/contexts/ServerContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Trash2, 
  Save, 
  Send, 
  FolderOpen, 
  FileText,
  Image,
  User,
  Hash,
  Clock,
  Palette,
  AlignLeft,
  Grid,
  Link,
  ChevronDown,
  ChevronUp,
  Copy
} from 'lucide-react';

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface EmbedData {
  title?: string;
  description?: string;
  color?: string;
  url?: string;
  timestamp?: boolean;
  footer?: {
    text?: string;
    iconUrl?: string;
  };
  image?: {
    url?: string;
  };
  thumbnail?: {
    url?: string;
  };
  author?: {
    name?: string;
    iconUrl?: string;
    url?: string;
  };
  fields?: EmbedField[];
}

interface EmbedTemplate {
  id: number;
  serverId: string;
  name: string;
  embedData: string;
  createdBy: string;
  createdByUsername?: string;
  createdAt: string;
  updatedAt: string;
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

const DEFAULT_EMBED: EmbedData = {
  title: '',
  description: '',
  color: '#5865F2',
  url: '',
  timestamp: false,
  footer: { text: '', iconUrl: '' },
  image: { url: '' },
  thumbnail: { url: '' },
  author: { name: '', iconUrl: '', url: '' },
  fields: [],
};

export default function EmbedBuilder() {
  const { selectedServerId } = useServerContext();
  const { toast } = useToast();
  const serverId = selectedServerId || '';

  const [embedData, setEmbedData] = useState<EmbedData>(DEFAULT_EMBED);
  const [templates, setTemplates] = useState<EmbedTemplate[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    author: false,
    images: false,
    footer: false,
    fields: true,
  });

  useEffect(() => {
    if (serverId) {
      loadTemplates();
      loadChannels();
    }
  }, [serverId]);

  const loadTemplates = async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/embeds`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadChannels = async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/channels`);
      if (res.ok) {
        const data = await res.json();
        const channelList = data.channels || data || [];
        setChannels(channelList.filter((c: Channel) => c.type === 0));
      }
    } catch (error) {
      console.error('Failed to load channels:', error);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const updateEmbed = useCallback((updates: Partial<EmbedData>) => {
    setEmbedData(prev => ({ ...prev, ...updates }));
  }, []);

  const addField = () => {
    setEmbedData(prev => ({
      ...prev,
      fields: [...(prev.fields || []), { name: 'Field Name', value: 'Field Value', inline: false }],
    }));
  };

  const updateField = (index: number, updates: Partial<EmbedField>) => {
    setEmbedData(prev => ({
      ...prev,
      fields: prev.fields?.map((f, i) => (i === index ? { ...f, ...updates } : f)),
    }));
  };

  const removeField = (index: number) => {
    setEmbedData(prev => ({
      ...prev,
      fields: prev.fields?.filter((_, i) => i !== index),
    }));
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      toast({ title: 'Error', description: 'Please enter a template name', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const url = selectedTemplateId
        ? `/api/servers/${serverId}/embeds/${selectedTemplateId}`
        : `/api/servers/${serverId}/embeds`;
      
      const res = await fetch(url, {
        method: selectedTemplateId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName, embedData }),
      });

      if (res.ok) {
        const saved = await res.json();
        setSelectedTemplateId(saved.id);
        toast({ title: 'Success', description: 'Template saved successfully' });
        loadTemplates();
        setSaveDialogOpen(false);
      } else {
        const error = await res.json();
        toast({ title: 'Error', description: error.error || 'Failed to save template', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const loadTemplate = (template: EmbedTemplate) => {
    try {
      const data = JSON.parse(template.embedData);
      setEmbedData({ ...DEFAULT_EMBED, ...data });
      setTemplateName(template.name);
      setSelectedTemplateId(template.id);
      setLoadDialogOpen(false);
      toast({ title: 'Template Loaded', description: `Loaded "${template.name}"` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to parse template data', variant: 'destructive' });
    }
  };

  const deleteTemplate = async (id: number) => {
    try {
      const res = await fetch(`/api/servers/${serverId}/embeds/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Deleted', description: 'Template deleted' });
        loadTemplates();
        if (selectedTemplateId === id) {
          setSelectedTemplateId(null);
          setTemplateName('');
        }
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete template', variant: 'destructive' });
    }
  };

  const sendEmbed = async () => {
    if (!selectedChannel) {
      toast({ title: 'Error', description: 'Please select a channel', variant: 'destructive' });
      return;
    }

    setIsSending(true);
    try {
      const url = selectedTemplateId
        ? `/api/servers/${serverId}/embeds/${selectedTemplateId}/send`
        : `/api/servers/${serverId}/embeds/send-direct`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: selectedChannel, embedData }),
      });

      if (res.ok) {
        toast({ title: 'Sent!', description: 'Embed sent to channel successfully' });
      } else {
        const error = await res.json();
        toast({ title: 'Error', description: error.error || 'Failed to send embed', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to send embed', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const resetEmbed = () => {
    setEmbedData(DEFAULT_EMBED);
    setTemplateName('');
    setSelectedTemplateId(null);
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(embedData, null, 2));
    toast({ title: 'Copied', description: 'Embed JSON copied to clipboard' });
  };

  const colorHex = embedData.color || '#5865F2';

  const SectionHeader = ({ 
    title, 
    icon: Icon, 
    section 
  }: { 
    title: string; 
    icon: any; 
    section: keyof typeof expandedSections 
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="flex items-center justify-between w-full py-2 text-left hover:bg-discord-dark/50 rounded px-2 transition-colors"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-discord-text">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      {expandedSections[section] ? (
        <ChevronUp className="h-4 w-4 text-discord-muted" />
      ) : (
        <ChevronDown className="h-4 w-4 text-discord-muted" />
      )}
    </button>
  );

  if (!serverId) {
    return (
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardContent className="p-8 text-center">
          <p className="text-discord-muted">Please select a server to use the Embed Builder</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Editor Panel */}
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-lg">Embed Editor</CardTitle>
            <div className="flex gap-2">
              <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="border-discord-dark">
                    <FolderOpen className="h-4 w-4 mr-1" />
                    Load
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-discord-sidebar border-discord-dark max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-white">Load Template</DialogTitle>
                  </DialogHeader>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {templates.length === 0 ? (
                      <p className="text-discord-muted text-sm text-center py-4">No saved templates</p>
                    ) : (
                      templates.map((template) => (
                        <div
                          key={template.id}
                          className="flex items-center justify-between p-3 bg-discord-dark rounded hover:bg-discord-dark/70 cursor-pointer"
                          onClick={() => loadTemplate(template)}
                        >
                          <div>
                            <p className="text-white font-medium">{template.name}</p>
                            <p className="text-discord-muted text-xs">
                              {new Date(template.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTemplate(template.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="border-discord-dark">
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-discord-sidebar border-discord-dark">
                  <DialogHeader>
                    <DialogTitle className="text-white">Save Template</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-discord-text">Template Name</Label>
                      <Input
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="My Embed Template"
                        className="bg-discord-dark border-discord-dark text-white mt-1"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={saveTemplate} disabled={isSaving} className="bg-discord-blue hover:bg-discord-blue/80">
                      {isSaving ? 'Saving...' : 'Save Template'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button variant="ghost" size="sm" onClick={copyJson} className="text-discord-muted">
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={resetEmbed} className="text-discord-muted">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 max-h-[600px] overflow-y-auto">
          {/* Basic Section */}
          <div className="border border-discord-dark rounded-lg overflow-hidden">
            <SectionHeader title="Basic" icon={AlignLeft} section="basic" />
            {expandedSections.basic && (
              <div className="p-3 space-y-3 border-t border-discord-dark">
                <div>
                  <Label className="text-discord-text text-xs">Title</Label>
                  <Input
                    value={embedData.title || ''}
                    onChange={(e) => updateEmbed({ title: e.target.value })}
                    placeholder="Embed Title"
                    className="bg-discord-dark border-discord-dark text-white mt-1"
                    maxLength={256}
                  />
                </div>
                <div>
                  <Label className="text-discord-text text-xs">URL (makes title clickable)</Label>
                  <Input
                    value={embedData.url || ''}
                    onChange={(e) => updateEmbed({ url: e.target.value })}
                    placeholder="https://example.com"
                    className="bg-discord-dark border-discord-dark text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-discord-text text-xs">Description</Label>
                  <Textarea
                    value={embedData.description || ''}
                    onChange={(e) => updateEmbed({ description: e.target.value })}
                    placeholder="Embed description... (Supports Markdown)"
                    className="bg-discord-dark border-discord-dark text-white mt-1 min-h-[100px]"
                    maxLength={4096}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label className="text-discord-text text-xs">Color</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={colorHex}
                        onChange={(e) => updateEmbed({ color: e.target.value })}
                        className="w-10 h-10 rounded border-0 cursor-pointer"
                      />
                      <Input
                        value={colorHex}
                        onChange={(e) => updateEmbed({ color: e.target.value })}
                        placeholder="#5865F2"
                        className="bg-discord-dark border-discord-dark text-white flex-1"
                        maxLength={7}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={embedData.timestamp || false}
                      onCheckedChange={(checked) => updateEmbed({ timestamp: checked })}
                    />
                    <Label className="text-discord-text text-xs">Timestamp</Label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Author Section */}
          <div className="border border-discord-dark rounded-lg overflow-hidden">
            <SectionHeader title="Author" icon={User} section="author" />
            {expandedSections.author && (
              <div className="p-3 space-y-3 border-t border-discord-dark">
                <div>
                  <Label className="text-discord-text text-xs">Author Name</Label>
                  <Input
                    value={embedData.author?.name || ''}
                    onChange={(e) => updateEmbed({ author: { ...embedData.author, name: e.target.value } })}
                    placeholder="Author Name"
                    className="bg-discord-dark border-discord-dark text-white mt-1"
                    maxLength={256}
                  />
                </div>
                <div>
                  <Label className="text-discord-text text-xs">Author Icon URL</Label>
                  <Input
                    value={embedData.author?.iconUrl || ''}
                    onChange={(e) => updateEmbed({ author: { ...embedData.author, iconUrl: e.target.value } })}
                    placeholder="https://example.com/icon.png"
                    className="bg-discord-dark border-discord-dark text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-discord-text text-xs">Author URL</Label>
                  <Input
                    value={embedData.author?.url || ''}
                    onChange={(e) => updateEmbed({ author: { ...embedData.author, url: e.target.value } })}
                    placeholder="https://example.com"
                    className="bg-discord-dark border-discord-dark text-white mt-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Images Section */}
          <div className="border border-discord-dark rounded-lg overflow-hidden">
            <SectionHeader title="Images" icon={Image} section="images" />
            {expandedSections.images && (
              <div className="p-3 space-y-3 border-t border-discord-dark">
                <div>
                  <Label className="text-discord-text text-xs">Thumbnail URL (small, top-right)</Label>
                  <Input
                    value={embedData.thumbnail?.url || ''}
                    onChange={(e) => updateEmbed({ thumbnail: { url: e.target.value } })}
                    placeholder="https://example.com/thumbnail.png"
                    className="bg-discord-dark border-discord-dark text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-discord-text text-xs">Image URL (large, bottom)</Label>
                  <Input
                    value={embedData.image?.url || ''}
                    onChange={(e) => updateEmbed({ image: { url: e.target.value } })}
                    placeholder="https://example.com/image.png"
                    className="bg-discord-dark border-discord-dark text-white mt-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Section */}
          <div className="border border-discord-dark rounded-lg overflow-hidden">
            <SectionHeader title="Footer" icon={FileText} section="footer" />
            {expandedSections.footer && (
              <div className="p-3 space-y-3 border-t border-discord-dark">
                <div>
                  <Label className="text-discord-text text-xs">Footer Text</Label>
                  <Input
                    value={embedData.footer?.text || ''}
                    onChange={(e) => updateEmbed({ footer: { ...embedData.footer, text: e.target.value } })}
                    placeholder="Footer text"
                    className="bg-discord-dark border-discord-dark text-white mt-1"
                    maxLength={2048}
                  />
                </div>
                <div>
                  <Label className="text-discord-text text-xs">Footer Icon URL</Label>
                  <Input
                    value={embedData.footer?.iconUrl || ''}
                    onChange={(e) => updateEmbed({ footer: { ...embedData.footer, iconUrl: e.target.value } })}
                    placeholder="https://example.com/footer-icon.png"
                    className="bg-discord-dark border-discord-dark text-white mt-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Fields Section */}
          <div className="border border-discord-dark rounded-lg overflow-hidden">
            <SectionHeader title="Fields" icon={Grid} section="fields" />
            {expandedSections.fields && (
              <div className="p-3 space-y-3 border-t border-discord-dark">
                {embedData.fields?.map((field, index) => (
                  <div key={index} className="bg-discord-dark p-3 rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-discord-muted text-xs">Field {index + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-400 hover:text-red-300"
                        onClick={() => removeField(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      value={field.name}
                      onChange={(e) => updateField(index, { name: e.target.value })}
                      placeholder="Field Name"
                      className="bg-discord-sidebar border-discord-dark text-white"
                      maxLength={256}
                    />
                    <Textarea
                      value={field.value}
                      onChange={(e) => updateField(index, { value: e.target.value })}
                      placeholder="Field Value"
                      className="bg-discord-sidebar border-discord-dark text-white min-h-[60px]"
                      maxLength={1024}
                    />
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={field.inline || false}
                        onCheckedChange={(checked) => updateField(index, { inline: checked })}
                      />
                      <Label className="text-discord-text text-xs">Inline</Label>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addField}
                  disabled={(embedData.fields?.length || 0) >= 25}
                  className="w-full border-discord-dark"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Field ({embedData.fields?.length || 0}/25)
                </Button>
              </div>
            )}
          </div>

          {/* Send Section */}
          <div className="border border-discord-blue rounded-lg p-3 space-y-3">
            <div>
              <Label className="text-discord-text text-xs">Send to Channel</Label>
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="bg-discord-dark border-discord-dark text-white mt-1">
                  <SelectValue placeholder="Select a channel" />
                </SelectTrigger>
                <SelectContent className="bg-discord-dark border-discord-dark">
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id} className="text-white">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-discord-muted" />
                        {channel.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={sendEmbed}
              disabled={isSending || !selectedChannel}
              className="w-full bg-discord-blue hover:bg-discord-blue/80"
            >
              <Send className="h-4 w-4 mr-2" />
              {isSending ? 'Sending...' : 'Send to Channel'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Panel */}
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-[#2f3136] rounded p-4">
            {/* Discord Embed Preview */}
            <div
              className="rounded overflow-hidden"
              style={{
                borderLeft: `4px solid ${colorHex}`,
                backgroundColor: '#2f3136',
              }}
            >
              <div className="p-4">
                {/* Author */}
                {embedData.author?.name && (
                  <div className="flex items-center gap-2 mb-2">
                    {embedData.author.iconUrl && (
                      <img
                        src={embedData.author.iconUrl}
                        alt=""
                        className="w-6 h-6 rounded-full"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    )}
                    {embedData.author.url ? (
                      <a
                        href={embedData.author.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white text-sm font-medium hover:underline"
                      >
                        {embedData.author.name}
                      </a>
                    ) : (
                      <span className="text-white text-sm font-medium">{embedData.author.name}</span>
                    )}
                  </div>
                )}

                {/* Title & Thumbnail Container */}
                <div className="flex gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    {embedData.title && (
                      <div className="mb-2">
                        {embedData.url ? (
                          <a
                            href={embedData.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#00aff4] font-semibold hover:underline"
                          >
                            {embedData.title}
                          </a>
                        ) : (
                          <span className="text-white font-semibold">{embedData.title}</span>
                        )}
                      </div>
                    )}

                    {/* Description */}
                    {embedData.description && (
                      <p className="text-[#dcddde] text-sm whitespace-pre-wrap break-words mb-2">
                        {embedData.description}
                      </p>
                    )}
                  </div>

                  {/* Thumbnail */}
                  {embedData.thumbnail?.url && (
                    <img
                      src={embedData.thumbnail.url}
                      alt=""
                      className="w-20 h-20 rounded object-cover flex-shrink-0"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  )}
                </div>

                {/* Fields */}
                {embedData.fields && embedData.fields.length > 0 && (
                  <div className="grid gap-2 mt-2" style={{ 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))'
                  }}>
                    {embedData.fields.map((field, index) => (
                      <div
                        key={index}
                        className={field.inline ? '' : 'col-span-full'}
                      >
                        <div className="text-white text-sm font-semibold">{field.name}</div>
                        <div className="text-[#dcddde] text-sm whitespace-pre-wrap">{field.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Image */}
                {embedData.image?.url && (
                  <img
                    src={embedData.image.url}
                    alt=""
                    className="mt-4 rounded max-w-full max-h-80 object-contain"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}

                {/* Footer */}
                {(embedData.footer?.text || embedData.timestamp) && (
                  <div className="flex items-center gap-2 mt-3 text-xs text-[#72767d]">
                    {embedData.footer?.iconUrl && (
                      <img
                        src={embedData.footer.iconUrl}
                        alt=""
                        className="w-5 h-5 rounded-full"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    )}
                    {embedData.footer?.text && <span>{embedData.footer.text}</span>}
                    {embedData.footer?.text && embedData.timestamp && <span>•</span>}
                    {embedData.timestamp && <span>{new Date().toLocaleString()}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Empty State */}
            {!embedData.title && !embedData.description && !embedData.author?.name && (
              <div className="text-center py-8 text-discord-muted">
                <p>Start editing to see your embed preview</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
