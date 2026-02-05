/**
 * Firebase Auth Triggers - Handle user lifecycle events
 */

import { beforeUserCreated } from 'firebase-functions/v2/identity';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Create user document when Firebase Auth user is created
 * This runs BEFORE the user is created in Firebase Auth
 */
export const onUserCreate = beforeUserCreated(async (event) => {
  if (!event.data) {
    console.error('No user data in auth event');
    return;
  }

  const { uid, email, displayName, photoURL } = event.data;

  const now = new Date().toISOString();

  // Create user document in Firestore
  await db.collection('users').doc(uid).set({
    id: uid,
    email: email || null,
    displayName: displayName || null,
    photoURL: photoURL || null,
    createdAt: now,
    lastLoginAt: now,
  });

  console.log(`Created user document for ${uid}`);
});

/**
 * Update lastLoginAt timestamp for a user
 * Called by the client after successful sign-in
 */
export const updateLastLogin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;
  const now = new Date().toISOString();

  await db.collection('users').doc(userId).update({
    lastLoginAt: now,
  });

  return { success: true };
});
