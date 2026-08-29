/* ======================================================================
   Shared fetch helper for every page that talks to /api/*.
   Attaches the JWT (if logged in) and normalizes the {success,data} contract.
   ====================================================================== */

function apiFetch(url, options) {
  options = options || {};
  var token = localStorage.getItem('rsuSdpoToken');
  var headers = Object.assign({}, options.headers || {});
  if (token) headers.Authorization = 'Bearer ' + token;
  return fetch(url, Object.assign({}, options, { headers: headers })).then(function (res) {
    return res.json().catch(function () { return null; }).then(function (body) {
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
