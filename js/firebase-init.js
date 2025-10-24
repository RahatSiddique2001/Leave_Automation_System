// js/firebase-init.js
// Firebase initialization (modular SDK v11).
// Exports: app, auth, db, storage
// - Use this from other modules with: import { auth, db, storage } from './js/firebase-init.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

// --------------------
// Replace these values with the exact config from your Firebase console for this project.
// I kept the values you previously provided but double-check in the console if you ever see API_KEY_INVALID / project-not-found errors.
// --------------------
const firebaseConfig = {
  apiKey: "AIzaSyAo4lAOLz94KVt0yJWyBuxEMv2cQr10YcA",
  authDomain: "leave-automation-system.firebaseapp.com",
  projectId: "leave-automation-system",
  storageBucket: "leave-automation-system.appspot.com", // appspot.com is typical
  messagingSenderId: "931470257331",
  appId: "1:931470257331:web:ec25db587fe8ae1360d4c6"
};

// Initialize Firebase app & services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Helpful logs for debugging during development
console.log('Firebase initialized for project:', firebaseConfig.projectId);
window.addEventListener('error', (e) => {
  console.error('Window error:', e);
});

export { app, auth, db, storage };
