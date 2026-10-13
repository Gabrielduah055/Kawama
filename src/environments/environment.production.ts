import { apiEndpoints, externalEndpoints } from './environment.config';

export const environment = {
  production: true,
  apiBaseUrl: 'https://kawama-api.onrender.com/api/v1',
  apiEndpoints,
  externalEndpoints,
} as const;
