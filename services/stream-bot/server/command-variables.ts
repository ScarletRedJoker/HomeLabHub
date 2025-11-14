export interface CommandContext {
  username: string;
  usageCount: number;
  streamStartTime?: Date;
}

export function parseCommandVariables(
  template: string,
  context: CommandContext
): string {
  let result = template;

  // {user} - Username who triggered the command
  result = result.replace(/\{user\}/gi, context.username);

  // {count} - Usage count
  result = result.replace(/\{count\}/gi, context.usageCount.toString());

  // {random:min-max} - Random number in range
  const randomPattern = /\{random:(\d+)-(\d+)\}/gi;
  result = result.replace(randomPattern, (match, min, max) => {
    const minNum = parseInt(min, 10);
    const maxNum = parseInt(max, 10);
    if (isNaN(minNum) || isNaN(maxNum) || minNum > maxNum) {
      return match; // Return original if invalid
    }
    const random = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
    return random.toString();
  });

  // {time} - Current time (formatted)
  result = result.replace(/\{time\}/gi, () => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  });

  // {uptime} - Stream uptime (if stream is live)
  result = result.replace(/\{uptime\}/gi, () => {
    if (!context.streamStartTime) {
      return 'Stream offline';
    }
    
    const now = new Date();
    const diffMs = now.getTime() - context.streamStartTime.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  });

  return result;
}

export function getAvailableVariables(): Array<{
  variable: string;
  description: string;
  example: string;
}> {
  return [
    {
      variable: '{user}',
      description: 'Username of the person who triggered the command',
      example: 'Welcome {user}!',
    },
    {
      variable: '{count}',
      description: 'Number of times this command has been used',
      example: 'This command has been used {count} times',
    },
    {
      variable: '{random:1-100}',
      description: 'Random number in the specified range',
      example: 'Your random number is {random:1-100}',
    },
    {
      variable: '{time}',
      description: 'Current time',
      example: 'The current time is {time}',
    },
    {
      variable: '{uptime}',
      description: 'Stream uptime (if live)',
      example: 'Stream has been live for {uptime}',
    },
  ];
}
