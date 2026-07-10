// ============================================================
// /api/export.js
// Reçoit un objet session (résultat de /api/extract + éventuelles
// éditions manuelles) et retourne un export markdown propre.
// ============================================================

function escapeMd(str) {
  return (str || '').replace(/\r?\n/g, ' ').trim();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const session = req.body || {};
    const title = session.title || 'Session Écho';
    const date = session.date ? new Date(session.date) : new Date();
    const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    const tasks = Array.isArray(session.tasks) ? session.tasks : [];
    const decisions = Array.isArray(session.decisions) ? session.decisions : [];
    const deadlines = Array.isArray(session.deadlines) ? session.deadlines : [];

    const lines = [];
    lines.push(`# ${escapeMd(title)}`);
    lines.push('');
    lines.push(`_${dateStr}_`);
    lines.push('');
    lines.push('## Résumé');
    lines.push(escapeMd(session.summary) || '_Aucun résumé disponible._');
    lines.push('');
    lines.push('## ✓ Tâches');
    if (tasks.length === 0) {
      lines.push('_Aucune tâche détectée._');
    } else {
      tasks.forEach((t) => {
        const extra = [t.assignee, t.priority].filter(Boolean).map(escapeMd).join(', ');
        lines.push(`- [ ] ${escapeMd(t.text)}${extra ? ` (${extra})` : ''}`);
      });
    }
    lines.push('');
    lines.push('## 🤝 Décisions');
    if (decisions.length === 0) {
      lines.push('_Aucune décision détectée._');
    } else {
      decisions.forEach((d) => {
        lines.push(`- ${escapeMd(d.text)}${d.context ? ` — ${escapeMd(d.context)}` : ''}`);
      });
    }
    lines.push('');
    lines.push('## 📅 Échéances');
    if (deadlines.length === 0) {
      lines.push('_Aucune échéance détectée._');
    } else {
      deadlines.forEach((d) => {
        const dateLabel = d.date || d.date_text;
        lines.push(`- ${escapeMd(d.text)}${dateLabel ? ` — ${escapeMd(dateLabel)}` : ''}`);
      });
    }
    lines.push('');
    lines.push('---');
    lines.push('_Généré par Écho — vérifiez toujours les résultats avant de les partager._');

    return res.status(200).json({ markdown: lines.join('\n') });
  } catch (err) {
    console.error('Erreur /api/export:', err);
    return res.status(500).json({ error: "Échec de la génération de l'export" });
  }
};
