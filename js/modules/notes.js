/* Записник: категорії з чеклістами (задачі/нотатки: побутові, робочі, ідеї…).
   Дані: state.notes = [{ id, name, items: [{id, text, done}] }] (синхронізується). */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.notes = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function render(root) {
    const st = App.store.state;
    if (!Array.isArray(st.notes)) st.notes = [];
    const save = function () { App.store.save(); };

    const listBox = h("div");

    function catCard(cat) {
      cat.items = cat.items || [];
      const countEl = h("span", { class: "tiny muted" });
      const itemsEl = h("div", { class: "notes-items" });

      function refreshCount() {
        const done = cat.items.filter(function (i) { return i.done; }).length;
        countEl.textContent = done + "/" + cat.items.length;
      }

      function itemRow(it) {
        const cb = h("input", { type: "checkbox" });
        cb.checked = !!it.done;
        const textIn = h("input", { class: "notes-item-text" + (it.done ? " done" : ""), value: it.text || "" });
        textIn.addEventListener("input", function () { it.text = textIn.value; });
        textIn.addEventListener("change", save);
        cb.addEventListener("change", function () {
          it.done = cb.checked;
          textIn.classList.toggle("done", it.done);
          refreshCount(); save();
        });
        const row = h("div", { class: "notes-item" }, cb, textIn,
          h("button", {
            class: "btn-mini", title: "Видалити пункт",
            onclick: function () {
              const i = cat.items.indexOf(it); if (i >= 0) cat.items.splice(i, 1);
              row.remove(); refreshCount(); save();
            },
          }, "✕"));
        return row;
      }

      cat.items.forEach(function (it) { itemsEl.append(itemRow(it)); });

      const addIn = h("input", { class: "notes-add", placeholder: "+ додати пункт…" });
      function addItem() {
        const t = addIn.value.trim();
        if (!t) return;
        const it = { id: uid(), text: t, done: false };
        cat.items.push(it);
        itemsEl.append(itemRow(it));
        addIn.value = "";
        refreshCount(); save();
        addIn.focus();
      }
      addIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addItem(); } });

      const nameIn = h("input", { class: "notes-cat-name", value: cat.name || "", placeholder: "Назва категорії" });
      nameIn.addEventListener("input", function () { cat.name = nameIn.value; });
      nameIn.addEventListener("change", save);

      refreshCount();
      return h("div", { class: "card fade-in notes-cat" },
        h("div", { class: "row between", style: "margin-bottom:8px;gap:10px" },
          nameIn,
          h("div", { class: "row", style: "gap:10px" }, countEl,
            h("button", {
              class: "btn-mini", title: "Видалити категорію",
              onclick: function () {
                if (!confirm("Видалити категорію «" + (cat.name || "") + "» з усіма пунктами?")) return;
                const i = st.notes.indexOf(cat); if (i >= 0) st.notes.splice(i, 1);
                save(); renderList();
              },
            }, "🗑"))),
        itemsEl,
        h("div", { class: "row", style: "gap:8px;margin-top:10px" }, addIn,
          h("button", { class: "btn small", onclick: addItem }, "Додати")));
    }

    function renderList() {
      listBox.innerHTML = "";
      if (!st.notes.length) {
        listBox.append(h("div", { class: "card fade-in", style: "text-align:center;padding:26px" },
          h("div", { class: "muted" }, "Порожньо. Додай першу категорію нижче — напр. «Побутові», «Робота», «Ідеї».")));
      }
      st.notes.forEach(function (cat) { listBox.append(catCard(cat)); });
    }

    const addCatIn = h("input", { class: "notes-add", placeholder: "Нова категорія…" });
    function addCat() {
      const t = addCatIn.value.trim();
      if (!t) return;
      st.notes.push({ id: uid(), name: t, items: [] });
      addCatIn.value = "";
      save(); renderList();
    }
    addCatIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addCat(); } });

    root.append(
      h("h1", { class: "page-title" }, "📝 Записник"),
      h("div", { class: "page-sub" }, "Твої плани й задачі за категоріями — побутові, робочі, ідеї. Як нотатки в телефоні."),
      listBox,
      h("div", { class: "card fade-in", style: "margin-top:4px" },
        h("div", { class: "row", style: "gap:8px" }, addCatIn,
          h("button", { class: "btn green small", onclick: addCat }, "➕ Категорія"))));

    renderList();
    return null;
  }

  return { id: "notes", title: "Записник", icon: "📝", render: render };
})();
