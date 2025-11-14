import { cn } from "@/lib/utils";

interface CandyLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  text?: string;
}

export function CandyLoader({ size = "md", className, text }: CandyLoaderProps) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  const dotSizeClasses = {
    sm: "w-1.5 h-1.5",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className={cn("relative", sizeClasses[size])}>
        <div className="absolute inset-0 candy-spin">
          <div
            className={cn(
              "absolute top-0 left-1/2 -translate-x-1/2 rounded-full",
              dotSizeClasses[size]
            )}
            style={{
              background: "linear-gradient(135deg, #FF6B9D 0%, #C084FC 100%)",
              boxShadow: "0 0 10px rgba(255, 107, 157, 0.6)",
            }}
          />
          <div
            className={cn(
              "absolute top-1/2 right-0 -translate-y-1/2 rounded-full",
              dotSizeClasses[size]
            )}
            style={{
              background: "linear-gradient(135deg, #4ECDC4 0%, #556FFF 100%)",
              boxShadow: "0 0 10px rgba(78, 205, 196, 0.6)",
            }}
          />
          <div
            className={cn(
              "absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full",
              dotSizeClasses[size]
            )}
            style={{
              background: "linear-gradient(135deg, #5EE68C 0%, #10B981 100%)",
              boxShadow: "0 0 10px rgba(94, 230, 140, 0.6)",
            }}
          />
          <div
            className={cn(
              "absolute top-1/2 left-0 -translate-y-1/2 rounded-full",
              dotSizeClasses[size]
            )}
            style={{
              background: "linear-gradient(135deg, #A78BFA 0%, #EC4899 100%)",
              boxShadow: "0 0 10px rgba(167, 139, 250, 0.6)",
            }}
          />
        </div>
        
        <div
          className={cn("absolute inset-0 rounded-full opacity-20", sizeClasses[size])}
          style={{
            background: "linear-gradient(-45deg, #FF6B9D, #C084FC, #4ECDC4, #5EE68C)",
            backgroundSize: "400% 400%",
            animation: "candyGradient 3s ease infinite",
            filter: "blur(8px)",
          }}
        />
      </div>
      
      {text && (
        <div className="candy-gradient-text text-sm font-semibold animate-pulse">
          {text}
        </div>
      )}
    </div>
  );
}

export function CandyProgressBar({ progress, className }: { progress: number; className?: string }) {
  return (
    <div className={cn("w-full bg-muted rounded-full h-2 overflow-hidden", className)}>
      <div
        className="candy-progress h-full transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}

export function CandyShimmer({ className }: { className?: string }) {
  return (
    <div className={cn("candy-shimmer rounded-lg bg-muted", className)} />
  );
}
