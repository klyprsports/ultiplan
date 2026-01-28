
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LandingPage from './LandingPage';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const Router: React.FC = () => {
  const [isAppRoute, setIsAppRoute] = useState(() =>
    window.location.pathname.startsWith('/app') || window.location.hash.startsWith('#/app')
  );

  useEffect(() => {
    const updateRoute = () => {
      setIsAppRoute(
        window.location.pathname.startsWith('/app') || window.location.hash.startsWith('#/app')
      );
    };
    window.addEventListener('hashchange', updateRoute);
    window.addEventListener('popstate', updateRoute);
    return () => {
      window.removeEventListener('hashchange', updateRoute);
      window.removeEventListener('popstate', updateRoute);
    };
  }, []);

  return isAppRoute ? <App /> : <LandingPage />;
};

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
