// Runtime configuration support via window.ENV
declare const window: any;

export const environment = {
  production: false,
  apiUrl: (function() {
    const env = (window as any).ENV || {};
    const proxyEnabled = env.PROXY_BACKEND === true || env.PROXY_BACKEND === 'true';
    if (env.API_URL) {
      return env.API_URL;
    }
    if (proxyEnabled) {
      return '/api';
    }
    return window.location.hostname === 'localhost'
      ? 'https://localhost:8000'
      : `https://${window.location.hostname}:8000`;
  })()
};
