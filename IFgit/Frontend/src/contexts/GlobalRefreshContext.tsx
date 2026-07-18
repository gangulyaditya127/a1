import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ReactNode
} from 'react';

const REFRESH_INTERVAL = 120; // 2 minutes in seconds

interface GlobalRefreshState {
  nextUpdate: number;
  lastRefreshTime: number; // timestamp of last refresh
  triggerRefresh: () => void;
}

const GlobalRefreshContext = createContext<GlobalRefreshState | null>(null);

export const GlobalRefreshProvider = ({ children }: { children: ReactNode }) => {
  const [nextUpdate, setNextUpdate] = useState(REFRESH_INTERVAL);
  const [lastRefreshTime, setLastRefreshTime] = useState(() => Date.now());
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const triggerRefresh = useCallback(() => {
    setNextUpdate(REFRESH_INTERVAL);
    setLastRefreshTime(Date.now());
  }, []);

  // Global countdown timer
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setNextUpdate(prev => {
        if (prev <= 1) {
          setLastRefreshTime(Date.now());
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // ✅ Memoized context value (SonarQube fix)
  const contextValue = useMemo(
    () => ({
      nextUpdate,
      lastRefreshTime,
      triggerRefresh
    }),
    [nextUpdate, lastRefreshTime, triggerRefresh]
  );

  return (
    <GlobalRefreshContext.Provider value={contextValue}>
      {children}
    </GlobalRefreshContext.Provider>
  );
};

export const useGlobalRefresh = () => {
  const context = useContext(GlobalRefreshContext);
  if (!context) {
    throw new Error('useGlobalRefresh must be used within a GlobalRefreshProvider');
  }
  return context;
};