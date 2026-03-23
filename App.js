// When Expo is started from repo root, AppEntry.js resolves ../../App to this file.
// Re-export the customer-app root so the bundle uses that app.
module.exports = require('./packages/customer-app/App');
