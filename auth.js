/* Gate d'accès très simple : mot de passe en dur côté client.
 * Objectif = friction, pas sécurité réelle (le mot de passe est visible dans
 * le code source). Ne rien mettre de sensible sur cette page.
 */
document.addEventListener('DOMContentLoaded', function () {
  var PASSWORD = 'projet';
  var SESSION_KEY = 'magistrat_auth_ok';

  var form = document.getElementById('auth-form');
  var input = document.getElementById('auth-input');
  var error = document.getElementById('auth-error');

  function unlock() {
    document.body.classList.add('authed');
  }

  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    unlock();
  } else if (input) {
    input.focus();
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (input.value === PASSWORD) {
        sessionStorage.setItem(SESSION_KEY, '1');
        error.style.display = 'none';
        unlock();
      } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
      }
    });
  }
});
