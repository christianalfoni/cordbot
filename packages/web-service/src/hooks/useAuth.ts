import { useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, discordProvider, db } from '../firebase';

export interface ToolCategory {
  id: string;
  name: string;
  description: string;
  authType: 'oauth2' | 'api_key' | 'none';
  connected: boolean;
  dependencies?: string[];
  tools: Array<{
    id: string;
    name: string;
    description: string;
    permissionLevel: 'read' | 'write';
    enabled: boolean;
  }>;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ToolsManifest {
  categories: ToolCategory[];
  tokens: {
    [categoryId: string]: OAuthToken;
  };
}

export interface UserData {
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  discordId?: string;
  discordUsername?: string;
  createdAt: string;
  lastLoginAt: string;
  botToken?: string;
  guildId?: string;
  memoryContextSize?: number; // Token budget for memory context (self-hosted bots, default: 10000)
  toolsManifest?: ToolsManifest;
  oauthConnections?: {
    gmail?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      email: string;
      scope: string;
      connectedAt: string;
    };
  };
  toolsConfig?: {
    [domain: string]: string[]; // e.g., { gmail: ['send_email', 'list_messages'] }
  };
  hostingBetaRequested?: boolean;
  hostingBetaApproved?: boolean;
  // Note: Bots are now stored in a subcollection: users/{userId}/bots/{botId}
  // Use useHostedBots hook to access them
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      // Clean up previous snapshot listener if any
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = undefined;
      }

      if (firebaseUser) {
        // Load or create user data in Firestore
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          // Create new user document
          const newUserData: UserData = {
            id: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          };
          await setDoc(userDocRef, newUserData);
          setUserData(newUserData);
        }

        // Set up real-time listener for user data changes
        unsubscribeSnapshot = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            setUserData(doc.data() as UserData);
          }
        });
      } else {
        setUserData(null);
      }

      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, []);

  const signInWithDiscord = async () => {
    try {
      const result = await signInWithPopup(auth, discordProvider);
      const user = result.user;

      // Update user data with Discord info
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      const userData: UserData = {
        id: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: userDoc.exists() ? userDoc.data().createdAt : new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      await setDoc(userDocRef, userData, { merge: true });

      return user;
    } catch (error) {
      console.error('Error signing in with Discord:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return {
    user,
    userData,
    loading,
    signInWithDiscord,
    signOut,
  };
}
