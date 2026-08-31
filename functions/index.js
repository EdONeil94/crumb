// Crumbz Cloud Functions — entry point.
// Every export here is an httpsCallable (v1 API, us-central1 default region).
// One module per feature area; see .claude/contracts/cloud-functions-contract.md.

const { setUserRole } = require('./roles');
const { moderateFlaggedReview } = require('./moderation');

exports.setUserRole = setUserRole;
exports.moderateFlaggedReview = moderateFlaggedReview;
