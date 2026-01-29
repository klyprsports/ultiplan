import { initializeApp, getApps } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export const isFirebaseConfigured = hasFirebaseConfig;

export const firebaseApp = hasFirebaseConfig
  ? getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig)
  : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
export const storage = firebaseApp ? getStorage(firebaseApp) : null;

let emulatorsConnected = false;

if (import.meta.env.DEV && firebaseApp && !emulatorsConnected && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || 'localhost';
  const authPort = Number(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT || 9099);
  const firestorePort = Number(import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || 8080);
  const storagePort = Number(import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT || 9199);

  if (auth) connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true });
  if (db) connectFirestoreEmulator(db, host, firestorePort);
  if (storage) connectStorageEmulator(storage, host, storagePort);

  emulatorsConnected = true;
}

if (!hasFirebaseConfig && import.meta.env.DEV) {
  console.warn('Firebase is not configured. Add VITE_FIREBASE_* values to .env.local to enable Firebase.');
}
