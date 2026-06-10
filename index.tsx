import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeFrontendConfig } from './config/frontend-config';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const bootstrap = async () => {
  try {
    await initializeFrontendConfig();
  } catch (error) {
    console.warn('[VIRA_CONFIG] frontend initialization failed, continuing with safe defaults', error);
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

bootstrap();
