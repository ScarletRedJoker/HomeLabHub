'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import {
  Loader2, Copy, Check, Download, Sparkles, Play, Smartphone, Tablet, Monitor,
  Layout, CreditCard, Grid3X3, MessageSquare, Quote, Menu, MousePointerClick,
  Image, BarChart3, Palette, Code, Eye, FileCode, FileText, RefreshCw, ChevronRight, ArrowLeft
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { COMPONENT_PRESETS, type ComponentPreset, type ComponentType } from '@/lib/designer/ai-generator';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type DeviceView = 'mobile' | 'tablet' | 'desktop';

const DEVICE_WIDTHS: Record<DeviceView, string> = {
  mobile: '375px',
  tablet: '768px',
  desktop: '100%',
};

const TYPE_ICONS: Record<ComponentType, React.ReactNode> = {
  hero: <Layout className="w-4 h-4" />,
  pricing: <CreditCard className="w-4 h-4" />,
  features: <Grid3X3 className="w-4 h-4" />,
  contact: <MessageSquare className="w-4 h-4" />,
  testimonials: <Quote className="w-4 h-4" />,
  navbar: <Menu className="w-4 h-4" />,
  footer: <Layout className="w-4 h-4" />,
  cta: <MousePointerClick className="w-4 h-4" />,
  gallery: <Image className="w-4 h-4" />,
  stats: <BarChart3 className="w-4 h-4" />,
  custom: <Palette className="w-4 h-4" />,
};

const TYPE_LABELS: Record<ComponentType, string> = {
  hero: 'Hero Sections',
  pricing: 'Pricing Tables',
  features: 'Feature Grids',
  contact: 'Contact Forms',
  testimonials: 'Testimonials',
  navbar: 'Navigation',
  footer: 'Footers',
  cta: 'Call to Action',
  gallery: 'Galleries',
  stats: 'Statistics',
  custom: 'Custom',
};

export default function AIDesignerPage() {
  const [prompt, setPrompt] = useState('');
  const [componentCode, setComponentCode] = useState('');
  const [componentName, setComponentName] = useState('GeneratedComponent');
  const [isGenerating, setIsGenerating] = useState(false);
  const [deviceView, setDeviceView] = useState<DeviceView>('desktop');
  const [activeTab, setActiveTab] = useState<'prompt' | 'code'>('prompt');
  const [previewKey, setPreviewKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [selectedType, setSelectedType] = useState<ComponentType | 'all'>('all');
  const [streamingCode, setStreamingCode] = useState('');
  const [metadata, setMetadata] = useState<{ provider: string; latency: number } | null>(null);
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  const filteredPresets = selectedType === 'all'
    ? COMPONENT_PRESETS
    : COMPONENT_PRESETS.filter(p => p.type === selectedType);

  const componentTypes: ComponentType[] = ['hero', 'pricing', 'features', 'contact', 'testimonials', 'navbar', 'footer', 'cta', 'gallery', 'stats'];

  const handleGenerate = useCallback(async (customPrompt?: string) => {
    const finalPrompt = customPrompt || prompt;
    if (!finalPrompt.trim()) {
      toast({ title: 'Error', description: 'Please enter a prompt', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    setStreamingCode('');
    setComponentCode('');
    setMetadata(null);
    setActiveTab('code');
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/designer/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt, stream: true }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error('Generation failed');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullCode = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const chunk = JSON.parse(data);
            if (chunk.content) {
              fullCode += chunk.content;
              setStreamingCode(fullCode);
            }
            if (chunk.component) {
              setComponentCode(chunk.component.code);
              setComponentName(chunk.component.name);
              setMetadata(chunk.component.metadata);
              setPreviewKey(k => k + 1);
            }
          } catch { continue; }
        }
      }
      toast({ title: 'Success', description: 'Component generated!' });
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [prompt, toast]);

  const handlePresetClick = useCallback((preset: ComponentPreset) => {
    setPrompt(preset.prompt);
    handleGenerate(preset.prompt);
  }, [handleGenerate]);

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(componentCode);
    setCopied(true);
    toast({ title: 'Copied!' });
    setTimeout(() => setCopied(false), 2000);
  }, [componentCode, toast]);

  const downloadAsReact = useCallback(() => {
    const blob = new Blob([componentCode], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${componentName}.tsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [componentCode, componentName]);

  const downloadAsHtml = useCallback(async () => {
    const res = await fetch('/api/designer/export-html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: componentCode, name: componentName }),
    });
    if (res.ok) {
      const { html } = await res.json();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${componentName}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [componentCode, componentName]);

  const previewHtml = componentCode ? `
    <!DOCTYPE html>
    <html><head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://cdn.tailwindcss.com"></script>
      <script>tailwind.config = { darkMode: 'class' }</script>
      <style>body { margin: 0; }</style>
    </head><body class="bg-white dark:bg-gray-900">
      <div id="root"></div>
      <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
      <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
      <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
      <script src="https://unpkg.com/lucide-react@latest/dist/umd/lucide-react.js"></script>
      <script type="text/babel">
        const icons = window.LucideReact || {};
        const { ${componentCode.match(/import\s*{\s*([^}]+)\s*}\s*from\s*['"]lucide-react['"]/)?.[1]?.split(',').map(s => s.trim()).join(', ') || ''} } = icons;
        ${componentCode.replace(/'use client';?\n?/g, '').replace(/import.*from.*;\n?/g, '')}
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${componentName}));
      </script>
    </body></html>
  ` : '';

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="border-b p-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/designer">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
          </Link>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Component Generator
          </h1>
          {metadata && (
            <div className="flex gap-2">
              <Badge variant="secondary">{metadata.provider}</Badge>
              <Badge variant="outline">{metadata.latency}ms</Badge>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-lg">
            {(['mobile', 'tablet', 'desktop'] as DeviceView[]).map(view => (
              <Button
                key={view}
                variant={deviceView === view ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDeviceView(view)}
              >
                {view === 'mobile' && <Smartphone className="h-4 w-4" />}
                {view === 'tablet' && <Tablet className="h-4 w-4" />}
                {view === 'desktop' && <Monitor className="h-4 w-4" />}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-56 border-r flex flex-col">
          <div className="p-2 border-b">
            <h3 className="font-semibold text-xs mb-2">Component Types</h3>
            <ScrollArea className="h-auto max-h-[180px]">
              <div className="space-y-0.5">
                <Button
                  variant={selectedType === 'all' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full justify-start text-xs h-7"
                  onClick={() => setSelectedType('all')}
                >
                  <Grid3X3 className="w-3 h-3 mr-2" />All
                </Button>
                {componentTypes.map(type => (
                  <Button
                    key={type}
                    variant={selectedType === type ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start text-xs h-7"
                    onClick={() => setSelectedType(type)}
                  >
                    {TYPE_ICONS[type]}<span className="ml-2">{TYPE_LABELS[type]}</span>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="p-2 border-b"><h3 className="font-semibold text-xs">Presets</h3></div>
            <ScrollArea className="h-[calc(100%-36px)]">
              <div className="p-1.5 space-y-1.5">
                {filteredPresets.map(preset => (
                  <Button
                    key={preset.id}
                    variant="outline"
                    className="w-full justify-start h-auto py-1.5 px-2 text-left"
                    onClick={() => handlePresetClick(preset)}
                    disabled={isGenerating}
                  >
                    <div className="flex items-start gap-1.5 w-full">
                      <div className="mt-0.5 shrink-0">{TYPE_ICONS[preset.type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs">{preset.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{preset.description}</div>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
          <div className="flex-1 p-4 overflow-auto flex items-start justify-center">
            <div
              className="bg-white dark:bg-gray-950 rounded-lg shadow-lg overflow-hidden transition-all"
              style={{ width: DEVICE_WIDTHS[deviceView], maxWidth: '100%', minHeight: '400px' }}
            >
              {componentCode ? (
                <iframe
                  key={previewKey}
                  srcDoc={previewHtml}
                  className="w-full h-full min-h-[500px] border-0"
                  sandbox="allow-scripts"
                  title="Preview"
                />
              ) : (
                <div className="h-full min-h-[400px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center p-8">
                    <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium mb-2">Live Preview</p>
                    <p className="text-sm">Generate a component to see it here</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="w-80 border-l flex flex-col">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'prompt' | 'code')} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-2 m-2">
              <TabsTrigger value="prompt" className="text-xs"><Sparkles className="w-3 h-3 mr-1" />Prompt</TabsTrigger>
              <TabsTrigger value="code" className="text-xs"><Code className="w-3 h-3 mr-1" />Code</TabsTrigger>
            </TabsList>

            <TabsContent value="prompt" className="flex-1 flex flex-col p-2 pt-0 m-0">
              <div className="space-y-2 flex-1 flex flex-col">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the component...&#10;&#10;Example: Hero section with purple gradient, large heading, and glowing CTA button"
                  className="flex-1 min-h-[150px] resize-none text-sm"
                />
                <Button onClick={() => handleGenerate()} disabled={isGenerating || !prompt.trim()} className="w-full">
                  {isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><Play className="mr-2 h-4 w-4" />Generate</>}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="code" className="flex-1 flex flex-col p-0 m-0 overflow-hidden">
              <div className="flex items-center justify-between p-2 border-b">
                <Input value={componentName} onChange={(e) => setComponentName(e.target.value)} className="h-7 text-xs w-32" />
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={copyToClipboard} disabled={!componentCode}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={downloadAsReact} disabled={!componentCode}><FileCode className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="sm" onClick={downloadAsHtml} disabled={!componentCode}><FileText className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => handleGenerate()} disabled={isGenerating || !prompt.trim()}>
                    <RefreshCw className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <MonacoEditor
                  height="100%"
                  language="typescript"
                  value={componentCode || streamingCode || '// Generated component will appear here'}
                  onChange={(v) => setComponentCode(v || '')}
                  theme="vs-dark"
                  options={{ minimap: { enabled: false }, fontSize: 12, wordWrap: 'on', readOnly: isGenerating }}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
