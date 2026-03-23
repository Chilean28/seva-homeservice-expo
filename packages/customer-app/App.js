// So expo/AppEntry.js can resolve: import App from '../../App'
// (expo-router root component; index.js still uses expo-router/entry)
const { App } = require('expo-router/build/qualified-entry');
module.exports = App;
