import OpenAI from "openai";
import { db } from "./db";
import { 
  analyticsSnapshots, 
  sentimentAnalysis, 
  chatActivity, 
  streamSessions,
  viewerSnapshots,
  messageHistory 
} from "@shared/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

interface SentimentData {
  date: string;
  positive: number;
  negative: number;
  neutral: number;
  score: number;
  topics: Array<{ topic: string; count: number }>;
}

interface GrowthPrediction {
  metric: string;
  current: number;
  predicted30Days: number;
  predicted90Days: number;
  growthRate: number;
  confidence: number;
}

interface EngagementMetrics {
  avgMessagesPerMinute: number;
  avgViewerRetention: number;
  uniqueChattersGrowth: number;
  mostActiveHour: number;
  peakEngagementDay: string;
}

interface BestStreamingTime {
  dayOfWeek: number;
  hour: number;
  avgViewers: number;
  engagementScore: number;
}

interface HealthScore {
  overall: number;
  breakdown: {
    consistency: number;
    growth: number;
    engagement: number;
    sentiment: number;
  };
  recommendations: string[];
}

class AnalyticsService {
  async analyzeSentiment(userId: string, messages: string[]): Promise<{ sentiment: 'positive' | 'negative' | 'neutral'; score: number; topics: string[] }> {
    if (messages.length === 0) {
      return { sentiment: 'neutral', score: 0, topics: [] };
    }

    try {
      const sampleMessages = messages.slice(0, 50).join('\n');
      
      const prompt = `Analyze the sentiment of these chat messages and extract key topics discussed.
Messages:
${sampleMessages}

Provide:
1. Overall sentiment (positive/negative/neutral)
2. Sentiment score from -100 (very negative) to 100 (very positive)
3. Top 5 topics being discussed

Format your response as JSON:
{
  "sentiment": "positive|negative|neutral",
  "score": 0,
  "topics": ["topic1", "topic2", ...]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 300,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content?.trim() || '{}';
      const result = JSON.parse(content);
      
      return {
        sentiment: result.sentiment || 'neutral',
        score: result.score || 0,
        topics: result.topics || []
      };
    } catch (error: any) {
      console.error('[Analytics] Sentiment analysis error:', error.message);
      return { sentiment: 'neutral', score: 0, topics: [] };
    }
  }

  async getSentimentTrend(userId: string, days: number = 30): Promise<SentimentData[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await db
      .select()
      .from(sentimentAnalysis)
      .where(
        and(
          eq(sentimentAnalysis.userId, userId),
          gte(sentimentAnalysis.date, startDate)
        )
      )
      .orderBy(sentimentAnalysis.date);

    return results.map(r => ({
      date: r.date.toISOString().split('T')[0],
      positive: r.positiveMessages,
      negative: r.negativeMessages,
      neutral: r.neutralMessages,
      score: r.sentimentScore,
      topics: Array.isArray(r.topTopics) ? r.topTopics as Array<{ topic: string; count: number }> : []
    }));
  }

  private linearRegression(data: Array<{ x: number; y: number }>): { slope: number; intercept: number } {
    const n = data.length;
    if (n === 0) return { slope: 0, intercept: 0 };

    const sumX = data.reduce((sum, p) => sum + p.x, 0);
    const sumY = data.reduce((sum, p) => sum + p.y, 0);
    const sumXY = data.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = data.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  async predictGrowth(userId: string, days: number = 30): Promise<GrowthPrediction[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90); // Use last 90 days for prediction

    const snapshots = await db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.userId, userId),
          gte(analyticsSnapshots.date, startDate)
        )
      )
      .orderBy(analyticsSnapshots.date);

    if (snapshots.length < 7) {
      // Not enough data for meaningful predictions
      return [];
    }

    const predictions: GrowthPrediction[] = [];
    
    // Predict followers
    const followerData = snapshots.map((s, i) => ({ x: i, y: s.followers }));
    const followerRegression = this.linearRegression(followerData);
    const currentFollowers = snapshots[snapshots.length - 1].followers;
    const predicted30Followers = followerRegression.slope * (snapshots.length + 30) + followerRegression.intercept;
    const predicted90Followers = followerRegression.slope * (snapshots.length + 90) + followerRegression.intercept;
    
    predictions.push({
      metric: 'followers',
      current: currentFollowers,
      predicted30Days: Math.max(0, Math.round(predicted30Followers)),
      predicted90Days: Math.max(0, Math.round(predicted90Followers)),
      growthRate: followerRegression.slope,
      confidence: this.calculateConfidence(followerData, followerRegression)
    });

    // Predict subscribers
    const subData = snapshots.map((s, i) => ({ x: i, y: s.subscribers }));
    const subRegression = this.linearRegression(subData);
    const currentSubs = snapshots[snapshots.length - 1].subscribers;
    const predicted30Subs = subRegression.slope * (snapshots.length + 30) + subRegression.intercept;
    const predicted90Subs = subRegression.slope * (snapshots.length + 90) + subRegression.intercept;
    
    predictions.push({
      metric: 'subscribers',
      current: currentSubs,
      predicted30Days: Math.max(0, Math.round(predicted30Subs)),
      predicted90Days: Math.max(0, Math.round(predicted90Subs)),
      growthRate: subRegression.slope,
      confidence: this.calculateConfidence(subData, subRegression)
    });

    // Predict average viewers
    const viewerData = snapshots.map((s, i) => ({ x: i, y: s.avgViewers }));
    const viewerRegression = this.linearRegression(viewerData);
    const currentViewers = snapshots[snapshots.length - 1].avgViewers;
    const predicted30Viewers = viewerRegression.slope * (snapshots.length + 30) + viewerRegression.intercept;
    const predicted90Viewers = viewerRegression.slope * (snapshots.length + 90) + viewerRegression.intercept;
    
    predictions.push({
      metric: 'avgViewers',
      current: currentViewers,
      predicted30Days: Math.max(0, Math.round(predicted30Viewers)),
      predicted90Days: Math.max(0, Math.round(predicted90Viewers)),
      growthRate: viewerRegression.slope,
      confidence: this.calculateConfidence(viewerData, viewerRegression)
    });

    return predictions;
  }

  private calculateConfidence(data: Array<{ x: number; y: number }>, regression: { slope: number; intercept: number }): number {
    if (data.length === 0) return 0;

    const predictions = data.map(d => regression.slope * d.x + regression.intercept);
    const errors = data.map((d, i) => Math.abs(d.y - predictions[i]));
    const meanError = errors.reduce((sum, e) => sum + e, 0) / errors.length;
    const meanY = data.reduce((sum, d) => sum + d.y, 0) / data.length;

    const confidence = Math.max(0, Math.min(100, 100 - (meanError / (meanY || 1)) * 100));
    return Math.round(confidence);
  }

  async getEngagementMetrics(userId: string, days: number = 30): Promise<EngagementMetrics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const sessions = await db
      .select()
      .from(streamSessions)
      .where(
        and(
          eq(streamSessions.userId, userId),
          gte(streamSessions.startedAt, startDate)
        )
      )
      .orderBy(desc(streamSessions.startedAt));

    if (sessions.length === 0) {
      return {
        avgMessagesPerMinute: 0,
        avgViewerRetention: 0,
        uniqueChattersGrowth: 0,
        mostActiveHour: 12,
        peakEngagementDay: 'Saturday'
      };
    }

    // Calculate average messages per minute
    const totalMessages = sessions.reduce((sum, s) => sum + s.totalMessages, 0);
    const totalHours = sessions.reduce((sum, s) => {
      if (!s.endedAt) return sum;
      return sum + (s.endedAt.getTime() - s.startedAt.getTime()) / (1000 * 60 * 60);
    }, 0);
    const avgMessagesPerMinute = totalHours > 0 ? totalMessages / (totalHours * 60) : 0;

    // Calculate average viewer retention (peak viewers vs unique chatters)
    const totalPeakViewers = sessions.reduce((sum, s) => sum + s.peakViewers, 0);
    const totalUniqueChatters = sessions.reduce((sum, s) => sum + s.uniqueChatters, 0);
    const avgViewerRetention = totalPeakViewers > 0 ? (totalUniqueChatters / totalPeakViewers) * 100 : 0;

    // Calculate unique chatters growth
    const firstHalfSessions = sessions.slice(Math.floor(sessions.length / 2));
    const secondHalfSessions = sessions.slice(0, Math.floor(sessions.length / 2));
    const firstHalfChatters = firstHalfSessions.reduce((sum, s) => sum + s.uniqueChatters, 0) / (firstHalfSessions.length || 1);
    const secondHalfChatters = secondHalfSessions.reduce((sum, s) => sum + s.uniqueChatters, 0) / (secondHalfSessions.length || 1);
    const uniqueChattersGrowth = firstHalfChatters > 0 ? ((secondHalfChatters - firstHalfChatters) / firstHalfChatters) * 100 : 0;

    // Find most active hour and peak engagement day
    const hourCounts = new Map<number, number>();
    const dayCounts = new Map<string, number>();
    
    sessions.forEach(session => {
      const hour = session.startedAt.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + session.totalMessages);
      
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][session.startedAt.getDay()];
      dayCounts.set(dayName, (dayCounts.get(dayName) || 0) + session.totalMessages);
    });

    let mostActiveHour = 12;
    let maxHourMessages = 0;
    hourCounts.forEach((count, hour) => {
      if (count > maxHourMessages) {
        maxHourMessages = count;
        mostActiveHour = hour;
      }
    });

    let peakEngagementDay = 'Saturday';
    let maxDayMessages = 0;
    dayCounts.forEach((count, day) => {
      if (count > maxDayMessages) {
        maxDayMessages = count;
        peakEngagementDay = day;
      }
    });

    return {
      avgMessagesPerMinute: Math.round(avgMessagesPerMinute * 10) / 10,
      avgViewerRetention: Math.round(avgViewerRetention * 10) / 10,
      uniqueChattersGrowth: Math.round(uniqueChattersGrowth * 10) / 10,
      mostActiveHour,
      peakEngagementDay
    };
  }

  async getBestStreamingTimes(userId: string, days: number = 90): Promise<BestStreamingTime[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const sessions = await db
      .select()
      .from(streamSessions)
      .where(
        and(
          eq(streamSessions.userId, userId),
          gte(streamSessions.startedAt, startDate)
        )
      );

    if (sessions.length === 0) {
      return [];
    }

    // Group sessions by day of week and hour
    const timeSlots = new Map<string, { viewers: number[]; messages: number[]; count: number }>();

    sessions.forEach(session => {
      const dayOfWeek = session.startedAt.getDay();
      const hour = session.startedAt.getHours();
      const key = `${dayOfWeek}-${hour}`;

      if (!timeSlots.has(key)) {
        timeSlots.set(key, { viewers: [], messages: [], count: 0 });
      }

      const slot = timeSlots.get(key)!;
      slot.viewers.push(session.peakViewers);
      slot.messages.push(session.totalMessages);
      slot.count++;
    });

    // Calculate best times
    const bestTimes: BestStreamingTime[] = [];
    
    timeSlots.forEach((data, key) => {
      const [dayOfWeek, hour] = key.split('-').map(Number);
      const avgViewers = data.viewers.reduce((sum, v) => sum + v, 0) / data.count;
      const avgMessages = data.messages.reduce((sum, m) => sum + m, 0) / data.count;
      
      // Engagement score combines viewers and messages per minute
      const engagementScore = (avgViewers * 0.7) + (avgMessages * 0.3);

      bestTimes.push({
        dayOfWeek,
        hour,
        avgViewers: Math.round(avgViewers),
        engagementScore: Math.round(engagementScore)
      });
    });

    // Sort by engagement score descending
    return bestTimes.sort((a, b) => b.engagementScore - a.engagementScore).slice(0, 20);
  }

  async calculateHealthScore(userId: string): Promise<HealthScore> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Get recent data
    const sessions = await db
      .select()
      .from(streamSessions)
      .where(
        and(
          eq(streamSessions.userId, userId),
          gte(streamSessions.startedAt, startDate)
        )
      );

    const snapshots = await db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.userId, userId),
          gte(analyticsSnapshots.date, startDate)
        )
      )
      .orderBy(analyticsSnapshots.date);

    const sentimentData = await db
      .select()
      .from(sentimentAnalysis)
      .where(
        and(
          eq(sentimentAnalysis.userId, userId),
          gte(sentimentAnalysis.date, startDate)
        )
      );

    const recommendations: string[] = [];

    // 1. Consistency Score (0-25 points)
    const streamDays = new Set(sessions.map(s => s.startedAt.toISOString().split('T')[0]));
    const totalDays = 30;
    const streamDaysCount = streamDays.size;
    const consistencyScore = Math.round((streamDaysCount / totalDays) * 25);

    if (consistencyScore < 15) {
      recommendations.push('Stream more consistently - aim for at least 15 days per month');
    }

    // 2. Growth Score (0-25 points)
    let growthScore = 0;
    if (snapshots.length >= 2) {
      const firstSnapshot = snapshots[0];
      const lastSnapshot = snapshots[snapshots.length - 1];
      const followerGrowth = lastSnapshot.followers - firstSnapshot.followers;
      const viewerGrowth = lastSnapshot.avgViewers - firstSnapshot.avgViewers;
      
      growthScore = Math.min(25, Math.max(0, (followerGrowth / 10) + (viewerGrowth / 2)));
      
      if (followerGrowth < 10) {
        recommendations.push('Focus on growing your follower base through social media promotion');
      }
      if (viewerGrowth < 5) {
        recommendations.push('Work on increasing average viewership with engaging content');
      }
    }

    // 3. Engagement Score (0-25 points)
    const avgMessages = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + s.totalMessages, 0) / sessions.length
      : 0;
    const avgChatters = sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.uniqueChatters, 0) / sessions.length
      : 0;
    const engagementScore = Math.min(25, (avgMessages / 50) * 10 + (avgChatters / 20) * 15);

    if (avgMessages < 50) {
      recommendations.push('Increase chat engagement by asking questions and interacting with viewers');
    }

    // 4. Sentiment Score (0-25 points)
    const avgSentiment = sentimentData.length > 0
      ? sentimentData.reduce((sum, s) => sum + s.sentimentScore, 0) / sentimentData.length
      : 0;
    const sentimentScore = Math.min(25, ((avgSentiment + 100) / 200) * 25);

    if (avgSentiment < 20) {
      recommendations.push('Work on improving chat sentiment with positive interactions and community building');
    }

    // Calculate overall score
    const overall = Math.round(consistencyScore + growthScore + engagementScore + sentimentScore);

    if (recommendations.length === 0) {
      recommendations.push('Great job! Keep up the excellent streaming performance!');
    }

    return {
      overall,
      breakdown: {
        consistency: Math.round(consistencyScore),
        growth: Math.round(growthScore),
        engagement: Math.round(engagementScore),
        sentiment: Math.round(sentimentScore)
      },
      recommendations
    };
  }

  async createDailySnapshot(userId: string, data: {
    followers: number;
    subscribers: number;
    avgViewers: number;
    totalStreams: number;
    totalHours: number;
    revenue: number;
  }): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await db
      .insert(analyticsSnapshots)
      .values({
        userId,
        date: today,
        ...data
      })
      .onConflictDoUpdate({
        target: [analyticsSnapshots.userId, analyticsSnapshots.date],
        set: data
      });
  }

  async createSentimentSnapshot(userId: string, data: {
    positiveMessages: number;
    negativeMessages: number;
    neutralMessages: number;
    sentimentScore: number;
    topTopics: Array<{ topic: string; count: number }>;
  }): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await db
      .insert(sentimentAnalysis)
      .values({
        userId,
        date: today,
        ...data
      })
      .onConflictDoUpdate({
        target: [sentimentAnalysis.userId, sentimentAnalysis.date],
        set: data
      });
  }
}

export const analyticsService = new AnalyticsService();
