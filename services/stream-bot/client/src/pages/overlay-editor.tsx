import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoBanner, StepGuide } from "@/components/HelpTooltip";
import { 
  Monitor, 
  Smartphone, 
  Tablet, 
  Move, 
  Trash2, 
  Copy, 
  Eye, 
  EyeOff,
  Plus,
  Layers,
  Type,
  Image,
  Square,
  RotateCcw,
  Save,
  Download,
  HelpCircle
} from "lucide-react";

type AspectRatio = "16:9" | "4:3" | "1:1" | "9:16";
type ElementType = "text" | "image" | "box" | "alert";

interface OverlayElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  visible: boolean;
  style: {
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    borderRadius?: number;
    opacity?: number;
  };
}

const aspectRatioStyles: Record<AspectRatio, string> = {
  "16:9": "candy-aspect-16-9",
  "4:3": "candy-aspect-4-3",
  "1:1": "candy-aspect-1-1",
  "9:16": "candy-aspect-9-16",
};

const defaultElements: OverlayElement[] = [
  {
    id: "alert-1",
    type: "alert",
    x: 50,
    y: 10,
    width: 300,
    height: 80,
    content: "New Follower Alert",
    visible: true,
    style: { backgroundColor: "rgba(167, 139, 250, 0.8)", borderRadius: 8, opacity: 100 },
  },
  {
    id: "chat-1",
    type: "box",
    x: 10,
    y: 60,
    width: 250,
    height: 200,
    content: "Chat Box",
    visible: true,
    style: { backgroundColor: "rgba(0, 0, 0, 0.6)", borderRadius: 12, opacity: 100 },
  },
  {
    id: "now-playing",
    type: "text",
    x: 10,
    y: 90,
    width: 200,
    height: 40,
    content: "Now Playing: Song Title",
    visible: true,
    style: { fontSize: 14, fontColor: "#ffffff", opacity: 100 },
  },
];

export default function OverlayEditor() {
  const [elements, setElements] = useState<OverlayElement[]>(defaultElements);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [previewMode, setPreviewMode] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent, elementId: string) => {
    if (previewMode) return;
    
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    setSelectedElement(elementId);
    setIsDragging(true);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const offsetX = clientX - rect.left - (element.x / 100) * rect.width;
      const offsetY = clientY - rect.top - (element.y / 100) * rect.height;
      setDragOffset({ x: offsetX, y: offsetY });
    }
  }, [elements, previewMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !selectedElement || !canvasRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const rect = canvasRef.current.getBoundingClientRect();
    const newX = ((clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const newY = ((clientY - rect.top - dragOffset.y) / rect.height) * 100;

    setElements(prev => prev.map(el => 
      el.id === selectedElement 
        ? { ...el, x: Math.max(0, Math.min(100, newX)), y: Math.max(0, Math.min(100, newY)) }
        : el
    ));
  }, [isDragging, selectedElement, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, []);

  const addElement = (type: ElementType) => {
    const newElement: OverlayElement = {
      id: `${type}-${Date.now()}`,
      type,
      x: 50,
      y: 50,
      width: type === "text" ? 150 : 200,
      height: type === "text" ? 30 : 100,
      content: type === "text" ? "New Text" : type === "image" ? "Image" : type === "alert" ? "New Alert" : "Box",
      visible: true,
      style: {
        fontSize: type === "text" ? 16 : undefined,
        fontColor: "#ffffff",
        backgroundColor: type === "box" ? "rgba(0,0,0,0.5)" : type === "alert" ? "rgba(167,139,250,0.8)" : undefined,
        borderRadius: 8,
        opacity: 100,
      },
    };
    setElements(prev => [...prev, newElement]);
    setSelectedElement(newElement.id);
  };

  const removeElement = (id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    if (selectedElement === id) setSelectedElement(null);
  };

  const duplicateElement = (id: string) => {
    const element = elements.find(el => el.id === id);
    if (!element) return;
    const newElement = { ...element, id: `${element.type}-${Date.now()}`, x: element.x + 5, y: element.y + 5 };
    setElements(prev => [...prev, newElement]);
    setSelectedElement(newElement.id);
  };

  const toggleVisibility = (id: string) => {
    setElements(prev => prev.map(el => 
      el.id === id ? { ...el, visible: !el.visible } : el
    ));
  };

  const updateElementStyle = (id: string, updates: Partial<OverlayElement['style']>) => {
    setElements(prev => prev.map(el => 
      el.id === id ? { ...el, style: { ...el.style, ...updates } } : el
    ));
  };

  const selectedEl = elements.find(el => el.id === selectedElement);

  // Export configuration as JSON file
  const exportConfig = () => {
    const config = {
      version: "1.0",
      aspectRatio,
      elements,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `overlay-config-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Save configuration to server (for OBS browser source)
  const saveConfig = async () => {
    try {
      const config = {
        aspectRatio,
        elements,
      };
      
      const response = await fetch("/api/overlay/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`Configuration saved! Your OBS overlay URL:\n\n${window.location.origin}/overlay/custom?id=${data.id}`);
      } else {
        const error = await response.json();
        alert(`Failed to save: ${error.error || "Unknown error"}`);
      }
    } catch (error: any) {
      alert(`Failed to save: ${error.message}`);
    }
  };

  // Reset to default elements
  const resetElements = () => {
    if (confirm("Reset all elements to defaults? This cannot be undone.")) {
      setElements([...defaultElements]);
      setSelectedElement(null);
    }
  };

  const [showOBSGuide, setShowOBSGuide] = useState(false);

  const obsSetupSteps = [
    { number: 1, title: "Open OBS Studio", description: "Launch OBS on your computer" },
    { number: 2, title: "Add Browser Source", description: "Right-click in Sources → Add → Browser" },
    { number: 3, title: "Name Your Source", description: "Give it a name like 'StreamBot Overlay'" },
    { number: 4, title: "Paste Overlay URL", description: "Click 'Save' above to get your overlay URL, then paste it in OBS" },
    { number: 5, title: "Set Dimensions", description: "Width: 1920, Height: 1080 (or your stream resolution)" },
    { number: 6, title: "Done!", description: "Your overlay will update automatically" },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold candy-gradient-text">Overlay Editor</h1>
          <p className="text-sm text-muted-foreground">Design and position your stream overlays</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowOBSGuide(!showOBSGuide)}>
            <HelpCircle className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">OBS Setup</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreviewMode(!previewMode)}>
            {previewMode ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            <span className="hidden sm:inline">{previewMode ? "Edit" : "Preview"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={resetElements}>
            <RotateCcw className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
          <Button size="sm" className="candy-button border-0" onClick={saveConfig}>
            <Save className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Save</span>
          </Button>
        </div>
      </div>

      {showOBSGuide && (
        <Card className="candy-glass-card border-blue-500/30 bg-blue-500/5">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="h-5 w-5 text-blue-500" />
                How to Add This Overlay to OBS
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowOBSGuide(false)}>×</Button>
            </div>
            <CardDescription className="text-xs">
              Follow these steps to display your custom overlay on your stream
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <StepGuide steps={obsSetupSteps} />
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                💡 <strong>Pro tip:</strong> After saving, you'll get a URL. Copy it and paste into OBS Browser Source. The overlay updates in real-time whenever you make changes here!
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="lg:col-span-3 space-y-4">
          <Card className="candy-glass-card">
            <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">Canvas</Badge>
                  <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)}>
                    <SelectTrigger className="w-24 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16:9">16:9</SelectItem>
                      <SelectItem value="4:3">4:3</SelectItem>
                      <SelectItem value="1:1">1:1</SelectItem>
                      <SelectItem value="9:16">9:16</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Monitor className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Tablet className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Smartphone className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div 
                ref={canvasRef}
                className={`candy-overlay-canvas w-full max-w-4xl mx-auto ${aspectRatioStyles[aspectRatio]} touch-none`}
                onMouseMove={handleMouseMove}
                onTouchMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchEnd={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {elements.filter(el => el.visible || !previewMode).map((element) => (
                  <div
                    key={element.id}
                    className={`candy-overlay-element ${selectedElement === element.id ? 'selected' : ''} ${isDragging && selectedElement === element.id ? 'dragging' : ''} ${!element.visible ? 'opacity-40' : ''}`}
                    style={{
                      left: `${element.x}%`,
                      top: `${element.y}%`,
                      width: element.width,
                      height: element.height,
                      backgroundColor: element.style.backgroundColor,
                      borderRadius: element.style.borderRadius,
                      opacity: (element.style.opacity || 100) / 100,
                      fontSize: element.style.fontSize,
                      color: element.style.fontColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px',
                      textAlign: 'center',
                    }}
                    onMouseDown={(e) => handleMouseDown(e, element.id)}
                    onTouchStart={(e) => handleMouseDown(e, element.id)}
                    onClick={() => !previewMode && setSelectedElement(element.id)}
                  >
                    {element.type === "image" ? (
                      <Image className="h-8 w-8 text-muted-foreground" />
                    ) : (
                      <span className="text-xs sm:text-sm truncate">{element.content}</span>
                    )}
                    {selectedElement === element.id && !previewMode && (
                      <>
                        <div className="candy-overlay-handle" style={{ top: -6, left: -6 }} />
                        <div className="candy-overlay-handle" style={{ top: -6, right: -6 }} />
                        <div className="candy-overlay-handle" style={{ bottom: -6, left: -6 }} />
                        <div className="candy-overlay-handle" style={{ bottom: -6, right: -6 }} />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="candy-glass-card">
            <CardHeader className="p-3 sm:p-6 pb-2">
              <CardTitle className="text-sm">Add Elements</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => addElement("text")} className="candy-touch-target">
                  <Type className="h-4 w-4 mr-1" />
                  Text
                </Button>
                <Button variant="outline" size="sm" onClick={() => addElement("box")} className="candy-touch-target">
                  <Square className="h-4 w-4 mr-1" />
                  Box
                </Button>
                <Button variant="outline" size="sm" onClick={() => addElement("image")} className="candy-touch-target">
                  <Image className="h-4 w-4 mr-1" />
                  Image
                </Button>
                <Button variant="outline" size="sm" onClick={() => addElement("alert")} className="candy-touch-target">
                  <Plus className="h-4 w-4 mr-1" />
                  Alert
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="candy-glass-card">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Layers
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 max-h-48 overflow-y-auto candy-scrollbar">
              <div className="space-y-1">
                {elements.map((element) => (
                  <div
                    key={element.id}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedElement === element.id ? 'bg-primary/20 border border-primary/40' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedElement(element.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button onClick={(e) => { e.stopPropagation(); toggleVisibility(element.id); }}>
                        {element.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                      <span className="text-xs truncate">{element.content}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); duplicateElement(element.id); }} className="p-1 hover:bg-muted rounded">
                        <Copy className="h-3 w-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); removeElement(element.id); }} className="p-1 hover:bg-destructive/20 rounded text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedEl && (
            <Card className="candy-glass-card">
              <CardHeader className="p-3 sm:p-4 pb-2">
                <CardTitle className="text-sm">Properties</CardTitle>
                <CardDescription className="text-xs">{selectedEl.type} element</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Content</Label>
                  <Input
                    value={selectedEl.content}
                    onChange={(e) => setElements(prev => prev.map(el => 
                      el.id === selectedEl.id ? { ...el, content: e.target.value } : el
                    ))}
                    className="h-8 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Position</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs text-muted-foreground">X: {Math.round(selectedEl.x)}%</span>
                      <Slider
                        value={[selectedEl.x]}
                        onValueChange={([v]) => setElements(prev => prev.map(el => 
                          el.id === selectedEl.id ? { ...el, x: v } : el
                        ))}
                        min={0}
                        max={100}
                        step={1}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Y: {Math.round(selectedEl.y)}%</span>
                      <Slider
                        value={[selectedEl.y]}
                        onValueChange={([v]) => setElements(prev => prev.map(el => 
                          el.id === selectedEl.id ? { ...el, y: v } : el
                        ))}
                        min={0}
                        max={100}
                        step={1}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Size</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs text-muted-foreground">W: {selectedEl.width}px</span>
                      <Slider
                        value={[selectedEl.width]}
                        onValueChange={([v]) => setElements(prev => prev.map(el => 
                          el.id === selectedEl.id ? { ...el, width: v } : el
                        ))}
                        min={50}
                        max={500}
                        step={10}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">H: {selectedEl.height}px</span>
                      <Slider
                        value={[selectedEl.height]}
                        onValueChange={([v]) => setElements(prev => prev.map(el => 
                          el.id === selectedEl.id ? { ...el, height: v } : el
                        ))}
                        min={20}
                        max={300}
                        step={10}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Opacity</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[selectedEl.style.opacity || 100]}
                      onValueChange={([v]) => updateElementStyle(selectedEl.id, { opacity: v })}
                      min={0}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-xs w-8">{selectedEl.style.opacity || 100}%</span>
                  </div>
                </div>

                {(selectedEl.type === "text" || selectedEl.type === "alert") && (
                  <div className="space-y-2">
                    <Label className="text-xs">Font Size</Label>
                    <Slider
                      value={[selectedEl.style.fontSize || 14]}
                      onValueChange={([v]) => updateElementStyle(selectedEl.id, { fontSize: v })}
                      min={10}
                      max={48}
                      step={1}
                    />
                  </div>
                )}

                <div className="pt-2">
                  <Button variant="destructive" size="sm" className="w-full" onClick={() => removeElement(selectedEl.id)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete Element
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="candy-glass-card">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-sm">Export</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0">
              <Button variant="outline" size="sm" className="w-full" onClick={exportConfig}>
                <Download className="h-4 w-4 mr-1" />
                Export Config
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
