import { useState, useCallback } from 'react';

export type LogLevel = 'critical' | 'warning' | 'unnecessary' | 'success';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: string;
}

export function useEffectsLogger() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const log = useCallback((level: LogLevel, message: string, context?: string) => {
    const newEntry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      level,
      message,
      context,
    };
    setLogs((prev) => [newEntry, ...prev].slice(0, 100)); // Keep last 100 logs
    
    // Also mirror to console with appropriate styling for dev convenience
    const styles = {
      critical: 'color: #ff4444; font-weight: bold;',
      warning: 'color: #ffbb33; font-weight: bold;',
      unnecessary: 'color: #999; font-style: italic;',
      success: 'color: #00C851; font-weight: bold;',
    };
    console.log(`%c[${level.toUpperCase()}] ${message}`, styles[level], context || '');
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, log, clearLogs };
}
