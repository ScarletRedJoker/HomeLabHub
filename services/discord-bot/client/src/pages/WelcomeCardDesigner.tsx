import React, { useState, useEffect, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { useServerContext } from '@/contexts/ServerContext';

type DragData = { x: number; y: number };
type ResizeRef = { style: { width: string; height: string } };
type Position = { x: number; y: number };

interface WelcomeCardElement {
  id: string;
  type: 'avatar' | 'text' | 'shape' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  avatarStyle?: 'circle' | 'rounded' | 'square';
  avatarBorderColor?: string;
  avatarBorderWidth?: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
  textShadow?: boolean;
  textShadowColor?: string;
  shapeType?: 'rectangle' | 'circle' | 'line';
  shapeFill?: string;
  shapeStroke?: string;
  shapeStrokeWidth?: number;
  shapeOpacity?: number;
  imageUrl?: string;
  imageOpacity?: number;
}

interface WelcomeCardTemplate {
  id?: number;
  serverId: string;
  name: string;
  isActive: boolean;
  width: number;
  height: number;
  backgroundType: 'solid' | 'gradient' | 'image';
  backgroundColor: string;
  backgroundGradient?: string;
  backgroundImage?: string;
  backgroundBlur: number;
  backgroundOpacity: number;
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  elements: string;
  welcomeMessage: string;
  channelId?: string;
}

const CANVAS_SCALE = 0.75;

const DEFAULT_ELEMENTS: WelcomeCardElement[] = [
  {
    id: 'avatar-default',
    type: 'avatar',
    x: 50,
    y: 125,
    width: 150,
    height: 150,
    zIndex: 2,
    avatarStyle: 'circle',
    avatarBorderColor: '#7289da',
    avatarBorderWidth: 4,
  },
  {
    id: 'welcome-text-default',
    type: 'text',
    x: 230,
    y: 100,
    width: 500,
    height: 50,
    zIndex: 3,
    text: 'Welcome to {server}!',
    fontFamily: 'Arial, sans-serif',
    fontSize: 36,
    fontColor: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'left',
    textShadow: true,
    textShadowColor: 'rgba(0,0,0,0.5)',
  },
  {
    id: 'username-text-default',
    type: 'text',
    x: 230,
    y: 160,
    width: 500,
    height: 40,
    zIndex: 3,
    text: '{username}',
    fontFamily: 'Arial, sans-serif',
    fontSize: 28,
    fontColor: '#7289da',
    fontWeight: 'bold',
    textAlign: 'left',
  },
  {
    id: 'member-count-default',
    type: 'text',
    x: 230,
    y: 210,
    width: 500,
    height: 30,
    zIndex: 3,
    text: 'You are member #{memberCount}',
    fontFamily: 'Arial, sans-serif',
    fontSize: 18,
    fontColor: '#a0a0a0',
    fontWeight: 'normal',
    textAlign: 'left',
  },
];

export default function WelcomeCardDesigner() {
  const { selectedServerId } = useServerContext();
  const serverId = selectedServerId || '';
  
  const [template, setTemplate] = useState<WelcomeCardTemplate>({
    serverId,
    name: 'Default Welcome Card',
    isActive: true,
    width: 800,
    height: 400,
    backgroundType: 'gradient',
    backgroundColor: '#1a1a2e',
    backgroundGradient: JSON.stringify({ start: '#1a1a2e', end: '#16213e', direction: 'diagonal' }),
    backgroundBlur: 0,
    backgroundOpacity: 100,
    borderEnabled: true,
    borderColor: '#7289da',
    borderWidth: 3,
    borderRadius: 20,
    elements: JSON.stringify(DEFAULT_ELEMENTS),
    welcomeMessage: 'Welcome to {server}!',
  });
  
  const [elements, setElements] = useState<WelcomeCardElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [templates, setTemplates] = useState<WelcomeCardTemplate[]>([]);
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeChannelId, setWelcomeChannelId] = useState<string>('');
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (serverId) {
      loadTemplates();
      loadSettings();
      loadChannels();
    }
  }, [serverId]);

  useEffect(() => {
    const parsed = JSON.parse(template.elements || '[]');
    setElements(parsed);
  }, [template.elements]);

  const loadTemplates = async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/welcome-cards`);
      const data = await res.json();
      setTemplates(data);
      
      if (data.length > 0) {
        const active = data.find((t: WelcomeCardTemplate) => t.isActive) || data[0];
        setTemplate(active);
      } else {
        setSelectedElement(null);
        setElements([...DEFAULT_ELEMENTS.map(el => ({ ...el }))]);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
      setSelectedElement(null);
      setElements([...DEFAULT_ELEMENTS.map(el => ({ ...el }))]);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/welcome-settings`);
      const data = await res.json();
      setWelcomeEnabled(data.welcomeEnabled || false);
      setWelcomeChannelId(data.welcomeChannelId || '');
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadChannels = async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/channels`);
      const data = await res.json();
      setChannels(data.filter((c: any) => c.type === 0));
    } catch (error) {
      console.error('Failed to load channels:', error);
    }
  };

  const generatePreview = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/welcome-cards/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...template,
          elements: JSON.stringify(elements),
        }),
      });
      
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }
    } catch (error) {
      console.error('Failed to generate preview:', error);
    } finally {
      setIsLoading(false);
    }
  }, [serverId, template, elements]);

  const saveTemplate = async () => {
    setIsSaving(true);
    try {
      const payload = {
        ...template,
        elements: JSON.stringify(elements),
      };
      
      const url = template.id
        ? `/api/servers/${serverId}/welcome-cards/${template.id}`
        : `/api/servers/${serverId}/welcome-cards`;
      
      const res = await fetch(url, {
        method: template.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (res.ok) {
        const saved = await res.json();
        setTemplate(saved);
        loadTemplates();
      }
    } catch (error) {
      console.error('Failed to save template:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const saveSettings = async () => {
    try {
      await fetch(`/api/servers/${serverId}/welcome-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ welcomeEnabled, welcomeChannelId }),
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const addElement = (type: WelcomeCardElement['type']) => {
    const newElement: WelcomeCardElement = {
      id: `${type}-${Date.now()}`,
      type,
      x: 50,
      y: 50,
      width: type === 'avatar' ? 120 : type === 'text' ? 200 : 100,
      height: type === 'avatar' ? 120 : type === 'text' ? 40 : 100,
      zIndex: elements.length + 1,
    };
    
    if (type === 'avatar') {
      newElement.avatarStyle = 'circle';
      newElement.avatarBorderColor = '#7289da';
      newElement.avatarBorderWidth = 4;
    } else if (type === 'text') {
      newElement.text = 'New Text';
      newElement.fontFamily = 'Arial, sans-serif';
      newElement.fontSize = 24;
      newElement.fontColor = '#ffffff';
      newElement.fontWeight = 'normal';
      newElement.textAlign = 'left';
    } else if (type === 'shape') {
      newElement.shapeType = 'rectangle';
      newElement.shapeFill = 'rgba(255,255,255,0.1)';
      newElement.shapeOpacity = 100;
    }
    
    setElements([...elements, newElement]);
    setSelectedElement(newElement.id);
  };

  const updateElement = (id: string, updates: Partial<WelcomeCardElement>) => {
    setElements(elements.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const deleteElement = (id: string) => {
    setElements(elements.filter(el => el.id !== id));
    if (selectedElement === id) setSelectedElement(null);
  };

  const getSelectedElementData = () => elements.find(el => el.id === selectedElement);

  const getBackgroundStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {
      width: template.width * CANVAS_SCALE,
      height: template.height * CANVAS_SCALE,
      borderRadius: template.borderRadius,
      position: 'relative',
      overflow: 'hidden',
    };
    
    if (template.backgroundType === 'solid') {
      style.backgroundColor = template.backgroundColor;
    } else if (template.backgroundType === 'gradient' && template.backgroundGradient) {
      const grad = JSON.parse(template.backgroundGradient);
      const direction = grad.direction === 'vertical' ? 'to bottom' : grad.direction === 'diagonal' ? 'to bottom right' : 'to right';
      style.background = `linear-gradient(${direction}, ${grad.start}, ${grad.end})`;
    } else if (template.backgroundType === 'image' && template.backgroundImage) {
      style.backgroundImage = `url(${template.backgroundImage})`;
      style.backgroundSize = 'cover';
      style.backgroundPosition = 'center';
    }
    
    if (template.borderEnabled) {
      style.border = `${template.borderWidth}px solid ${template.borderColor}`;
    }
    
    return style;
  };

  const renderElement = (element: WelcomeCardElement) => {
    const isSelected = selectedElement === element.id;
    const commonStyle: React.CSSProperties = {
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
    };
    
    let content;
    
    switch (element.type) {
      case 'avatar':
        content = (
          <div
            style={{
              ...commonStyle,
              borderRadius: element.avatarStyle === 'circle' ? '50%' : element.avatarStyle === 'rounded' ? 12 : 0,
              border: `${element.avatarBorderWidth || 0}px solid ${element.avatarBorderColor || '#fff'}`,
              backgroundColor: '#7289da',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 14,
            }}
          >
            Avatar
          </div>
        );
        break;
      case 'text':
        content = (
          <div
            style={{
              ...commonStyle,
              fontFamily: element.fontFamily,
              fontSize: (element.fontSize || 24) * CANVAS_SCALE,
              color: element.fontColor,
              fontWeight: element.fontWeight,
              textAlign: element.textAlign,
              textShadow: element.textShadow ? `2px 2px 4px ${element.textShadowColor || 'rgba(0,0,0,0.5)'}` : undefined,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            {element.text?.replace(/{username}/gi, 'NewMember')
              .replace(/{server}/gi, 'My Server')
              .replace(/{memberCount}/gi, '1234')
              .replace(/{date}/gi, 'January 1, 2025')}
          </div>
        );
        break;
      case 'shape':
        content = (
          <div
            style={{
              ...commonStyle,
              backgroundColor: element.shapeFill,
              borderRadius: element.shapeType === 'circle' ? '50%' : 0,
              opacity: (element.shapeOpacity || 100) / 100,
              border: element.shapeStroke ? `${element.shapeStrokeWidth || 1}px solid ${element.shapeStroke}` : undefined,
            }}
          />
        );
        break;
      case 'image':
        content = (
          <div
            style={{
              ...commonStyle,
              backgroundColor: '#333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#888',
              fontSize: 12,
            }}
          >
            {element.imageUrl ? <img src={element.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'Image'}
          </div>
        );
        break;
    }
    
    const handleDragStop = (_e: unknown, d: DragData) => {
      updateElement(element.id, { x: d.x / CANVAS_SCALE, y: d.y / CANVAS_SCALE });
    };
    
    const handleResizeStop = (_e: unknown, _dir: unknown, ref: ResizeRef, _delta: unknown, position: Position) => {
      updateElement(element.id, {
        width: parseInt(ref.style.width) / CANVAS_SCALE,
        height: parseInt(ref.style.height) / CANVAS_SCALE,
        x: position.x / CANVAS_SCALE,
        y: position.y / CANVAS_SCALE,
      });
    };
    
    return (
      <div key={element.id}>
        <Rnd
          size={{ width: element.width * CANVAS_SCALE, height: element.height * CANVAS_SCALE }}
          position={{ x: element.x * CANVAS_SCALE, y: element.y * CANVAS_SCALE }}
          onDragStop={handleDragStop as any}
          onResizeStop={handleResizeStop as any}
          bounds="parent"
          style={{
            zIndex: element.zIndex,
            outline: isSelected ? '2px solid #7289da' : 'none',
            cursor: 'move',
          }}
        >
          <div onClick={() => setSelectedElement(element.id)} style={{ width: '100%', height: '100%' }}>
            {content}
          </div>
        </Rnd>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', gap: 24, padding: 24, backgroundColor: '#0d1117', minHeight: '100vh', color: '#e6edf3' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Welcome Card Designer</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={generatePreview}
              disabled={isLoading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#238636',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? 'Generating...' : 'Preview'}
            </button>
            <button
              onClick={saveTemplate}
              disabled={isSaving}
              style={{
                padding: '8px 16px',
                backgroundColor: '#1f6feb',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
        
        <div style={{ backgroundColor: '#161b22', borderRadius: 8, padding: 16, border: '1px solid #30363d' }}>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={welcomeEnabled}
                onChange={(e) => {
                  setWelcomeEnabled(e.target.checked);
                  saveSettings();
                }}
              />
              Enable Welcome Cards
            </label>
            <select
              value={welcomeChannelId}
              onChange={(e) => {
                setWelcomeChannelId(e.target.value);
                saveSettings();
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#21262d',
                color: '#e6edf3',
                border: '1px solid #30363d',
                borderRadius: 6,
              }}
            >
              <option value="">Select Channel</option>
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>
          
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => addElement('avatar')} style={toolButtonStyle}>+ Avatar</button>
            <button onClick={() => addElement('text')} style={toolButtonStyle}>+ Text</button>
            <button onClick={() => addElement('shape')} style={toolButtonStyle}>+ Shape</button>
            <button onClick={() => addElement('image')} style={toolButtonStyle}>+ Image</button>
            <button 
              onClick={() => {
                setSelectedElement(null);
                setElements([...DEFAULT_ELEMENTS.map(el => ({ ...el }))]);
              }} 
              style={{ ...toolButtonStyle, backgroundColor: '#3d4550', marginLeft: 'auto' }}
            >
              Reset to Default
            </button>
          </div>
          
          {elements.length > 0 && (
            <div style={{ marginBottom: 8, fontSize: 12, color: '#8b949e' }}>
              {elements.length} element{elements.length !== 1 ? 's' : ''} on canvas - Click an element to edit it
            </div>
          )}
          
          <div style={getBackgroundStyle()}>
            {elements.map(renderElement)}
          </div>
        </div>
        
        {previewUrl && (
          <div style={{ backgroundColor: '#161b22', borderRadius: 8, padding: 16, border: '1px solid #30363d' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Server-Rendered Preview</h3>
            <img src={previewUrl} alt="Welcome Card Preview" style={{ maxWidth: '100%', borderRadius: 8 }} />
          </div>
        )}
      </div>
      
      <div style={{ width: 320, backgroundColor: '#161b22', borderRadius: 8, padding: 16, border: '1px solid #30363d' }}>
        <h2 style={{ fontSize: 16, margin: '0 0 16px 0' }}>Properties</h2>
        
        {selectedElement ? (
          <ElementProperties
            element={getSelectedElementData()!}
            onUpdate={(updates) => updateElement(selectedElement, updates)}
            onDelete={() => deleteElement(selectedElement)}
          />
        ) : (
          <BackgroundProperties
            template={template}
            onUpdate={(updates) => setTemplate({ ...template, ...updates })}
          />
        )}
      </div>
    </div>
  );
}

const toolButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  backgroundColor: '#21262d',
  color: '#e6edf3',
  border: '1px solid #30363d',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
};

function ElementProperties({
  element,
  onUpdate,
  onDelete,
}: {
  element: WelcomeCardElement;
  onUpdate: (updates: Partial<WelcomeCardElement>) => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: '#8b949e' }}>Type: {element.type}</div>
      
      {element.type === 'text' && (
        <>
          <label style={labelStyle}>
            Text
            <textarea
              value={element.text || ''}
              onChange={(e) => onUpdate({ text: e.target.value })}
              style={{ ...inputStyle, height: 60, resize: 'vertical' }}
              placeholder="Use {username}, {server}, {memberCount}, {date}"
            />
          </label>
          <label style={labelStyle}>
            Font Size
            <input
              type="number"
              value={element.fontSize || 24}
              onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value) })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Font Color
            <input
              type="color"
              value={element.fontColor || '#ffffff'}
              onChange={(e) => onUpdate({ fontColor: e.target.value })}
              style={{ ...inputStyle, height: 32, padding: 2 }}
            />
          </label>
          <label style={labelStyle}>
            Font Weight
            <select
              value={element.fontWeight || 'normal'}
              onChange={(e) => onUpdate({ fontWeight: e.target.value as 'normal' | 'bold' })}
              style={inputStyle}
            >
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
            </select>
          </label>
          <label style={labelStyle}>
            Text Align
            <select
              value={element.textAlign || 'left'}
              onChange={(e) => onUpdate({ textAlign: e.target.value as 'left' | 'center' | 'right' })}
              style={inputStyle}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={element.textShadow || false}
              onChange={(e) => onUpdate({ textShadow: e.target.checked })}
            />
            Text Shadow
          </label>
        </>
      )}
      
      {element.type === 'avatar' && (
        <>
          <label style={labelStyle}>
            Style
            <select
              value={element.avatarStyle || 'circle'}
              onChange={(e) => onUpdate({ avatarStyle: e.target.value as 'circle' | 'rounded' | 'square' })}
              style={inputStyle}
            >
              <option value="circle">Circle</option>
              <option value="rounded">Rounded</option>
              <option value="square">Square</option>
            </select>
          </label>
          <label style={labelStyle}>
            Border Color
            <input
              type="color"
              value={element.avatarBorderColor || '#7289da'}
              onChange={(e) => onUpdate({ avatarBorderColor: e.target.value })}
              style={{ ...inputStyle, height: 32, padding: 2 }}
            />
          </label>
          <label style={labelStyle}>
            Border Width
            <input
              type="number"
              value={element.avatarBorderWidth || 4}
              onChange={(e) => onUpdate({ avatarBorderWidth: parseInt(e.target.value) })}
              style={inputStyle}
            />
          </label>
        </>
      )}
      
      {element.type === 'shape' && (
        <>
          <label style={labelStyle}>
            Shape Type
            <select
              value={element.shapeType || 'rectangle'}
              onChange={(e) => onUpdate({ shapeType: e.target.value as 'rectangle' | 'circle' | 'line' })}
              style={inputStyle}
            >
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
              <option value="line">Line</option>
            </select>
          </label>
          <label style={labelStyle}>
            Fill Color
            <input
              type="color"
              value={element.shapeFill || '#ffffff'}
              onChange={(e) => onUpdate({ shapeFill: e.target.value })}
              style={{ ...inputStyle, height: 32, padding: 2 }}
            />
          </label>
          <label style={labelStyle}>
            Opacity
            <input
              type="range"
              min="0"
              max="100"
              value={element.shapeOpacity || 100}
              onChange={(e) => onUpdate({ shapeOpacity: parseInt(e.target.value) })}
              style={{ width: '100%' }}
            />
          </label>
        </>
      )}
      
      {element.type === 'image' && (
        <label style={labelStyle}>
          Image URL
          <input
            type="text"
            value={element.imageUrl || ''}
            onChange={(e) => onUpdate({ imageUrl: e.target.value })}
            style={inputStyle}
            placeholder="https://..."
          />
        </label>
      )}
      
      <label style={labelStyle}>
        Layer (Z-Index)
        <input
          type="number"
          value={element.zIndex}
          onChange={(e) => onUpdate({ zIndex: parseInt(e.target.value) })}
          style={inputStyle}
        />
      </label>
      
      <button
        onClick={onDelete}
        style={{
          padding: '8px 16px',
          backgroundColor: '#f85149',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          marginTop: 8,
        }}
      >
        Delete Element
      </button>
    </div>
  );
}

function BackgroundProperties({
  template,
  onUpdate,
}: {
  template: WelcomeCardTemplate;
  onUpdate: (updates: Partial<WelcomeCardTemplate>) => void;
}) {
  const gradientConfig = template.backgroundGradient
    ? JSON.parse(template.backgroundGradient)
    : { start: '#1a1a2e', end: '#16213e', direction: 'horizontal' };
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: '#8b949e' }}>Background Settings</div>
      
      <label style={labelStyle}>
        Template Name
        <input
          type="text"
          value={template.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          style={inputStyle}
        />
      </label>
      
      <label style={labelStyle}>
        Canvas Size
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            value={template.width}
            onChange={(e) => onUpdate({ width: parseInt(e.target.value) })}
            style={{ ...inputStyle, width: '50%' }}
            placeholder="Width"
          />
          <input
            type="number"
            value={template.height}
            onChange={(e) => onUpdate({ height: parseInt(e.target.value) })}
            style={{ ...inputStyle, width: '50%' }}
            placeholder="Height"
          />
        </div>
      </label>
      
      <label style={labelStyle}>
        Background Type
        <select
          value={template.backgroundType}
          onChange={(e) => onUpdate({ backgroundType: e.target.value as 'solid' | 'gradient' | 'image' })}
          style={inputStyle}
        >
          <option value="solid">Solid Color</option>
          <option value="gradient">Gradient</option>
          <option value="image">Image</option>
        </select>
      </label>
      
      {template.backgroundType === 'solid' && (
        <label style={labelStyle}>
          Background Color
          <input
            type="color"
            value={template.backgroundColor}
            onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
            style={{ ...inputStyle, height: 32, padding: 2 }}
          />
        </label>
      )}
      
      {template.backgroundType === 'gradient' && (
        <>
          <label style={labelStyle}>
            Start Color
            <input
              type="color"
              value={gradientConfig.start}
              onChange={(e) => onUpdate({
                backgroundGradient: JSON.stringify({ ...gradientConfig, start: e.target.value }),
              })}
              style={{ ...inputStyle, height: 32, padding: 2 }}
            />
          </label>
          <label style={labelStyle}>
            End Color
            <input
              type="color"
              value={gradientConfig.end}
              onChange={(e) => onUpdate({
                backgroundGradient: JSON.stringify({ ...gradientConfig, end: e.target.value }),
              })}
              style={{ ...inputStyle, height: 32, padding: 2 }}
            />
          </label>
          <label style={labelStyle}>
            Direction
            <select
              value={gradientConfig.direction}
              onChange={(e) => onUpdate({
                backgroundGradient: JSON.stringify({ ...gradientConfig, direction: e.target.value }),
              })}
              style={inputStyle}
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
              <option value="diagonal">Diagonal</option>
            </select>
          </label>
        </>
      )}
      
      {template.backgroundType === 'image' && (
        <label style={labelStyle}>
          Image URL
          <input
            type="text"
            value={template.backgroundImage || ''}
            onChange={(e) => onUpdate({ backgroundImage: e.target.value })}
            style={inputStyle}
            placeholder="https://..."
          />
        </label>
      )}
      
      <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={template.borderEnabled}
          onChange={(e) => onUpdate({ borderEnabled: e.target.checked })}
        />
        Enable Border
      </label>
      
      {template.borderEnabled && (
        <>
          <label style={labelStyle}>
            Border Color
            <input
              type="color"
              value={template.borderColor}
              onChange={(e) => onUpdate({ borderColor: e.target.value })}
              style={{ ...inputStyle, height: 32, padding: 2 }}
            />
          </label>
          <label style={labelStyle}>
            Border Width
            <input
              type="number"
              value={template.borderWidth}
              onChange={(e) => onUpdate({ borderWidth: parseInt(e.target.value) })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Border Radius
            <input
              type="number"
              value={template.borderRadius}
              onChange={(e) => onUpdate({ borderRadius: parseInt(e.target.value) })}
              style={inputStyle}
            />
          </label>
        </>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 13,
  color: '#e6edf3',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  backgroundColor: '#21262d',
  color: '#e6edf3',
  border: '1px solid #30363d',
  borderRadius: 6,
  fontSize: 13,
};
