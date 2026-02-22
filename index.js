const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// 1️⃣ **Send Invitation Email Function**
exports.sendInvitationEmail = functions.firestore
    .document('couples/{coupleId}')
    .onCreate(async (snap, context) => {
        const coupleData = snap.data();
        const inviteCode = coupleData.inviteCode;
        
        // In production, integrate with SendGrid or similar email service
        console.log(`Invitation code for ${coupleData.partner1Name}: ${inviteCode}`);
        
        // You would send actual email here
        // await sendEmail({
        //   to: coupleData.partner1Email,
        //   subject: 'Your Couple Invitation Code',
        //   body: `Share this code with your partner: ${inviteCode}`
        // });
        
        return null;
    });

// 2️⃣ **Validate and Process Invitation**
exports.validateInvitation = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }
    
    const { inviteCode, userEmail, userName } = data;
    
    try {
        // Get invite document
        const inviteDoc = await db.collection('invites').doc(inviteCode).get();
        
        if (!inviteDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Invalid invitation code');
        }
        
        if (inviteDoc.data().used) {
            throw new functions.https.HttpsError('already-exists', 'Code already used');
        }
        
        // Update couple with partner2 info
        const coupleId = inviteDoc.data().coupleId;
        await db.collection('couples').doc(coupleId).update({
            partner2Name: userName,
            partner2Email: userEmail,
            partner2Id: context.auth.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Mark invite as used
        await db.collection('invites').doc(inviteCode).update({
            used: true,
            usedBy: context.auth.uid,
            usedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Create userCouple mapping
        await db.collection('userCouples').doc(context.auth.uid).set({
            coupleId: coupleId,
            joinedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, coupleId: coupleId };
        
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// 3️⃣ **Schedule Cleanup Function (runs daily)**
exports.cleanupOldEvents = functions.pubsub
    .schedule('0 0 * * *') // Run at midnight every day
    .timeZone('UTC')
    .onRun(async (context) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const oldEvents = await db.collection('schedules')
            .where('date', '<', thirtyDaysAgo.toISOString().split('T')[0])
            .get();
        
        let batch = db.batch();
        oldEvents.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        console.log(`Cleaned up ${oldEvents.size} old events`);
        
        return null;
    });

// 4️⃣ **Daily Schedule Summary (sends notification)**
exports.dailyScheduleSummary = functions.pubsub
    .schedule('0 8 * * *') // Run at 8 AM every day
    .timeZone('America/New_York')
    .onRun(async (context) => {
        const today = new Date().toISOString().split('T')[0];
        
        // Get all events for today
        const todayEvents = await db.collection('schedules')
            .where('date', '==', today)
            .get();
        
        // Group by couple
        const coupleEvents = {};
        todayEvents.forEach(doc => {
            const event = doc.data();
            if (!coupleEvents[event.coupleId]) {
                coupleEvents[event.coupleId] = [];
            }
            coupleEvents[event.coupleId].push(event);
        });
        
        // For each couple, send notification
        for (const [coupleId, events] of Object.entries(coupleEvents)) {
            const coupleDoc = await db.collection('couples').doc(coupleId).get();
            const coupleData = coupleDoc.data();
            
            // Get both partners' user IDs
            const partner1Id = coupleId;
            const partner2Id = coupleData.partner2Id;
            
            // Create summary message
            const summary = events.map(e => 
                `${e.time}: ${e.title}`
            ).join('\n');
            
            // Store notification for both partners
            const notification = {
                coupleId: coupleId,
                message: `Today's schedule:\n${summary}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false
            };
            
            if (partner1Id) {
                await db.collection('notifications').add({
                    ...notification,
                    userId: partner1Id
                });
            }
            
            if (partner2Id) {
                await db.collection('notifications').add({
                    ...notification,
                    userId: partner2Id
                });
            }
        }
        
        return null;
    });