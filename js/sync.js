/* Хмарна синхронізація між пристроями через Firebase (Auth + Firestore).

   Вантажиться лише якщо є мережа і завантажився Firebase SDK; інакше додаток
   працює як раніше — локально (localStorage). Документ користувача:
     users/{uid} = { data: <JSON всього стану>, client, ts }
   Логіка: при першому з'єднанні — ОБ'ЄДНАННЯ локального і хмарного (нічого
   критичного не губиться), далі — «останній запис перемагає» в реальному часі.
   Захист від циклів: зміни, отримані з хмари, застосовуються під прапором
   applyingRemote, тож не штовхаються назад. */
window.App = window.App || {};

App.sync = (function () {
  var firebaseConfig = {
    apiKey: "AIzaSyBooflKX8sJr1XW9wS9dCqqQIQLvR9kch4",
    authDomain: "genius-11387.firebaseapp.com",
    projectId: "genius-11387",
    storageBucket: "genius-11387.firebasestorage.app",
    messagingSenderId: "807581148536",
    appId: "1:807581148536:web:856300e02d77428251548d",
    measurementId: "G-PD03M78X3H"
  };

  var auth = null, db = null, unsub = null, pushTimer = null;
  var applyingRemote = false, firstSnap = true;
  var clientId = getClientId();
  var listeners = [];
  // state: off | connecting | synced | error | offline
  var status = { available: false, signedIn: false, email: null, state: 'off' };

  function getClientId() {
    try {
      var k = localStorage.getItem('genius.sync.client');
      if (k) return k;
      var id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('genius.sync.client', id);
      return id;
    } catch (e) { return 'c' + Date.now(); }
  }

  function setStatus(patch) {
    Object.assign(status, patch);
    listeners.forEach(function (fn) { try { fn(status); } catch (e) {} });
  }
  function onStatus(fn) { listeners.push(fn); try { fn(status); } catch (e) {} }
  function offStatus(fn) { listeners = listeners.filter(function (x) { return x !== fn; }); }

  function init() {
    // Якщо статичні теги Firebase не завантажились (буває після повернення з
    // редіректу в standalone-PWA) — дотягуємо SDK динамічно й тоді ініціалізуємо.
    if (typeof firebase === 'undefined' || !firebase.initializeApp || !firebase.firestore) {
      loadFirebaseScripts(function (ok) {
        if (ok) realInit(); else setStatus({ available: false, state: 'offline' });
      });
      return;
    }
    realInit();
  }

  function loadFirebaseScripts(cb) {
    if (typeof document === 'undefined') { cb(false); return; }
    var files = [
      'js/vendor/firebase-app-compat.js',
      'js/vendor/firebase-auth-compat.js',
      'js/vendor/firebase-firestore-compat.js'
    ];
    var i = 0;
    (function next() {
      if (i >= files.length) {
        cb(typeof firebase !== 'undefined' && !!firebase.initializeApp && !!firebase.firestore);
        return;
      }
      var s = document.createElement('script');
      s.src = files[i++];
      s.async = false;
      s.onload = next;
      s.onerror = function () { cb(false); };
      document.head.appendChild(s);
    })();
  }

  function realInit() {
    try {
      firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
      setStatus({ available: true, state: 'off' });
      auth.getRedirectResult().catch(function (e) { console.warn('redirect result', e && e.code); });
      auth.onAuthStateChanged(handleAuth);
      App.onStateSaved = function () { schedulePush(); };
    } catch (e) {
      console.warn('Firebase init failed', e);
      setStatus({ available: false, state: 'offline' });
    }
  }

  function handleAuth(user) {
    if (unsub) { unsub(); unsub = null; }
    if (!user) { setStatus({ signedIn: false, email: null, state: 'off' }); return; }
    firstSnap = true;
    setStatus({ signedIn: true, email: user.email, state: 'connecting' });
    var ref = db.collection('users').doc(user.uid);
    unsub = ref.onSnapshot(
      function (doc) { handleSnapshot(doc, ref); },
      function (err) { console.warn('snapshot error', err); setStatus({ state: 'error' }); });
  }

  function handleSnapshot(doc, ref) {
    if (doc.metadata && doc.metadata.hasPendingWrites) return; // власний ще не закомічений запис
    var cloud = doc.exists ? safeParse(doc.data().data) : null;
    var cloudClient = doc.exists ? doc.data().client : null;
    if (firstSnap) {
      firstSnap = false;
      if (!cloud) {
        pushNow(ref, App.store.state);                 // хмара порожня — вивантажуємо локальне
      } else {
        var merged = mergeStates(App.store.state, cloud);
        applyRemote(merged);                           // ставимо об'єднане локально
        pushNow(ref, merged);                          // і вивантажуємо назад
      }
      setStatus({ state: 'synced' });
      return;
    }
    if (cloud && cloudClient !== clientId) applyRemote(cloud); // зміна з іншого пристрою
    setStatus({ state: 'synced' });
  }

  function applyRemote(stateObj) {
    applyingRemote = true;
    try {
      App.store.replaceState(stateObj);
      if (App.rerender) App.rerender();
    } catch (e) { console.warn('applyRemote', e); }
    applyingRemote = false;
  }

  function schedulePush() {
    if (applyingRemote || !auth || !auth.currentUser || !db) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      pushNow(db.collection('users').doc(auth.currentUser.uid), App.store.state);
    }, 800);
  }

  function pushNow(ref, stateObj) {
    try {
      ref.set({ data: JSON.stringify(stateObj), client: clientId, ts: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function () { setStatus({ state: 'synced' }); })
        .catch(function (e) { console.warn('push failed', e); setStatus({ state: 'error' }); });
    } catch (e) { console.warn('push exception', e); setStatus({ state: 'error' }); }
  }

  function signIn() {
    if (!auth) { App.ui && App.ui.toast && App.ui.toast('Хмара недоступна (немає мережі)', 'info'); return; }
    var provider = new firebase.auth.GoogleAuthProvider();
    setStatus({ state: 'connecting' });
    // Попап тримає сторінку відкритою (на iOS у встановленому PWA повний редірект
    // ламає завантаження Firebase). Якщо попап не підтримується — редірект як запас.
    auth.signInWithPopup(provider).catch(function (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request' || e.code === 'auth/operation-not-supported-in-this-environment')) {
        auth.signInWithRedirect(provider);
      } else {
        console.warn('signIn', e);
        setStatus({ state: 'error' });
        App.ui && App.ui.toast && App.ui.toast('Не вдалося увійти: ' + (e && (e.message || e.code) || ''), 'info');
      }
    });
  }
  function signOut() { if (auth) auth.signOut(); }

  // ───────── об'єднання станів (нічого критичного не губиться) ─────────
  function safeParse(s) { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return null; } }
  function totalRecords(s) { var n = 0; if (s && s.records) for (var k in s.records) if (Array.isArray(s.records[k])) n += s.records[k].length; return n; }

  function mergeByDayCat(a, b) {
    a = a || {}; b = b || {}; var out = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (d) {
      out[d] = out[d] || {}; var ad = a[d] || {}, bd = b[d] || {};
      Object.keys(ad).concat(Object.keys(bd)).forEach(function (c) { out[d][c] = Math.max(ad[c] || 0, bd[c] || 0); });
    });
    return out;
  }
  function mergeByDayNum(a, b) {
    a = a || {}; b = b || {}; var out = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (d) { out[d] = Math.max(a[d] || 0, b[d] || 0); });
    return out;
  }

  function mergeStates(local, cloud) {
    local = local || {}; cloud = cloud || {};
    // базу (редаговані поля: tasks, goals, prefs, taskState…) беремо з «багатшого» за записами боку
    var primary = totalRecords(local) >= totalRecords(cloud) ? local : cloud;
    var merged = JSON.parse(JSON.stringify(primary));
    // records — об'єднати обидва боки за ts
    merged.records = merged.records || {};
    var cats = {};
    [local.records, cloud.records].forEach(function (r) { if (r) Object.keys(r).forEach(function (c) { cats[c] = 1; }); });
    Object.keys(cats).forEach(function (c) {
      var la = (local.records && local.records[c]) || [], cb = (cloud.records && cloud.records[c]) || [];
      var seen = {}, out = [];
      la.concat(cb).forEach(function (r) {
        var key = r && (r.ts != null ? c + ':' + r.ts : JSON.stringify(r));
        if (key && !seen[key]) { seen[key] = 1; out.push(r); }
      });
      out.sort(function (x, y) { return (x.ts || 0) - (y.ts || 0); });
      if (out.length > 500) out = out.slice(-500);
      merged.records[c] = out;
    });
    // taskHistory — одна на дату (вищий pct)
    var hist = {};
    [(local.taskHistory || []), (cloud.taskHistory || [])].forEach(function (arr) {
      arr.forEach(function (e) { if (e && e.date && (!hist[e.date] || (e.pct || 0) > (hist[e.date].pct || 0))) hist[e.date] = e; });
    });
    merged.taskHistory = Object.keys(hist).sort().map(function (d) { return hist[d]; });
    if (merged.taskHistory.length > 400) merged.taskHistory = merged.taskHistory.slice(-400);
    // лічильники / зіграний час — об'єднати без втрат
    merged.timeByDay = mergeByDayCat(local.timeByDay, cloud.timeByDay);
    merged.twisterByDay = mergeByDayNum(local.twisterByDay, cloud.twisterByDay);
    merged.twisterTotal = Math.max(local.twisterTotal || 0, cloud.twisterTotal || 0);
    return merged;
  }

  return {
    init: init, signIn: signIn, signOut: signOut,
    onStatus: onStatus, offStatus: offStatus,
    mergeStates: mergeStates, // відкрито для тестів/дебагу
    get status() { return status; }
  };
})();

App.sync.init();
