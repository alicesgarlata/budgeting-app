const STORAGE_KEY = 'budget-flow-v3';
const PREVIOUS_STORAGE_KEYS = ['budget-flow-v2', 'budget-flow-v1'];
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const dateFmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

const $ = (id) => document.getElementById(id);
const state = loadState();
let pendingTimers = new Map();

function localISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function diffDaysInclusive(fromISO, toISO) {
  const ms = startOfDay(toISO) - startOfDay(fromISO);
  return Math.floor(ms / 86400000) + 1;
}

function defaultState() {
  return { config: null, expenses: [] };
}

function loadState() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return JSON.parse(current);

    for (const key of PREVIOUS_STORAGE_KEYS) {
      const old = localStorage.getItem(key);
      if (!old) continue;
      const migrated = JSON.parse(old);
      migrated.expenses = (migrated.expenses || []).map((expense) => ({
        ...expense,
        source: expense.source || 'manual',
        status: expense.status || 'completed'
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (error) {
    console.warn('Impossibile leggere i dati salvati', error);
  }
  return defaultState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function completedExpenses() {
  return state.expenses.filter((expense) => expense.status !== 'pending');
}

function sumExpenses(filterFn = () => true) {
  return completedExpenses().filter(filterFn).reduce((sum, e) => sum + e.amount, 0);
}

function getMetrics() {
  const today = localISO();
  const totalBudget = state.config.totalBudget;
  const totalSpent = sumExpenses();
  const remainingTotal = Math.max(0, totalBudget - totalSpent);
  const daysRemaining = Math.max(1, diffDaysInclusive(today, state.config.endDate));

  const spentToday = sumExpenses((e) => e.date === today);
  const spentBeforeToday = sumExpenses((e) => e.date < today);
  const elapsedBeforeToday = Math.max(0, diffDaysInclusive(state.config.startDate, today) - 1);
  const originalDays = Math.max(1, diffDaysInclusive(state.config.startDate, state.config.endDate));
  const baseDaily = totalBudget / originalDays;
  const plannedSpentBeforeToday = baseDaily * elapsedBeforeToday;
  const carry = plannedSpentBeforeToday - spentBeforeToday;
  const todayAvailable = Math.max(0, baseDaily + carry);

  return { totalSpent, remainingTotal, daysRemaining, spentToday, baseDaily, carry, todayAvailable };
}

function render() {
  const hasConfig = !!state.config;
  $('setupCard').classList.toggle('hidden', hasConfig);
  $('dashboard').classList.toggle('hidden', !hasConfig);
  $('resetBtn').classList.toggle('hidden', !hasConfig);
  $('expenseDate').value = $('expenseDate').value || localISO();

  if (!hasConfig) return;

  const m = getMetrics();
  $('todayAvailable').textContent = euro.format(m.todayAvailable);
  $('todayBaseText').textContent = `Budget base: ${euro.format(m.baseDaily)}`;
  $('spentToday').textContent = euro.format(m.spentToday);
  $('carryText').textContent = `${m.carry >= 0 ? 'Avanzo' : 'Scostamento'} accumulato: ${euro.format(Math.abs(m.carry))}`;
  $('remainingTotal').textContent = euro.format(m.remainingTotal);
  $('daysText').textContent = `${m.daysRemaining} ${m.daysRemaining === 1 ? 'giorno incluso oggi' : 'giorni inclusi oggi'}`;

  const ratio = m.todayAvailable > 0 ? m.spentToday / m.todayAvailable : (m.spentToday > 0 ? 1 : 0);
  $('progressBar').style.width = `${Math.min(100, ratio * 100)}%`;

  const remainingToday = m.todayAvailable - m.spentToday;
  const statusPill = $('statusPill');
  if (remainingToday >= 0) {
    statusPill.textContent = 'In budget';
    $('dailyMessage').textContent = `Puoi spendere ancora ${euro.format(remainingToday)} oggi. Quello che non usi resta disponibile nei giorni successivi.`;
  } else {
    statusPill.textContent = 'Oltre il limite';
    $('dailyMessage').textContent = `Oggi sei oltre di ${euro.format(Math.abs(remainingToday))}. Il budget dei prossimi giorni si ridurrà automaticamente.`;
  }

  renderExpenses();
}

function renderExpenses() {
  const list = $('expensesList');
  list.innerHTML = '';
  const sorted = [...state.expenses].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!sorted.length) {
    list.innerHTML = '<p class="empty">Ancora nessuna spesa. Il libro è pulito ✦</p>';
    return;
  }

  for (const expense of sorted) {
    const node = $('expenseTemplate').content.cloneNode(true);
    node.querySelector('.expense-note').textContent = expense.note || 'Spesa';

    const sourceBadge = node.querySelector('.source-badge');
    const isBank = expense.source === 'bank-demo';
    sourceBadge.textContent = isBank ? 'BANCA DEMO' : 'MANUALE';
    sourceBadge.classList.toggle('bank-source', isBank);

    const pending = expense.status === 'pending';
    node.querySelector('.pending-badge').classList.toggle('hidden', !pending);

    const dateText = dateFmt.format(startOfDay(expense.date));
    const timeText = expense.createdAt ? ` · ${timeFmt.format(new Date(expense.createdAt))}` : '';
    node.querySelector('.expense-date').textContent = `${dateText}${timeText}`;
    node.querySelector('.expense-amount').textContent = `${pending ? '≈' : '−'} ${euro.format(expense.amount)}`;
    if (pending) node.querySelector('.expense-amount').classList.add('pending-amount');

    node.querySelector('.icon-button').addEventListener('click', () => {
      clearPendingTimer(expense.id);
      state.expenses = state.expenses.filter((e) => e.id !== expense.id);
      saveState();
      render();
    });
    list.appendChild(node);
  }
}

function clearPendingTimer(id) {
  const timer = pendingTimers.get(id);
  if (timer) clearTimeout(timer);
  pendingTimers.delete(id);
}

function scheduleBankSettlement(transactionId, delay = 1400) {
  clearPendingTimer(transactionId);
  const timer = setTimeout(() => settleBankTransaction(transactionId), delay);
  pendingTimers.set(transactionId, timer);
}

function settleBankTransaction(transactionId) {
  const transaction = state.expenses.find((expense) => expense.id === transactionId);
  if (!transaction || transaction.status !== 'pending') return;

  transaction.status = 'completed';
  transaction.settledAt = Date.now();
  saveState();
  pendingTimers.delete(transactionId);

  showBankFeedback(`Pagamento contabilizzato: ${euro.format(transaction.amount)} da ${transaction.note}. Il budget è stato aggiornato automaticamente.`, 'success');
  render();
}

function showBankFeedback(message, type = 'info') {
  const box = $('bankFeedback');
  box.textContent = message;
  box.className = `bank-feedback ${type}`;
}

function restorePendingTransactions() {
  for (const expense of state.expenses) {
    if (expense.source === 'bank-demo' && expense.status === 'pending') {
      scheduleBankSettlement(expense.id, 700);
    }
  }
}

$('startBtn').addEventListener('click', () => {
  const totalBudget = Number($('totalBudget').value);
  const endDate = $('endDate').value;
  const today = localISO();

  if (!totalBudget || totalBudget <= 0) return alert('Inserisci un budget maggiore di zero.');
  if (!endDate || endDate < today) return alert('Scegli una data finale da oggi in poi.');

  state.config = { totalBudget, startDate: today, endDate };
  state.expenses = [];
  saveState();
  render();
});

$('expenseForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const amount = Number($('expenseAmount').value);
  const note = $('expenseNote').value.trim();
  const date = $('expenseDate').value;

  if (!amount || amount <= 0) return;

  state.expenses.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    amount,
    note,
    date,
    source: 'manual',
    status: 'completed',
    createdAt: Date.now()
  });
  saveState();

  $('expenseAmount').value = '';
  $('expenseNote').value = '';
  $('expenseDate').value = localISO();
  render();
});

$('bankPaymentForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const amount = Number($('bankAmount').value);
  const merchant = $('bankMerchant').value.trim();
  if (!amount || amount <= 0 || !merchant) return;

  const id = crypto.randomUUID ? crypto.randomUUID() : `bank-${Date.now()}`;
  state.expenses.push({
    id,
    amount,
    note: merchant,
    date: localISO(),
    source: 'bank-demo',
    status: 'pending',
    createdAt: Date.now()
  });
  saveState();

  $('bankAmount').value = '';
  $('bankMerchant').value = '';
  showBankFeedback(`Pagamento autorizzato: ${euro.format(amount)} da ${merchant}. Transazione in attesa di contabilizzazione…`, 'pending');
  render();
  scheduleBankSettlement(id);
});


function showBackupFeedback(message, isError = false) {
  const box = $('backupFeedback');
  box.textContent = message;
  box.className = `backup-feedback ${isError ? 'error' : 'success'}`;
}

function exportBackup() {
  const backup = {
    app: 'Budget Flow',
    version: 3,
    exportedAt: new Date().toISOString(),
    data: state
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `budget-flow-backup-${localISO()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showBackupFeedback('Backup esportato. Conservalo fuori dalla repository GitHub.');
}

async function importBackup(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const imported = parsed && parsed.data ? parsed.data : parsed;
    if (!imported || typeof imported !== 'object' || !Array.isArray(imported.expenses)) {
      throw new Error('Formato non valido');
    }
    if (imported.config && (!Number.isFinite(Number(imported.config.totalBudget)) || !imported.config.endDate)) {
      throw new Error('Configurazione non valida');
    }
    const confirmed = confirm('Importare questo backup? I dati attuali su questo dispositivo verranno sostituiti.');
    if (!confirmed) return;
    state.config = imported.config || null;
    state.expenses = imported.expenses.map((expense) => ({
      ...expense,
      amount: Number(expense.amount),
      source: expense.source || 'manual',
      status: expense.status || 'completed'
    })).filter((expense) => Number.isFinite(expense.amount));
    saveState();
    render();
    restorePendingTransactions();
    showBackupFeedback('Backup importato correttamente.');
  } catch (error) {
    console.error(error);
    showBackupFeedback('Questo file non sembra un backup valido di Budget Flow.', true);
  } finally {
    $('importFile').value = '';
  }
}

$('exportBtn').addEventListener('click', exportBackup);
$('importFile').addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  if (file) importBackup(file);
});

$('resetBtn').addEventListener('click', () => {
  if (!confirm('Vuoi cancellare budget e spese salvate su questo dispositivo?')) return;
  for (const id of pendingTimers.keys()) clearPendingTimer(id);
  state.config = null;
  state.expenses = [];
  saveState();
  $('totalBudget').value = '';
  $('endDate').value = '';
  $('bankFeedback').className = 'bank-feedback hidden';
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

render();
restorePendingTransactions();
