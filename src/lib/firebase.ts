import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Config loaded from firebase-applet-config.json
const firebaseConfig = {
  apiKey: "REDACTED_FIREBASE_KEY",
  authDomain: "gen-lang-client-0198159235.firebaseapp.com",
  projectId: "gen-lang-client-0198159235",
  storageBucket: "gen-lang-client-0198159235.firebasestorage.app",
  messagingSenderId: "36613802708",
  appId: "1:36613802708:web:58b5783a017b644b298941"
};

const DATABASE_ID = "ai-studio-ubersurgedemandt-5bc507fc-add0-4028-b5e0-6cad574b6975";

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

