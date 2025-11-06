// js/list.js
// Page script for list.html ("My Requests").
// - Guards page (redirect to index if not authenticated)
// - Loads current user's requests and renders them
// - Shows request details in a modal (attachments, history)
// - Allows user to add a small comment to their request (non-status update)
// - Allows user to attempt to cancel (set status to 'cancelled') — note: Firestore rules may block owner status changes; errors are shown

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ---------- Module state ---------- */
let currentUser = null;
let activeRequest = null; // { id, data }

/* ---------- UI helpers ---------- */
function msg(text, isError = false) {
    const el = document.getElementById('list-msg');
    if (!el) return console.log((isError ? 'ERROR: ' : '') + text);
    el.textContent = text;
    el.style.color = isError ? 'red' : 'green';
}

function formatDate(tsOrString) {
    if (!tsOrString) return '';
    try {
        if (tsOrString.toDate) return tsOrString.toDate().toLocaleString();
        return new Date(tsOrString).toLocaleString();
    } catch (e) {
        return String(tsOrString);
    }
}

/* ---------- Load user's requests ---------- */
async function loadRequests(uid) {
    const container = document.getElementById('requests-container');
    if (!container) return;
    container.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Loading your requests...</p>
        </div>
    `;

    try {
        // ONLY CHANGE THE QUERY - keep everything else the same
        const q = query(
            collection(db, 'leaveRequests'),  // ✅ Only this line changed
            where('userId', '==', uid),       // ✅ Only this line changed  
            orderBy('appliedAt', 'desc')      // ✅ Only this line changed
        );
        const snaps = await getDocs(q);
        if (snaps.empty) {
            container.innerHTML = '<div class="text-muted py-4 text-center">You have not submitted any requests yet.</div>';
            return;
        }

        // KEEP EVERYTHING ELSE EXACTLY THE SAME
        let html = '<div class="list-group">';
        snaps.forEach(snap => {
            const d = snap.data();
            const created = formatDate(d.appliedAt || d.createdAt); // ✅ Handle both
            const statusBadgeClass = d.status === 'pending' ? 'warning text-dark' : d.status === 'approved' ? 'success' : d.status === 'rejected' ? 'danger' : 'secondary';

            html += `
        <div class="list-group-item">
          <div class="d-flex justify-content-between align-items-start">
            <div>
                <strong>${d.leaveType || d.type}</strong> — ${d.startDate} → ${d.endDate}
                <div class="mt-1"><small>${d.reason}</small></div>
                ${d.status === 'rejected' && d.approverComment ? `<div class="mt-1 text-danger"><small><strong>Rejection Reason:</strong> ${d.approverComment}</small></div>` : ''}
                ${d.status === 'approved' && d.approverComment ? `<div class="mt-1 text-success"><small><strong>Approver Note:</strong> ${d.approverComment}</small></div>` : ''}
            </div>
            <div class="text-end">
              <div><span class="badge bg-${statusBadgeClass}">${d.status}</span></div>
              <div class="mt-2">
                <button class="btn btn-sm btn-outline-primary" data-docid="${snap.id}" onclick="window.__list_openDetails(event)">Details</button>
              </div>
            </div>
          </div>
          <div class="text-muted mt-2"><small>Submitted: ${created}</small></div>
        </div>
      `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        console.error('Failed to load requests', e);
        container.innerHTML = '<div class="text-danger">Failed to load your requests.</div>';
    }
}
/* ---------- Open details modal (exposed) ---------- */
window.__list_openDetails = async function (evt) {
    const btn = evt.currentTarget || evt.target;
    const docId = btn?.getAttribute('data-docid');
    if (!docId) return;

    try {
        const reqRef = doc(db, 'leaveRequests', docId);
        const snap = await getDoc(reqRef);
        if (!snap.exists()) {
            msg('Request no longer exists', true);
            return;
        }
        activeRequest = { id: docId, data: snap.data() };

        // populate modal
        const md = document.getElementById('modal-request-full');
        const d = activeRequest.data;

        // FIXED: Add historyHtml variable that was missing
        const historyHtml = (d.history && d.history.length)
            ? `<div class="mt-2"><strong>History:</strong><ul>${d.history.map(h => `<li><small>${formatDate(h.ts || h.createdAt)} — ${h.actorUid || 'system'} — ${h.action} ${h.comment ? ' — ' + h.comment : ''}</small></li>`).join('')}</ul></div>`
            : '';

        // FIXED: Clean attachment display with reload instructions
        const attachmentsHtml = (d.attachments && d.attachments.length)
            ? `<div class="mb-2">
                <strong>Attachments:</strong> 
                <div class="mt-1">
                    ${d.attachments.map(a => {
                const isDataUrl = a.url && a.url.startsWith('data:');

                if (isDataUrl) {
                    return `
                                <div class="mb-1">
                                    <a href="${a.url}" 
                                       target="_blank" 
                                       rel="noopener" 
                                       class="text-primary">
                                        📄 ${a.name}
                                    </a>
                                    <small class="text-muted ms-2">
                                        (reload new tab to view attachment)
                                    </small>
                                </div>
                            `;
                } else {
                    return `
                                <div class="mb-1">
                                    <a href="${a.url}" 
                                       target="_blank" 
                                       rel="noopener" 
                                       class="text-primary">
                                        🔗 ${a.name}
                                    </a>
                                </div>
                            `;
                }
            }).join('')}
                </div>
               </div>`
            : '';

        // NEW: Show approver comment if request was rejected or has approver comments
        const approverCommentHtml = (d.status === 'rejected' && d.approverComment)
            ? `<div class="mt-2 alert alert-danger">
          <strong>Rejection Reason:</strong> ${d.approverComment}
          ${d.approverUid ? `<br><small>By: ${d.approverUid}</small>` : ''}
       </div>`
            : (d.approverComment && d.status === 'approved')
                ? `<div class="mt-2 alert alert-success">
          <strong>Approver Note:</strong> ${d.approverComment}
          ${d.approverUid ? `<br><small>By: ${d.approverUid}</small>` : ''}
       </div>`
                : (d.approverComment)
                    ? `<div class="mt-2 alert alert-info">
          <strong>Approver Comment:</strong> ${d.approverComment}
          ${d.approverUid ? `<br><small>By: ${d.approverUid}</small>` : ''}
       </div>`
                    : '';

        md.innerHTML = `
  <div><strong>${d.fullName || d.email}</strong> (<small>${d.email}</small>)</div>
  <div><small>Teacher ID: ${d.teacherId || '—'}</small></div>
  <div class="mt-2"><strong>${d.leaveType}</strong> — ${d.startDate} → ${d.endDate}</div>
  <div class="mt-2"><em>${d.reason}</em></div>
  ${attachmentsHtml}
  <div class="mt-2"><small>Status: <strong>${d.status}</strong></small></div>
  <div class="mt-2"><small>Current stage: <strong>${d.currentStage || '—'}</strong></small></div>
  ${approverCommentHtml}
  ${historyHtml}
`;

        // user comment (prepopulate if exists)
        const userCommentEl = document.getElementById('userComment');
        if (userCommentEl) userCommentEl.value = d.userComment || '';

        // show/hide Cancel button: only when status == 'pending'
        const cancelBtn = document.getElementById('btnCancelRequest');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                // Show confirmation modal instead of basic confirm()
                const confirmModalEl = document.getElementById('cancelConfirmModal');
                const confirmModal = new bootstrap.Modal(confirmModalEl);
                confirmModal.show();

                // Set up the confirmation button
                const confirmCancelBtn = document.getElementById('confirmCancelBtn');
                confirmCancelBtn.onclick = async () => {
                    await attemptCancelRequest();
                    confirmModal.hide();
                    try { bsModal.hide(); } catch (e) { }
                };
            };
        }

        // show modal
        const modalEl = document.getElementById('requestModal');
        const bsModal = new bootstrap.Modal(modalEl);
        bsModal.show();

        // REMOVED: initAttachmentHandlers(); // Not needed anymore

        // attach handlers (safe attach)
        if (cancelBtn) {
            cancelBtn.onclick = async () => {
                const confirmCancel = confirm('Are you sure you want to cancel this request?');
                if (!confirmCancel) return;
                await attemptCancelRequest();
                try { bsModal.hide(); } catch (e) { }
            };
        }

        // when modal closes, save any user comment the requester added (non-status field)
        modalEl.addEventListener('hidden.bs.modal', async function onHidden() {
            modalEl.removeEventListener('hidden.bs.modal', onHidden);
            const commentText = (document.getElementById('userComment')?.value || '').trim();
            if (commentText !== (activeRequest.data.userComment || '')) {
                await saveUserComment(commentText);
                await loadRequests(currentUser.uid);
            }
        });

    } catch (e) {
        console.error('Failed to open details', e);
        msg('Failed to load request details', true);
    }
};

/* ---------- Save user comment (non-status update) ---------- */
async function saveUserComment(text) {
    if (!activeRequest || !currentUser) return;
    try {
        const reqRef = doc(db, 'leaveRequests', activeRequest.id);
        // Use a client-side timestamp inside the comment object because serverTimestamp() cannot be embedded in arrayUnion's object
        const commentObj = {
            text: text || null,
            actorUid: currentUser.uid,
            actorEmail: currentUser.email || null,
            createdAt: new Date().toISOString()
        };
        await updateDoc(reqRef, {
            userComment: text || null,
            updatedAt: serverTimestamp(),
            history: arrayUnion(commentObj)
        });
        msg('Comment saved');
        return true;
    } catch (e) {
        console.error('Failed to save comment', e);
        msg('Failed to save comment: ' + (e?.message || ''), true);
        return false;
    }
}

/* ---------- Attempt to cancel request (may be blocked by rules) ---------- */
async function attemptCancelRequest() {
    if (!activeRequest || !currentUser) {
        msg('No active request', true);
        return;
    }

    if (activeRequest.data.uid !== currentUser.uid) {
        msg('You are not the owner of this request', true);
        return;
    }

    try {
        const reqRef = doc(db, 'leaveRequests', activeRequest.id);
        await updateDoc(reqRef, {
            status: 'cancelled',
            updatedAt: serverTimestamp(),
            history: arrayUnion({
                ts: new Date().toISOString(),
                actorUid: currentUser.uid,
                action: 'cancelled_by_user',
                comment: null
            })
        });
        msg('Request cancelled');
        await loadRequests(currentUser.uid);
    } catch (e) {
        console.error('Cancel request failed', e);
        msg('Unable to cancel request: ' + (e?.message || 'permission denied or rules blocked the update'), true);
    }
}

/* ---------- REMOVED: initAttachmentHandlers function ---------- */
// This function is no longer needed since we're using the simple approach

/* ---------- Init page ---------- */
export function initListPage() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (!user) {
            window.location.href = '/index.html';
            return;
        }

        await loadRequests(user.uid);
    });
}