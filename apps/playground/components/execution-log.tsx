'use client';

import { Button } from './ui/button';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';

export type LogEntry = {
  timestamp: Date;
  type: 'request' | 'response' | 'error';
  method: string;
  data: unknown;
};

interface ExecutionLogProps {
  logs: LogEntry[];
  onClear: () => void;
}

export function ExecutionLog({ logs, onClear }: ExecutionLogProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatData = (data: unknown): string => {
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Activity Log</h2>
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
      <ScrollArea className="h-48">
        <div className="space-y-2 pr-4">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet...</p>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`text-xs font-mono p-2 rounded ${
                  log.type === 'error'
                    ? 'bg-destructive/10 text-destructive'
                    : log.type === 'request'
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200'
                    : 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground whitespace-nowrap">
                    [{formatTime(log.timestamp)}]
                  </span>
                  <span className="font-semibold whitespace-nowrap">
                    {log.type === 'request'
                      ? 'REQ'
                      : log.type === 'response'
                      ? 'RES'
                      : 'ERR'}
                  </span>
                  <span className="whitespace-nowrap">{log.method}</span>
                </div>
                <pre className="mt-1 text-xs overflow-auto max-h-24 whitespace-pre-wrap break-all">
                  {formatData(log.data)}
                </pre>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
