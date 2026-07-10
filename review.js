// ============================================================
// Écho — review.js
// Deux origines possibles pour "session" :
// 1. ?pending=1  -> résultat frais venant de record.js, pas encore sauvegardé
// 2. ?id=xxx     -> session déjà présente dans l'historique
// ============================================================

const urlParams = new URLSearchParams(location.search);
const sessionId = urlParams.get('id');
const isPending = urlParams.get('pending') === '1';

let session = null;
let isSaved = false;

if (isPending) {
  session = Echo.getPendingResult();
} else if (sessionId) {
  session = Echo.getSession(sessionId);
  isSaved = !!session;
}

if (!session) {
  document.querySelector('.container').innerHTML = `
    <div class="empty-state">Session introuvable ou expirée.<br><br><a href="/index.html" style="color:var(--coral); font-weight:600;">Retour à l'accueil</a></div>`;
  throw new Error('Aucune session à afficher');
}

document.getElementById('sessionTitle').textContent = session.title;
document.getElementById('sessionDate').textContent = Echo.formatDate(session.date);
document.getElementById('summaryText').textContent = session.summary;

if (isSaved) {
  document.getElementById('saveBtn').textContent = 'Enregistré dans l\'historique ✓';
  document.getElementById('saveBtn').disabled = true;
  document.getElementById('deleteRow').style.display = 'block';
}

let activeTab = 'tasks';

const TAB_LABELS = { tasks: 'tâche', decisions: 'décision', deadlines: 'échéance' };

function persist() {
  if (isSaved) {
    Echo.updateSession(session.id, session);
  } else {
    Echo.setPendingResult(session);
  }
}

function priorityBadgeClass(priority) {
  if (priority === 'haute') return 'badge';
  if (priority === 'moyenne') return 'badge badge-gold';
  if (priority === 'basse') return 'badge badge-sage';
  return 'badge';
}

function renderTab() {
  const container = document.getElementById('tabContent');
  const items = session[activeTab] || [];

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:20px;">Rien détecté ici pour l'instant.</div>`;
    return;
  }

  container.innerHTML = items.map((item, i) => {
    let metaHtml = '';
    if (activeTab === 'tasks') {
      const parts = [];
      if (item.assignee) parts.push(`<span class="badge">${Echo.escapeHtml(item.assignee)}</span>`);
      if (item.priority) parts.push(`<span class="${priorityBadgeClass(item.priority)}">${Echo.escapeHtml(item.priority)}</span>`);
      if (item.confidence && item.confidence !== 'haute') parts.push(`<span class="item-confidence">confiance ${Echo.escapeHtml(item.confidence)}</span>`);
      metaHtml = parts.join('');
    } else if (activeTab === 'deadlines') {
      const dateLabel = item.date || item.date_text || 'Date non précisée';
      metaHtml = `<span class="badge">${Echo.escapeHtml(dateLabel)}</span>`;
      if (item.confidence && item.confidence !== 'haute') metaHtml += `<span class="item-confidence">confiance ${Echo.escapeHtml(item.confidence)}</span>`;
    } else if (activeTab === 'decisions') {
      if (item.context) metaHtml = `<span class="badge">${Echo.escapeHtml(item.context)}</span>`;
      if (item.confidence && item.confidence !== 'haute') metaHtml += `<span class="item-confidence">confiance ${Echo.escapeHtml(item.confidence)}</span>`;
    }
    return `
      <div class="item-row">
        <div style="flex:1;">
          <div class="item-text" contenteditable="true" data-idx="${i}">${Echo.escapeHtml(item.text)}</div>
          ${metaHtml ? `<div class="item-meta">${metaHtml}</div>` : ''}
        </div>
        <button class="item-delete" data-idx="${i}" aria-label="Supprimer">✕</button>
      </div>`;
  }).join('');

  container.querySelectorAll('.item-text').forEach((el) => {
    el.addEventListener('blur', () => {
      const idx = +el.dataset.idx;
      if (session[activeTab][idx]) {
        session[activeTab][idx].text = el.textContent.trim();
        persist();
      }
    });
  });

  container.querySelectorAll('.item-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      session[activeTab].splice(idx, 1);
      persist();
      renderTab();
    });
  });
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    document.getElementById('addItemInput').placeholder = `Ajouter une ${TAB_LABELS[activeTab]}…`;
    renderTab();
  });
});

document.getElementById('sessionTitle').addEventListener('blur', (e) => {
  session.title = e.target.textContent.trim() || session.title;
  persist();
});
document.getElementById('summaryText').addEventListener('blur', (e) => {
  session.summary = e.target.textContent.trim();
  persist();
});

function addManualItem() {
  const input = document.getElementById('addItemInput');
  const text = input.value.trim();
  if (!text) return;

  let newItem;
  if (activeTab === 'tasks') {
    newItem = { text, assignee: null, priority: 'moyenne', confidence: 'haute' };
  } else if (activeTab === 'decisions') {
    newItem = { text, context: null, confidence: 'haute' };
  } else {
    newItem = { text, date: null, date_text: null, related_task: null, confidence: 'haute' };
  }

  session[activeTab] = session[activeTab] || [];
  session[activeTab].push(newItem);
  persist();
  input.value = '';
  renderTab();
}

document.getElementById('addItemBtn').addEventListener('click', addManualItem);
document.getElementById('addItemInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addManualItem();
});

function buildMarkdown() {
  const lines = [];
  lines.push(`# ${session.title}`);
  lines.push('');
  lines.push(Echo.formatDate(session.date));
  lines.push('');
  lines.push('## Résumé');
  lines.push(session.summary || '_Aucun résumé_');
  lines.push('');
  lines.push('## ✓ Tâches');
  if ((session.tasks || []).length === 0) lines.push('_Aucune tâche détectée_');
  (session.tasks || []).forEach((t) => {
    const extra = [t.assignee, t.priority].filter(Boolean).join(', ');
    lines.push(`- [ ] ${t.text}${extra ? ` (${extra})` : ''}`);
  });
  lines.push('');
  lines.push('## 🤝 Décisions');
  if ((session.decisions || []).length === 0) lines.push('_Aucune décision détectée_');
  (session.decisions || []).forEach((d) => {
    lines.push(`- ${d.text}${d.context ? ` — ${d.context}` : ''}`);
  });
  lines.push('');
  lines.push('## 📅 Échéances');
  if ((session.deadlines || []).length === 0) lines.push('_Aucune échéance détectée_');
  (session.deadlines || []).forEach((d) => {
    const date = d.date || d.date_text;
    lines.push(`- ${d.text}${date ? ` — ${date}` : ''}`);
  });
  return lines.join('\n');
}

document.getElementById('saveBtn').addEventListener('click', () => {
  if (isSaved) return;
  Echo.addSession(session);
  Echo.clearPendingResult();
  isSaved = true;
  const btn = document.getElementById('saveBtn');
  btn.textContent = 'Enregistré dans l\'historique ✓';
  btn.disabled = true;
  document.getElementById('deleteRow').style.display = 'block';
  history.replaceState(null, '', `/review.html?id=${session.id}`);
});

document.getElementById('exportBtn').addEventListener('click', async () => {
  try {
    const resp = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    });
    const data = await resp.json();
    const markdown = data.markdown || buildMarkdown();
    downloadMarkdown(markdown);
  } catch {
    downloadMarkdown(buildMarkdown());
  }
});

function downloadMarkdown(markdown) {
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(session.title || 'echo-session').replace(/[^a-z0-9]+/gi, '-')}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('shareBtn').addEventListener('click', async () => {
  const text = buildMarkdown();
  if (navigator.share) {
    try {
      await navigator.share({ title: session.title, text });
    } catch {
      // partage annulé par l'utilisateur, rien à faire
    }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    alert('Copié dans le presse-papiers');
  } else {
    downloadMarkdown(text);
  }
});

document.getElementById('deleteBtn')?.addEventListener('click', () => {
  if (confirm('Supprimer définitivement cette session ?')) {
    Echo.deleteSession(session.id);
    location.href = '/index.html';
  }
});

renderTab();
