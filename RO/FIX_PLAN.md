# Firebase Errors Fix Plan

## Issues Identified:

1. **Deprecation Warning**: `db.enablePersistence()` will be deprecated in the future - need to use `FirestoreSettings.cache` instead.

2. **Missing Indexes**: The firestore.indexes.json has empty indexes. Need to create:
   - Index for notifications query: (userId ASC, read ASC, createdAt DESC)
   - Index for schedules query: (coupleId ASC, date ASC, time ASC)

3. **Firebase Database Error**: `firebase.database is not a function` - The code is using Firebase Realtime Database but only Firestore SDK is loaded.

4. **Permission Errors**: These are caused by missing indexes - when Firestore can't execute a query due to missing index, it throws a permission error.

## Plan:

### Step 1: Update firestore.indexes.json
Add the required composite indexes for the queries.

### Step 2: Update app.js
- Replace deprecated `db.enablePersistence()` with the new cache settings API
- Either add Firebase Realtime Database SDK or simplify the presence system to use Firestore only

### Step 3: Update dashboard.html (if needed)
- Add Firebase Realtime Database SDK script if we want to keep the presence feature

## Files to Edit:
1. `firestore.indexes.json` - Add composite indexes
2. `app.js` - Fix persistence and presence system
3. `dashboard.html` - Add Firebase Realtime Database SDK (optional)
