// notification-service.js


// Debug: Check if db is properly initialized
console.log('Notification Service: Firestore db instance:', db);
console.log('Notification Service: Firestore collection function:', collection);

import {
    collection,
    addDoc,
    query,
    where,
    getDocs,
    updateDoc,
    doc,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { db } from './firebase-init.js';

class NotificationService {
    // Create a new notification
    async createNotification(notificationData) {
        try {
            console.log('Creating notification:', notificationData);
            const docRef = await addDoc(collection(db, 'notifications'), notificationData);
            console.log('Notification created with ID:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error; // Re-throw to handle in calling function
        }
    }

    // Get notifications for a user
    async getUserNotifications(userId) {
        try {
            const q = query(
                collection(db, 'notifications'),
                where('userId', '==', userId),
                orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error fetching notifications:', error);
            return [];
        }
    }

    // Mark notification as read
    async markAsRead(notificationId) {
        try {
            await updateDoc(doc(db, 'notifications', notificationId), {
                read: true
            });
            console.log('Notification marked as read:', notificationId);
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    }

    // Real-time notifications listener
    listenForNotifications(userId, callback) {
        try {
            const q = query(
                collection(db, 'notifications'),
                where('userId', '==', userId),
                where('read', '==', false),
                orderBy('createdAt', 'desc')
            );

            return onSnapshot(q, (snapshot) => {
                const notifications = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                callback(notifications);
            });
        } catch (error) {
            console.error('Error setting up notifications listener:', error);
        }
    }

    // Play notification sound
    playNotificationSound() {
        try {
            const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alert-quick-chime-766.mp3');
            audio.volume = 0.3;
            audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (error) {
            console.error('Error playing notification sound:', error);
        }
    }
}

export const notificationService = new NotificationService();