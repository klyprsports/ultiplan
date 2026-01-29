
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LandingPage from './LandingPage';
import PlaybookPage from './PlaybookPage';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const Router: React.FC = () => {
  const getRoute = () => {
    const hash = window.location.hash;
    if (hash.startsWith('#/app')) {
      window.history.replaceState({}, '', '/builder');
      return 'app';
    }
    if (hash.startsWith('#/builder')) {
      window.history.replaceState({}, '', '/builder');
      return 'app';
    }
    if (hash.startsWith('#/playbook')) {
      window.history.replaceState({}, '', '/playbook');
      return 'playbook';
    }
    const path = window.location.pathname;
    if (path.startsWith('/builder')) return 'app';
    if (path.startsWith('/playbook')) return 'playbook';
    if (path.startsWith('/library')) return 'playbook';
    return 'landing';
  };

  const [route, setRoute] = useState(() => getRoute());

  useEffect(() => {
    const updateRoute = () => {
      setRoute(getRoute());
    };
    window.addEventListener('popstate', updateRoute);
    return () => {
      window.removeEventListener('popstate', updateRoute);
    };
  }, []);

  if (route === 'app') return <App />;
  if (route === 'playbook') return <PlaybookPage />;
  return <LandingPage />;
};

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
