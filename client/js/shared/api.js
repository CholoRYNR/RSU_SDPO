/* ======================================================================
   Shared fetch helper for every page that talks to /api/*.
   Attaches the JWT (if logged in) and normalizes the {success,data} contract.
   ====================================================================== */

// Low finding, 2026-09-08 system audit: there was no handling anywhere for
// an expired/invalid session — every request after that point just failed
// with a generic "Request failed (401)" toast, over and over, with no way
// back to a working session short of the person noticing and manually
// signing out. `body.code === 'AUTH_EXPIRED'` (set only by
// authMiddleware.js, see server/middlewares/authMiddleware.js) is what
// distinguishes a real expired/missing session from an ordinary
// business-logic 401 elsewhere in the app (wrong login password, wrong
// current password on change-password) — those must NOT force a sign-out.
// `redirected` guards against firing more than once if several requests
// 401 around the same time.
var sessionExpiredRedirected = false;
function handleExpiredSession() {
  if (sessionExpiredRedirected) return;
  // Determine where to send the person back from the *stored* user's role,
  // not the current page — a borrower's expired session must land them on
  // user-login.html, never the staff admin-login.html, and vice versa.
  var role = null;
  try {
    var raw = localStorage.getItem('rsuSdpoUser');
    role = raw ? JSON.parse(raw).userRole : null;
  } catch (e) { /* malformed/missing — fall through to the admin default below */ }
  localStorage.removeItem('rsuSdpoToken');
  localStorage.removeItem('rsuSdpoUser');
  var target = role === 'Borrower' ? '/pages/auth/user-login.html' : '/pages/auth/admin-login.html';
  // Already on a login page (e.g. this 401 came from a forgot-password
  // request made while signed out) — nothing to redirect away from.
  if (/\/(user|admin)-login\.html$/.test(window.location.pathname)) return;
  sessionExpiredRedirected = true;
  window.location.href = target;
}

function apiFetch(url, options) {
  options = options || {};
  var token = localStorage.getItem('rsuSdpoToken');
  var headers = Object.assign({}, options.headers || {});
  if (token) headers.Authorization = 'Bearer ' + token;
  return fetch(url, Object.assign({}, options, { headers: headers })).then(function (res) {
    return res.json().catch(function () { return null; }).then(function (body) {
      if (body && body.code === 'AUTH_EXPIRED') {
        handleExpiredSession();
        throw new Error('Your session has expired. Please sign in again.');
      }
      if (!res.ok || !body || !body.success) {
        throw new Error((body && body.message) || 'Request failed (' + res.status + ')');
      }
      return body.data;
    });
  });
}

function currentUser() {
  var raw = localStorage.getItem('rsuSdpoUser');
  return raw ? JSON.parse(raw) : null;
}

function logout() {
  localStorage.removeItem('rsuSdpoToken');
  localStorage.removeItem('rsuSdpoUser');
  window.location.href = '/pages/auth/user-login.html';
}
