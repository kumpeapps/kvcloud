// Runtime configuration support via window.ENV
declare const window: any;

export const environment = {
  production: false,
  apiUrl: (window.ENV && window.ENV.API_URL) ||
    (window.location.hostname === 'localhost' 
      ? 'http://localhost:8000' 
      : `http://${window.location.hostname}:8000`)
};
