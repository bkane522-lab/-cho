function renderHistory() {
  const sessions = Echo.getSessions();
  const container = document.getElementById('allSessions');
  const clearBtn = document.getElementById('clearAllBtn');

  clearBtn.style.display = sessions.length === 0 ? 'none' : 'inline-block';

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        Aucune session enregistrée pour l'instant.
      </div>`;
    return;
  }

  container.innerHTML = sessions.map((s) => `
    <div class="session-item" data-id="${s.id}">
      <div style="flex:1; min-width:0;" onclick="location.href='/review.html?id=${s.id}'">
        <div class="session-title">${Echo.escapeHtml(s.title || 'Session sans titre')}</div>
        <div class="session-date">${Echo.formatDate(s.date)}</div>
        ${s.summary ? `<div class="session-summary">${Echo.escapeHtml(s.summary)}</div>` : ''}
      </div>
      <div class="session-counts">
        <span class="badge">${(s.tasks || []).length} T</span>
        <span class="badge badge-gold">${(s.decisions || []).length} D</span>
        <span class="badge badge-sage">${(s.deadlines || []).length} É</span>
      </div>
      <button class="item-delete" data-delete-id="${s.id}" aria-label="Supprimer">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteId;
      if (confirm('Supprimer cette session ?')) {
        Echo.deleteSession(id);
        renderHistory();
      }
    });
  });
}

document.getElementById('clearAllBtn').addEventListener('click', () => {
  if (confirm("Vider tout l'historique ? Cette action est irréversible.")) {
    Echo.clearAllSessions();
    renderHistory();
  }
});

renderHistory();
