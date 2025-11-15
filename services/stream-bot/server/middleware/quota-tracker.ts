import { Request, Response, NextFunction } from 'express';
import { quotaService, Platform } from '../quota-service';

export interface QuotaTrackerOptions {
  platform: Platform;
  cost?: number;
  userId?: (req: Request) => string | undefined;
  skipCheck?: (req: Request) => boolean;
  onQuotaExceeded?: (req: Request, res: Response) => void;
}

export function quotaTracker(options: QuotaTrackerOptions) {
  const {
    platform,
    cost = 1,
    userId,
    skipCheck,
    onQuotaExceeded,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (skipCheck && skipCheck(req)) {
      return next();
    }

    const userIdValue = userId ? userId(req) : undefined;

    try {
      const quotaCheck = await quotaService.checkQuota(platform, cost, userIdValue);

      if (!quotaCheck.allowed) {
        console.warn(
          `[QuotaTracker] Request blocked for ${platform}: ${quotaCheck.reason}`
        );

        if (onQuotaExceeded) {
          onQuotaExceeded(req, res);
        } else {
          const backoffDelay = quotaService.getBackoffDelayMs(quotaCheck.status);
          const retryAfter = Math.ceil(backoffDelay / 1000);

          res.status(429).json({
            error: 'Quota exceeded',
            platform,
            message: quotaCheck.reason,
            status: quotaCheck.status,
            retryAfter,
          });
        }
        return;
      }

      const backoffDelay = quotaService.getBackoffDelayMs(quotaCheck.status);
      if (backoffDelay > 0 && backoffDelay < 60000) {
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }

      const originalSend = res.send;
      let responseSent = false;

      res.send = function (data: any) {
        if (!responseSent) {
          responseSent = true;
          quotaService.trackApiCall(platform, cost, userIdValue).catch((error) => {
            console.error('[QuotaTracker] Failed to track API call:', error);
          });
        }
        return originalSend.call(this, data);
      };

      next();
    } catch (error: any) {
      console.error('[QuotaTracker] Error in quota middleware:', error);
      next();
    }
  };
}

export async function trackApiCall(platform: Platform, cost: number = 1, userId?: string): Promise<void> {
  try {
    await quotaService.trackApiCall(platform, cost, userId);
  } catch (error: any) {
    console.error(`[QuotaTracker] Failed to track ${platform} API call:`, error);
  }
}

export async function checkQuota(platform: Platform, cost: number = 1, userId?: string): Promise<boolean> {
  try {
    const result = await quotaService.checkQuota(platform, cost, userId);
    return result.allowed;
  } catch (error: any) {
    console.error(`[QuotaTracker] Failed to check ${platform} quota:`, error);
    return true;
  }
}

export async function waitForQuotaIfNeeded(platform: Platform, cost: number = 1, userId?: string): Promise<void> {
  try {
    const result = await quotaService.checkQuota(platform, cost, userId);
    
    if (!result.allowed && result.status.isCircuitBreakerActive) {
      const waitTime = quotaService.getBackoffDelayMs(result.status);
      
      if (waitTime > 0 && waitTime < 5 * 60 * 1000) {
        console.log(
          `[QuotaTracker] Waiting ${Math.ceil(waitTime / 1000)}s for ${platform} quota to reset...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        throw new Error(`${platform} quota exhausted. Resets at ${result.status.resetTime.toISOString()}`);
      }
    } else {
      const backoffDelay = quotaService.getBackoffDelayMs(result.status);
      if (backoffDelay > 0 && backoffDelay < 60000) {
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  } catch (error: any) {
    console.error(`[QuotaTracker] Error waiting for ${platform} quota:`, error);
    throw error;
  }
}
