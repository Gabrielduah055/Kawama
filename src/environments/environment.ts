import { apiEndpoints, externalEndpoints } from './environment.config';

export const environment = {
  production: false,
  apiBaseUrl: 'https://kawama-admin-backend.onrender.com/api/v1',
  aiApiBaseUrl: 'https://kawama-admin-backend.onrender.com/api',
  apiEndpoints,
  externalEndpoints,
} as const;
