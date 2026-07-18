import { useEffect, useState, useCallback, useRef } from 'react';
import { registeredApplications } from '@/data/applications';
import { useGlobalRefresh } from '@/contexts/GlobalRefreshContext';

export const useActiveServicesCount = () => {
  const { lastRefreshTime } = useGlobalRefresh();
  const [activeCount, setActiveCount] = useState(0);
  const [totalCount] = useState(registeredApplications.length);
  const [isChecking, setIsChecking] = useState(true);
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

  const checkServices = useCallback(async () => {
    setIsChecking(true);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 2.5 * 60 * 1000);

    const checks = await Promise.all(
      registeredApplications.map(async (app) => {
        try {
          const params = new URLSearchParams({
            start: toApiFormat(startTime),
            end: toApiFormat(endTime)
          });
          const response = await fetch(`${app.apiEndpoint}?${params}`);
          return response.ok;
        } catch {
          return false;
        }
      })
    );

    setActiveCount(checks.filter(Boolean).length);
    setIsChecking(false);
    lastFetchTimeRef.current = Date.now();
  }, []);

  // Fetch on mount and when global refresh triggers
  useEffect(() => {
    if (lastRefreshTime > lastFetchTimeRef.current) {
      checkServices();
    }
  }, [lastRefreshTime, checkServices]);

  // Initial check
  useEffect(() => {
    checkServices();
  }, [checkServices]);

  return { activeCount, totalCount, isChecking };
};
