// Global variables
let currentDate = new Date();
let currentCoupleId = null;
let currentUser = null;
let partnerName = 'Not connected';
let eventsListener = null;
let eventManager = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    
    // Check if auth is defined (from app.js)
    if (typeof auth === 'undefined') {
        console.error('Auth not initialized');
        hideLoading();
        return;
    }
    
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData(user);
            await loadEvents();
            setupRealtimeUpdates();
            updateDateDisplay();
            generateMiniCalendar();
            
            // Initialize event manager
            if (currentCoupleId) {
                eventManager = new EventManager(currentCoupleId);
            }
            
            hideLoading();
        } else {
            window.location.href = 'index.html';
        }
    });
});

// Load user and couple data
async function loadUserData(user) {
    try {
        // Check if user is partner1 (has couple doc with their ID)
        let coupleDoc = await db.collection('couples').doc(user.uid).get();
        
        if (coupleDoc.exists) {
            // User is partner1
            currentCoupleId = user.uid;
            partnerName = coupleDoc.data().partner2Name || 'Not connected';
            const inviteDisplay = document.getElementById('invite-code-display');
            if (inviteDisplay) {
                inviteDisplay.textContent = coupleDoc.data().inviteCode || 'No code';
            }
        } else {
            // User might be partner2 - check userCouples
            const userCoupleDoc = await db.collection('userCouples').doc(user.uid).get();
            if (userCoupleDoc.exists) {
                currentCoupleId = userCoupleDoc.data().coupleId;
                coupleDoc = await db.collection('couples').doc(currentCoupleId).get();
                partnerName = coupleDoc.data().partner1Name;
                // Hide invite section for partner2
                const inviteSection = document.querySelector('.invite-section');
                if (inviteSection) inviteSection.style.display = 'none';
            }
        }
        
        // Update UI
        const userNameEl = document.getElementById('user-name');
        const partnerNameEl = document.getElementById('partner-name');
        
        if (userNameEl) userNameEl.textContent = user.displayName || 'User';
        if (partnerNameEl) partnerNameEl.textContent = partnerName;
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showNotification('Error loading user data');
    }
}

// Setup real-time updates
function setupRealtimeUpdates() {
    if (!currentCoupleId) return;
    
    // Clean up existing listener
    if (eventsListener) {
        eventsListener();
    }
    
    // Listen for schedule changes
    eventsListener = db.collection('schedules')
        .where('coupleId', '==', currentCoupleId)
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' || change.type === 'modified' || change.type === 'removed') {
                    // Refresh events display
                    loadEvents();
                    generateMiniCalendar();
                    
                    // Show notification for partner updates
                    if (change.type === 'added' && change.doc.data().createdBy !== currentUser?.uid) {
                        showNotification(`${partnerName || 'Your partner'} added a new event: ${change.doc.data().title}`);
                    } else if (change.type === 'modified' && change.doc.data().createdBy !== currentUser?.uid) {
                        showNotification(`${partnerName || 'Your partner'} updated an event`);
                    } else if (change.type === 'removed' && change.doc.data().createdBy !== currentUser?.uid) {
                        showNotification(`${partnerName || 'Your partner'} removed an event`);
                    }
                }
            });
        }, (error) => {
            console.error('Error in realtime updates:', error);
        });
}

// Load events for current date
async function loadEvents() {
    if (!currentCoupleId) return;
    
    const dateString = formatDate(currentDate);
    const selectedDateEl = document.getElementById('selected-date');
    if (selectedDateEl) {
        selectedDateEl.textContent = formatDisplayDate(currentDate);
    }
    
    try {
        const eventsSnapshot = await db.collection('schedules')
            .where('coupleId', '==', currentCoupleId)
            .where('date', '==', dateString)
            .orderBy('time')
            .get();
        
        const scheduleList = document.getElementById('schedule-list');
        if (!scheduleList) return;
        
        if (eventsSnapshot.empty) {
            scheduleList.innerHTML = '<div class="no-events">No events scheduled for this day 📅</div>';
            updateStats(0, await getUpcomingCount());
            return;
        }
        
        let eventsHtml = '';
        let todayCount = 0;
        
        eventsSnapshot.forEach(doc => {
            const event = { id: doc.id, ...doc.data() };
            eventsHtml += `
                <div class="event-item ${event.category || 'other'}" onclick='openEditModal(${JSON.stringify(event)})'>
                    <span class="event-time">${formatTime(event.time)}</span>
                    <div class="event-details">
                        <div class="event-title">${escapeHtml(event.title)}</div>
                        ${event.notes ? `<div class="event-notes">${escapeHtml(event.notes)}</div>` : ''}
                    </div>
                    <span class="event-category">${getCategoryEmoji(event.category)}</span>
                </div>
            `;
            todayCount++;
        });
        
        scheduleList.innerHTML = eventsHtml;
        updateStats(todayCount, await getUpcomingCount());
        
    } catch (error) {
        console.error('Error loading events:', error);
        const scheduleList = document.getElementById('schedule-list');
        if (scheduleList) {
            scheduleList.innerHTML = '<div class="error-message">Error loading events. Please refresh.</div>';
        }
    }
}

// Get upcoming events count
async function getUpcomingCount() {
    if (!currentCoupleId) return 0;
    
    const today = formatDate(new Date());
    try {
        const snapshot = await db.collection('schedules')
            .where('coupleId', '==', currentCoupleId)
            .where('date', '>', today)
            .limit(10)
            .get();
        return snapshot.size;
    } catch (error) {
        console.error('Error getting upcoming count:', error);
        return 0;
    }
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Update stats display
function updateStats(todayCount, upcomingCount) {
    const todayEl = document.getElementById('today-count');
    const upcomingEl = document.getElementById('upcoming-count');
    if (todayEl) todayEl.textContent = todayCount;
    if (upcomingEl) upcomingEl.textContent = upcomingCount;
}

// Format date for storage (YYYY-MM-DD)
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Format date for display
function formatDisplayDate(date) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Format time for display
function formatTime(time) {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

// Get category emoji
function getCategoryEmoji(category) {
    const emojis = {
        date: '💕',
        work: '💼',
        personal: '🌟',
        family: '👨‍👩‍👧',
        other: '📌'
    };
    return emojis[category] || '📌';
}

// Show notification
function showNotification(message) {
    // Check if notification container exists
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
        `;
        document.body.appendChild(container);
    }
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = `
        <div class="notification-content">
            <p>${escapeHtml(message)}</p>
            <button onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
    `;
    
    container.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
    
    // Also try browser notification
    if (Notification.permission === 'granted') {
        new Notification('Couple Schedule', { body: message });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// Update date display
function updateDateDisplay() {
    const display = document.getElementById('current-date-display');
    if (display) {
        display.textContent = formatDisplayDate(currentDate);
    }
}

// Generate mini calendar
function generateMiniCalendar() {
    const calendarGrid = document.getElementById('mini-calendar-grid');
    if (!calendarGrid) return;
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDay = firstDay.getDay();
    const totalDays = lastDay.getDate();
    
    let html = '';
    
    // Day headers
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });
    
    // Empty cells for days before the first of the month
    for (let i = 0; i < startingDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    // Days of the month
    const today = new Date();
    for (let day = 1; day <= totalDays; day++) {
        const dateStr = formatDate(new Date(year, month, day));
        const isToday = dateStr === formatDate(today);
        const isSelected = dateStr === formatDate(currentDate);
        
        html += `<div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="selectDate(${year}, ${month}, ${day})">${day}</div>`;
    }
    
    calendarGrid.innerHTML = html;
}

// Select date from mini calendar
function selectDate(year, month, day) {
    currentDate = new Date(year, month, day);
    loadEvents();
    updateDateDisplay();
    generateMiniCalendar();
}

// Change date (prev/next)
function changeDate(direction) {
    if (direction === 'prev') {
        currentDate.setDate(currentDate.getDate() - 1);
    } else if (direction === 'next') {
        currentDate.setDate(currentDate.getDate() + 1);
    }
    loadEvents();
    updateDateDisplay();
    generateMiniCalendar();
}

// Go to today
function goToToday() {
    currentDate = new Date();
    loadEvents();
    updateDateDisplay();
    generateMiniCalendar();
}

// Logout
function logout() {
    if (typeof auth === 'undefined') {
        console.error('Auth not initialized');
        return;
    }
    
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    }).catch(error => {
        console.error('Logout error:', error);
        alert('Error logging out. Please try again.');
    });
}

// Copy invite code
function copyInviteCode() {
    const codeEl = document.getElementById('invite-code-display');
    if (!codeEl) return;
    
    const code = codeEl.textContent;
    navigator.clipboard.writeText(code).then(() => {
        showNotification('Invite code copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Please manually copy the code: ' + code);
    });
}

// Add new event
async function addEvent(event) {
    event.preventDefault();
    
    if (!currentCoupleId || !currentUser) {
        alert('Please wait for data to load');
        return;
    }
    
    showLoading();
    
    const title = document.getElementById('event-title').value;
    const time = document.getElementById('event-time').value;
    const category = document.getElementById('event-category').value;
    const notes = document.getElementById('event-notes').value;
    
    if (!title || !time) {
        alert('Please fill in title and time');
        hideLoading();
        return;
    }
    
    try {
        await db.collection('schedules').add({
            coupleId: currentCoupleId,
            title: title,
            date: formatDate(currentDate),
            time: time,
            category: category,
            notes: notes,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Clear form
        document.getElementById('event-title').value = '';
        document.getElementById('event-time').value = '';
        document.getElementById('event-category').value = 'date';
        document.getElementById('event-notes').value = '';
        
        showNotification('Event added successfully!');
        
    } catch (error) {
        console.error('Error adding event:', error);
        alert('Error adding event: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Open edit modal
function openEditModal(event) {
    const modal = document.getElementById('edit-modal');
    if (!modal) return;
    
    document.getElementById('edit-event-id').value = event.id;
    document.getElementById('edit-title').value = event.title;
    document.getElementById('edit-time').value = event.time;
    document.getElementById('edit-category').value = event.category || 'other';
    document.getElementById('edit-notes').value = event.notes || '';
    
    modal.classList.remove('hidden');
}

// Close edit modal
function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Update event
async function updateEvent(event) {
    event.preventDefault();
    showLoading();
    
    const eventId = document.getElementById('edit-event-id').value;
    const title = document.getElementById('edit-title').value;
    const time = document.getElementById('edit-time').value;
    const category = document.getElementById('edit-category').value;
    const notes = document.getElementById('edit-notes').value;
    
    if (!eventId || !title || !time) {
        alert('Please fill in required fields');
        hideLoading();
        return;
    }
    
    try {
        await db.collection('schedules').doc(eventId).update({
            title: title,
            time: time,
            category: category,
            notes: notes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        closeEditModal();
        showNotification('Event updated successfully!');
        
    } catch (error) {
        console.error('Error updating event:', error);
        alert('Error updating event: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Delete event
async function deleteEvent() {
    if (!confirm('Are you sure you want to delete this event?')) return;
    
    showLoading();
    const eventId = document.getElementById('edit-event-id').value;
    
    if (!eventId) {
        hideLoading();
        return;
    }
    
    try {
        await db.collection('schedules').doc(eventId).delete();
        closeEditModal();
        showNotification('Event deleted successfully!');
        
    } catch (error) {
        console.error('Error deleting event:', error);
        alert('Error deleting event: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Show loading
function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

// Hide loading
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// Event Manager Class
class EventManager {
    constructor(coupleId) {
        this.coupleId = coupleId;
        this.listeners = [];
    }
    
    async addEvent(eventData) {
        try {
            const eventWithMetadata = {
                ...eventData,
                coupleId: this.coupleId,
                createdBy: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            const docRef = await db.collection('schedules').add(eventWithMetadata);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Error adding event:', error);
            return { success: false, error: error.message };
        }
    }
    
    async updateEvent(eventId, eventData) {
        try {
            await db.collection('schedules').doc(eventId).update({
                ...eventData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Error updating event:', error);
            return { success: false, error: error.message };
        }
    }
    
    async deleteEvent(eventId) {
        try {
            await db.collection('schedules').doc(eventId).delete();
            return { success: true };
        } catch (error) {
            console.error('Error deleting event:', error);
            return { success: false, error: error.message };
        }
    }
    
    cleanup() {
        this.listeners.forEach(listener => listener());
    }
}

// Export functions
window.changeDate = changeDate;
window.goToToday = goToToday;
window.selectDate = selectDate;
window.logout = logout;
window.copyInviteCode = copyInviteCode;
window.addEvent = addEvent;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.updateEvent = updateEvent;
window.deleteEvent = deleteEvent;
window.showNotification = showNotification;
window.EventManager = EventManager;