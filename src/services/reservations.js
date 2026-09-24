// Reservation lifecycle wrappers. Thin calls onto the callables; the stock
// maths, price, precondition checks and the admin / assigned-business gate
// all live in functions/reservations.js.
//
// CreateReservationResult = {
//   reservationId: string,
//   reservation: {                 // exactly the reservations/{id} doc as written
//     userId, userName, userEmail, bakeryName, offeringId, offeringName,
//     slot, collectDate, quantity, status: 'pending',
//     price: number, totalPrice: number,
//     createdAt: string            // ISO-8601, server value
//   },
//   remaining: number              // the offering's remaining AFTER the decrement
// }
// CancelReservationResult = {
//   reservationId: string, status: 'cancelled',
//   remaining: number | null       // null when the offering no longer exists
// }
// MarkCollectedResult = {
//   reservationId: string, status: 'collected',
//   collectedAt: string, offeringName: string, bakeryName: string, userName: string
// }

import { callable } from './functions.js';

const _createReservation = callable('createReservation');
const _cancelReservation = callable('cancelReservation');
const _markReservationCollected = callable('markReservationCollected');

export async function createReservation(offeringId, quantity) {
  return _createReservation({ offeringId, quantity });
}

export async function cancelReservation(reservationId) {
  return _cancelReservation({ reservationId });
}

export async function markReservationCollected(reservationId) {
  return _markReservationCollected({ reservationId });
}
