import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useMemo,
} from 'react';
import { toast } from 'sonner';

const THRESHOLD_UPDATE_INTERVAL = 10 * 60; // 10 minutes in seconds
const THRESHOLD_ENDPOINT = `${import.meta.env.VITE_API_PYTHON_BASE_URL}/forecast/update-threshold-payment-service`;

interface PaymentThresholdState {
  thresholdNextUpdate: number;
  isUpdatingThreshold: boolean;
  updateThreshold: () => void;
}

const PaymentThresholdContext = createContext<PaymentThresholdState | null>(null);

export const PaymentThresholdProvider = ({ children }: { children: ReactNode }) => {
  const [thresholdNextUpdate, setThresholdNextUpdate] = useState(
    THRESHOLD_UPDATE_INTERVAL
  );
  const [isUpdatingThreshold, setIsUpdatingThreshold] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  /**
   * ✅ Actual async logic kept intact
   * This function is NOT exposed as context value
   */
  const updateThresholdAsync = useCallback(async () => {
    setIsUpdatingThreshold(true);
    try {
      const response = await fetch(
        `${THRESHOLD_ENDPOINT}`,
        { method: 'POST', body: JSON.stringify({refresh_window_seconds: 60}), headers: {
          'Content-Type': 'application/json'
        } }
      );

      if (response.ok) {
        const result = await response.json();
        toast.success(`Threshold updated: ${result.new_threshold}`);
        if(!isConnected){
          setIsConnected(true);
        }
      } else {
        setIsConnected(false);
      }
    } catch (error) {
      console.error('Failed to update threshold:', error);
      setIsConnected(false);
    } finally {
      setIsUpdatingThreshold(false);
      setThresholdNextUpdate(THRESHOLD_UPDATE_INTERVAL);
    }
  }, []);

  /**
   * ✅ Void-returning wrapper
   * This satisfies both:
   * - React expectations
   * - SonarQube rule
   */
  const updateThreshold = useCallback((): void => {
    void updateThresholdAsync();
  }, [updateThresholdAsync]);

  // Initial fetch and polling
  useEffect(() => {
    updateThreshold();
    const interval = setInterval(
      updateThreshold,
      THRESHOLD_UPDATE_INTERVAL * 1000
    );
    return () => clearInterval(interval);
  }, [updateThreshold]);

  // Countdown timer
  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setThresholdNextUpdate((prev) =>
        prev <= 1 ? THRESHOLD_UPDATE_INTERVAL : prev - 1
      );
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, []);

  // ✅ Memoized context value (SonarQube fix)
  const contextValue = useMemo(
    () => ({
        thresholdNextUpdate,
        isUpdatingThreshold,
        updateThreshold,
    }),
    [thresholdNextUpdate, isUpdatingThreshold, updateThreshold]
  );

  return (
    <PaymentThresholdContext.Provider
      value={contextValue}
    >
      {children}
    </PaymentThresholdContext.Provider>
  );
};

export const usePaymentThreshold = () => {
  const context = useContext(PaymentThresholdContext);
  if (!context) {
    throw new Error(
      'usePaymentThreshold must be used within a PaymentThresholdProvider'
    );
  }
  return context;
};