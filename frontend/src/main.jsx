import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './i18n';
import App from './App';
import './index.css';

// Global safety net: log client errors instead of letting them crash the page.
// Render errors are additionally caught by the ErrorBoundary around the app.
const onUncaughtError = (event) => {
  console.error('[EthioBridge] Uncaught error:', event.error || event.message);
  event.preventDefault?.();
};

const onUnhandledRejection = (event) => {
  console.error('[EthioBridge] Unhandled promise rejection:', event.reason);
  event.preventDefault?.();
};

window.addEventListener('error', onUncaughtError);
window.addEventListener('unhandledrejection', onUnhandledRejection);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <ToastContainer position="top-right" autoClose={4000} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover />
    </BrowserRouter>
  </React.StrictMode>
);
