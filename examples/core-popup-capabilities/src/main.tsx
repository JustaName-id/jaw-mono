import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// No wagmi / react-query providers — this example talks to the EIP-1193 provider directly.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
