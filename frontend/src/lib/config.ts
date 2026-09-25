export const config = {
  authMode: (import.meta.env.VITE_AUTH_MODE ?? 'cognito') as 'dev' | 'cognito',
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, ''),
  cognito: {
    region: import.meta.env.VITE_COGNITO_REGION ?? 'us-east-1',
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
  },
};
