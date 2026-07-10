// ============================================================
// Écho — logique commune (storage, navigation, formatage)
// Conçu pour une migration facile vers IndexedDB/Upstash plus tard :
// toute la logique de lecture/écriture passe par ces fonctions,
// jamais d'accès direct à localStorage ailleurs dans le code.
// ============================================================

const Echo = {
  STORAGE_KEY: 'echo_sessions',
  PENDING_KEY: 'echo_pending_result',

  // --- Sessions (historique) ---
  getSessions() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveSessions(sessions) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
      return true;
    } catch {
      return false;
    }
  },

  addSession(session) {
    const sessions = this.getSessions();
    sessions.unshift(session);
    this.saveSessions(sessions);
  },

  updateSession(id, updated) {
    const sessions = this.getSessions();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx !== -1) {
      sessions[idx] = { ...sessions[idx], ...updated };
      this.saveSessions(sessions);
    }
  },

  deleteSession(id) {
    const sessions = this.getSessions().filter((s) => s.id !== id);
    this.saveSessions(sessions);
  },

  clearAllSessions() {
    localStorage.removeItem(this.STORAGE_KEY);
  },

  getSession(id) {
    return this.getSessions().find((s) => s.id === id);
  },

  // --- Résultat en attente (entre record.html et review.html avant sauvegarde) ---
  setPendingResult(result) {
    sessionStorage.setItem(this.PENDING_KEY, JSON.stringify(result));
  },

  getPendingResult() {
    try {
      const raw = sessionStorage.getItem(this.PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clearPendingResult() {
    sessionStorage.removeItem(this.PENDING_KEY);
  },

  // --- Formatage ---
  formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  },

  formatTimer(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  },

  // --- Divers ---
  uid() {
    return 'echo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // Construit un objet session normalisé à partir du résultat de /api/extract
  buildSession(extractResult, transcript) {
    return {
      id: this.uid(),
      date: new Date().toISOString(),
      title: extractResult.title || 'Session du ' + new Date().toLocaleDateString('fr-FR'),
      transcript: transcript || '',
      summary: extractResult.summary || '',
      tasks: Array.isArray(extractResult.tasks) ? extractResult.tasks : [],
      decisions: Array.isArray(extractResult.decisions) ? extractResult.decisions : [],
      deadlines: Array.isArray(extractResult.deadlines) ? extractResult.deadlines : []
    };
  }
};
