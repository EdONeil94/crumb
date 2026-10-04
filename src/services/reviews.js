// C1 / C1b — review write path wrappers. Thin calls onto the callables; the
// validation, rate-limiting, permission checks and every aggregate
// (communityAvg/reviewCount/avgPrice/priceCount/dim_*) all live server-side
// in functions/reviews.js — see .claude/contracts/cloud-functions-contract.md.
//
// SubmitReviewResult = {
//   itemId: string, itemRecordId: string,
//   item: { ...the items/{itemId} doc as written, id, itemRecordId,
//            createdAt: string },   // ISO-8601, server value
//   itemRecord: { id: string, ...fields actually written this call —
//                 aggregate-only when linking to an EXISTING record (the
//                 identity fields aren't touched); the full shape
//                 (name/category/bakeryName/... + aggregate + createdAt)
//                 when a NEW record is created. Callers merge this onto
//                 their own cached copy rather than replacing it wholesale. }
// }
// UpdateReviewResult = {
//   itemId: string,
//   item: { ...the updated items/{itemId} doc, id },
//   itemRecord: { id: string, ...aggregate } | null   // null if the review
//                                                       had no itemRecordId
// }
// DeleteReviewResult = {
//   itemId: string, itemRecordId: string | null,
//   itemRecordDeleted: boolean   // true when that was the record's last review
// }

import { callable } from './functions.js';

const _submitReview = callable('submitReview');
const _updateReview = callable('updateReview');
const _deleteReview = callable('deleteReview');

export async function submitReview(fields) {
  return _submitReview(fields);
}

export async function updateReview(itemId, fields) {
  return _updateReview({ itemId, ...fields });
}

export async function deleteReview(itemId) {
  return _deleteReview({ itemId });
}
