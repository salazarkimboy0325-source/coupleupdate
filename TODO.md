# Fix Firebase Warnings and Index Error

## TODO List:
- [x] Read and analyze relevant files (app.js, dashboard.js, firestore.indexes.json)
- [x] Fix app.js - Replace deprecated enablePersistence() with FirestoreSettings.cache and add merge:true
- [x] Verify firestore.indexes.json has the correct index (already done - has coupleId, date, time)
- [ ] Deploy index to Firebase (instructions provided in completion)
