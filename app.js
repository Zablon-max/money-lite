(() => {
  'use strict';

  const KEY = 'moneyLite.v1';
  const BACKUP_KEY = 'moneyLite.lastBackup';

  const WALLET_TYPES = {
    mpesa: ['📱', 'M-Pesa'], cash: ['💵', 'Cash'], bank: ['🏦', 'Bank'],
    sacco: ['👥', 'Sacco'], savings: ['🐖', 'Savings'], other: ['👛', 'Other'],
  };

  const DEFAULT_CATS = [
    ['expense', '🍽️', 'Food'], ['expense', '🚌', 'Transport'], ['expense', '📶', 'Airtime & data'],
    ['expense', '🏠', 'Rent'], ['expense', '💡', 'Electricity & water'], ['expense', '🎓', 'School fees'],
    ['expense', '🩺', 'Health'], ['expense', '🛍️', 'Shopping'], ['expense', '🎬', 'Entertainment'],
    ['expense', '🧾', 'Other expense'],
    ['income', '💼', 'Salary'], ['income', '💻', 'Freelance'], ['income', '🏪', 'Business'],
    ['income', '🎁', 'Gift'], ['income', '💰', 'Other income'],
  ];

  const LINES = [
    'Every shilling has a job to do.', 'Track it, plan it, keep it.', 'Small savings, kept daily, add up.',
    'Spend with purpose today.', 'Know where your money goes.', 'Plan the month before it plans you.',
    'Progress is built one entry at a time.',
  ];

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $('#app');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => Number.parseFloat(v) || 0;
  const r2 = (n) => Math.round(n * 100) / 100;
  const fmt = (n) => new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const monthOf = (date) => date.slice(0, 7);
  const shiftMonth = (m, delta) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + delta, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' }); };
  const fmtDate = (s) => { const [y, mo, d] = s.split('-').map(Number); return new Date(y, mo - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };
  const dayOfYear = () => { const n = new Date(); return Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 86400000); };

  // ---------- data ----------
  function fresh() {
    return {
      wallets: [], transactions: [], budgets: [],
      categories: DEFAULT_CATS.map(([type, icon, name]) => ({ id: uid(), type, icon, name })),
    };
  }

  function normalize(s) {
    if (!s || !Array.isArray(s.wallets) || !Array.isArray(s.transactions) || !Array.isArray(s.budgets) || !Array.isArray(s.categories)) {
      throw new Error('bad data');
    }
    return {
      wallets: s.wallets.map((w) => ({ id: String(w.id), name: String(w.name || '').slice(0, 60), type: WALLET_TYPES[w.type] ? w.type : 'other', opening: r2(num(w.opening)) })),
      categories: s.categories.map((c) => ({ id: String(c.id), type: c.type === 'income' ? 'income' : 'expense', icon: String(c.icon || '🧾').slice(0, 8), name: String(c.name || '').slice(0, 50) })),
      transactions: s.transactions.map((t) => ({
        id: String(t.id), type: t.type === 'income' ? 'income' : 'expense', amount: r2(num(t.amount)),
        walletId: String(t.walletId), categoryId: t.categoryId ? String(t.categoryId) : null,
        date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : today(), note: String(t.note || '').slice(0, 140),
      })),
      budgets: s.budgets.map((b) => ({ id: String(b.id), categoryId: String(b.categoryId), amount: r2(num(b.amount)) })),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* fall through to fresh data */ }
    return fresh();
  }

  let state = load();
  let flash = {};
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  const walletOf = (id) => state.wallets.find((w) => w.id === id);
  const catOf = (id) => state.categories.find((c) => c.id === id);
  const sumTx = (list, type) => list.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  const monthTx = (m) => state.transactions.filter((t) => monthOf(t.date) === m);
  const spentIn = (catId, m) => monthTx(m).filter((t) => t.type === 'expense' && t.categoryId === catId).reduce((s, t) => s + t.amount, 0);
  const balance = (w) => r2(w.opening + sumTx(state.transactions.filter((t) => t.walletId === w.id), 'income') - sumTx(state.transactions.filter((t) => t.walletId === w.id), 'expense'));

  function budgetAlert(tx) {
    if (tx.type !== 'expense' || !tx.categoryId) return '';
    const b = state.budgets.find((x) => x.categoryId === tx.categoryId);
    const cat = catOf(tx.categoryId);
    if (!b || !cat || b.amount <= 0) return '';
    const spent = spentIn(tx.categoryId, monthOf(tx.date));
    if (spent > b.amount) return 'Over budget: ' + cat.name + ' is KES ' + fmt(spent - b.amount) + ' over its limit.';
    const pct = Math.round((spent / b.amount) * 100);
    return pct >= 80 ? 'Careful: ' + cat.name + ' is at ' + pct + '% of its budget.' : '';
  }

  function flashHtml() {
    const html = (flash.ok ? '<p class="success">' + esc(flash.ok) + '</p>' : '') + (flash.warn ? '<p class="alert">⚠ ' + esc(flash.warn) + '</p>' : '');
    flash = {};
    return html;
  }

  const notFound = () => '<div class="card"><p class="muted">That item was not found.</p></div><p><a href="#/home">&larr; Home</a></p>';
  const monthNav = (base, m) => '<div class="month-nav"><a href="#/' + base + '/' + shiftMonth(m, -1) + '">&larr;</a><strong>' + monthLabel(m) + '</strong><a href="#/' + base + '/' + shiftMonth(m, 1) + '">&rarr;</a></div>';

  function needsBackup() {
    if (state.transactions.length < 5) return false;
    const last = localStorage.getItem(BACKUP_KEY);
    if (!last) return true;
    return (new Date() - new Date(last)) / 86400000 > 30;
  }

  // ---------- views ----------
  function viewHome() {
    const m = monthOf(today());
    const tx = monthTx(m);
    const total = state.wallets.reduce((s, w) => s + balance(w), 0);
    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    return `
      <section class="hero">
        <h1>${greet}</h1>
        <p class="intention">${esc(LINES[dayOfYear() % LINES.length])}</p>
        <span class="stat">📅 ${monthLabel(m)}</span>
        ${state.wallets.length ? `<span class="stat">💰 KES ${fmt(total)}</span><span class="stat">⬆ ${fmt(sumTx(tx, 'income'))}</span><span class="stat">⬇ ${fmt(sumTx(tx, 'expense'))}</span>` : ''}
      </section>
      ${needsBackup() ? '<a class="alert" href="#/data" style="margin-bottom:14px">⚠ You have not backed up lately. Tap to export a backup.</a>' : ''}
      <div class="tiles">
        <a class="tile wallets" href="#/wallets"><span class="icon">👛</span><h3>Wallets</h3><p>Where your money lives</p></a>
        <a class="tile activity" href="#/activity"><span class="icon">💸</span><h3>Activity</h3><p>Money in and out</p></a>
        <a class="tile budgets" href="#/budgets"><span class="icon">📊</span><h3>Budgets</h3><p>Limits that protect you</p></a>
        <a class="tile backup" href="#/data"><span class="icon">🗂️</span><h3>Backup</h3><p>Keep your data safe</p></a>
      </div>`;
  }

  function viewWallets() {
    const total = state.wallets.reduce((s, w) => s + balance(w), 0);
    const list = state.wallets.length
      ? state.wallets.map((w) => `
          <a class="card row" href="#/wallet/${esc(w.id)}">
            <span class="w-icon">${WALLET_TYPES[w.type][0]}</span>
            <div class="w-info"><h3>${esc(w.name)}</h3><span class="muted">${WALLET_TYPES[w.type][1]}</span></div>
            <div class="money">KES ${fmt(balance(w))}</div>
          </a>`).join('')
      : '<div class="card"><p class="muted">No wallets yet. Add the places where your money lives, like M-Pesa, cash, or your bank.</p></div>';
    return `
      <div class="page-head"><h2>👛 Wallets</h2><a class="btn" href="#/wallet/new">+ Add wallet</a></div>
      ${flashHtml()}
      <div class="card total"><span class="muted">Total across wallets</span><div class="money big">KES ${fmt(total)}</div></div>
      ${list}`;
  }

  function viewWalletForm(id) {
    const isNew = id === 'new';
    const w = isNew ? { name: '', type: 'mpesa', opening: 0 } : walletOf(id);
    if (!w) return notFound();
    const options = Object.entries(WALLET_TYPES).map(([k, [icon, label]]) => `<option value="${k}" ${w.type === k ? 'selected' : ''}>${icon} ${label}</option>`).join('');
    return `
      <h2>${isNew ? 'Add a wallet' : 'Edit wallet'}</h2>
      <div class="card">
        <form data-form="wallet" data-id="${isNew ? '' : esc(id)}">
          <label>Name</label>
          <input name="name" maxlength="60" value="${esc(w.name)}" placeholder="e.g. My M-Pesa" required>
          <label>Type</label>
          <select name="type">${options}</select>
          <label>Starting balance (KES)</label>
          <input name="opening" type="number" step="0.01" min="0" value="${esc(w.opening)}" required>
          <button type="submit">Save wallet</button>
        </form>
        ${isNew ? '' : `<button class="danger" data-del="wallet" data-id="${esc(id)}">Delete wallet</button>`}
      </div>
      <p><a href="#/wallets">&larr; Back to wallets</a></p>`;
  }

  function viewActivity(m) {
    const tx = monthTx(m).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const inc = sumTx(tx, 'income');
    const out = sumTx(tx, 'expense');
    const rows = tx.length
      ? tx.map((t) => {
          const cat = catOf(t.categoryId);
          const w = walletOf(t.walletId);
          return `
            <a class="card row" href="#/tx/${esc(t.id)}">
              <span class="w-icon">${cat ? cat.icon : '🧾'}</span>
              <div class="w-info"><h3>${esc(cat ? cat.name : 'Uncategorised')}</h3>
                <span class="muted">${fmtDate(t.date)} · ${esc(w ? w.name : 'Deleted wallet')}${t.note ? ' · ' + esc(t.note) : ''}</span></div>
              <div class="money ${t.type}">${t.type === 'income' ? '+' : '−'} ${fmt(t.amount)}</div>
            </a>`;
        }).join('')
      : '<div class="card"><p class="muted">Nothing recorded this month. Tap <strong>+ Add</strong> to record income or an expense.</p></div>';
    return `
      <div class="page-head"><h2>💸 Activity</h2><a class="btn" href="#/tx/new">+ Add</a></div>
      ${flashHtml()}
      ${monthNav('activity', m)}
      <div class="summary">
        <div class="card sum in"><span class="muted">Income</span><div class="money">${fmt(inc)}</div></div>
        <div class="card sum out"><span class="muted">Spent</span><div class="money">${fmt(out)}</div></div>
        <div class="card sum net"><span class="muted">Left</span><div class="money">${fmt(inc - out)}</div></div>
      </div>
      ${rows}`;
  }

  function viewTxForm(id) {
    if (!state.wallets.length) {
      return '<div class="card"><p class="muted">Add a wallet first, then you can record money in and out.</p><a class="btn" href="#/wallet/new">Add a wallet</a></div>';
    }
    const isNew = id === 'new';
    const t = isNew
      ? { type: 'expense', amount: '', walletId: state.wallets[0].id, categoryId: null, date: today(), note: '' }
      : state.transactions.find((x) => x.id === id);
    if (!t) return notFound();
    const wallets = state.wallets.map((w) => `<option value="${esc(w.id)}" ${w.id === t.walletId ? 'selected' : ''}>${WALLET_TYPES[w.type][0]} ${esc(w.name)}</option>`).join('');
    const cats = state.categories.map((c) => `<option value="${esc(c.id)}" data-type="${c.type}" ${c.id === t.categoryId ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('');
    return `
      <h2>${isNew ? 'Add income or expense' : 'Edit entry'}</h2>
      <div class="card">
        <form data-form="tx" data-id="${isNew ? '' : esc(id)}">
          <div class="seg">
            <input type="radio" name="type" id="t-exp" value="expense" ${t.type === 'expense' ? 'checked' : ''}>
            <label for="t-exp" class="exp">Expense</label>
            <input type="radio" name="type" id="t-inc" value="income" ${t.type === 'income' ? 'checked' : ''}>
            <label for="t-inc" class="inc">Income</label>
          </div>
          <label>Amount (KES)</label>
          <input name="amount" type="number" step="0.01" min="0.01" value="${esc(t.amount)}" required>
          <label>Wallet</label>
          <select name="walletId">${wallets}</select>
          <label>Category</label>
          <select name="categoryId" id="category">${cats}</select>
          <label>Date</label>
          <input name="date" type="date" value="${esc(t.date)}" required>
          <label>Note (optional)</label>
          <input name="note" maxlength="140" value="${esc(t.note)}" placeholder="e.g. Lunch, matatu fare">
          <button type="submit">Save</button>
        </form>
        ${isNew ? '' : `<button class="danger" data-del="tx" data-id="${esc(id)}">Delete entry</button>`}
      </div>
      <p><a href="#/activity">&larr; Back to activity</a></p>`;
  }

  function viewBudgets(m) {
    const rows = state.budgets
      .map((b) => {
        const cat = catOf(b.categoryId);
        const spent = spentIn(b.categoryId, m);
        const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
        const st = spent > b.amount ? 'over' : pct >= 80 ? 'warn' : 'ok';
        return { b, cat, spent, pct, st };
      })
      .filter((r) => r.cat)
      .sort((a, b) => b.pct - a.pct);
    const totalLimit = rows.reduce((s, r) => s + r.b.amount, 0);
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
    const cards = rows.length
      ? rows.map(({ b, cat, spent, pct, st }) => {
          const left = b.amount - spent;
          return `
            <a class="card row" style="display:block" href="#/budget/${esc(b.id)}">
              <div class="row">
                <span class="w-icon">${cat.icon}</span>
                <div class="w-info"><h3>${esc(cat.name)}</h3><span class="muted">KES ${fmt(spent)} of ${fmt(b.amount)}</span></div>
                <span class="pill ${st === 'ok' ? '' : st}">${pct}%</span>
              </div>
              <div class="bar"><div class="fill ${st === 'ok' ? '' : st}" style="width:${Math.min(pct, 100)}%"></div></div>
              <span class="left ${st === 'ok' ? '' : st}">${left < 0 ? 'KES ' + fmt(-left) + ' over budget' : 'KES ' + fmt(left) + ' left'}</span>
            </a>`;
        }).join('')
      : '<div class="card"><p class="muted">No budgets yet. Tap <strong>+ Add</strong>, pick a category like Food, and set how much you can spend on it each month.</p></div>';
    return `
      <div class="page-head"><h2>📊 Budgets</h2><a class="btn" href="#/budget/new">+ Add</a></div>
      ${flashHtml()}
      ${monthNav('budgets', m)}
      ${rows.length ? `<div class="card total"><span class="muted">Budgeted spending</span><div class="money big">KES ${fmt(totalSpent)}</div><span class="muted">of KES ${fmt(totalLimit)} planned</span></div>` : ''}
      ${cards}`;
  }

  function viewBudgetForm(id) {
    const isNew = id === 'new';
    const b = isNew ? { categoryId: '', amount: '' } : state.budgets.find((x) => x.id === id);
    if (!b) return notFound();
    const taken = state.budgets.map((x) => x.categoryId);
    const options = state.categories.filter((c) => c.type === 'expense' && !taken.includes(c.id));
    if (isNew && !options.length) {
      return '<div class="card"><p class="muted">Every expense category already has a budget.</p></div><p><a href="#/budgets">&larr; Back to budgets</a></p>';
    }
    const cat = catOf(b.categoryId);
    const field = isNew
      ? `<select name="categoryId">${options.map((c) => `<option value="${esc(c.id)}">${c.icon} ${esc(c.name)}</option>`).join('')}</select>`
      : `<input value="${cat ? cat.icon + ' ' + esc(cat.name) : ''}" disabled>`;
    return `
      <h2>${isNew ? 'Add a budget' : 'Edit budget'}</h2>
      <div class="card">
        <form data-form="budget" data-id="${isNew ? '' : esc(id)}">
          <label>Category</label>
          ${field}
          <label>Monthly limit (KES)</label>
          <input name="amount" type="number" step="0.01" min="1" value="${esc(b.amount)}" required>
          <p class="muted" style="margin:6px 0 0">This limit applies to every month.</p>
          <button type="submit">Save budget</button>
        </form>
        ${isNew ? '' : `<button class="danger" data-del="budget" data-id="${esc(id)}">Remove budget</button>`}
      </div>
      <p><a href="#/budgets">&larr; Back to budgets</a></p>`;
  }

  function viewData() {
    const last = localStorage.getItem(BACKUP_KEY);
    return `
      <h2>🗂️ Backup</h2>
      ${flashHtml()}
      <div class="card">
        <p>Your data lives <strong>only on this device</strong>, in this browser. If you clear the site's data or lose the phone, it is gone, so export a backup now and then.</p>
        <p class="muted">Last backup: ${last ? esc(last) : 'never'}</p>
        <button id="btn-export">Export a backup file</button>
      </div>
      <div class="card">
        <h3>Restore from a backup</h3>
        <p class="muted">This replaces everything in the app with the contents of the file.</p>
        <input type="file" id="file-import" accept="application/json,.json">
      </div>
      <div class="card">
        <h3>Start over</h3>
        <button class="danger" id="btn-reset">Delete all data</button>
      </div>`;
  }

  // ---------- actions ----------
  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function submitWallet(form, id) {
    const d = new FormData(form);
    const name = String(d.get('name') || '').trim().slice(0, 60);
    if (!name) return alert('Give the wallet a name.');
    const data = { name, type: WALLET_TYPES[d.get('type')] ? d.get('type') : 'other', opening: r2(num(d.get('opening'))) };
    if (id) Object.assign(walletOf(id), data);
    else state.wallets.push({ id: uid(), ...data });
    save();
    flash.ok = 'Wallet saved.';
    go('#/wallets');
  }

  function submitTx(form, id) {
    const d = new FormData(form);
    const type = d.get('type') === 'income' ? 'income' : 'expense';
    const amount = r2(num(d.get('amount')));
    const walletId = String(d.get('walletId'));
    const categoryId = d.get('categoryId') ? String(d.get('categoryId')) : null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(d.get('date')) ? d.get('date') : today();
    if (amount <= 0) return alert('Enter an amount above zero.');
    if (!walletOf(walletId)) return alert('Pick a wallet.');
    const cat = catOf(categoryId);
    if (categoryId && (!cat || cat.type !== type)) return alert('Pick a category that matches income or expense.');
    const data = { type, amount, walletId, categoryId, date, note: String(d.get('note') || '').trim().slice(0, 140) };
    let saved;
    if (id) saved = Object.assign(state.transactions.find((t) => t.id === id), data);
    else { saved = { id: uid(), ...data }; state.transactions.push(saved); }
    save();
    flash.ok = 'Saved.';
    flash.warn = budgetAlert(saved);
    go('#/activity/' + monthOf(date));
  }

  function submitBudget(form, id) {
    const d = new FormData(form);
    const amount = r2(num(d.get('amount')));
    if (amount < 1) return alert('Enter a monthly limit.');
    if (id) {
      state.budgets.find((b) => b.id === id).amount = amount;
    } else {
      const categoryId = String(d.get('categoryId'));
      const cat = catOf(categoryId);
      if (!cat || cat.type !== 'expense') return alert('Pick a category.');
      if (state.budgets.some((b) => b.categoryId === categoryId)) return alert('That category already has a budget.');
      state.budgets.push({ id: uid(), categoryId, amount });
    }
    save();
    flash.ok = 'Budget saved.';
    go('#/budgets');
  }

  const FORMS = { wallet: submitWallet, tx: submitTx, budget: submitBudget };

  function del(kind, id) {
    if (kind === 'wallet') {
      if (!confirm('Delete this wallet and all of its entries?')) return;
      state.wallets = state.wallets.filter((w) => w.id !== id);
      state.transactions = state.transactions.filter((t) => t.walletId !== id);
      save();
      go('#/wallets');
    } else if (kind === 'tx') {
      if (!confirm('Delete this entry?')) return;
      state.transactions = state.transactions.filter((t) => t.id !== id);
      save();
      go('#/activity');
    } else if (kind === 'budget') {
      if (!confirm('Remove this budget?')) return;
      state.budgets = state.budgets.filter((b) => b.id !== id);
      save();
      go('#/budgets');
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'money-lite-backup-' + today() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    localStorage.setItem(BACKUP_KEY, today());
    flash.ok = 'Backup file created. Keep it somewhere safe.';
    render();
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = normalize(JSON.parse(reader.result));
        if (!confirm('Replace everything in this app with the backup?')) return;
        state = data;
        save();
        flash.ok = 'Backup restored.';
        render();
      } catch (err) {
        alert('That file is not a valid backup.');
      }
    };
    reader.readAsText(file);
  }

  function resetData() {
    if (!confirm('Delete ALL data in this app? Export a backup first if you might need it.')) return;
    if (!confirm('Really delete everything?')) return;
    state = fresh();
    save();
    go('#/home');
  }

  function setupCategoryFilter(select) {
    const apply = () => {
      const type = $('input[name="type"]:checked').value;
      let first = null;
      Array.from(select.options).forEach((o) => {
        const show = o.dataset.type === type;
        o.hidden = !show;
        o.disabled = !show;
        if (show && !first) first = o;
      });
      const current = select.selectedOptions[0];
      if ((!current || current.disabled) && first) select.value = first.value;
    };
    document.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener('change', apply));
    apply();
  }

  // ---------- router ----------
  function bind() {
    app.querySelectorAll('form[data-form]').forEach((f) => f.addEventListener('submit', (e) => {
      e.preventDefault();
      FORMS[f.dataset.form](f, f.dataset.id);
    }));
    app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => del(b.dataset.del, b.dataset.id)));
    const cat = $('#category');
    if (cat) setupCategoryFilter(cat);
    const exp = $('#btn-export');
    if (exp) exp.addEventListener('click', exportData);
    const imp = $('#file-import');
    if (imp) imp.addEventListener('change', importData);
    const rst = $('#btn-reset');
    if (rst) rst.addEventListener('click', resetData);
  }

  function render() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const page = parts[0] || 'home';
    const arg = parts[1] || '';
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(arg) ? arg : monthOf(today());
    let html;
    switch (page) {
      case 'wallets': html = viewWallets(); break;
      case 'wallet': html = viewWalletForm(arg || 'new'); break;
      case 'activity': html = viewActivity(month); break;
      case 'tx': html = viewTxForm(arg || 'new'); break;
      case 'budgets': html = viewBudgets(month); break;
      case 'budget': html = viewBudgetForm(arg || 'new'); break;
      case 'data': html = viewData(); break;
      default: html = viewHome();
    }
    app.innerHTML = html;
    window.scrollTo(0, 0);
    const navPage = { wallet: 'wallets', tx: 'activity', budget: 'budgets' }[page] || page;
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.page === navPage));
    bind();
  }

  window.addEventListener('hashchange', render);
  render();

  // Ask the browser not to delete our data when storage is low
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
  }
})();