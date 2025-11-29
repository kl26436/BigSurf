import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// Firebase Messaging SDK removed - using Web Push API directly instead
// See push-notification-manager.js for Web Push implementation
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAbzL4bGY026Z-oWiWcYLfDgkmmgAfUY3k",
  authDomain: "workout-tracker-b94b6.firebaseapp.com",
  projectId: "workout-tracker-b94b6",
  storageBucket: "workout-tracker-b94b6.appspot.com",
  messagingSenderId: "111958991290",
  appId: "1:111958991290:web:23e1014ab2ba27df6ebd83"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);

// Firebase Messaging is no longer used - we use Web Push API directly
// See push-notification-manager.js for the implementation
export const messaging = null;

// Set auth persistence to LOCAL (survives browser restarts and redirects)
setPersistence(auth, browserLocalPersistence)
  .then(() => {
  })
  .catch((error) => {
    console.error('❌ Error setting auth persistence:', error);
  });

export const provider = new GoogleAuthProvider();

// Note: 'select_account' prompt can cause redirect loops on production
// Removed for stability - users can sign out and use different account

// Re-export Firebase functions for easy importing
export {
  doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot,
  onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, setPersistence, browserLocalPersistence,
  httpsCallable
};