// js/leave-service.js - UPDATED
import { db } from './firebase-init.js';
import {
    doc,
    getDoc,
    updateDoc,
    arrayUnion,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { DEFAULT_LEAVE_BALANCES, getCurrentAcademicYear } from './leave-config.js';

// Add this function if it doesn't exist
export async function getLeaveBalance(userId, leaveType) {
    try {
        const balanceDoc = await getDoc(doc(db, 'leaveBalances', userId));
        if (balanceDoc.exists()) {
            const balances = balanceDoc.data();
            return balances[leaveType] || 0;
        }
        return 0;
    } catch (error) {
        console.error('Error getting leave balance:', error);
        return 0;
    }
}

/* ---------- Leave Balance Service ---------- */
export async function getUserLeaveBalances(userId) {
    try {
        const balanceRef = doc(db, 'leaveBalances', userId);
        const balanceSnap = await getDoc(balanceRef);

        if (balanceSnap.exists()) {
            console.log('Found existing leave balances:', balanceSnap.data());
            return balanceSnap.data();
        } else {
            // Create balances if they don't exist
            console.log('Creating new leave balances for user:', userId);
            const newBalances = {
                userId: userId,
                ...DEFAULT_LEAVE_BALANCES,
                academicYear: getCurrentAcademicYear(),
                lastUpdated: serverTimestamp()
            };

            await setDoc(balanceRef, newBalances);
            console.log('Created new leave balances:', newBalances);
            return newBalances;
        }
    } catch (error) {
        console.error('Error in getUserLeaveBalances:', error);
        // Return defaults as fallback
        return {
            ...DEFAULT_LEAVE_BALANCES,
            academicYear: getCurrentAcademicYear()
        };
    }
}

export function renderSingleLeaveBalance(balances, leaveType, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const balance = balances[leaveType] || 0;
    const leaveTypeName = leaveType.charAt(0).toUpperCase() + leaveType.slice(1);
    
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <span class="fw-bold fs-6">${balance} days</span>
            
        </div>
    `;
}

// Keep the existing updateLeaveBalance function...
export async function updateLeaveBalance(userId, leaveType, daysUsed) {
    try {
        const balanceRef = doc(db, 'leaveBalances', userId);
        const balanceSnap = await getDoc(balanceRef);

        if (balanceSnap.exists()) {
            const currentBalance = balanceSnap.data()[leaveType] || 0;
            const newBalance = Math.max(0, currentBalance - daysUsed);

            await updateDoc(balanceRef, {
                [leaveType]: newBalance,
                lastUpdated: serverTimestamp(),
                history: arrayUnion({
                    action: 'leave_used',
                    leaveType: leaveType,
                    daysUsed: daysUsed,
                    previousBalance: currentBalance,
                    newBalance: newBalance,
                    timestamp: new Date().toISOString()
                })
            });

            console.log(`Updated ${leaveType} balance: ${currentBalance} -> ${newBalance}`);
            return newBalance;
        }
    } catch (error) {
        console.error('Error updating leave balance:', error);
        throw error;
    }
}