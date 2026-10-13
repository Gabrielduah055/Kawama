import { apiEndpoints, externalEndpoints } from './environment.config';

export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api/v1',
  apiEndpoints,
  externalEndpoints,
} as const;
