// C9 — reservation lifecycle wrappers. Thin calls onto the callables; the
// admin / assigned-business gate and the status transition live in
// functions/reservations.js.
//
// createReservation (C8) / cancelReservation (C8b) wrappers are added here
// when their turn comes in the sequential order — see
// .claude/contracts/cloud-functions-contract.md.
//
// MarkCollectedResult = {
//   reservationId: string,
//   status: 'collected',
//   collectedAt: string,     // ISO-8601, server value
//   offeringName: string,
//   bakeryName: string,
//   userName: string
// }

import { callable } from './functions.js';

const _markReservationCollected = callable('markReservationCollected');

export async function markReservationCollected(reservationId) {
  return _markReservationCollected({ reservationId });
}
