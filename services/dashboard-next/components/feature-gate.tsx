"use client";

import { ReactNode } from "react";
import { useFeatureGate, ServiceAvailability } from "@/lib/hooks/use-service-availability";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureGateProps {
  feature: keyof ServiceAvailability;
  children: ReactNode;
  fallback?: ReactNode;
  showLoadingState?: boolean;
  showUnavailableState?: boolean;
  className?: string;
}

export function FeatureGate({
  feature,
  children,
  fallback,
  showLoadingState = true,
  showUnavailableState = true,
  className,
}: FeatureGateProps) {
  const { available, loading, reason } = useFeatureGate(feature);

  if (loading && showLoadingState) {
    return (
      <div className={cn("animate-pulse", className)}>
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (!available) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (showUnavailableState) {
      return (
        <Card className={cn("border-dashed border-muted-foreground/25", className)}>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground font-medium mb-1">
              Feature Unavailable
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-sm">
              {reason}
            </p>
          </CardContent>
        </Card>
      );
    }

    return null;
  }

  return <>{children}</>;
}

interface FeatureGatedButtonProps {
  feature: keyof ServiceAvailability;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  disabled?: boolean;
}

export function FeatureGatedButton({
  feature,
  children,
  onClick,
  className,
  variant = "default",
  size = "default",
  disabled = false,
}: FeatureGatedButtonProps) {
  const { available, loading, reason } = useFeatureGate(feature);

  const isDisabled = disabled || loading || !available;
  const buttonTitle = !available ? reason : undefined;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={isDisabled}
      title={buttonTitle}
      className={cn(
        !available && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
      {children}
    </Button>
  );
}

interface FeatureStatusBadgeProps {
  feature: keyof ServiceAvailability;
  showLabel?: boolean;
  className?: string;
}

const FEATURE_LABELS: Record<keyof ServiceAvailability, string> = {
  chat: "AI Chat",
  imageGeneration: "Image Generation",
  workflowAutomation: "Workflows",
  voiceSynthesis: "Voice",
  codeDevelopment: "AI Code",
};

export function FeatureStatusBadge({
  feature,
  showLabel = true,
  className,
}: FeatureStatusBadgeProps) {
  const { available, loading } = useFeatureGate(feature);

  if (loading) {
    return (
      <Badge variant="secondary" className={cn("animate-pulse", className)}>
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        {showLabel && FEATURE_LABELS[feature]}
      </Badge>
    );
  }

  return (
    <Badge
      variant={available ? "default" : "secondary"}
      className={cn(
        available ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-muted text-muted-foreground",
        className
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full mr-1.5",
          available ? "bg-green-500" : "bg-muted-foreground"
        )}
      />
      {showLabel && FEATURE_LABELS[feature]}
    </Badge>
  );
}

interface FeatureUnavailableCardProps {
  feature: keyof ServiceAvailability;
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function FeatureUnavailableCard({
  feature,
  title,
  description,
  onRetry,
  className,
}: FeatureUnavailableCardProps) {
  const { reason, loading } = useFeatureGate(feature);

  return (
    <Card className={cn("border-yellow-500/20 bg-yellow-500/5", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <CardTitle className="text-base">
            {title || `${FEATURE_LABELS[feature]} Unavailable`}
          </CardTitle>
        </div>
        <CardDescription>
          {description || reason}
        </CardDescription>
      </CardHeader>
      {onRetry && (
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Retry Connection
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
