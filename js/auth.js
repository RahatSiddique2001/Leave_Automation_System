// js/auth.js
import { auth, db } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export function initAuthHandlers() {
  const btnSignup = document.getElementById('btn-signup');
  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const authMsg = document.getElementById('auth-msg');

  const showMsg = (m, type='danger') => {
    authMsg.innerHTML = `<div class="alert alert-${type}">${m}</div>`;
    setTimeout(()=> authMsg.innerHTML = '', 2500);
  };

  // Signup
  btnSignup.addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const name = document.getElementById('fullName').value.trim();
    const role = document.getElementById('role').value;
    const teacherId = document.getElementById('teacherId').value.trim();

    if (!email || !password || !name) { showMsg('Name, email and password required'); return; }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      // save profile in users collection
      await setDoc(doc(db, 'users', uid), {
        name, email, role, teacherId, rank: ''
      });
      showMsg('Signup successful', 'success');
      // hide modal
      setTimeout(()=> bootstrap.Modal.getInstance(document.getElementById('authModal')).hide(), 700);
    } catch (err) {
      showMsg(err.message);
    }
  });

  // Login
  btnLogin.addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) { showMsg('Email & password required'); return; }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      showMsg('Logged in', 'success');
      setTimeout(()=> bootstrap.Modal.getInstance(document.getElementById('authModal')).hide(), 700);
    } catch (err) {
      showMsg(err.message);
    }
  });

  // Logout
  btnLogout.addEventListener('click', async () => {
    await signOut(auth);
  });

  // Auth state changes
  onAuthStateChanged(auth, async user => {
    const userArea = document.getElementById('user-area');
    if (user) {
      // show logout button and hide login buttons inside modal
      document.getElementById('btn-logout').style.display = 'inline-block';
      document.getElementById('btn-login').style.display = 'none';
      document.getElementById('btn-signup').style.display = 'none';
      // load profile
      const snap = await getDoc(doc(db, 'users', user.uid));
      const data = snap.exists() ? snap.data() : { name: 'User', role: 'teacher' };
      userArea.innerHTML = `<div class="alert alert-success">Logged in as <strong>${data.name}</strong> (${data.role})</div>`;
    } else {
      userArea.innerHTML = '';
      document.getElementById('btn-logout').style.display = 'none';
      document.getElementById('btn-login').style.display = 'inline-block';
      document.getElementById('btn-signup').style.display = 'inline-block';
    }
  });
}
