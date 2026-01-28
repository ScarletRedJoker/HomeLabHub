"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import {
  Eraser,
  Paintbrush,
  Undo2,
  Redo2,
  Trash2,
  Download,
} from "lucide-react";

interface PaintOverlayProps {
  imageUrl: string;
  width?: number;
  height?: number;
  onMaskExport?: (maskBase64: string) => void;
}

interface HistoryState {
  data: ImageData;
}

export function PaintOverlay({
  imageUrl,
  width = 512,
  height = 512,
  onMaskExport,
}: PaintOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [brushHardness, setBrushHardness] = useState(100);
  const [isEraser, setIsEraser] = useState(false);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [canvasSize, setCanvasSize] = useState({ width, height });
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    setCtx(context);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      const aspectRatio = img.width / img.height;
      let newWidth = width;
      let newHeight = height;

      if (aspectRatio > 1) {
        newHeight = Math.round(width / aspectRatio);
      } else {
        newWidth = Math.round(height * aspectRatio);
      }

      setCanvasSize({ width: newWidth, height: newHeight });
      canvas.width = newWidth;
      canvas.height = newHeight;

      context.fillStyle = "black";
      context.fillRect(0, 0, newWidth, newHeight);
      saveToHistory(context);
    };
    img.src = imageUrl;
  }, [imageUrl, width, height]);

  const saveToHistory = useCallback((context: CanvasRenderingContext2D) => {
    const canvas = context.canvas;
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ data: imageData });
      if (newHistory.length > 50) {
        newHistory.shift();
        return newHistory;
      }
      return newHistory;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (!ctx || historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const state = history[newIndex];
    if (state) {
      ctx.putImageData(state.data, 0, 0);
      setHistoryIndex(newIndex);
    }
  }, [ctx, history, historyIndex]);

  const redo = useCallback(() => {
    if (!ctx || historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const state = history[newIndex];
    if (state) {
      ctx.putImageData(state.data, 0, 0);
      setHistoryIndex(newIndex);
    }
  }, [ctx, history, historyIndex]);

  const clearCanvas = useCallback(() => {
    if (!ctx) return;
    const canvas = ctx.canvas;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveToHistory(ctx);
  }, [ctx, saveToHistory]);

  const getCanvasPoint = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number, clientY: number;
    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const drawBrushStroke = useCallback(
    (x: number, y: number, lastX?: number, lastY?: number) => {
      if (!ctx) return;

      const opacity = brushOpacity / 100;
      const hardness = brushHardness / 100;

      if (isEraser) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "black";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      }

      ctx.beginPath();

      if (lastX !== undefined && lastY !== undefined) {
        const distance = Math.sqrt((x - lastX) ** 2 + (y - lastY) ** 2);
        const steps = Math.max(1, Math.floor(distance / 2));

        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const interpX = lastX + (x - lastX) * t;
          const interpY = lastY + (y - lastY) * t;

          if (hardness >= 0.9) {
            ctx.beginPath();
            ctx.arc(interpX, interpY, brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const gradient = ctx.createRadialGradient(
              interpX,
              interpY,
              0,
              interpX,
              interpY,
              brushSize / 2
            );
            const color = isEraser ? "0, 0, 0" : "255, 255, 255";
            gradient.addColorStop(0, `rgba(${color}, ${opacity})`);
            gradient.addColorStop(hardness, `rgba(${color}, ${opacity * 0.5})`);
            gradient.addColorStop(1, `rgba(${color}, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(interpX, interpY, brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        if (hardness >= 0.9) {
          ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, brushSize / 2);
          const color = isEraser ? "0, 0, 0" : "255, 255, 255";
          gradient.addColorStop(0, `rgba(${color}, ${opacity})`);
          gradient.addColorStop(hardness, `rgba(${color}, ${opacity * 0.5})`);
          gradient.addColorStop(1, `rgba(${color}, 0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    [ctx, brushSize, brushOpacity, brushHardness, isEraser]
  );

  const handleStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const point = getCanvasPoint(e);
      if (!point) return;

      setIsDrawing(true);
      lastPointRef.current = point;
      drawBrushStroke(point.x, point.y);
    },
    [getCanvasPoint, drawBrushStroke]
  );

  const handleMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawing) return;

      const point = getCanvasPoint(e);
      if (!point) return;

      const lastPoint = lastPointRef.current;
      if (lastPoint) {
        drawBrushStroke(point.x, point.y, lastPoint.x, lastPoint.y);
      }
      lastPointRef.current = point;
    },
    [isDrawing, getCanvasPoint, drawBrushStroke]
  );

  const handleEnd = useCallback(() => {
    if (isDrawing && ctx) {
      saveToHistory(ctx);
      const canvas = canvasRef.current;
      if (canvas && onMaskExport) {
        const base64 = canvas.toDataURL("image/png").split(",")[1];
        onMaskExport(base64);
      }
    }
    setIsDrawing(false);
    lastPointRef.current = null;
  }, [isDrawing, ctx, saveToHistory, onMaskExport]);

  const exportMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const base64 = canvas.toDataURL("image/png").split(",")[1];
    if (onMaskExport) {
      onMaskExport(base64);
    }
    return base64;
  }, [onMaskExport]);

  const downloadMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `mask-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 p-3 bg-muted rounded-lg">
        <div className="flex items-center gap-2">
          <Toggle
            pressed={!isEraser}
            onPressedChange={() => setIsEraser(false)}
            aria-label="Brush"
            size="sm"
          >
            <Paintbrush className="h-4 w-4" />
          </Toggle>
          <Toggle
            pressed={isEraser}
            onPressedChange={() => setIsEraser(true)}
            aria-label="Eraser"
            size="sm"
          >
            <Eraser className="h-4 w-4" />
          </Toggle>
        </div>

        <div className="flex-1 min-w-[150px] max-w-[200px]">
          <Label className="text-xs text-muted-foreground">
            Size: {brushSize}px
          </Label>
          <Slider
            value={[brushSize]}
            onValueChange={([v]) => setBrushSize(v)}
            min={5}
            max={100}
            step={1}
            className="mt-1"
          />
        </div>

        <div className="flex-1 min-w-[150px] max-w-[200px]">
          <Label className="text-xs text-muted-foreground">
            Opacity: {brushOpacity}%
          </Label>
          <Slider
            value={[brushOpacity]}
            onValueChange={([v]) => setBrushOpacity(v)}
            min={10}
            max={100}
            step={5}
            className="mt-1"
          />
        </div>

        <div className="flex-1 min-w-[150px] max-w-[200px]">
          <Label className="text-xs text-muted-foreground">
            Hardness: {brushHardness}%
          </Label>
          <Slider
            value={[brushHardness]}
            onValueChange={([v]) => setBrushHardness(v)}
            min={10}
            max={100}
            step={5}
            className="mt-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={undo}
            disabled={historyIndex <= 0}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearCanvas}
            title="Clear"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadMask}
            title="Download Mask"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative inline-block rounded-lg overflow-hidden border-2 border-dashed border-muted-foreground/30"
        style={{ touchAction: "none" }}
      >
        <img
          src={imageUrl}
          alt="Source"
          className="block"
          style={{
            width: canvasSize.width,
            height: canvasSize.height,
            pointerEvents: "none",
          }}
          crossOrigin="anonymous"
        />
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute top-0 left-0 cursor-crosshair"
          style={{
            opacity: 0.6,
            mixBlendMode: "normal",
          }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          onTouchCancel={handleEnd}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Paint <strong className="text-white">white</strong> over areas you want to regenerate.
        Use <strong>eraser</strong> to remove mask. Keyboard: Ctrl+Z = Undo, Ctrl+Shift+Z = Redo
      </p>

      <input
        type="hidden"
        id="maskData"
        value=""
        ref={(el) => {
          if (el && canvasRef.current) {
            el.value = canvasRef.current.toDataURL("image/png").split(",")[1];
          }
        }}
      />
    </div>
  );
}

export function usePaintOverlay() {
  const exportMaskRef = useRef<(() => string | null) | null>(null);

  const setExportFunction = useCallback(
    (fn: () => string | null) => {
      exportMaskRef.current = fn;
    },
    []
  );

  const getMask = useCallback(() => {
    if (exportMaskRef.current) {
      return exportMaskRef.current();
    }
    return null;
  }, []);

  return { getMask, setExportFunction };
}

export default PaintOverlay;
