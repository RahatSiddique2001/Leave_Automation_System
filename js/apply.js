// js/apply.js
// Complete, ready-to-drop file for the Apply page.
// Responsibilities:
// - Guard page (redirect to index if not authenticated)
// - Submit leave requests (with route + optional attachment upload)
// - Render the signed-in user's requests
// - Uses Firestore (requests, users) and Storage (attachments)

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    getDocs,
    updateDoc,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

const storage = getStorage();

/* ---------- UI helpers ---------- */
function showMsg(text, isError = false) {
    const el = document.getElementById('apply-msg');
    if (!el) {
        console.log((isError ? 'ERROR: ' : '') + text);
        return;
    }
    el.textContent = text;
    el.style.color = isError ? 'red' : 'green';
}

/* ---------- Submit handler ---------- */
async function submitLeave(event, user) {
    event.preventDefault();
    const btn = document.getElementById('btnSubmitLeave');
    if (btn) btn.disabled = true;
    showMsg('');

    try {
        const type = document.getElementById('leaveType').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const reason = document.getElementById('reason').value.trim();
        const routeEl = document.getElementById('route');
        const route = routeEl ? routeEl.value : 'via_hod';
        const attachmentInput = document.getElementById('attachment');
        const attachments = [];

        // Basic validations
        if (!startDate || !endDate || !reason) {
            showMsg('Please fill all required fields.', true);
            if (btn) btn.disabled = false;
            return;
        }
        if (new Date(endDate) < new Date(startDate)) {
            showMsg('End date cannot be before start date.', true);
            if (btn) btn.disabled = false;
            return;
        }

        // Fetch profile from users/{uid} if exists
        const userDocRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);
        const profile = userSnap.exists() ? userSnap.data() : {};

        // Create the request document first so we have an ID for storage path
        const requestsCol = collection(db, 'requests');
        const newDocRef = await addDoc(requestsCol, {
            uid: user.uid,
            email: user.email,
            fullName: profile.fullName || null,
            teacherId: profile.teacherId || null,
            role: profile.role || 'teacher',
            type,
            startDate,
            endDate,
            reason,
            route,
            currentStage: route === 'via_hod' ? 'pending_hod' : 'pending_registrar',
            status: 'pending',
            approverUid: null,
            approverComment: null,
            attachments: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        console.log('Created request doc id =', newDocRef.id);

        // Optional file upload (single file). If you want multiple files, iterate.
        if (attachmentInput && attachmentInput.files && attachmentInput.files.length > 0) {
            const file = attachmentInput.files[0];
            const path = `attachments/${user.uid}/${newDocRef.id}/${file.name}`;
            const sref = storageRef(storage, path);
            await uploadBytes(sref, file);
            const url = await getDownloadURL(sref);
            attachments.push({ name: file.name, storagePath: path, url });
            // update the request doc with attachments metadata
            await updateDoc(newDocRef, { attachments, updatedAt: serverTimestamp() });
            console.log('Uploaded attachment and updated request doc');
        }

        showMsg('Leave request submitted!');
        // reset form
        const form = document.getElementById('leaveForm');
        if (form) form.reset();

        // refresh list
        await renderMyRequests(user.uid);
    } catch (err) {
        console.error('Submit leave failed', err);
        showMsg(err?.message || 'Failed to submit leave', true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

/* ---------- Render user's requests ---------- */
async function renderMyRequests(uid) {
    const listEl = document.getElementById('my-requests-list');
    if (!listEl) return;
    listEl.innerHTML = '<h4>My Requests</h4><div>Loading...</div>';

    try {
        const q = query(
            collection(db, 'requests'),
            where('uid', '==', uid),
            orderBy('createdAt', 'desc')
        );
        const snaps = await getDocs(q);
        if (snaps.empty) {
            listEl.innerHTML = '<h4>My Requests</h4><div class="text-muted">No requests yet.</div>';
            return;
        }

        let html = '<h4>My Requests</h4><div class="list-group">';
        snaps.forEach(docSnap => {
            const d = docSnap.data();
            let created = '';
            try {
                created = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : (d.createdAt || '');
            } catch (e) {
                created = '';
            }
            const attachmentsHtml = (d.attachments && d.attachments.length)
                ? `<div class="mt-2"><small>Attachments: ${d.attachments.map(a => `<a href="${a.url}" target="_blank" rel="noopener">${a.name}</a>`).join(', ')}</small></div>`
                : '';

            html += `
        <div class="list-group-item">
          <div class="d-flex justify-content-between">
            <div>
              <strong>${d.type}</strong> — ${d.startDate} → ${d.endDate}
              <div><small>${d.reason}</small></div>
            </div>
            <div class="text-end">
              <div><span class="badge bg-${d.status === 'pending' ? 'warning text-dark' : d.status === 'approved' ? 'success' : 'danger'}">${d.status}</span></div>
              <div><small class="text-muted">${d.currentStage || ''}</small></div>
            </div>
          </div>
          ${attachmentsHtml}
          <div class="text-muted mt-2"><small>Submitted: ${created}</small></div>
        </div>
      `;
        });
        html += '</div>';
        listEl.innerHTML = html;
    } catch (e) {
        console.error('Failed to load requests', e);
        listEl.innerHTML = '<div class="text-danger">Failed to load requests</div>';
    }
}

/* ---------- Init function exported for page ---------- */
export function initApplyPage() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // Not logged in — redirect to home
            window.location.href = '/index.html';
            return;
        }

        // Attach submit handler once
        const form = document.getElementById('leaveForm');
        if (form) {
            // ensure we don't add multiple listeners
            form.removeEventListener('submit', submitLeave);
            form.addEventListener('submit', (e) => submitLeave(e, user));
        }

        // Render user's requests
        await renderMyRequests(user.uid);
    });
}
