// js/approvals.js
// Complete, ready-to-drop file for the Approvals page.
// Responsibilities:
// - Guard page (redirect to index if not authenticated)
// - List pending requests (pending_hod and pending_registrar as appropriate)
// - Show request details in a modal and allow approver to Forward / Approve / Reject
// - Append a history entry using arrayUnion
// - Uses Firestore (requests, users) and Auth

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    getDoc,
    doc,
    updateDoc,
    serverTimestamp,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ---------- Module state ---------- */
let currentUser = null;
let currentRequestDoc = null; // { id, data }

/* ---------- UI helpers ---------- */
function showMsg(text, isError = false) {
    const el = document.getElementById('approver-msg');
    if (!el) return console.log((isError ? 'ERROR: ' : '') + text);
    el.textContent = text;
    el.style.color = isError ? 'red' : 'green';
}

function formatDateField(d) {
    if (!d) return '';
    try {
        if (d.toDate) return d.toDate().toLocaleString();
        return d;
    } catch (e) {
        return '';
    }
}

/* ---------- Load pending requests ---------- */
async function fetchPendingRequests() {
    const listEl = document.getElementById('requests-list');
    if (!listEl) return;
    listEl.innerHTML = 'Loading...';

    try {
        // Show requests that are pending either at HOD or Registrar.
        // Approver role check is done separately; rules will ultimately control access.
        const q = query(
            collection(db, 'requests'),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );
        const snaps = await getDocs(q);

        if (snaps.empty) {
            listEl.innerHTML = '<div class="text-muted">No pending requests.</div>';
            return;
        }

        let html = '<div class="list-group">';
        snaps.forEach(snap => {
            const d = snap.data();
            const created = formatDateField(d.createdAt);
            // summary item with a Review button
            html += `
        <div class="list-group-item">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <strong>${d.fullName || d.email}</strong>
              <div><small>${d.type} — ${d.startDate} → ${d.endDate}</small></div>
              <div class="mt-1"><small>${d.reason}</small></div>
            </div>
            <div class="text-end">
              <div><span class="badge bg-warning text-dark">${d.currentStage || 'pending'}</span></div>
              <div class="mt-2">
                <button class="btn btn-sm btn-outline-primary" data-docid="${snap.id}" onclick="window.__approvals_openModal(event)">Review</button>
              </div>
            </div>
          </div>
          <div class="text-muted mt-2"><small>Submitted: ${created}</small></div>
        </div>
      `;
        });
        html += '</div>';
        listEl.innerHTML = html;
    } catch (e) {
        console.error('Failed to fetch pending requests', e);
        listEl.innerHTML = '<div class="text-danger">Failed to load requests</div>';
    }
}

/* ---------- Modal open (exposed globally for inline onclick) ---------- */
window.__approvals_openModal = async function (evt) {
    const btn = evt.currentTarget || evt.target;
    const docId = btn?.getAttribute('data-docid');
    if (!docId) return;

    try {
        const reqRef = doc(db, 'requests', docId);
        const snap = await getDoc(reqRef);
        if (!snap.exists()) {
            showMsg('Request not found', true);
            return;
        }
        currentRequestDoc = { id: docId, data: snap.data() };

        // populate modal details
        const md = document.getElementById('modal-request-details');
        const d = currentRequestDoc.data;
        const attachmentsHtml = (d.attachments && d.attachments.length)
            ? `<div class="mt-2"><small>Attachments: ${d.attachments.map(a => `<a href="${a.url}" target="_blank" rel="noopener">${a.name}</a>`).join(', ')}</small></div>`
            : '';
        md.innerHTML = `
      <div><strong>${d.fullName || d.email}</strong> (<small>${d.email}</small>)</div>
      <div><small>Teacher ID: ${d.teacherId || '—'}</small></div>
      <div class="mt-2"><strong>${d.type}</strong> — ${d.startDate} → ${d.endDate}</div>
      <div class="mt-2"><em>${d.reason}</em></div>
      ${attachmentsHtml}
    `;

        // reset comment input
        const commentEl = document.getElementById('approverComment');
        if (commentEl) commentEl.value = '';

        // show modal
        const modalEl = document.getElementById('actionModal');
        const bsModal = new bootstrap.Modal(modalEl);
        bsModal.show();

        // attach handlers
        document.getElementById('btnApprove').onclick = () => handleAction('approved', bsModal);
        document.getElementById('btnReject').onclick = () => handleAction('rejected', bsModal);
        // Forward button may not exist if page HTML wasn't updated; try safely
        const fbtn = document.getElementById('btnForward');
        if (fbtn) fbtn.onclick = () => handleAction('forward', bsModal);
    } catch (e) {
        console.error(e);
        showMsg('Failed to load request details', true);
    }
};

/* ---------- Handle approver actions ---------- */
async function handleAction(action, bsModal) {
    if (!currentUser) {
        showMsg('Not signed in', true);
        return;
    }
    if (!currentRequestDoc) {
        showMsg('No request selected', true);
        return;
    }

    // Read approver comment
    const comment = (document.getElementById('approverComment')?.value || '').trim();
    const reqRef = doc(db, 'requests', currentRequestDoc.id);

    // Verify current user's role from users/{uid}
    try {
        const udoc = await getDoc(doc(db, 'users', currentUser.uid));
        const role = udoc.exists() ? udoc.data().role : null;
        if (!['hod', 'registrar'].includes(role)) {
            showMsg('You are not authorized to perform this action', true);
            return;
        }

        // If action is forward: only HOD should forward and only if currentStage == 'pending_hod'
        if (action === 'forward') {
            if (role !== 'hod') {
                showMsg('Only HOD can forward to Registrar', true);
                return;
            }
            if ((currentRequestDoc.data.currentStage || '') !== 'pending_hod') {
                showMsg('Request is not at HOD stage', true);
                return;
            }

            await updateDoc(reqRef, {
                currentStage: 'pending_registrar',
                forwardedTo: 'registrar',
                approverUid: currentUser.uid,
                approverComment: comment || null,
                updatedAt: serverTimestamp(),
                history: arrayUnion({
                    ts: serverTimestamp(),
                    actorUid: currentUser.uid,
                    action: 'forwarded_to_registrar',
                    comment: comment || null
                })
            });

            showMsg('Forwarded to Registrar');
            bsModal.hide();
            await fetchPendingRequests();
            return;
        }

        // If action is approve/reject: approver sets final status (policy: registrar is final approver; HOD may approve but policy might require forwarding)
        if (action === 'approved' || action === 'rejected') {
            // For stricter enforcement: only registrar can finalize. Here we allow both but you can tighten later.
            await updateDoc(reqRef, {
                status: action,
                currentStage: 'finalized',
                approverUid: currentUser.uid,
                approverComment: comment || null,
                updatedAt: serverTimestamp(),
                history: arrayUnion({
                    ts: serverTimestamp(),
                    actorUid: currentUser.uid,
                    action: action,
                    comment: comment || null
                })
            });

            showMsg(`Request ${action}`);
            bsModal.hide();
            await fetchPendingRequests();
            return;
        }

        showMsg('Unknown action', true);
    } catch (e) {
        console.error('Failed to perform action', e);
        showMsg('Failed to update request', true);
    }
}

/* ---------- Init function ---------- */
export function initApprovalsPage() {
    // ensure global exists so inline onclick can call it
    window.__approvals_openModal = window.__approvals_openModal;

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (!user) {
            // Not signed in: redirect to home
            window.location.href = '/index.html';
            return;
        }

        // Quick role check: show an info message if user is not an approver
        try {
            const udoc = await getDoc(doc(db, 'users', user.uid));
            const role = udoc.exists() ? udoc.data().role : null;
            if (!['hod', 'registrar'].includes(role)) {
                showMsg('You are not an approver. Approver roles: hod, registrar.', true);
                // still attempt to fetch pending requests (rules may block actual reads)
            } else {
                showMsg('Welcome approver — listing pending requests');
            }
        } catch (e) {
            console.warn('Failed to read user role', e);
        }

        // Load pending requests
        await fetchPendingRequests();
    });
}
