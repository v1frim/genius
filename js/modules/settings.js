/* Дані: експорт/імпорт прогресу, повне скидання */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.settings = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  function render(root) {
    const exportArea = h("textarea", { rows: 6, readonly: true, style: "font-size:0.78rem;font-family:monospace" });

    const importArea = h("textarea", { rows: 6, placeholder: "Встав сюди JSON з експорту…", style: "font-size:0.78rem;font-family:monospace" });

    // ── Хмарна синхронізація між пристроями ──
    const syncBody = h("div", null);
    function renderSync(st) {
      syncBody.innerHTML = "";
      if (!st || !st.available) {
        const fb = (typeof firebase !== 'undefined') ? "Firebase завантажився, але не запустився" : "скрипти Firebase не завантажились";
        syncBody.append(h("div", { class: "small", style: "color:var(--muted)" },
          "Зараз недоступна (" + fb + "). Прогрес зберігається локально — синхронізація під'єднається, щойно буде інтернет."));
        return;
      }
      if (!st.signedIn) {
        syncBody.append(
          h("div", { class: "small", style: "margin-bottom:10px;color:var(--muted)" },
            "Увійди через Google — і прогрес стане однаковим на ПК і телефоні (відмітив на одному — оновилось на іншому). ",
            h("b", null, "Порада:"), " спершу увійди там, де вже є твій прогрес (на ПК)."),
          h("button", { class: "btn green", onclick: function () { App.sync.signIn(); } }, "Увійти через Google"));
      } else {
        const lbl = st.state === 'synced' ? "синхронізовано ✓"
          : st.state === 'connecting' ? "з'єднання…"
          : st.state === 'error' ? "помилка (спробую ще раз)" : "…";
        syncBody.append(
          h("div", { class: "small", style: "margin-bottom:6px" }, "Акаунт: ", h("b", null, st.email || "—")),
          h("div", { class: "small", style: "margin-bottom:12px;color:var(--muted)" }, "Стан: " + lbl),
          h("button", { class: "btn ghost", onclick: function () { App.sync.signOut(); } }, "Вийти"));
      }
    }
    const syncCard = h("div", { class: "card fade-in" },
      h("h2", null, "☁️ Синхронізація між пристроями"),
      syncBody);
    if (App.sync) App.sync.onStatus(renderSync); else renderSync({ available: false });

    root.append(
      h("h1", { class: "page-title" }, "⚙️ Дані"),
      h("div", { class: "page-sub" }, "Прогрес зберігається локально (localStorage). Увімкни синхронізацію нижче — або періодично роби експорт."),

      syncCard,

      h("div", { class: "card fade-in" },
        h("h2", null, "Експорт"),
        h("div", { class: "row", style: "margin-bottom:10px" },
          h("button", {
            class: "btn green",
            onclick: function () {
              const data = App.store.exportJSON();
              const blob = new Blob([data], { type: "application/json" });
              const a = h("a", {
                href: URL.createObjectURL(blob),
                download: "genius-backup-" + App.store.todayStr() + ".json",
              });
              document.body.append(a);
              a.click();
              a.remove();
            },
          }, "⬇️ Завантажити файл"),
          h("button", {
            class: "btn ghost",
            onclick: function () {
              exportArea.value = App.store.exportJSON();
              exportArea.select();
              try { document.execCommand("copy"); App.ui.toast("Скопійовано в буфер"); } catch (e) { /* старі браузери */ }
            },
          }, "📋 Показати і скопіювати")),
        exportArea),

      h("div", { class: "card fade-in" },
        h("h2", null, "Імпорт"),
        importArea,
        h("div", { class: "row", style: "margin-top:10px" },
          h("button", {
            class: "btn",
            onclick: function () {
              if (!importArea.value.trim()) { App.ui.toast("Поле порожнє", "info"); return; }
              if (!confirm("Імпорт замінить ВЕСЬ поточний прогрес. Продовжити?")) return;
              try {
                App.store.importJSON(importArea.value);
                App.ui.toast("Дані відновлено ✅");
                location.hash = "#/";
              } catch (e) {
                App.ui.toast("Помилка: " + e.message, "info");
              }
            },
          }, "♻️ Відновити з JSON"))),

      h("div", { class: "card fade-in" },
        h("h2", { class: "danger-text" }, "Небезпечна зона"),
        h("div", { class: "muted small", style: "margin-bottom:12px" },
          "Повне скидання видалить усі рекорди, задачі, цілі та журнал медитацій."),
        h("button", {
          class: "btn danger",
          onclick: function () {
            if (!confirm("Точно скинути ВЕСЬ прогрес?")) return;
            if (!confirm("Останнє попередження: все буде видалено. Скидаємо?")) return;
            App.store.resetAll();
            App.ui.toast("Почато з чистого аркуша");
            location.hash = "#/";
            location.reload();
          },
        }, "🗑️ Скинути все")),

      h("div", { class: "card fade-in" },
        h("h2", null, "Про сайт"),
        h("div", { class: "small", style: "color:var(--muted);line-height:1.7" },
          "«Genius» — особистий тренажерний зал для мозку: Шульте, швидкочитання (RSVP), друк українською, ",
          "скоромовки з генератором, усний рахунок, робоча пам'ять, медитація та трекер цілей.", h("br"),
          "Працює повністю офлайн, без сервера. Код легко розширювати — кожен тренажер це окремий модуль у js/modules/.")));

    return function () { if (App.sync) App.sync.offStatus(renderSync); };
  }

  return { id: "settings", title: "Дані", icon: "⚙️", render: render };
})();
