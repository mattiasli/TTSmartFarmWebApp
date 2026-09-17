import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AutomationPanel } from './AutomationPanel';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element.');

createRoot(root).render(
  <StrictMode>
    <FluentProvider theme={webLightTheme}>
      <AutomationPanel farmName="Standalone remote" />
    </FluentProvider>
  </StrictMode>,
);
