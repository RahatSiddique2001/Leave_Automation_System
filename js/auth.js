// js/auth.js - CLEANED VERSION
// Registration access codes - ONLY FOR REGISTRAR
const REGISTRATION_CODES = {
  registrar: "REG2025" // Only registrar needs code
};

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

// In auth.js - add these imports
import { DEFAULT_LEAVE_BALANCES, getCurrentAcademicYear } from './leave-config.js';

// Add this function to create/initialize leave balances
async function initializeUserLeaveBalances(userId) {
  try {
    const balanceRef = doc(db, 'leaveBalances', userId);
    const balanceSnap = await getDoc(balanceRef);

    if (!balanceSnap.exists()) {
      // Create new balance record
      await setDoc(balanceRef, {
        userId: userId,
        ...DEFAULT_LEAVE_BALANCES,
        academicYear: getCurrentAcademicYear(),
        lastUpdated: serverTimestamp()
      });
      console.log('Leave balances initialized for user:', userId);
    } else {
      // Check if academic year has changed and reset balances if needed
      const balanceData = balanceSnap.data();
      const currentAcademicYear = getCurrentAcademicYear();

      if (balanceData.academicYear !== currentAcademicYear) {
        // Academic year changed - reset balances
        await setDoc(balanceRef, {
          ...DEFAULT_LEAVE_BALANCES,
          academicYear: currentAcademicYear,
          lastUpdated: serverTimestamp()
        });
        console.log('Leave balances reset for new academic year:', currentAcademicYear);
      }
    }
  } catch (error) {
    console.error('Error initializing leave balances:', error);
  }
}

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

// Fixed department list for your university
const FIXED_DEPARTMENTS = [
  "Department of Accounting and Information Systems",
  "Department of Agronomy and Agricultural Extension",
  "Department of Anthropology",
  "Department of Applied Chemistry & Chemical Engineering",
  "Department of Applied Mathematics",
  "Department of Arabic",
  "Department of Banking and Insurance",
  "Department of Bangla",
  "Department of Biochemistry & Molecular Biology",
  "Department of Botany",
  "Department of Ceramics and Sculpture",
  "Department of Chemistry",
  "Department of Civil Engineering",
  "Department of Clinical Psychology",
  "Department of Computer Science & Engineering",
  "Department of Crop Science and Technology",
  "Department of Economics",
  "Department of Electrical and Electronic Engineering",
  "Department of English",
  "Department of Finance",
  "Department of Fisheries",
  "Department of Folklore & Social Development studies",
  "Department of Genetic Engineering & Biotechnology",
  "Department of Geography & Environmental Studies",
  "Department of Geology & Mining",
  "Department of Graphic Design, Crafts & History of Art",
  "Department of History",
  "Department of Information & Communication Engineering",
  "Department of Information Science & Library Management",
  "Department of International Relations",
  "Department of Islamic History & Culture",
  "Department of Islamic Studies",
  "Department of Law",
  "Department of Law and Land Administration",
  "Department of Management Studies",
  "Department of Marketing",
  "Department of Mass Communication and Journalism",
  "Department of Materials Science and Engineering",
  "Department of Mathematics",
  "Department of Microbiology",
  "Department of Music",
  "Department of Persian language and literature",
  "Department of Pharmacy",
  "Department of Philosophy",
  "Department of Physical Education and Sports Sciences",
  "Department of Physics",
  "Department of Political Science",
  "Department of Population Science & Human Resource Development",
  "Department of Psychology",
  "Department of Public Administration",
  "Department of Sociology",
  "Department of Social Work",
  "Department of Sanskrit",
  "Department of Statistics",
  "Department of Theatre",
  "Department of Tourism and Hospitality Management",
  "Department of Urdu",
  "Department of Veterinary & Animal Sciences",
  "Department of Zoology"
];

// Simplified function to populate departments dropdown
function populateDepartments() {

  const passwordInput = el('REG2025');
  if (passwordInput) {
    if (selectedRole === 'registrar') {
      passwordInput.placeholder = 'Enter Registrar Access Code';
    } else {
      passwordInput.placeholder = 'Password';
    }
  }
  const roleSelect = el('role');
  const departmentGroup = el('department-group');
  const departmentSelect = el('department');

  if (!roleSelect || !departmentGroup || !departmentSelect) return;

  const selectedRole = roleSelect.value;

  if (selectedRole === 'hod' || selectedRole === 'teacher') {
    departmentGroup.style.display = 'block';
    departmentSelect.innerHTML = '<option value="">Select Department</option>';
    FIXED_DEPARTMENTS.forEach(dept => {
      const option = document.createElement('option');
      option.value = dept;
      option.textContent = dept;
      departmentSelect.appendChild(option);
    });
  } else {
    departmentGroup.style.display = 'none';
  }
  // NO ACCESS CODE LOGIC HERE
}

function updateUserArea(user, profile) {
  const area = el('user-area');
  if (!area) return;
  if (!user) {
    area.innerHTML = `<div class="text-muted">Not logged in</div>`;
    return;
  }
  const displayName = profile?.fullName || user.displayName || user.email;
  const roleHtml = profile?.role ? `<div><small>Role: ${profile.role}</small></div>` : '';
  const departmentHtml = profile?.department ? `<div><small>Department: ${profile.department}</small></div>` : '';

  area.innerHTML = `
    <div class="card p-2">
      <strong>${displayName}</strong>
      ${roleHtml}
      ${departmentHtml}
    </div>
  `;
}

/* ---------- Core flows ---------- */
async function doSignUp() {
  clearAuthMsg();
  const fullName = el('fullName')?.value.trim() || '';
  const role = el('role')?.value || 'teacher';
  const email = el('email')?.value.trim() || '';
  const password = el('password')?.value || '';
  const department = el('department')?.value || '';
  const accessCode = el('accessCode')?.value.trim() || '';

  console.log('Sign up attempt', { email, role, fullName, department });

  // Access code validation ONLY for Registrar
  if (role === 'registrar') {
    const requiredCode = REGISTRATION_CODES.registrar;
    if (password !== requiredCode) {
      showAuthMsg(`Invalid access code for Registrar role. Contact Admin for code.`, true);
      return;
    }
  }

  // Department validation
  if ((role === 'hod' || role === 'teacher') && !department) {
    showAuthMsg('Please select a department', true);
    return;
  }

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

    // Prepare user data with department
    const userData = {
      uid: cred.user.uid,
      email: email,
      fullName: fullName || null,
      role: role || 'teacher',
      createdAt: serverTimestamp()
    };

    // Add department only for HOD and Teacher roles
    if (role === 'hod' || role === 'teacher') {
      userData.department = department;
    }

    // Save a user profile doc in Firestore (users/{uid})
    const userDocRef = doc(db, 'users', cred.user.uid);
    await setDoc(userDocRef, userData);

    // After saving user profile, add:
    await initializeUserLeaveBalances(cred.user.uid);

    console.log('User profile saved to Firestore with department:', department);

    showAuthMsg('Account created and profile saved!');

    // Redirect based on role
    setTimeout(() => {
      if (role === 'teacher') {
        window.location.href = 'apply.html';
      } else if (role === 'hod' || role === 'registrar') {
        window.location.href = 'approvals.html';
      }
    }, 1500);

    // close modal if present
    const modalEl = document.getElementById('authModal');
    if (modalEl) {
      const bs = bootstrap.Modal.getInstance(modalEl);
      if (bs) bs.hide();
    }
  } catch (err) {
    console.error('Sign up error', err);
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

    // Get user role and redirect
    const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;
    const role = userData?.role || 'teacher';

    setTimeout(() => {
      if (role === 'teacher') {
        window.location.href = 'apply.html';
      } else if (role === 'hod' || role === 'registrar') {
        window.location.href = 'approvals.html';
      }
    }, 1000);

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
  const roleSelect = el('role');

  if (btnSignup) btnSignup.addEventListener('click', doSignUp);
  if (btnLogin) btnLogin.addEventListener('click', doSignIn);
  if (btnLogout) btnLogout.addEventListener('click', doSignOut);

  // Role change listener for department field
  if (roleSelect) {
    roleSelect.addEventListener('change', populateDepartments);
  }

  // Initial population of departments
  populateDepartments();

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