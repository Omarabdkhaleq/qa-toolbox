import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import { tools } from './tools/registry';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App tools={tools} />
  </StrictMode>,
);
