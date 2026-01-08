// Runtime configuration support via window.ENV
declare const window: any;

export const environment = {
  production: true,
  apiUrl: (function() {
    const env = (window as any).ENV || {};
    const proxyEnabled = env.PROXY_BACKEND === true || env.PROXY_BACKEND === 'true';
    if (env.API_URL) {
      return env.API_URL;
    }
    if (proxyEnabled) {
      return '/api';
    }
    return 'https://' + window.location.hostname + '/api';
  })()
};
