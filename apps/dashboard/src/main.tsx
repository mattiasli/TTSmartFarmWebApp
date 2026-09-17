import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentAppProvider } from '@smartfarm/ui';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element.');

createRoot(root).render(
  <StrictMode>
    <FluentAppProvider>
      <App />
    </FluentAppProvider>
  </StrictMode>,
);
