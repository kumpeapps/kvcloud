// Runtime configuration support via window.ENV
declare const window: any;

export const environment = {
  production: true,
  apiUrl: (window.ENV && window.ENV.API_URL) || '/api'
};
