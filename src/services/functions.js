// The single httpsCallable transport for every Cloud Functions callable.
//
// Pure transport by design: this module never imports appState.js, never
// renders, never calls showToast() or getAction(). It stays a leaf so
// `madge --circular src/` needs no getAction() indirection anywhere in the
// Cloud Functions phase. The *calling UI* decides what a failure looks like —
// it catches the thrown HttpsError and picks the toast text from
// `err.code` / `err.details.code`.

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase.js';

// callable('name') -> async (data) => result.data
// Re-throws the raw Firebase HttpsError unchanged (code, message, details).
export function callable(name) {
  const fn = httpsCallable(functions, name);
  return async (data) => {
    const res = await fn(data ?? {});
    return res.data;
  };
}

// The server's HttpsError message, as written in functions/. The client SDK
// appends the HTTP status (" [400]") to every callable error message
// (@firebase/functions: `${description} [${httpStatus}]`) — strip it before
// a calling UI shows the text in a toast. '' if there's no message.
export function serverMessage(err) {
  return (err?.message || '').replace(/\s*\[\d{3}\]$/, '');
}
