import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

let inMemoryIdToken: string | null = null;

export function getInMemoryIdToken(): string | null {
  return inMemoryIdToken;
}

export async function refreshInMemoryIdToken(): Promise<string | null> {
  if (!auth.currentUser) {
    inMemoryIdToken = null;
    return null;
  }
  inMemoryIdToken = await auth.currentUser.getIdToken();
  return inMemoryIdToken;
}

export async function signInWithGoogleAndSyncSql(): Promise<string | null> {
  const credential = await signInWithPopup(auth, googleAuthProvider);
  const token = await credential.user.getIdToken();
  inMemoryIdToken = token;

  await fetch('/api/auth/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  return token;
}
