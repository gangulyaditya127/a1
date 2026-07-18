import { RegisteredApplication } from '@/types/forecaster';

export const registeredApplications: RegisteredApplication[] = [
  {
    id: 'payment-service',
    name: 'Payment Service',
    description: 'Payment gateway and transaction processing service',
    apiEndpoint: `${import.meta.env.VITE_API_PYTHON_BASE_URL}/forecast/issue-forecaster-payment`,
    icon: '💳'
  },
  {
    id: 'auth-service',
    name: 'Authentication Service',
    description: 'User authentication and session management',
    apiEndpoint: `${import.meta.env.VITE_API_PYTHON_BASE_URL}/forecast/issue-forecaster-authentication`,
    icon: '🔐'
  },
  {
    id: 'search-service',
    name: 'Search Service',
    description: 'Product search and indexing service',
    apiEndpoint: `${import.meta.env.VITE_API_PYTHON_BASE_URL}/forecast/issue-forecaster-search`,
    icon: '🔍'
  }
];
