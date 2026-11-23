/// <reference types="vite/client" />
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_BACKEND?: 'memory' | 'firebase';
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}
