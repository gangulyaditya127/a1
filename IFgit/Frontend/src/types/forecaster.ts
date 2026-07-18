export interface LLMResponse {
  issue_summary: string;
  reasoning: string;
  recommended_actions: string[];
  raw?: string;
  parse_error?: string;
  error?: string;
}

export interface CollatedLog {
  count: number;
  example_log: string;
  fields: {
    code?: string;
    level?: string;
    msg?: string;
    provider?: string;
    service?: string;
    message?: string;
    [key: string]: string | undefined;
  };
  first_seen: string;
  last_seen: string;
}

export interface ForecastResponse {
  start_time: string;
  end_time: string;
  duration_seconds: number;
  error_count: number;
  error_threshold: number;
  status: 'normal' | 'alert';
  forecast_triggered: boolean;
  risk_level: 'Low' | 'Medium' | 'High' | 'Very High' | null;
  llm_response?: LLMResponse | null;
  logs: string[];
  collated_logs: CollatedLog[];
  message?: string;
}

export interface ForecastHistory {
  timestamp: Date;
  response: ForecastResponse;
}

export interface RegisteredApplication {
  id: string;
  name: string;
  description: string;
  apiEndpoint: string;
  icon: string;
}
