// js/apply.js - CLEANED VERSION (No Email, Notifications Only)

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

import { getUserLeaveBalances, renderSingleLeaveBalance, getLeaveBalance } from './leave-service.js';
import { calculateLeaveDays } from './leave-config.js';
import { notificationService } from './notification-service.js';

/* ---------- Leave Balance Validation ---------- */
let userLeaveBalances = {};

/* ---------- Find HOD Email by Department ---------- */
async function findHodEmail(department) {
    try {
        console.log('Searching for HOD in department:', department);

        // Query users collection to find HOD for this department
        const q = query(
            collection(db, 'users'),
            where('role', '==', 'hod'),
            where('department', '==', department)
        );
        const querySnapshot = await getDocs(q);

        console.log(`Found ${querySnapshot.size} HOD(s) for department: ${department}`);

        if (!querySnapshot.empty) {
            const hodData = querySnapshot.docs[0].data();
            console.log('Found HOD email:', hodData.email);
            return hodData.email;
        }

        console.warn('No HOD found for department:', department);
        return null;
    } catch (error) {
        console.error('Error finding HOD email:', error);
        if (error.code === 'permission-denied') {
            console.error('Permission denied. Check Firestore rules for users collection access.');
        }
        return null;
    }
}

/* ---------- Helper Functions ---------- */
function getCurrentAcademicYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return month >= 1 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function showMsg(text, isError = false) {
    const el = document.getElementById('apply-msg');
    if (!el) {
        console.log((isError ? 'ERROR: ' : '') + text);
        return;
    }
    el.textContent = text;
    el.style.color = isError ? 'red' : 'green';
}

async function loadAndDisplayLeaveBalances(userId) {
    try {
        userLeaveBalances = await getUserLeaveBalances(userId);
        const initialLeaveType = document.getElementById('leaveType')?.value || 'casual';
        renderSingleLeaveBalance(userLeaveBalances, initialLeaveType, 'leave-balance-display');
        setupRealTimeBalanceValidation();
    } catch (error) {
        console.error('Failed to load leave balances:', error);
        document.getElementById('leave-balance-display').innerHTML =
            '<div class="text-danger">Failed to load leave balances</div>';
    }
}

function setupRealTimeBalanceValidation() {
    const leaveTypeSelect = document.getElementById('leaveType');

    function updateBalanceDisplay() {
        const leaveType = leaveTypeSelect?.value;
        if (leaveType && userLeaveBalances[leaveType] !== undefined) {
            renderSingleLeaveBalance(userLeaveBalances, leaveType, 'leave-balance-display');
        }
    }

    if (leaveTypeSelect) {
        leaveTypeSelect.addEventListener('change', updateBalanceDisplay);
    }
    updateBalanceDisplay();
}

function validateDates(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
        return { isValid: false, message: 'Start date cannot be in the past.' };
    }
    if (end < start) {
        return { isValid: false, message: 'End date cannot be before start date.' };
    }
    return { isValid: true };
}

function validateReason(reason) {
    if (reason.length < 10) {
        return { isValid: false, message: 'Reason must be at least 10 characters long.' };
    }
    if (reason.length > 500) {
        return { isValid: false, message: 'Reason cannot exceed 500 characters.' };
    }
    return { isValid: true };
}

function showValidationError(message, isError = true) {
    const msgEl = document.getElementById('apply-msg');
    if (msgEl) {
        msgEl.textContent = message;
        msgEl.style.color = isError ? 'red' : 'green';
    }
}

function setupRealTimeValidation() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const reasonInput = document.getElementById('reason');
    const charCountEl = document.createElement('div');

    if (reasonInput) {
        charCountEl.className = 'form-text text-muted';
        charCountEl.innerHTML = '<small>Character count: <span id="charCount">0</span>/500</small>';
        reasonInput.parentNode.appendChild(charCountEl);

        reasonInput.addEventListener('input', function () {
            const count = this.value.length;
            document.getElementById('charCount').textContent = count;

            if (count > 500) {
                charCountEl.innerHTML = '<small class="text-danger">Character count: <span id="charCount">' + count + '</span>/500 (Too long!)</small>';
            } else if (count < 10) {
                charCountEl.innerHTML = '<small class="text-warning">Character count: <span id="charCount">' + count + '</span>/500 (Minimum 10 required)</small>';
            } else {
                charCountEl.innerHTML = '<small class="text-success">Character count: <span id="charCount">' + count + '</span>/500</small>';
            }
        });
    }

    const today = new Date().toISOString().split('T')[0];
    if (startDateInput) startDateInput.min = today;
    if (endDateInput) endDateInput.min = today;

    if (startDateInput && endDateInput) {
        startDateInput.addEventListener('change', validateDateRange);
        endDateInput.addEventListener('change', validateDateRange);
    }
}

function validateDateRange() {
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;

    if (startDate && endDate) {
        const validation = validateDates(startDate, endDate);
        if (!validation.isValid) {
            showValidationError(validation.message, true);
        } else {
            showValidationError('', false);
        }
    }
}

/* ---------- Submit handler ---------- */
async function submitLeave(event, user) {
    event.preventDefault();

    try {
        console.log('Starting leave submission...');

        const formData = new FormData(event.target);
        const leaveType = formData.get('leaveType');
        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        const reason = formData.get('reason');
        const contactAddress = formData.get('contactAddress');
        const emergencyContact = formData.get('emergencyContact');

        // DEBUG: Log all form values
        console.log('Form values:', {
            leaveType,
            startDate, 
            endDate,
            reason,
            contactAddress,
            emergencyContact
        });

        // Validate required fields
        if (!leaveType || !startDate || !endDate || !reason) {
            throw new Error('Please fill in all required fields');
        }

        if (!user) {
            throw new Error('You must be logged in to submit a leave request');
        }

        // Get user profile
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
            throw new Error('User profile not found. Please contact administrator.');
        }

        const userProfile = userDoc.data();
        const department = userProfile.department;

        if (!department) {
            throw new Error('Department not found in your profile. Please contact administrator.');
        }

        console.log('User department:', department);

        // Calculate leave days
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (end < start) {
            throw new Error('End date cannot be before start date');
        }

        const timeDiff = end.getTime() - start.getTime();
        const numberOfDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;

        if (numberOfDays <= 0) {
            throw new Error('Invalid date range');
        }

        console.log('Calculated leave days:', numberOfDays);

        // Check leave balance
        const leaveBalance = await getLeaveBalance(user.uid, leaveType);
        console.log('Available balance:', leaveBalance, 'Requested days:', numberOfDays);

        if (leaveBalance < numberOfDays) {
            throw new Error(`Insufficient ${leaveType} leave balance. Available: ${leaveBalance} days, Requested: ${numberOfDays} days`);
        }

        // Find HOD email for the department
        console.log('Finding HOD for department:', department);
        const hodEmail = await findHodEmail(department);

        if (!hodEmail) {
            console.warn('No HOD found for department:', department);
        }

        console.log('Found HOD email:', hodEmail);

        

        // Create leave request document
        const requestData = {
            // User info
            userId: user.uid,
            email: user.email,
            fullName: userProfile.fullName || user.email,
            department: department,
            employeeId: userProfile.employeeId || '',

            // Leave details
            leaveType: leaveType,
            startDate: startDate,
            endDate: endDate,
            numberOfDays: numberOfDays,
            reason: reason,
            contactAddress: contactAddress || '',
            emergencyContact: emergencyContact || '',

            // Approval chain
            hodEmail: hodEmail,
            registrarEmail: 'registrar@ru.ac.bd',
            currentStage: hodEmail ? 'pending_hod' : 'pending_registrar',
            status: 'pending',

            // Timestamps
            appliedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),

            // System fields
            academicYear: getCurrentAcademicYear()
        };

        console.log('Creating leave request with data:', requestData);
        const docRef = await addDoc(collection(db, 'leaveRequests'), requestData);

        console.log('Created request doc id =', docRef.id, 'with department:', department);

       // ✅ Create notification for HOD
        if (hodEmail) {
            try {
                // Find HOD's user ID
                const hodQuery = query(
                    collection(db, 'users'), 
                    where('email', '==', hodEmail)
                );
                const hodSnapshot = await getDocs(hodQuery);
                
                if (!hodSnapshot.empty) {
                    const hodUserId = hodSnapshot.docs[0].id;
                    
                    // Wait for notification to be created
                    await notificationService.createNotification({
                        userId: hodUserId,
                        title: 'New Leave Request',
                        message: `New ${leaveType} leave request from ${userProfile.fullName || user.email} in ${department}`,
                        type: 'new_request',
                        read: false,
                        createdAt: serverTimestamp(),
                        requestId: docRef.id
                    });
                    
                    console.log('Notification created for HOD:', hodEmail);
                }
            } catch (notificationError) {
                console.warn('Failed to create HOD notification:', notificationError);
                // Don't fail the entire submission if notification fails
            }
        }

        // ✅ Create notification for the teacher (confirmation)
        try {
            await notificationService.createNotification({
                userId: user.uid,
                title: 'Leave Request Submitted',
                message: `Your ${leaveType} leave request has been submitted successfully.`,
                type: 'confirmation',
                read: false,
                createdAt: serverTimestamp(),
                requestId: docRef.id
            });
        } catch (notificationError) {
            console.warn('Failed to create teacher notification:', notificationError);
        }

        // Show success message to teacher
        showMsg('Leave request submitted successfully! You will be notified when it is reviewed.', false);

        // Reset form
        event.target.reset();

        // Reload leave balances and requests
        await loadAndDisplayLeaveBalances(user.uid);
        await renderMyRequests(user.uid);

        console.log('Leave request submitted successfully');

    } catch (error) {
        console.error('Error submitting leave request:', error);
        showMsg('Failed to submit leave request: ' + error.message, true);
    }
}

/* ---------- Render user's requests ---------- */
async function renderMyRequests(uid) {
    const listEl = document.getElementById('my-requests-list');
    if (!listEl) return;

    listEl.innerHTML = `
        <h4>My Requests</h4>
        <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Loading your requests...</p>
        </div>
    `;

    try {
        const q = query(
            collection(db, 'leaveRequests'),
            where('userId', '==', uid),
            orderBy('appliedAt', 'desc')
        );
        const snaps = await getDocs(q);

        if (snaps.empty) {
            listEl.innerHTML = '<h4>My Requests</h4><div class="text-muted py-3">No requests yet.</div>';
            return;
        }

        let html = '<h4>My Requests</h4><div class="list-group">';
        snaps.forEach(docSnap => {
            const d = docSnap.data();
            let applied = '';
            try {
                applied = d.appliedAt?.toDate ? d.appliedAt.toDate().toLocaleString() : (d.appliedAt || '');
            } catch (e) {
                applied = '';
            }

            const departmentHtml = d.department ? `<div><small>Department: ${d.department}</small></div>` : '';

            html += `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between">
                    <div>
                        <strong>${d.leaveType}</strong> — ${d.startDate} → ${d.endDate}
                        <div><small>${d.reason}</small></div>
                        ${departmentHtml}
                    </div>
                    <div class="text-end">
                        <div><span class="badge bg-${d.status === 'pending' ? 'warning text-dark' : d.status === 'approved' ? 'success' : 'danger'}">${d.status}</span></div>
                        <div><small class="text-muted">${d.currentStage || ''}</small></div>
                    </div>
                    </div>
                    <div class="text-muted mt-2"><small>Submitted: ${applied}</small></div>
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

/* ---------- Init function ---------- */
export function initApplyPage() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = '/index.html';
            return;
        }

        await loadAndDisplayLeaveBalances(user.uid);
        setupRealTimeValidation();

        // Check if teacher has department assigned
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userDocRef);
            const profile = userSnap.exists() ? userSnap.data() : {};

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

        // Attach submit handler
        const leaveForm = document.getElementById('leaveForm');
        if (leaveForm) {
            console.log('Form found, attaching submit handler...');
    
            leaveForm.addEventListener('submit', (e) => {
                console.log('Form submitted!', e);
                console.log('Current user:', user);
                submitLeave(e, user);
            });
        } else {
            console.error('Form element not found!');
        }

        // Render user's requests
        await renderMyRequests(user.uid);
    });
}