import { useState, useEffect, useCallback, useRef } from 'react';
import { ForecastResponse, ForecastHistory } from '@/types/forecaster';
import { useGlobalRefresh } from '@/contexts/GlobalRefreshContext';

export const useForecaster = (apiEndpoint: string) => {
  const { nextUpdate, lastRefreshTime, triggerRefresh } = useGlobalRefresh();
  const [currentResponse, setCurrentResponse] = useState<ForecastResponse | null>(null);
  const [history, setHistory] = useState<ForecastHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(true);
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

  const fetchForecast = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // Calculate time window (last 2.5 minutes)
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 2.5 * 60 * 1000);

    try {
      const params = new URLSearchParams({
        start: toApiFormat(startTime),
        end: toApiFormat(endTime)
      });

      const response = await fetch(`${apiEndpoint}?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ForecastResponse = await response.json();
      
      setCurrentResponse(data);
      setLastUpdate(new Date());
      setIsConnected(true);
      
      // Add to history
      setHistory(prev => [...prev.slice(-19), { timestamp: new Date(), response: data }]);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch forecast';
      setError(errorMessage);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
      lastFetchTimeRef.current = Date.now();
    }
  }, [apiEndpoint]);

  const manualRefresh = useCallback(() => {
    triggerRefresh();
  }, [triggerRefresh]);

  // Fetch on mount and when global refresh triggers
  useEffect(() => {
    // Only fetch if this is a new refresh cycle (lastRefreshTime changed)
    if (lastRefreshTime > lastFetchTimeRef.current) {
      fetchForecast();
    }
  }, [lastRefreshTime, fetchForecast]);

  // Initial fetch
  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  return {
    currentResponse,
    history,
    isLoading,
    error,
    lastUpdate,
    nextUpdate,
    isConnected,
    manualRefresh
  };
};
