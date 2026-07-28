// Firebase web configuration.
// Replace every REPLACE_* value using Firebase Console → Project settings → Your apps.
// These values identify the Firebase project; Firestore Security Rules protect user data.

export const firebaseConfig = {
  apiKey: "REPLACE_API_KEY",
  authDomain: "REPLACE_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_PROJECT_ID",
  storageBucket: "REPLACE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "REPLACE_MESSAGING_SENDER_ID",
  appId: "REPLACE_APP_ID"
};

export const vapidKey = "REPLACE_WEB_PUSH_VAPID_PUBLIC_KEY";
