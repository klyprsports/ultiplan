import { GoogleAuthProvider, User, linkWithPopup, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase';

let authReadyPromise: Promise<void> | null = null;
const DISABLE_ANON_KEY = 'ultiplan_disable_anonymous_auth';

export const ensureAnonymousAuth = async () => {
  if (!auth || !isFirebaseConfigured) return;
  if (localStorage.getItem(DISABLE_ANON_KEY) === 'true') return;
  if (auth.currentUser) return;
  if (!authReadyPromise) {
    authReadyPromise = new Promise<void>((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (user) {
            unsubscribe();
            resolve();
          }
        },
        (error) => {
          unsubscribe();
          reject(error);
        }
      );
      signInAnonymously(auth).catch((error) => {
        unsubscribe();
        reject(error);
      });
    }).finally(() => {
      authReadyPromise = null;
    });
  }
  await authReadyPromise;
};

export const subscribeToAuth = (callback: (user: User | null) => void) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};

export const signInWithGoogle = async () => {
  if (!auth || !isFirebaseConfigured) return;
  localStorage.removeItem(DISABLE_ANON_KEY);
  const provider = new GoogleAuthProvider();
  if (auth.currentUser?.isAnonymous) {
    await linkWithPopup(auth.currentUser, provider);
    return;
  }
  await signInWithPopup(auth, provider);
};

export const signOutUser = async () => {
  if (!auth) return;
  localStorage.setItem(DISABLE_ANON_KEY, 'true');
  await signOut(auth);
};
