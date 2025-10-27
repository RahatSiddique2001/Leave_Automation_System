// js/apply.js - MODIFIED VERSION with Department Support

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

/* ---------- Helper: read file as data URL (base64) ---------- */
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = (err) => reject(err);
        fr.readAsDataURL(file);
    });
}

/* ---------- Submit handler ---------- */
async function submitLeave(event, user) {
    event.preventDefault();
    const btn = document.getElementById('btnSubmitLeave');
    if (btn) btn.disabled = true;
    showMsg('');

    try {
        const type = (document.getElementById('leaveType')?.value || '').trim();
        const startDate = (document.getElementById('startDate')?.value || '').trim();
        const endDate = (document.getElementById('endDate')?.value || '').trim();
        const reason = (document.getElementById('reason')?.value || '').trim();
        const routeEl = document.getElementById('route');
        const route = routeEl ? routeEl.value : 'via_hod';

        // inputs (may or may not exist)
        const attachmentInput = document.getElementById('attachment');
        const attachmentUrlEl = document.getElementById('attachmentUrl');

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

        // NEW: Get user's department
        const userDepartment = profile.department || null;

        // NEW: Validate that teacher has a department assigned
        if (route === 'via_hod' && (!userDepartment || userDepartment === '')) {
            showMsg('You need to be assigned to a department to submit via HOD. Please update your profile.', true);
            if (btn) btn.disabled = false;
            return;
        }

        // Create the request document first with empty attachments array
        const requestsCol = collection(db, 'requests');

        // NEW: Include department in request data
        const requestData = {
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
        };

        // NEW: Add department to request data
        if (userDepartment) {
            requestData.department = userDepartment;
        }

        const newDocRef = await addDoc(requestsCol, requestData);

        console.log('Created request doc id =', newDocRef.id, 'with department:', userDepartment);

        // Prepare attachments array
        const attachments = [];

        // External URL (if provided) -> store as {name, url}
        const attachmentUrl = attachmentUrlEl ? (attachmentUrlEl.value || '').trim() : '';
        if (attachmentUrl) {
            const parsedName = (attachmentUrl.split('/').pop() || 'External file').split('?')[0];
            attachments.push({ name: parsedName, url: attachmentUrl });
        }

        // Local file(s) handling
        if (attachmentInput && attachmentInput.files && attachmentInput.files.length > 0) {
            for (let i = 0; i < attachmentInput.files.length; i++) {
                const file = attachmentInput.files[i];
                try {
                    const dataUrl = await readFileAsDataURL(file);
                    attachments.push({
                        name: file.name,
                        url: dataUrl
                    });
                } catch (err) {
                    console.warn('Failed to read file as data URL', err);
                }
            }
        }

        // If we collected attachments, update the document with the array
        if (attachments.length > 0) {
            try {
                await updateDoc(newDocRef, { attachments, updatedAt: serverTimestamp() });
                console.log('Saved attachments metadata on request doc');
            } catch (err) {
                console.error('Failed to save attachments to request doc', err);
                showMsg('Request submitted but attachments could not be saved (file too large?).', true);
            }
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

            // NEW: Show department if available
            const departmentHtml = d.department ? `<div><small>Department: ${d.department}</small></div>` : '';

            // Build attachments html
            let attachmentsHtml = '';
            if (d.attachments && Array.isArray(d.attachments) && d.attachments.length) {
                attachmentsHtml = `<div class="mt-2"><small>Attachments: ${d.attachments.map(a => {
                    const href = a.url || '#';
                    const display = a.name || (typeof a === 'string' ? (a.split('/').pop() || 'Attachment') : 'Attachment');
                    return `<a href="${href}" target="_blank" rel="noopener">${display}</a>`;
                }).join(', ')}</small></div>`;
            } else if (d.attachments && typeof d.attachments === 'string') {
                attachmentsHtml = `<div class="mt-2"><small>Attachment: <a href="${d.attachments}" target="_blank" rel="noopener">${d.attachments.split('/').pop()}</a></small></div>`;
            }

            html += `
        <div class="list-group-item">
          <div class="d-flex justify-content-between">
            <div>
              <strong>${d.type}</strong> — ${d.startDate} → ${d.endDate}
              <div><small>${d.reason}</small></div>
              ${departmentHtml}
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
            window.location.href = '/index.html';
            return;
        }

        // NEW: Check if teacher has department assigned
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userDocRef);
            const profile = userSnap.exists() ? userSnap.data() : {};

            // Show warning if teacher doesn't have department but tries to use HOD route
            const routeSelect = document.getElementById('route');
            if (routeSelect && profile.role === 'teacher' && (!profile.department || profile.department === '')) {
                showMsg('Warning: You are not assigned to any department. You can only submit requests directly to Registrar.', true);
                if (routeSelect) {
                    routeSelect.value = 'direct_registrar';
                    routeSelect.disabled = true;
                }
            }
        } catch (error) {
            console.warn('Could not check user department:', error);
        }

        // Attach submit handler once
        const form = document.getElementById('leaveForm');
        if (form) {
            form.removeEventListener('submit', submitLeave);
            form.addEventListener('submit', (e) => submitLeave(e, user));
        }

        // Render user's requests
        await renderMyRequests(user.uid);
    });
}