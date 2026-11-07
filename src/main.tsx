import React from 'react';
import ReactDOM from 'react-dom/client';
import { FlywayApp } from './FlywayApp';
import { FlywayErrorBoundary } from './FlywayErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FlywayErrorBoundary><FlywayApp /></FlywayErrorBoundary>
  </React.StrictMode>,
);
