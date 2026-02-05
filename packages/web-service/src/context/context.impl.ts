// Firebase Context Implementation - ONLY file allowed to import Firebase SDK
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  OAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  deleteField,
  type Firestore,
} from 'firebase/firestore';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';

import type { AppContext } from './context';
import type {
  User,
  UserData,
  Guild,
  GuildStatus,
  GuildLogs,
  Subscription,
  BotValidationResult,
  GmailAuthResult,
  DiscordOAuthParams,
  SubscriptionCheckoutResult,
  Unsubscribe,
  AuthStateListener,
  UserDataListener,
  GuildsListener,
  SubscriptionListener,
  Logger,
} from './types';

interface FirebaseContextConfig {
  googleClientId: string;
  discordRedirectUri: string;
}

export class FirebaseContext implements AppContext {
  private app: FirebaseApp;
  private auth: Auth;
  private db: Firestore;
  private functions: Functions;
  private discordProvider: OAuthProvider;
  private config: FirebaseContextConfig;

  private currentUser: User | null = null;
  private authStateListeners: Set<AuthStateListener> = new Set();
  private authStateInitialized = false;

  private constructor(config: FirebaseContextConfig) {
    this.config = config;

    const firebaseConfig = {
      apiKey: 'AIzaSyAUeQJwDpUO7JiJCVwaKoryoseFKqyBg_Y',
      authDomain: 'claudebot-34c42.firebaseapp.com',
      projectId: 'claudebot-34c42',
      storageBucket: 'claudebot-34c42.firebasestorage.app',
      messagingSenderId: '314308703927',
      appId: '1:314308703927:web:ae04f499bdc705c4147f32',
    };

    this.app = initializeApp(firebaseConfig);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    this.functions = getFunctions(this.app);

    this.discordProvider = new OAuthProvider('oidc.discord');
    this.discordProvider.addScope('identify');
    this.discordProvider.addScope('email');
    this.discordProvider.addScope('guilds');

    // Setup auth state listener
    this.setupAuthListener();
  }

  static async create(config: FirebaseContextConfig): Promise<FirebaseContext> {
    return new FirebaseContext(config);
  }

  private setupAuthListener(): void {
    onAuthStateChanged(this.auth, (firebaseUser) => {
      this.currentUser = firebaseUser ? this.transformFirebaseUser(firebaseUser) : null;
      this.authStateInitialized = true;
      this.authStateListeners.forEach((listener) => listener(this.currentUser));
    });
  }

  private transformFirebaseUser(firebaseUser: FirebaseUser): User {
    return {
      id: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
    };
  }

  // ============ Authentication ============

  async signInWithDiscord(): Promise<User> {
    const result = await signInWithPopup(this.auth, this.discordProvider);
    const user = this.transformFirebaseUser(result.user);

    const userDocRef = doc(this.db, 'users', user.id);
    const userDoc = await getDoc(userDocRef);

    const userData: UserData = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: userDoc.exists() ? userDoc.data().createdAt : new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    await setDoc(userDocRef, userData, { merge: true });

    return user;
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(this.auth);
  }

  watchAuthState(listener: AuthStateListener): Unsubscribe {
    this.authStateListeners.add(listener);
    // Only call listener immediately if auth state has been initialized
    if (this.authStateInitialized) {
      listener(this.currentUser);
    }
    return () => {
      this.authStateListeners.delete(listener);
    };
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  // ============ User Data ============

  async getUserData(userId: string): Promise<UserData | null> {
    const userDocRef = doc(this.db, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    return userDoc.exists() ? (userDoc.data() as UserData) : null;
  }

  watchUserData(userId: string, listener: UserDataListener): Unsubscribe {
    const userDocRef = doc(this.db, 'users', userId);

    // First check if document exists, create if not
    getDoc(userDocRef).then((docSnap) => {
      if (!docSnap.exists() && this.currentUser) {
        // Create initial user document
        const initialData: UserData = {
          id: userId,
          email: this.currentUser.email,
          displayName: this.currentUser.displayName,
          photoURL: this.currentUser.photoURL,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
        setDoc(userDocRef, initialData);
      }
    });

    return onSnapshot(userDocRef, (docSnap) => {
      listener(docSnap.exists() ? (docSnap.data() as UserData) : null);
    });
  }

  async updateUserData(userId: string, data: Partial<UserData>): Promise<void> {
    const userDocRef = doc(this.db, 'users', userId);
    await updateDoc(userDocRef, data as Record<string, unknown>);
  }

  // ============ Guilds ============

  watchUserGuilds(userId: string, listener: GuildsListener): Unsubscribe {
    const guildsRef = collection(this.db, 'guilds');
    const q = query(guildsRef, where('userId', '==', userId));

    return onSnapshot(q, (snapshot) => {
      const guilds = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Guild[];
      listener(guilds);
    });
  }

  async getGuildStatus(guildId: string): Promise<GuildStatus> {
    const getGuildStatusFunc = httpsCallable(this.functions, 'getGuildStatus');
    const result = await getGuildStatusFunc({ guildId });
    return result.data as GuildStatus;
  }

  async getGuildLogs(guildId: string): Promise<GuildLogs> {
    const getGuildLogsFunc = httpsCallable(this.functions, 'getGuildLogs');
    const result = await getGuildLogsFunc({ guildId });
    return result.data as GuildLogs;
  }

  async restartGuild(guildId: string): Promise<void> {
    const restartGuildFunc = httpsCallable(this.functions, 'restartGuild');
    await restartGuildFunc({ guildId });
  }

  async deployGuildUpdate(guildId: string, version: string): Promise<void> {
    const deployGuildUpdateFunc = httpsCallable(this.functions, 'deployGuildUpdate');
    await deployGuildUpdateFunc({ guildId, version });
  }

  async deprovisionGuild(guildId: string): Promise<void> {
    const deprovisionGuildFunc = httpsCallable(this.functions, 'deprovisionGuild');
    await deprovisionGuildFunc({ guildId });
  }

  async triggerPaidTierProvisioning(guildId: string): Promise<void> {
    const provisionPaidTierGuildFunc = httpsCallable(this.functions, 'provisionPaidTierGuild');
    await provisionPaidTierGuildFunc({ guildId });
  }

  // ============ Subscriptions ============

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    const subscriptionRef = doc(this.db, 'subscriptions', subscriptionId);
    const subscriptionDoc = await getDoc(subscriptionRef);
    return subscriptionDoc.exists() ? (subscriptionDoc.data() as Subscription) : null;
  }

  watchSubscription(subscriptionId: string, listener: SubscriptionListener): Unsubscribe {
    const subscriptionRef = doc(this.db, 'subscriptions', subscriptionId);
    return onSnapshot(subscriptionRef, (docSnap) => {
      listener(docSnap.exists() ? (docSnap.data() as Subscription) : null);
    });
  }

  async createGuildSubscription(
    guildId: string,
    tier: 'starter' | 'pro',
    userId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<SubscriptionCheckoutResult> {
    const createGuildSubscriptionFunc = httpsCallable(this.functions, 'createGuildSubscription');
    const result = await createGuildSubscriptionFunc({
      guildId,
      tier,
      userId,
      successUrl,
      cancelUrl,
    });
    return result.data as SubscriptionCheckoutResult;
  }

  async createBillingPortal(userId: string, returnUrl: string): Promise<{ url: string }> {
    const createBillingPortalFunc = httpsCallable(this.functions, 'createBillingPortal');
    const result = await createBillingPortalFunc({ userId, returnUrl });
    return result.data as { url: string };
  }

  // ============ OAuth ============

  async processDiscordOAuth(params: DiscordOAuthParams): Promise<void> {
    const processDiscordOAuthFunc = httpsCallable(this.functions, 'processDiscordOAuth');
    await processDiscordOAuthFunc(params);
  }

  initiateGmailOAuth(userId: string, botId: string): void {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');

    const state = this.generateOAuthState({ botId, userId });
    const redirectUri = `${window.location.origin}/auth/callback/gmail`;

    const params = new URLSearchParams({
      client_id: this.config.googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    this.openExternalUrl(authUrl);
  }

  async exchangeGmailToken(
    code: string,
    userId: string,
    botId: string,
    redirectUri: string
  ): Promise<GmailAuthResult> {
    const exchangeGmailTokenFunc = httpsCallable(this.functions, 'exchangeGmailToken');
    const result = await exchangeGmailTokenFunc({
      code,
      userId,
      botId,
      redirectUri,
    });
    return result.data as GmailAuthResult;
  }

  async disconnectGmail(userId: string, botId: string): Promise<void> {
    const botRef = doc(this.db, 'users', userId, 'bots', botId);
    await updateDoc(botRef, {
      'oauthConnections.gmail': deleteField(),
      'toolsConfig.gmail': deleteField(),
    });
  }

  // ============ Bot Token Validation ============

  async validateBotToken(botToken: string): Promise<BotValidationResult> {
    const validateBotTokenFunc = httpsCallable(this.functions, 'validateBotToken');
    const result = await validateBotTokenFunc({ botToken });
    return result.data as BotValidationResult;
  }

  async saveBotToken(userId: string, botToken: string): Promise<void> {
    const userRef = doc(this.db, 'users', userId);
    await updateDoc(userRef, { botToken });
  }

  async saveGuildSelection(userId: string, guildId: string): Promise<void> {
    const userRef = doc(this.db, 'users', userId);
    await updateDoc(userRef, { guildId });
  }

  async clearBotToken(userId: string): Promise<void> {
    const userRef = doc(this.db, 'users', userId);
    await updateDoc(userRef, {
      botToken: null,
      guildId: null,
    });
  }

  // ============ Utilities ============

  logger: Logger = {
    info: (message, meta) => console.log(message, meta),
    error: (message, error) => console.error(message, error),
    warn: (message, meta) => console.warn(message, meta),
  };

  getCurrentTime(): Date {
    return new Date();
  }

  generateOAuthState(data: Record<string, unknown>): string {
    return btoa(JSON.stringify(data));
  }

  parseOAuthState(state: string): Record<string, unknown> {
    return JSON.parse(atob(state)) as Record<string, unknown>;
  }

  openExternalUrl(url: string): void {
    window.location.href = url;
  }
}
