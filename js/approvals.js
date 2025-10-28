// js/approvals.js - CLEANED VERSION (No Email, Notifications Only)

import { updateLeaveBalance } from './leave-service.js';
import { calculateLeaveDays } from './leave-config.js';
import { auth, db } from './firebase-init.js';
import { notificationService } from './notification-service.js';
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
let currentUserDepartment = null;

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
async function fetchPendingRequests(role, department) {
    const listEl = document.getElementById('requests-list');
    if (!listEl) return;
    listEl.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Loading pending requests...</p>
        </div>
    `;

    try {
        let whereClause;

        if (role === 'hod') {
            if (!department) {
                listEl.innerHTML = '<div class="text-warning py-4 text-center">You are not assigned to any department. Please update your profile.</div>';
                return;
            }
            whereClause = [
                where('currentStage', '==', 'pending_hod'),
                where('department', '==', department)
            ];
        } else if (role === 'registrar') {
            whereClause = [where('currentStage', '==', 'pending_registrar')];
        } else {
            listEl.innerHTML = '<div class="text-muted py-4 text-center">You are not an approver.</div>';
            return;
        }

        const q = query(
            collection(db, 'leaveRequests'), // Fixed: changed from 'requests' to 'leaveRequests'
            where('status', '==', 'pending'),
            ...whereClause,
            orderBy('appliedAt', 'desc') // Fixed: changed from 'createdAt' to 'appliedAt'
        );

        const snaps = await getDocs(q);

        if (snaps.empty) {
            if (role === 'hod') {
                listEl.innerHTML = `<div class="text-muted py-4 text-center">No pending requests in your department.</div>`;
            } else {
                listEl.innerHTML = '<div class="text-muted py-4 text-center">No pending requests for approval.</div>';
            }
            return;
        }

        let html = '<div class="list-group">';
        snaps.forEach(s => {
            const d = s.data();
            const applied = formatDateField(d.appliedAt); // Fixed: changed from 'createdAt' to 'appliedAt'
            const departmentHtml = d.department ? `<div><small>Department: ${d.department}</small></div>` : '';

            html += `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between">
                        <div>
                            <strong>${d.fullName || d.email}</strong>
                            <div><small>${d.leaveType} — ${d.startDate} → ${d.endDate}</small></div> <!-- Fixed: changed 'type' to 'leaveType' -->
                            ${departmentHtml}
                        </div>
                        <div>
                            <button class="btn btn-sm btn-outline-primary me-2" data-docid="${s.id}" onclick="window.__approvals_openModal(event)">Review</button>
                            <span class="badge bg-warning text-dark">${d.currentStage || d.status}</span>
                        </div>
                    </div>
                    <div class="mt-2"><small>${d.reason}</small></div>
                    <div class="text-muted"><small>Submitted: ${applied}</small></div>
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

/* ---------- Modal open ---------- */
window.__approvals_openModal = async function (evt) {
    const btn = evt.currentTarget || evt.target;
    const docId = btn?.getAttribute('data-docid');
    if (!docId) return;

    try {
        const reqRef = doc(db, 'leaveRequests', docId); // Fixed: changed from 'requests' to 'leaveRequests'
        const snap = await getDoc(reqRef);
        if (!snap.exists()) {
            showMsg('Request not found', true);
            return;
        }
        currentRequestDoc = { id: docId, data: snap.data() };

        const md = document.getElementById('modal-request-details');
        const d = currentRequestDoc.data;
        const departmentHtml = d.department ? `<div><small>Department: ${d.department}</small></div>` : '';

        md.innerHTML = `
            <div><strong>${d.fullName || d.email}</strong> (<small>${d.email}</small>)</div>
            <div><small>Employee ID: ${d.employeeId || '—'}</small></div> <!-- Fixed: changed 'teacherId' to 'employeeId' -->
            ${departmentHtml}
            <div class="mt-2"><strong>${d.leaveType}</strong> — ${d.startDate} → ${d.endDate}</div> <!-- Fixed: changed 'type' to 'leaveType' -->
            <div class="mt-2"><strong>Number of Days:</strong> ${d.numberOfDays || calculateLeaveDays(d.startDate, d.endDate)}</div>
            <div class="mt-2"><strong>Reason:</strong><br><em>${d.reason}</em></div>
            <div class="mt-2"><strong>Contact During Leave:</strong> ${d.contactAddress || 'Not provided'}</div>
            <div class="mt-2"><strong>Emergency Contact:</strong> ${d.emergencyContact || 'Not provided'}</div>
        `;

        const commentEl = document.getElementById('approverComment');
        if (commentEl) commentEl.value = '';

        const modalEl = document.getElementById('actionModal');
        const bsModal = new bootstrap.Modal(modalEl);
        bsModal.show();

        document.getElementById('btnApprove').onclick = () => handleAction('approved', bsModal);
        document.getElementById('btnReject').onclick = () => showRejectionConfirmation(bsModal);

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

/* ---------- Rejection Confirmation Only ---------- */
function showRejectionConfirmation(bsModal) {
    const comment = (document.getElementById('approverComment')?.value || '').trim();

    if (!comment) {
        showMsg('Comment is required when rejecting a request. Please provide a reason for rejection.', true);
        return;
    }

    const confirmReject = confirm(`❌ Confirm Rejection\n\nAre you sure you want to reject this leave request?\n\nRejection reason: "${comment}"\n\nThis cannot be undone and will be notified to the teacher.`);

    if (confirmReject) {
        handleAction('rejected', bsModal);
    }
}

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
    const reqRef = doc(db, 'leaveRequests', currentRequestDoc.id);
    const requestData = currentRequestDoc.data;

    try {
        const udoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userProfile = udoc.exists() ? udoc.data() : {};
        const role = userProfile.role;

        if (!['hod', 'registrar'].includes(role)) {
            showMsg('You are not authorized to perform this action', true);
            return;
        }

        // Department validation for HOD
        if (role === 'hod') {
            const requestDepartment = requestData.department;
            const hodDepartment = userProfile.department;

            if (requestDepartment !== hodDepartment) {
                showMsg('You can only approve requests from your own department.', true);
                return;
            }
        }

        // HOD forwarding
        if (action === 'forward') {
            if (role !== 'hod') {
                showMsg('Only HOD can forward to Registrar', true);
                return;
            }
            if ((requestData.currentStage || '') !== 'pending_hod') {
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

            // In HOD forwarding section:
            await notificationService.createNotification({
                userId: requestData.userId,
                title: 'Request Forwarded to Registrar',
                message: `Your leave request has been forwarded to registrar${comment ? ` with remarks: ${comment}` : ''}`,
                type: 'forwarded',
                read: false,
                createdAt: serverTimestamp(),
                requestId: currentRequestDoc.id
            });


            showMsg('Forwarded to Registrar');
            bsModal.hide();
            await fetchPendingRequests(role, userProfile.department);
            return;
        }

        // Approve action
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

                // In HOD approval section:
                await notificationService.createNotification({
                    userId: requestData.userId,
                    title: 'Approved by HOD',
                    message: `Your leave request has been approved by HOD${comment ? ` with remarks: ${comment}` : ''}`,
                    type: 'approved',
                    read: false,
                    createdAt: serverTimestamp(),
                    requestId: currentRequestDoc.id
                });

                showMsg('Approved by HOD and forwarded to Registrar');
                bsModal.hide();
                await fetchPendingRequests(role, userProfile.department);
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

                // Deduct balance from teacher's account
                const daysRequested = calculateLeaveDays(requestData.startDate, requestData.endDate);
                await updateLeaveBalance(requestData.userId, requestData.leaveType, daysRequested); // Fixed: changed 'type' to 'leaveType'

                // In Registrar approval section:
                await notificationService.createNotification({
                    userId: requestData.userId,
                    title: 'Leave Request Approved',
                    message: `Your leave request has been approved${comment ? ` with remarks: ${comment}` : ''}`,
                    type: 'approved',
                    read: false,
                    createdAt: serverTimestamp(),
                    requestId: currentRequestDoc.id
                });
                showMsg('Request approved (final)');
                bsModal.hide();
                await fetchPendingRequests(role, userProfile.department);
                return;
            }
        }

        // Reject action
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

            // In rejection section:
            await notificationService.createNotification({
                userId: requestData.userId,
                title: 'Leave Request Rejected',
                message: `Your leave request has been rejected${comment ? ` with remarks: ${comment}` : ''}`,
                type: 'rejected',
                read: false,
                createdAt: serverTimestamp(),
                requestId: currentRequestDoc.id
            });

            showMsg('Request rejected');
            bsModal.hide();
            await fetchPendingRequests(role, userProfile.department);
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

        let role = null;
        let department = null;
        try {
            const udoc = await getDoc(doc(db, 'users', user.uid));
            const userProfile = udoc.exists() ? udoc.data() : {};
            role = userProfile.role;
            department = userProfile.department;
            currentUserDepartment = department;
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

        await fetchPendingRequests(role, department);
    });
}