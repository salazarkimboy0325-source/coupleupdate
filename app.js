// ===========================================
// FIREBASE CONFIGURATION
// ===========================================
const firebaseConfig = {
  apiKey: "AIzaSyBe6YCfVtnMFaVdi_I9FVXab_z1gUF9_Q4",
  authDomain: "couple-website-30e9a.firebaseapp.com",
  databaseURL: "https://couple-website-30e9a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "couple-website-30e9a",
  storageBucket: "couple-website-30e9a.firebasestorage.app",
  messagingSenderId: "573369941326",
  appId: "1:573369941326:web:8d3e386ad89fceb639f21f",
  measurementId: "G-GBWY8DHFFM"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence
const firestoreSettings = {
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    merge: true
};
db.settings(firestoreSettings);

// ===========================================
// GLOBAL VARIABLES
// ===========================================
let currentUser = null;
let currentCoupleId = null;

// ===========================================
// UI HELPER FUNCTIONS
// ===========================================
function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="notification-close">&times;</button>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function setButtonLoading(button, isLoading, originalText = '') {
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.innerHTML = '<span class="spinner-small"></span> Loading...';
    } else {
        button.disabled = false;
        button.textContent = originalText || button.dataset.originalText;
    }
}

// ===========================================
// TAB SWITCHING
// ===========================================
function switchTab(tabName, event) {
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Show selected form
    document.querySelectorAll('.form').forEach(form => form.classList.remove('active'));
    document.getElementById(`${tabName}-form`).classList.add('active');
}

// ===========================================
// INVITE CODE GENERATION
// ===========================================
function generateInviteCode() {
    // Removed confusing characters like O, 0, I, 1
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    
    // Generate 8 characters
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
        // Add hyphen after 4th character for readability
        if (i === 3) code += '-';
    }
    
    return code; // Format: ABCD-1234
}

// Format invite code as user types (for Person 2 input)
function formatInviteCodeInput(input) {
    let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    if (value.length > 4) {
        value = value.slice(0, 4) + '-' + value.slice(4, 8);
    }
    
    input.value = value;
}

// ===========================================
// PERSON 1 REGISTRATION
// ===========================================
async function handleRegister(event) {
    event.preventDefault();
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    setButtonLoading(submitBtn, true);
    showLoading();
    
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const partnerName = document.getElementById('partner-name').value.trim();
    
    // Validate inputs
    if (!name || !email || !password || !partnerName) {
        showNotification('Please fill in all fields', 'error');
        setButtonLoading(submitBtn, false, originalText);
        hideLoading();
        return;
    }
    
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        setButtonLoading(submitBtn, false, originalText);
        hideLoading();
        return;
    }
    
    try {
        // Step 1: Create user account
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        currentUser = user;
        
        // Step 2: Update profile with name
        await user.updateProfile({
            displayName: name
        });
        
        // Step 3: Generate unique invitation code
        const inviteCode = generateInviteCode();
        
        // Step 4: Create couple profile
        await db.collection('couples').doc(user.uid).set({
            partner1Name: name,
            partner2Name: partnerName,
            partner1Email: email,
            partner2Email: null,
            partner2Id: null,
            inviteCode: inviteCode,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: user.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Step 5: Save invite code for validation
        await db.collection('invites').doc(inviteCode.replace('-', '')).set({
            coupleId: user.uid,
            used: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: user.uid
        });
        
        // Step 6: Show success message with code
        showNotification(`✅ Registration successful!`, 'success');
        
        // Store invite code in session storage for dashboard
        sessionStorage.setItem('pendingInviteCode', inviteCode);
        
        // Step 7: Redirect to dashboard
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle specific error codes
        if (error.code === 'auth/configuration-not-found') {
            showNotification('Firebase Auth not enabled. Please enable Email/Password in Firebase Console.', 'error');
        } else if (error.code === 'auth/email-already-in-use') {
            showNotification('This email is already registered. Please login instead.', 'error');
        } else if (error.code === 'auth/weak-password') {
            showNotification('Password should be at least 6 characters.', 'error');
        } else if (error.code === 'auth/invalid-email') {
            showNotification('Please enter a valid email address.', 'error');
        } else {
            showNotification('Registration failed: ' + error.message, 'error');
        }
        
        setButtonLoading(submitBtn, false, originalText);
    } finally {
        hideLoading();
    }
}

// ===========================================
// PERSON 2 REGISTRATION (WITH INVITE CODE)
// ===========================================
async function handleInviteRegister(event) {
    event.preventDefault();
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    setButtonLoading(submitBtn, true);
    showLoading();
    
    const name = document.getElementById('invite-name').value.trim();
    const email = document.getElementById('invite-email').value.trim();
    const password = document.getElementById('invite-password').value;
    let inviteCode = document.getElementById('invite-code').value.toUpperCase();
    
    // Validate inputs
    if (!name || !email || !password || !inviteCode) {
        showNotification('Please fill in all fields', 'error');
        setButtonLoading(submitBtn, false, originalText);
        hideLoading();
        return;
    }
    
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        setButtonLoading(submitBtn, false, originalText);
        hideLoading();
        return;
    }
    
    // Remove hyphen for database lookup
    const cleanInviteCode = inviteCode.replace('-', '');
    
    try {
        // Step 1: Verify invite code exists and is not used
        const inviteDoc = await db.collection('invites').doc(cleanInviteCode).get();
        
        if (!inviteDoc.exists) {
            throw new Error('invalid-code');
        }
        
        const inviteData = inviteDoc.data();
        
        if (inviteData.used) {
            throw new Error('code-used');
        }
        
        // Step 2: Get couple information
        const coupleId = inviteData.coupleId;
        const coupleDoc = await db.collection('couples').doc(coupleId).get();
        
        if (!coupleDoc.exists) {
            throw new Error('couple-not-found');
        }
        
        // Step 3: Create user account for Person 2
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        currentUser = user;
        
        // Step 4: Update user profile with name
        await user.updateProfile({
            displayName: name
        });
        
        // Step 5: Update couple document with Person 2's info
        await db.collection('couples').doc(coupleId).update({
            partner2Name: name,
            partner2Email: email,
            partner2Id: user.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Step 6: Mark invite code as used
        await db.collection('invites').doc(cleanInviteCode).update({
            used: true,
            usedBy: user.uid,
            usedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Step 7: Create userCouple mapping for quick lookup
        await db.collection('userCouples').doc(user.uid).set({
            coupleId: coupleId,
            joinedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Step 8: Show success message
        showNotification(`✅ Successfully joined ${coupleDoc.data().partner1Name}'s couple space!`, 'success');
        
        // Step 9: Redirect to dashboard
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Invite registration error:', error);
        
        // Handle specific errors
        if (error.message === 'invalid-code') {
            showNotification('❌ Invalid invitation code. Please check and try again.', 'error');
        } else if (error.message === 'code-used') {
            showNotification('❌ This invitation code has already been used.', 'error');
        } else if (error.message === 'couple-not-found') {
            showNotification('❌ Couple not found. Please contact your partner.', 'error');
        } else if (error.code === 'auth/email-already-in-use') {
            showNotification('This email is already registered. Please login instead.', 'error');
        } else if (error.code === 'auth/invalid-email') {
            showNotification('Please enter a valid email address.', 'error');
        } else {
            showNotification('Registration failed: ' + error.message, 'error');
        }
        
        setButtonLoading(submitBtn, false, originalText);
    } finally {
        hideLoading();
    }
}

// ===========================================
// LOGIN FUNCTION
// ===========================================
async function handleLogin(event) {
    event.preventDefault();
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    setButtonLoading(submitBtn, true);
    showLoading();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showNotification('Please enter email and password', 'error');
        setButtonLoading(submitBtn, false, originalText);
        hideLoading();
        return;
    }
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showNotification('✅ Login successful!', 'success');
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Login error:', error);
        
        if (error.code === 'auth/configuration-not-found') {
            showNotification('Firebase Auth not enabled. Please enable Email/Password in Firebase Console.', 'error');
        } else if (error.code === 'auth/user-not-found') {
            showNotification('No account found with this email. Please register first.', 'error');
        } else if (error.code === 'auth/wrong-password') {
            showNotification('Incorrect password. Please try again.', 'error');
        } else if (error.code === 'auth/too-many-requests') {
            showNotification('Too many failed attempts. Please try again later.', 'error');
        } else if (error.code === 'auth/invalid-email') {
            showNotification('Please enter a valid email address.', 'error');
        } else {
            showNotification('Login failed: ' + error.message, 'error');
        }
        
        setButtonLoading(submitBtn, false, originalText);
    } finally {
        hideLoading();
    }
}

// ===========================================
// LOGOUT FUNCTION
// ===========================================
async function logout() {
    showLoading();
    try {
        await auth.signOut();
        sessionStorage.clear();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Error logging out: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ===========================================
// COPY INVITE CODE TO CLIPBOARD
// ===========================================
function copyInviteCode() {
    const codeElement = document.getElementById('invite-code-display');
    if (!codeElement) return;
    
    const code = codeElement.textContent;
    
    // Create temporary input element
    const tempInput = document.createElement('input');
    tempInput.value = code;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    
    // Show feedback
    showNotification('✅ Invite code copied to clipboard!', 'success');
}

// ===========================================
// LOAD DASHBOARD DATA
// ===========================================
async function loadDashboardData(user) {
    if (!user) return;
    
    try {
        // Check if user is Partner 1 (has couple doc with their ID)
        let coupleDoc = await db.collection('couples').doc(user.uid).get();
        let coupleData;
        let isPartner1 = true;
        let coupleId = user.uid;
        
        if (coupleDoc.exists) {
            // User is Partner 1
            coupleData = coupleDoc.data();
        } else {
            // User might be Partner 2 - check userCouples
            const userCoupleDoc = await db.collection('userCouples').doc(user.uid).get();
            
            if (userCoupleDoc.exists) {
                isPartner1 = false;
                coupleId = userCoupleDoc.data().coupleId;
                coupleDoc = await db.collection('couples').doc(coupleId).get();
                coupleData = coupleDoc.data();
            } else {
                console.error('No couple found for user');
                return;
            }
        }
        
        // Update UI elements
        const userNameEl = document.getElementById('user-name');
        const partnerNameEl = document.getElementById('partner-name');
        const partnerStatusEl = document.getElementById('partner-status');
        const inviteSection = document.getElementById('invite-section');
        const inviteCodeDisplay = document.getElementById('invite-code-display');
        
        if (userNameEl) {
            userNameEl.textContent = user.displayName || 'User';
        }
        
        // Show partner name
        const partnerName = isPartner1 ? coupleData.partner2Name : coupleData.partner1Name;
        if (partnerNameEl) {
            partnerNameEl.textContent = partnerName || 'Not connected yet';
        }
        
        // Show partner status
        if (partnerStatusEl) {
            if (coupleData.partner2Id) {
                partnerStatusEl.innerHTML = '✅ Partner connected';
                partnerStatusEl.className = 'status-connected';
            } else {
                partnerStatusEl.innerHTML = '⏳ Waiting for partner to join';
                partnerStatusEl.className = 'status-waiting';
            }
        }
        
        // Show invite code ONLY for Partner 1 and ONLY if Partner 2 hasn't joined
        if (inviteSection && inviteCodeDisplay) {
            if (isPartner1 && !coupleData.partner2Id) {
                // Check if there's a pending code in session storage
                const pendingCode = sessionStorage.getItem('pendingInviteCode');
                if (pendingCode) {
                    inviteCodeDisplay.textContent = pendingCode;
                    sessionStorage.removeItem('pendingInviteCode');
                } else {
                    inviteCodeDisplay.textContent = coupleData.inviteCode || 'Error loading code';
                }
                inviteSection.style.display = 'block';
            } else {
                inviteSection.style.display = 'none';
            }
        }
        
        // Set current couple ID for other functions
        currentCoupleId = coupleId;
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Error loading dashboard: ' + error.message, 'error');
    }
}

// ===========================================
// AUTH STATE OBSERVER
// ===========================================
auth.onAuthStateChanged(async (user) => {
    const currentPath = window.location.pathname;
    const isDashboard = currentPath.includes('dashboard.html') || currentPath.includes('/dashboard');
    
    if (user) {
        // User is logged in
        currentUser = user;
        
        if (isDashboard) {
            // Load dashboard data
            await loadDashboardData(user);
        }
    } else {
        // User is logged out
        currentUser = null;
        currentCoupleId = null;
        
        if (isDashboard) {
            // Redirect to login if on dashboard
            window.location.href = 'index.html';
        }
    }
});

// ===========================================
// INITIALIZE EVENT LISTENERS
// ===========================================
document.addEventListener('DOMContentLoaded', function() {
    // Add input formatter for invite code field
    const inviteCodeInput = document.getElementById('invite-code');
    if (inviteCodeInput) {
        inviteCodeInput.addEventListener('input', function(e) {
            formatInviteCodeInput(e.target);
        });
    }
    
    // Check for dashboard elements and initialize
    if (document.getElementById('invite-code-display')) {
        // We're on dashboard, but wait for auth state
        console.log('Dashboard loaded, waiting for auth...');
    }
});

// ===========================================
// EXPORT FUNCTIONS FOR GLOBAL ACCESS
// ===========================================
window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleInviteRegister = handleInviteRegister;
window.logout = logout;
window.copyInviteCode = copyInviteCode;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.formatInviteCodeInput = formatInviteCodeInput;
