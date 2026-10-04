// Crumbz Cloud Functions — entry point.
// Every export here is an httpsCallable (v1 API, us-central1 default region).
// One module per feature area; see .claude/contracts/cloud-functions-contract.md.

const { setUserRole } = require('./roles');
const { moderateFlaggedReview } = require('./moderation');
const { createReservation, cancelReservation, markReservationCollected } = require('./reservations');
const { submitReview, updateReview, deleteReview } = require('./reviews');

exports.setUserRole = setUserRole;
exports.moderateFlaggedReview = moderateFlaggedReview;
exports.createReservation = createReservation;
exports.cancelReservation = cancelReservation;
exports.markReservationCollected = markReservationCollected;
exports.submitReview = submitReview;
exports.updateReview = updateReview;
exports.deleteReview = deleteReview;
