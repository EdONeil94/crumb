// C3 — flagged-review moderation wrappers. Thin calls onto the
// `moderateFlaggedReview` callable; the admin gate, the batched delete and
// the itemRecord recompute all live in functions/moderation.js.
//
// ModerationResult = {
//   flagId: string,
//   action: 'remove' | 'dismiss',
//   itemId: string | null,        // the removed review's id (null for dismiss)
//   reviewDeleted: boolean
// }

import { callable } from './functions.js';

const moderateFlaggedReview = callable('moderateFlaggedReview');

export async function removeFlaggedReview(flagId) {
  return moderateFlaggedReview({ flagId, action: 'remove' });
}

export async function dismissFlaggedReview(flagId) {
  return moderateFlaggedReview({ flagId, action: 'dismiss' });
}
