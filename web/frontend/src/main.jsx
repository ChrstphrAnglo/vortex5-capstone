import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthContextProvider } from './context/AuthContext.jsx';
import { initAirQualityBands } from './utils/airQualityGuidance.js';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Load the canonical air-quality band table before first paint, so tiles are
// never coloured by one set of numbers and then re-coloured by another.
// initAirQualityBands never rejects: on failure the bundled fallback table
// stays in place, so `.finally` is the render trigger either way.
initAirQualityBands().finally(() => {
  root.render(
    <React.StrictMode>
      <AuthContextProvider>
        <App />
      </AuthContextProvider>
    </React.StrictMode>
  );
});

