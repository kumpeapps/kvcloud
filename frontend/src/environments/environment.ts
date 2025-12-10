export const environment = {
  production: false,
  apiUrl: window.location.hostname === 'localhost' 
    ? 'http://localhost:8000' 
    : `http://${window.location.hostname}:8000`
};
