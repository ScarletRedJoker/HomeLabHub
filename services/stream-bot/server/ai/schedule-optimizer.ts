import { generateContent } from '../ai-content-service';

export interface StreamHistory {
  id: string;
  startTime: Date;
  endTime: Date;
  game: string;
  avgViewers: number;
  peakViewers: number;
  chatMessages: number;
  newFollowers: number;
}

export interface ScheduleRecommendation {
  day: string;
  time: string;
  duration: string;
  game?: string;
  reason: string;
  confidence: number;
}

export interface ScheduleAnalysis {
  recommendations: ScheduleRecommendation[];
  insights: string[];
  bestDay: string;
  bestTime: string;
  worstTime: string;
  avgViewersByDay: Record<string, number>;
  avgViewersByHour: Record<string, number>;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function aggregateStreamData(history: StreamHistory[]): {
  byDay: Record<string, { viewers: number; count: number }>;
  byHour: Record<string, { viewers: number; count: number }>;
  byGame: Record<string, { viewers: number; count: number }>;
} {
  const byDay: Record<string, { viewers: number; count: number }> = {};
  const byHour: Record<string, { viewers: number; count: number }> = {};
  const byGame: Record<string, { viewers: number; count: number }> = {};

  for (const stream of history) {
    const day = DAYS[stream.startTime.getDay()];
    const hour = stream.startTime.getHours();
    const hourKey = `${hour.toString().padStart(2, '0')}:00`;

    if (!byDay[day]) byDay[day] = { viewers: 0, count: 0 };
    byDay[day].viewers += stream.avgViewers;
    byDay[day].count++;

    if (!byHour[hourKey]) byHour[hourKey] = { viewers: 0, count: 0 };
    byHour[hourKey].viewers += stream.avgViewers;
    byHour[hourKey].count++;

    if (!byGame[stream.game]) byGame[stream.game] = { viewers: 0, count: 0 };
    byGame[stream.game].viewers += stream.avgViewers;
    byGame[stream.game].count++;
  }

  return { byDay, byHour, byGame };
}

export async function analyzeSchedule(history: StreamHistory[]): Promise<ScheduleAnalysis> {
  if (history.length < 5) {
    return getDefaultAnalysis();
  }

  const { byDay, byHour, byGame } = aggregateStreamData(history);

  const avgViewersByDay: Record<string, number> = {};
  const avgViewersByHour: Record<string, number> = {};

  for (const [day, data] of Object.entries(byDay)) {
    avgViewersByDay[day] = Math.round(data.viewers / data.count);
  }

  for (const [hour, data] of Object.entries(byHour)) {
    avgViewersByHour[hour] = Math.round(data.viewers / data.count);
  }

  const sortedDays = Object.entries(avgViewersByDay).sort((a, b) => b[1] - a[1]);
  const sortedHours = Object.entries(avgViewersByHour).sort((a, b) => b[1] - a[1]);
  const sortedGames = Object.entries(byGame)
    .map(([game, data]) => ({ game, avg: data.viewers / data.count }))
    .sort((a, b) => b.avg - a.avg);

  const bestDay = sortedDays[0]?.[0] || 'Saturday';
  const bestTime = sortedHours[0]?.[0] || '19:00';
  const worstTime = sortedHours[sortedHours.length - 1]?.[0] || '06:00';

  const prompt = `Analyze this streaming data and suggest optimal 3-day weekly schedule:

Average viewers by day:
${JSON.stringify(avgViewersByDay, null, 2)}

Average viewers by time:
${JSON.stringify(avgViewersByHour, null, 2)}

Top games by performance:
${sortedGames.slice(0, 5).map(g => `${g.game}: ${Math.round(g.avg)} avg viewers`).join('\n')}

Total streams analyzed: ${history.length}

Return JSON:
{
  "recommendations": [
    { "day": "Monday", "time": "19:00", "duration": "3h", "game": "Valorant", "reason": "...", "confidence": 0.8 }
  ],
  "insights": ["insight 1", "insight 2"]
}`;

  try {
    const result = await generateContent({
      type: 'description',
      context: prompt,
      tone: 'professional'
    });

    if (!result.success) {
      throw new Error('AI generation failed');
    }

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      recommendations?: ScheduleRecommendation[];
      insights?: string[];
    };

    return {
      recommendations: parsed.recommendations || getDefaultRecommendations(bestDay, bestTime),
      insights: parsed.insights || getDefaultInsights(bestDay, bestTime, sortedGames[0]?.game),
      bestDay,
      bestTime,
      worstTime,
      avgViewersByDay,
      avgViewersByHour
    };
  } catch (error) {
    console.error('[ScheduleOptimizer] Error:', error);
    return {
      recommendations: getDefaultRecommendations(bestDay, bestTime),
      insights: getDefaultInsights(bestDay, bestTime, sortedGames[0]?.game),
      bestDay,
      bestTime,
      worstTime,
      avgViewersByDay,
      avgViewersByHour
    };
  }
}

function getDefaultAnalysis(): ScheduleAnalysis {
  return {
    recommendations: [
      { day: 'Tuesday', time: '19:00', duration: '3h', reason: 'Weekday evening sweet spot', confidence: 0.6 },
      { day: 'Thursday', time: '20:00', duration: '3h', reason: 'Pre-weekend engagement', confidence: 0.6 },
      { day: 'Saturday', time: '14:00', duration: '4h', reason: 'Weekend afternoon peak', confidence: 0.7 }
    ],
    insights: [
      'Need more stream data for accurate analysis (minimum 5 streams)',
      'Consider streaming consistently at the same times to build audience habits',
      'Evening hours (6-10 PM local) typically perform best'
    ],
    bestDay: 'Saturday',
    bestTime: '19:00',
    worstTime: '06:00',
    avgViewersByDay: {},
    avgViewersByHour: {}
  };
}

function getDefaultRecommendations(bestDay: string, bestTime: string): ScheduleRecommendation[] {
  const dayIndex = DAYS.indexOf(bestDay);
  const altDay1 = DAYS[(dayIndex + 2) % 7];
  const altDay2 = DAYS[(dayIndex + 4) % 7];

  return [
    { day: bestDay, time: bestTime, duration: '3h', reason: 'Historically best performing day', confidence: 0.8 },
    { day: altDay1, time: bestTime, duration: '3h', reason: 'Good spread across the week', confidence: 0.6 },
    { day: altDay2, time: bestTime, duration: '3h', reason: 'Maintains consistency', confidence: 0.6 }
  ];
}

function getDefaultInsights(bestDay: string, bestTime: string, topGame?: string): string[] {
  const insights = [
    `${bestDay} shows the strongest viewer engagement`,
    `${bestTime} appears to be your optimal start time`,
    'Consider streaming at least 3 days per week for consistency'
  ];

  if (topGame) {
    insights.push(`${topGame} is your best performing category`);
  }

  return insights;
}

export async function suggestNextStreamTime(
  history: StreamHistory[],
  excludeTimes?: string[]
): Promise<{ time: Date; reason: string }> {
  const analysis = await analyzeSchedule(history);
  
  const now = new Date();
  const targetDayIndex = DAYS.indexOf(analysis.bestDay);
  let daysUntilTarget = targetDayIndex - now.getDay();
  if (daysUntilTarget <= 0) daysUntilTarget += 7;

  const [hours, minutes] = analysis.bestTime.split(':').map(Number);
  const suggestedTime = new Date(now);
  suggestedTime.setDate(now.getDate() + daysUntilTarget);
  suggestedTime.setHours(hours, minutes || 0, 0, 0);

  return {
    time: suggestedTime,
    reason: `${analysis.bestDay} at ${analysis.bestTime} shows your best viewer engagement`
  };
}

export const scheduleOptimizer = {
  analyze: analyzeSchedule,
  suggestNext: suggestNextStreamTime
};

export default scheduleOptimizer;
