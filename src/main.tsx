import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Intercept and suppress third-party cross-origin "Script error." and unhandled rejections
// that occur in sandboxed iframe environments (such as the Google Maps loading failures)
if (typeof window !== 'undefined') {
  const handleScriptError = (message: any, source: any) => {
    const msgStr = String(message || '');
    const srcStr = String(source || '');
    const isScriptError = msgStr === 'Script error.' || msgStr.includes('Script error') || !msgStr;
    const isGoogleMapsError = srcStr.includes('maps.googleapis.com') || msgStr.includes('google');
    
    if (isScriptError || isGoogleMapsError) {
      console.warn('Suppressing third-party cross-origin script error:', msgStr, 'from:', srcStr);
      return true; // Tells the browser the error is fully handled and prevents bubbling
    }
    return false;
  };

  // Modern event listener
  window.addEventListener('error', (event) => {
    if (handleScriptError(event.message, event.filename)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  // Legacy/Canonical onerror handler (required for absolute error silencing across browsers)
  const originalOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    if (handleScriptError(message, source)) {
      return true; // Completely silences the error propagation
    }
    if (originalOnError) {
      return originalOnError.apply(this, arguments as any);
    }
    return false;
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = event.reason ? String(event.reason.message || event.reason) : '';
    if (reasonStr.includes('google') || reasonStr.includes('Script error.')) {
      event.preventDefault();
      console.warn('Ignored third-party sandboxed promise rejection:', reasonStr);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

