/**
 * NexaIoT Auth Module
 */
const Auth = (() => {
  function isLoggedIn() {
    const token = Store.get('token');
    const user  = Store.get('user');
    const exp   = Store.get('session_exp');
    if (!token || !user) return false;
    if (exp && Date.now() > exp) { logout(); return false; }
    return true;
  }

  function getUser() {
    return Store.get('user');
  }

  async function login(username, password) {
    const res = await API.login(username, password);
    if (!res.ok) throw new Error(res.error || 'Login failed');
    Store.set('token', res.token);
    Store.set('user',  res.user);
    Store.set('session_exp', Date.now() + 8 * 3600 * 1000);
    Bus.emit('auth:login', res.user);
    return res.user;
  }

  function logout() {
    Store.clear();
    Bus.emit('auth:logout');
    window.location.href = 'index.html';
  }

  return { isLoggedIn, getUser, login, logout };
})();
