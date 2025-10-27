// js/approvals.js - MODIFIED VERSION with Department Filtering

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
let currentRequestDoc = null;
let currentUserDepartment = null; // NEW: Store user's department

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
// NEW: Modified to filter by department for HODs
async function fetchPendingRequests(role, department) {
    const listEl = document.getElementById('requests-list');
    if (!listEl) return;
    listEl.innerHTML = 'Loading...';

    try {
        let whereClause;

        if (role === 'hod') {
            // NEW: HOD only sees requests from their department
            if (!department) {
                listEl.innerHTML = '<div class="text-warning">You are not assigned to any department. Please update your profile.</div>';
                return;
            }
            whereClause = [
                where('currentStage', '==', 'pending_hod'),
                where('department', '==', department) // NEW: Department filter
            ];
        } else if (role === 'registrar') {
            whereClause = [where('currentStage', '==', 'pending_registrar')];
        } else {
            listEl.innerHTML = '<div class="text-muted">You are not an approver.</div>';
            return;
        }

        // Build query: status must be pending AND currentStage matches role AND department matches (for HOD)
        const q = query(
            collection(db, 'requests'),
            where('status', '==', 'pending'),
            ...whereClause,
            orderBy('createdAt', 'desc')
        );

        const snaps = await getDocs(q);
        if (snaps.empty) {
            if (role === 'hod') {
                listEl.innerHTML = `<div class="text-muted">No pending requests for your department (${department}).</div>`;
            } else {
                listEl.innerHTML = '<div class="text-muted">No pending requests for your role.</div>';
            }
            return;
        }

        let html = '<div class="list-group">';
        snaps.forEach(s => {
            const d = s.data();
            const created = formatDateField(d.createdAt);

            // NEW: Show department in the request card
            const departmentHtml = d.department ? `<div><small>Department: ${d.department}</small></div>` : '';

            html += `
        <div class="list-group-item">
          <div class="d-flex justify-content-between">
            <div>
              <strong>${d.fullName || d.email}</strong>
              <div><small>${d.type} — ${d.startDate} → ${d.endDate}</small></div>
              ${departmentHtml}
            </div>
            <div>
              <button class="btn btn-sm btn-outline-primary me-2" data-docid="${s.id}" onclick="window.__approvals_openModal(event)">Review</button>
              <span class="badge bg-warning text-dark">${d.currentStage || d.status}</span>
            </div>
          </div>
          <div class="mt-2"><small>${d.reason}</small></div>
          <div class="text-muted"><small>Submitted: ${created}</small></div>
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

        // NEW: Show department in modal
        const departmentHtml = d.department ? `<div><small>Department: ${d.department}</small></div>` : '';

        const attachmentsHtml = (d.attachments && d.attachments.length)
            ? `<div class="mt-2"><small>Attachments: ${d.attachments.map(a => `<a href="${a.url}" target="_blank" rel="noopener">${a.name}</a>`).join(', ')}</small></div>`
            : '';
        md.innerHTML = `
      <div><strong>${d.fullName || d.email}</strong> (<small>${d.email}</small>)</div>
      <div><small>Teacher ID: ${d.teacherId || '—'}</small></div>
      ${departmentHtml}
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

        // NEW: Show Forward button only for HOD
        const fbtn = document.getElementById('btnForward');
        if (fbtn) {
            if (currentUser && currentUser.role === 'hod') {
                fbtn.style.display = 'inline-block';
                fbtn.onclick = () => handleAction('forward', bsModal);
            } else {
                fbtn.style.display = 'none';
            }
        }
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

    const comment = (document.getElementById('approverComment')?.value || '').trim();
    const reqRef = doc(db, 'requests', currentRequestDoc.id);

    try {
        const udoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userProfile = udoc.exists() ? udoc.data() : {};
        const role = userProfile.role;

        if (!['hod', 'registrar'].includes(role)) {
            showMsg('You are not authorized to perform this action', true);
            return;
        }

        // NEW: Department validation for HOD
        if (role === 'hod') {
            const requestDepartment = currentRequestDoc.data.department;
            const hodDepartment = userProfile.department;

            if (requestDepartment !== hodDepartment) {
                showMsg('You can only approve requests from your own department.', true);
                return;
            }
        }

        // HOD forwarding: explicit forward (keeps status pending, moves to registrar)
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
                    ts: new Date().toISOString(),
                    actorUid: currentUser.uid,
                    action: 'forwarded_to_registrar',
                    comment: comment || null
                })
            });

            showMsg('Forwarded to Registrar');
            bsModal.hide();
            await fetchPendingRequests(role, currentUserDepartment);
            return;
        }

        // Approve action:
        if (action === 'approved') {
            if (role === 'hod') {
                await updateDoc(reqRef, {
                    currentStage: 'pending_registrar',
                    approverUid: currentUser.uid,
                    approverComment: comment || null,
                    updatedAt: serverTimestamp(),
                    history: arrayUnion({
                        ts: new Date().toISOString(),
                        actorUid: currentUser.uid,
                        action: 'approved_by_hod_forwarded_to_registrar',
                        comment: comment || null
                    })
                });

                showMsg('Approved by HOD and forwarded to Registrar');
                bsModal.hide();
                await fetchPendingRequests(role, currentUserDepartment);
                return;
            } else if (role === 'registrar') {
                await updateDoc(reqRef, {
                    status: 'approved',
                    currentStage: 'finalized',
                    approverUid: currentUser.uid,
                    approverComment: comment || null,
                    updatedAt: serverTimestamp(),
                    history: arrayUnion({
                        ts: new Date().toISOString(),
                        actorUid: currentUser.uid,
                        action: 'approved_by_registrar',
                        comment: comment || null
                    })
                });

                showMsg('Request approved (final)');
                bsModal.hide();
                await fetchPendingRequests(role, currentUserDepartment);
                return;
            }
        }

        // Reject action -> final for either approver
        if (action === 'rejected') {
            await updateDoc(reqRef, {
                status: 'rejected',
                currentStage: 'finalized',
                approverUid: currentUser.uid,
                approverComment: comment || null,
                updatedAt: serverTimestamp(),
                history: arrayUnion({
                    ts: new Date().toISOString(),
                    actorUid: currentUser.uid,
                    action: `rejected_by_${role || 'approver'}`,
                    comment: comment || null
                })
            });

            showMsg('Request rejected');
            bsModal.hide();
            await fetchPendingRequests(role, currentUserDepartment);
            return;
        }

        showMsg('Unknown action', true);
    } catch (e) {
        console.error('Failed to perform action', e);
        showMsg('Failed to update request: ' + (e?.message || ''), true);
    }
}

/* ---------- Init function ---------- */
export function initApprovalsPage() {
    window.__approvals_openModal = window.__approvals_openModal;

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (!user) {
            window.location.href = '/index.html';
            return;
        }

        // Read the user's role and department
        let role = null;
        let department = null;
        try {
            const udoc = await getDoc(doc(db, 'users', user.uid));
            const userProfile = udoc.exists() ? udoc.data() : {};
            role = userProfile.role;
            department = userProfile.department;
            currentUserDepartment = department; // Store for later use

            // NEW: Set currentUser with role for department checking
            currentUser = { ...user, role, department };

            if (!['hod', 'registrar'].includes(role)) {
                showMsg('You are not an approver. Approver roles: hod, registrar.', true);
            } else {
                if (role === 'hod') {
                    if (department) {
                        showMsg(`Welcome HOD — Showing pending requests for ${department} department`);
                    } else {
                        showMsg('Warning: You are not assigned to any department. Please update your profile.', true);
                    }
                } else {
                    showMsg('Welcome Registrar — Listing all pending requests');
                }
            }
        } catch (e) {
            console.warn('Failed to read user role', e);
        }

        // Load requests appropriate to role and department
        await fetchPendingRequests(role, department);
    });
}