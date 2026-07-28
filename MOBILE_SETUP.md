# Mobile setup — exact order

The app code is complete, but permanent hosting and notifications must belong
to your own Firebase and GitHub accounts.

1. Create a Firebase project.
2. Enable Anonymous Authentication.
3. Create Firestore.
4. Generate a Web Push VAPID key.
5. Create a Firebase Web App.
6. Replace the placeholders in:
   - `public/firebase-config.js`
   - `public/firebase-messaging-sw.js`
7. Create a GitHub repository and upload the package.
8. Add the Firebase service-account JSON as the GitHub secret
   `FIREBASE_SERVICE_ACCOUNT_JSON`.
9. Add the GitHub variable `FIREBASE_PROJECT_ID`.
10. Enable GitHub Pages using GitHub Actions.
11. Run all three workflows from the Actions tab.
12. Open the Pages URL in Chrome and tap **Install app**.
13. Enable notifications inside the app.
14. Add `NIFTYBEES.NS` or another ticker.

The scanner runs twice each weekday. You can also run **Daily market scanner**
manually from the Actions tab.
