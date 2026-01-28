import { initializeApp } from "firebase/app";
import { getAuth, OAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAUeQJwDpUO7JiJCVwaKoryoseFKqyBg_Y",
  authDomain: "claudebot-34c42.firebaseapp.com",
  projectId: "claudebot-34c42",
  storageBucket: "claudebot-34c42.firebasestorage.app",
  messagingSenderId: "314308703927",
  appId: "1:314308703927:web:ae04f499bdc705c4147f32"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// Configure Discord OAuth provider
export const discordProvider = new OAuthProvider('oidc.discord');
discordProvider.addScope('identify');
discordProvider.addScope('email');
discordProvider.addScope('guilds'); // Access to user's servers
