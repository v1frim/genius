/* Інтеграція з сайтом Oxford 1000 (англійська слова).

   Обидва сайти — це GitHub Pages одного користувача й живуть на ОДНОМУ origin
   (v1frim.github.io), тому ділять спільний localStorage. Звідси ми напряму
   читаємо прогрес Oxford і рахуємо ту саму шкалу «планів», що й термометр там.

   Формула (один-в-один із getThermoPointsToday у Oxford):
     бали за день = ігри того дня + сесії Duolingo того дня
                    + уроки LingoHut, зараховані того дня (≤35 → 1 бал, інакше 2)
     1 план = 4 бали.
   Працює в межах одного браузера/пристрою (це спільне сховище). Якщо даних
   Oxford ще немає (сайт не відкривали в цьому браузері) — повертаємо 0. */
window.App = window.App || {};

App.oxford = (function () {
  var DAYS_KEY = "oxford_days_v1";        // { "YYYY-MM-DD": { games: N, ... } }
  var DUO_KEY  = "oxford_duolingo_v1";    // { "YYYY-MM-DD": сесій }
  var LH_KEY   = "oxford_lingohut_v1";    // { номерУроку: "YYYY-MM-DD" }

  var POINTS_PER_PLAN = 4;

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); }
    catch (e) { return null; }
  }

  /* «Сьогодні» Oxford рахує в UTC (toISOString), беремо так само, щоб число
     збігалося з тим, що показує термометр на тому сайті. */
  function utcToday() { return new Date().toISOString().slice(0, 10); }

  /* Бали Oxford за конкретну дату (рядок "YYYY-MM-DD"). */
  function pointsForDate(date) {
    var days = read(DAYS_KEY) || {};
    var duo  = read(DUO_KEY) || {};
    var lh   = read(LH_KEY) || {};
    var pts = 0;
    if (days[date] && typeof days[date] === "object") pts += days[date].games || 0;
    pts += duo[date] || 0;
    if (lh && typeof lh === "object" && !Array.isArray(lh)) {
      Object.keys(lh).forEach(function (lesson) {
        if (lh[lesson] === date) pts += (Number(lesson) <= 35 ? 1 : 2);
      });
    }
    return pts;
  }

  function pointsToday() { return pointsForDate(utcToday()); }
  function plansToday() { return Math.floor(pointsToday() / POINTS_PER_PLAN); }

  /* Дати поточного тижня (пн..нд) у локальному форматі — як у genius (mondayStr). */
  function weekDates() {
    var out = [];
    var mon = App.store.mondayStr();
    var d = new Date(mon + "T00:00:00");
    for (var i = 0; i < 7; i++) { out.push(App.store.dateStr(d)); d.setDate(d.getDate() + 1); }
    return out;
  }

  function pointsThisWeek() {
    return weekDates().reduce(function (sum, date) { return sum + pointsForDate(date); }, 0);
  }
  function plansThisWeek() { return Math.floor(pointsThisWeek() / POINTS_PER_PLAN); }

  /* Чи є взагалі дані Oxford у цьому браузері. */
  function hasData() {
    return localStorage.getItem(DAYS_KEY) !== null ||
           localStorage.getItem(DUO_KEY) !== null ||
           localStorage.getItem(LH_KEY) !== null;
  }

  return {
    POINTS_PER_PLAN: POINTS_PER_PLAN,
    pointsForDate: pointsForDate,
    pointsToday: pointsToday,
    plansToday: plansToday,
    pointsThisWeek: pointsThisWeek,
    plansThisWeek: plansThisWeek,
    hasData: hasData,
  };
})();
