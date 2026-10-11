import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './fonts.css';
import './cabin-room.css';
import './room-immersive.css';
import './record-library.css';
import './album-wall.css';
import './app.css';
import './styles/pixel-ui.css';
import './styles/perf-low.css';
import { installZenConsoleReveal } from './scene/zen-console.mjs';
import { syncPerformance, applyPerformance, startPerformanceProbe } from './perf-profile.mjs';

syncPerformance();
applyPerformance(); // before the first paint: slow machines never start at full effects
startPerformanceProbe();
installZenConsoleReveal();
createRoot(document.getElementById('root')).render(<App/>);
