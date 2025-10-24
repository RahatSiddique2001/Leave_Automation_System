// js/auth.js
// Complete auth UI module: signup, signin, signout, onAuthStateChanged UI updates.
// Exports: initAuthHandlers()

import { auth, db } from './firebase-init.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ---------- UI helpers ---------- */
function el(id) {
  return document.getElementById(id);
}

function showAuthMsg(text, isError = false) {
  const elMsg = el('auth-msg');
  if (elMsg) {
    elMsg.textContent = text;
    elMsg.style.color = isError ? 'red' : 'green';
    return;
  }
  console.log((isError ? 'ERROR: ' : '') + text);
}

function clearAuthMsg() {
  const elMsg = el('auth-msg');
  if (elMsg) elMsg.textContent = '';
}

function updateUserArea(user, profile) {
  const area = el('user-area');
  if (!area) return;
  if (!user) {
    area.innerHTML = `<div class="text-muted">Not logged in</div>`;
    return;
  }
  const displayName = profile?.fullName || user.displayName || user.email;
  const teacherIdHtml = profile?.teacherId ? `<div><small>Teacher ID: ${profile.teacherId}</small></div>` : '';
  const roleHtml = profile?.role ? `<div><small>Role: ${profile.role}</small></div>` : '';
  area.innerHTML = `
    <div class="card p-2">
      <strong>${displayName}</strong>
      ${teacherIdHtml}
      ${roleHtml}
    </div>
  `;
}

/* ---------- Core flows ---------- */
async function doSignUp() {
  clearAuthMsg();
  const fullName = el('fullName')?.value.trim() || '';
  const teacherId = el('teacherId')?.value.trim() || '';
  const role = el('role')?.value || 'teacher';
  const email = el('email')?.value.trim() || '';
  const password = el('password')?.value || '';

  console.log('Sign up attempt', { email, role, teacherId, fullName });

  if (!email || !password) {
    showAuthMsg('Email and password required', true);
    return;
  }
  if (password.length < 6) {
    showAuthMsg('Password must be at least 6 characters', true);
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log('createUserWithEmailAndPassword success', cred);

    // update displayName in auth profile (optional)
    if (fullName) {
      try {
        await updateProfile(cred.user, { displayName: fullName });
        console.log('auth profile displayName set');
      } catch (e) {
        console.warn('Failed to set displayName in auth profile', e);
      }
    }

    // Save a user profile doc in Firestore (users/{uid})
    const userDocRef = doc(db, 'users', cred.user.uid);
    await setDoc(userDocRef, {
      uid: cred.user.uid,
      email: email,
      fullName: fullName || null,
      teacherId: teacherId || null,
      role: role || 'teacher',
      createdAt: serverTimestamp()
    });
    console.log('User profile saved to Firestore');

    showAuthMsg('Account created and profile saved!');
    // close modal if present
    const modalEl = document.getElementById('authModal');
    if (modalEl) {
      const bs = bootstrap.Modal.getInstance(modalEl);
      if (bs) bs.hide();
    }
  } catch (err) {
    console.error('Sign up error', err);
    // Firebase error codes come with messages; show friendly fallback
    showAuthMsg(err?.message || 'Sign up failed', true);
  }
}

async function doSignIn() {
  clearAuthMsg();
  const email = el('email')?.value.trim() || '';
  const password = el('password')?.value || '';

  console.log('Sign in attempt', { email });

  if (!email || !password) {
    showAuthMsg('Email and password required', true);
    return;
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.log('signInWithEmailAndPassword success', cred);

    showAuthMsg('Signed in successfully!');
    // close modal if present
    const modalEl = document.getElementById('authModal');
    if (modalEl) {
      const bs = bootstrap.Modal.getInstance(modalEl);
      if (bs) bs.hide();
    }
  } catch (err) {
    console.error('Sign in error', err);
    showAuthMsg(err?.message || 'Sign in failed', true);
  }
}

async function doSignOut() {
  try {
    await signOut(auth);
    console.log('User signed out');
    showAuthMsg('Signed out');
  } catch (err) {
    console.error('Sign out error', err);
    showAuthMsg('Sign out failed', true);
  }
}

/* ---------- Attach handlers and auth state listener ---------- */
export function initAuthHandlers() {
  console.log('initAuthHandlers running');

  const btnSignup = el('btn-signup');
  const btnLogin = el('btn-login');
  const btnLogout = el('btn-logout');

  if (btnSignup) btnSignup.addEventListener('click', doSignUp);
  if (btnLogin) btnLogin.addEventListener('click', doSignIn);
  if (btnLogout) btnLogout.addEventListener('click', doSignOut);

  // Observe auth state & update UI
  onAuthStateChanged(auth, async (user) => {
    console.log('onAuthStateChanged user =', user);

    // set logout/login button visibility
    if (btnLogout) btnLogout.style.display = user ? '' : 'none';
    if (btnLogin) btnLogin.style.display = user ? 'none' : '';
    if (btnSignup) btnSignup.style.display = user ? 'none' : '';

    // update user-area & approvals link visibility
    if (!user) {
      updateUserArea(null, null);
      try {
        const approvalsLink = document.getElementById('approvals-link');
        if (approvalsLink) approvalsLink.style.display = 'none';
      } catch (e) { }
      return;
    }

    // fetch profile from Firestore, if exists
    let profile = null;
    try {
      const udocRef = doc(db, 'users', user.uid);
      const snap = await getDoc(udocRef);
      if (snap.exists()) profile = snap.data();
    } catch (e) {
      console.warn('Failed to read user profile on auth change', e);
    }

    // Update user area display
    updateUserArea(user, profile);

    // Show/hide Approvals link based on role
    try {
      const approvalsLink = document.getElementById('approvals-link');
      const role = profile?.role || null;
      if (approvalsLink) {
        approvalsLink.style.display = (role === 'hod' || role === 'registrar') ? 'inline-block' : 'none';
      }
    } catch (e) {
      console.warn('Failed to toggle approvals link', e);
    }

    // Clear any previous messages after showing welcome briefly
    setTimeout(() => clearAuthMsg(), 3000);
  });
}
