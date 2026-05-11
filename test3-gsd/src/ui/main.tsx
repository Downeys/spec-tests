// src/ui/main.tsx
// Phase 2 plan 02-07 — mounts the assistant-ui App into #root.
// Imports the Tailwind v4 entry CSS so all utility classes resolve.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Could not find #root element in index.html');
}
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
