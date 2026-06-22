import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Frontend Hardening: Prevent Self-XSS (Social Engineering Attacks)
if (process.env.NODE_ENV === 'production') {
  const warningTitle = 'STOP!';
  const warningDesc = 'This is a browser feature intended for developers. If someone told you to copy-paste something here to enable a feature or "hack" someone\\'s account, it is a scam and will give them access to your Bunon.shop account.';
  
  console.log(
    `%c${warningTitle}`,
    'color: red; font-size: 50px; font-weight: bold; text-shadow: 1px 1px 2px black;'
  );
  console.log(
    `%c${warningDesc}`,
    'font-size: 16px; font-family: sans-serif; color: #333;'
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
