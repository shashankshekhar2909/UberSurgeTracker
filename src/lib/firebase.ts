import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Config loaded from environment variables (see .env.example). Never hardcode secrets here.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const DATABASE_ID = process.env.FIREBASE_DATABASE_ID;

let app: any;
let auth: any;
let googleProvider: any;
let db: any;

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  db = getFirestore(app, DATABASE_ID);
} catch (error) {
  console.error("Firebase safety initialization failed. Engaging mock/stub mode to prevent white-screen crashes:", error);
  // Create stubs so the app doesn't crash on import
  app = {} as any;
  auth = {
    currentUser: null,
    onAuthStateChanged: (cb: any) => {
      cb(null);
      return () => {};
    },
  } as any;
  googleProvider = {} as any;
  db = {} as any;
}

export { app, auth, googleProvider, db };

