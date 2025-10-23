// js/firebase-init.js
// Use browser ES module imports from Firebase CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// <-- paste the exact config object you copied from the Firebase console -->
const firebaseConfig = {
  apiKey: "AIzaSyAo4lAOLz94KVt0yJWyBuxEMv2cQr10YcA",
  authDomain: "leave-automation-system.firebaseapp.com",
  projectId: "leave-automation-system",
  storageBucket: "leave-automation-system.firebasestorage.app", // ensure this matches console (often appspot.com)
  messagingSenderId: "931470257331",
  appId: "1:931470257331:web:ec25db587fe8ae1360d4c6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export for other modules (auth.js, app.js, etc.)
export { app, auth, db };
