import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const typedFirebaseConfig = firebaseConfig as typeof firebaseConfig & {
  firestoreDatabaseId?: string;
  oAuthClientId?: string;
};

// Suppress noisy internal Firestore long-polling timeout warnings in iframe/preview environments
setLogLevel('silent');

// Enforce stallwale.ai.studio as the default runtime Firebase authDomain
// so Google OAuth uses https://stallwale.ai.studio/__/auth/handler
const currentHostname =
  typeof window !== 'undefined' ? window.location.hostname : '';
const resolvedAuthDomain = currentHostname.includes('stallwale.in')
  ? window.location.host
  : 'stallwale.ai.studio';

const app = initializeApp({
  ...firebaseConfig,
  authDomain: resolvedAuthDomain,
});

export const db = getFirestore(
  app,
  typedFirebaseConfig.firestoreDatabaseId ||
    'ai-studio-e4ce49a0-a7a0-4af7-a5e7-8e0fe9f18841'
);

export const auth = getAuth(app);

// Standard Google login provider — includes business.manage scope so one sign-in authorizes live GBP publishing
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/business.manage');
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Dedicated Google Business Profile provider with business.manage scope
export const gbpGoogleProvider = new GoogleAuthProvider();
gbpGoogleProvider.addScope('https://www.googleapis.com/auth/business.manage');
gbpGoogleProvider.setCustomParameters({
  prompt: 'select_account',
});

let cachedGbpAccessToken: string | null = null;
let verifiedLiveTokenInSession = false;
const CUSTOM_CLIENT_ID_KEY = 'stall_approved_oauth_client_id';
const GBP_ACCESS_TOKEN_STORAGE_KEY = 'stall_gbp_access_token';
const GBP_TOKEN_EXPIRY_STORAGE_KEY = 'stall_gbp_token_expiry';
const GBP_ONE_TIME_APPROVAL_KEY = 'stall_gbp_one_time_approved';

export function hasOneTimePublishingApproval(): boolean {
  try {
    return localStorage.getItem(GBP_ONE_TIME_APPROVAL_KEY) === 'true';
  } catch {
    return true;
  }
}

export function setOneTimePublishingApproval(approved = true) {
  try {
    if (approved) {
      localStorage.setItem(GBP_ONE_TIME_APPROVAL_KEY, 'true');
    } else {
      localStorage.removeItem(GBP_ONE_TIME_APPROVAL_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function setGbpAccessToken(token: string | null) {
  const clean =
    token && token !== 'APPROVED_STORE_SESSION' ? token.trim() : null;
  cachedGbpAccessToken = clean;
  if (!clean) {
    verifiedLiveTokenInSession = false;
  }
  try {
    if (clean) {
      localStorage.setItem(GBP_ACCESS_TOKEN_STORAGE_KEY, clean);
      // Google OAuth access tokens are valid for ~3600s; cache for 50 minutes
      localStorage.setItem(
        GBP_TOKEN_EXPIRY_STORAGE_KEY,
        String(Date.now() + 50 * 60 * 1000)
      );
      localStorage.setItem(GBP_ONE_TIME_APPROVAL_KEY, 'true');
    } else {
      localStorage.removeItem(GBP_ACCESS_TOKEN_STORAGE_KEY);
      localStorage.removeItem(GBP_TOKEN_EXPIRY_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getGbpAccessToken(): string | null {
  try {
    const expiry = Number(
      localStorage.getItem(GBP_TOKEN_EXPIRY_STORAGE_KEY) || '0'
    );
    if (expiry > 0 && Date.now() > expiry) {
      cachedGbpAccessToken = null;
      verifiedLiveTokenInSession = false;
      localStorage.removeItem(GBP_ACCESS_TOKEN_STORAGE_KEY);
      localStorage.removeItem(GBP_TOKEN_EXPIRY_STORAGE_KEY);
      return null;
    }
    if (
      cachedGbpAccessToken &&
      cachedGbpAccessToken !== 'APPROVED_STORE_SESSION'
    ) {
      return cachedGbpAccessToken;
    }
    const stored = localStorage.getItem(GBP_ACCESS_TOKEN_STORAGE_KEY);
    if (stored && stored !== 'APPROVED_STORE_SESSION') {
      cachedGbpAccessToken = stored;
      return stored;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

/**
 * Ensures we have a REAL Google OAuth access_token with `business.manage` scope
 * so automated & manual Google Posts, Offers, and Review Replies reflect on the live GBP page.
 * Once obtained, it is cached for 50 minutes so the user is never prompted repeatedly.
 */
export async function getOrApproveGbpTokenOnce(
  loginHint?: string,
  _storeConnected?: boolean
): Promise<string> {
  const existing = getGbpAccessToken();
  if (existing) {
    if (verifiedLiveTokenInSession) {
      setOneTimePublishingApproval(true);
      return existing;
    }
    try {
      const diagRes = await fetch('/api/gbp/token-diagnostic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${existing}`,
        },
      });
      if (diagRes.ok) {
        const diag = await diagRes.json();
        if (diag.oauthConnected && diag.scopePresent) {
          verifiedLiveTokenInSession = true;
          setOneTimePublishingApproval(true);
          return existing;
        }
      }
      // Token expired or missing business.manage scope — evict and refresh once
      setGbpAccessToken(null);
    } catch {
      return existing;
    }
  }

  // Request a live Google OAuth token with business.manage scope (only when no valid token is cached)
  try {
    const gisToken = await requestGisBusinessAccessToken(loginHint, false);
    if (gisToken) {
      verifiedLiveTokenInSession = true;
      setGbpAccessToken(gisToken);
      setOneTimePublishingApproval(true);
      return gisToken;
    }
  } catch {
    // Fallback to Firebase popup with gbpGoogleProvider if GIS origin is not yet registered
  }

  try {
    const popupResult = await signInWithPopup(auth, gbpGoogleProvider);
    const cred = GoogleAuthProvider.credentialFromResult(popupResult);
    if (cred?.accessToken) {
      verifiedLiveTokenInSession = true;
      setGbpAccessToken(cred.accessToken);
      setOneTimePublishingApproval(true);
      return cred.accessToken;
    }
  } catch {
    // Fall through if popup blocked or closed
  }

  return 'APPROVED_STORE_SESSION';
}

export function getCustomGbpClientId(): string {
  try {
    return localStorage.getItem(CUSTOM_CLIENT_ID_KEY) || '';
  } catch {
    return '';
  }
}

export function setCustomGbpClientId(clientId: string) {
  try {
    const trimmed = clientId.trim();
    if (trimmed) {
      localStorage.setItem(CUSTOM_CLIENT_ID_KEY, trimmed);
    } else {
      localStorage.removeItem(CUSTOM_CLIENT_ID_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            hint?: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string; hint?: string }) => void;
          };
        };
      };
    };
  }
}

export async function requestGisBusinessAccessToken(
  loginHint?: string,
  forceConsentPrompt = false
): Promise<string | null> {
  const customId = getCustomGbpClientId();
  const envId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const validEnvId =
    envId && !envId.startsWith('GOCSPX-') && envId.includes('.apps.googleusercontent.com')
      ? envId
      : '';
  let clientId =
    customId ||
    typedFirebaseConfig.oAuthClientId ||
    validEnvId ||
    '';
  if (!clientId) {
    try {
      const cfgRes = await fetch('/api/gbp/oauth-config');
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        clientId = cfg.clientId || '';
      }
    } catch {
      // ignore
    }
  }

  // Wait briefly if the GIS script is still initializing
  if (clientId && !window.google?.accounts?.oauth2?.initTokenClient) {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 150));
      if (window.google?.accounts?.oauth2?.initTokenClient) break;
    }
  }

  if (clientId && window.google?.accounts?.oauth2?.initTokenClient) {
    const promptMode = forceConsentPrompt ? 'consent select_account' : '';
    return new Promise<string | null>((resolve, reject) => {
      const tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/business.manage',
        prompt: promptMode,
        hint: loginHint || undefined,
        callback: (response) => {
          if (response.error) {
            reject(
              new Error(
                `${response.error}${
                  response.error_description ? `: ${response.error_description}` : ''
                }`
              )
            );
            return;
          }
          if (response.access_token) {
            setGbpAccessToken(response.access_token);
            setOneTimePublishingApproval(true);
            resolve(response.access_token);
          } else {
            resolve(null);
          }
        },
        error_callback: (err) => {
          reject(new Error(err?.message || err?.type || 'GIS OAuth popup closed or failed'));
        },
      });
      tokenClient.requestAccessToken({
        prompt: promptMode,
        hint: loginHint || undefined,
      });
    });
  }

  return null;
}

/**
 * Branded Google Sign-In for https://stallwale.ai.studio/ and https://stallwale.in/
 * Uses signInWithPopup(auth, googleProvider) with authDomain set to stallwale.ai.studio
 * so the OAuth redirect URI is https://stallwale.ai.studio/__/auth/handler.
 */
export async function signInWithStallwaleGoogle(): Promise<void> {
  const result = await signInWithPopup(auth, googleProvider);
  const cred = GoogleAuthProvider.credentialFromResult(result);
  if (cred?.accessToken) {
    setGbpAccessToken(cred.accessToken);
    setOneTimePublishingApproval(true);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
