// Firebase Configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// Enable offline persistence using FirestoreSettings (recommended for SDK 9.22.0+)
// Include merge: true to avoid "overriding the original host" warning
const firestoreSettings = {
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    merge: true
};

db.settings(firestoreSettings);

// Note: FirestoreSettings.cache is now handled automatically in SDK 9.22.0+
// when cacheSizeBytes is set. No need for separate enablePersistence() call.

// Tab Switching Function
function switchTab(tabName) {
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Show selected form
    document.querySelectorAll('.form').forEach(form => form.classList.remove('active'));
    document.getElementById(`${tabName}-form`).classList.add('active');
}

// Show/Hide Loading
function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// Generate Random Invitation Code
function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Handle Registration (First Partner)
async function handleRegister(event) {
    event.preventDefault();
    showLoading();
    
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const partnerName = document.getElementById('partner-name').value;
    
    try {
        // Create user account
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Update profile with name
        await user.updateProfile({
            displayName: name
        });
        
        // Generate invitation code
        const inviteCode = generateInviteCode();
        
        // Create couple profile in Firestore
        await db.collection('couples').doc(user.uid).set({
            partner1Name: name,
            partner2Name: partnerName,
            partner1Email: email,
            partner2Email: null,
            partner2Id: null,
            inviteCode: inviteCode,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: user.uid
        });
        
        // Save invite code in separate collection for easy lookup
        await db.collection('invites').doc(inviteCode).set({
            coupleId: user.uid,
            used: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        alert(`Registration successful! Your invite code is: ${inviteCode}\nShare this with your partner.`);
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Registration error:', error);
        if (error.code === 'auth/configuration-not-found') {
            alert('Firebase configuration error: Email/Password authentication is not enabled.\n\nPlease go to Firebase Console → Authentication → Sign-in method → Enable Email/Password.');
        } else if (error.code === 'auth/email-already-in-use') {
            alert('This email is already registered. Please login instead.');
        } else if (error.code === 'auth/weak-password') {
            alert('Password should be at least 6 characters.');
        } else {
            alert('Error: ' + error.message);
        }
    } finally {
        hideLoading();
    }
}

// Handle Invite Registration (Second Partner)
async function handleInviteRegister(event) {
    event.preventDefault();
    showLoading();
    
    const name = document.getElementById('invite-name').value;
    const email = document.getElementById('invite-email').value;
    const password = document.getElementById('invite-password').value;
    const inviteCode = document.getElementById('invite-code').value.toUpperCase();
    
    try {
        // Verify invite code
        const inviteDoc = await db.collection('invites').doc(inviteCode).get();
        
        if (!inviteDoc.exists) {
            throw new Error('Invalid invitation code');
        }
        
        if (inviteDoc.data().used) {
            throw new Error('This invitation code has already been used');
        }
        
        // Create user account
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Update profile with name
        await user.updateProfile({
            displayName: name
        });
        
        // Update couple profile with second partner
        const coupleId = inviteDoc.data().coupleId;
        await db.collection('couples').doc(coupleId).update({
            partner2Name: name,
            partner2Email: email,
            partner2Id: user.uid
        });
        
        // Mark invite as used
        await db.collection('invites').doc(inviteCode).update({
            used: true,
            usedBy: user.uid,
            usedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Create a reference to the couple for the second partner
        await db.collection('userCouples').doc(user.uid).set({
            coupleId: coupleId,
            joinedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        alert('Successfully joined your partner!');
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Invite registration error:', error);
        if (error.code === 'auth/configuration-not-found') {
            alert('Firebase configuration error: Email/Password authentication is not enabled.\n\nPlease go to Firebase Console → Authentication → Sign-in method → Enable Email/Password.');
        } else if (error.code === 'auth/email-already-in-use') {
            alert('This email is already registered. Please login instead.');
        } else {
            alert('Error: ' + error.message);
        }
    } finally {
        hideLoading();
    }
}

// Handle Login
async function handleLogin(event) {
    event.preventDefault();
    showLoading();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Login error:', error);
        if (error.code === 'auth/configuration-not-found') {
            alert('Firebase configuration error: Email/Password authentication is not enabled.\n\nPlease go to Firebase Console → Authentication → Sign-in method → Enable Email/Password.');
        } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            alert('Invalid email or password.');
        } else if (error.code === 'auth/too-many-requests') {
            alert('Too many failed login attempts. Please try again later.');
        } else {
            alert('Login failed: ' + error.message);
        }
    } finally {
        hideLoading();
    }
}

// Check Auth State on Dashboard
auth.onAuthStateChanged((user) => {
    if (window.location.pathname.includes('dashboard.html') || window.location.pathname.includes('/dashboard')) {
        if (!user) {
            window.location.href = 'index.html';
        }
    }
});

// Export functions for use in other files
window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleInviteRegister = handleInviteRegister;
window.showLoading = showLoading;
window.hideLoading = hideLoading;