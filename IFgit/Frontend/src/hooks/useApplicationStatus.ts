import { useEffect, useState, useCallback, useRef } from 'react';
import { ForecastResponse } from '@/types/forecaster';
import { useGlobalRefresh } from '@/contexts/GlobalRefreshContext';

export type ConnectionStatus = 'connected' | 'disconnected' | 'loading';

interface UseApplicationStatusReturn {
  data: ForecastResponse | null;
  isLoading: boolean;
  connectionStatus: ConnectionStatus;
  nextUpdate: number;
  lastUpdate: Date | null;
  refetch: () => void;
}

export const useApplicationStatus = (apiEndpoint: string): UseApplicationStatusReturn => {
  const { nextUpdate, lastRefreshTime, triggerRefresh } = useGlobalRefresh();
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('loading');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const lastFetchTimeRef = useRef<number>(0);

  const toApiFormat = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const Y = d.getFullYear();
    const M = pad(d.getMonth() + 1);
    const D = pad(d.getDate());
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    return `${Y}-${M}-${D}T${h}:${m}:${s}`;
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 2.5 * 60 * 1000);

    try {
      const params = new URLSearchParams({
        start: toApiFormat(startTime),
        end: toApiFormat(endTime)
      });
      const response = await fetch(`${apiEndpoint}?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
        setConnectionStatus('connected');
        setLastUpdate(new Date());
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (err) {
      console.error('Failed to fetch:', err);
      setConnectionStatus('disconnected');
    } finally {
      setIsLoading(false);
      lastFetchTimeRef.current = Date.now();
    }
  }, [apiEndpoint]);

  // Fetch on mount and when global refresh triggers
  useEffect(() => {
    // Only fetch if this is a new refresh cycle (lastRefreshTime changed)
    if (lastRefreshTime > lastFetchTimeRef.current) {
      fetchData();
    }
  }, [lastRefreshTime, fetchData]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    triggerRefresh();
  }, [triggerRefresh]);

  return { data, isLoading, connectionStatus, nextUpdate, lastUpdate, refetch };
};