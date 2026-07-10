// ============================================================
// /api/extract.js
// Reçoit une transcription, appelle Groq Chat Completions pour
// extraire tâches / décisions / échéances / résumé en JSON strict.
// Modèle configurable via process.env.EXTRACT_MODEL avec fallback.
// ============================================================

const SYSTEM_PROMPT = `Tu analyses la transcription d'une réunion ou conversation.

Réponds UNIQUEMENT en JSON valide.
Aucun texte avant ou après.
Aucun markdown.
Aucune phrase d'explication.

Règles importantes :
- N'invente jamais une tâche, une décision, un assigné ou une échéance.
- Si aucune personne n'est clairement assignée, mets "assignee": null.
- Si aucune date explicite n'est mentionnée, mets "date": null.
- Si une date est relative, garde l'expression entendue dans "date_text".
- Si une information est incertaine, indique une confidence basse.
- Une tâche doit être une action concrète à faire.
- Une décision doit être quelque chose qui a été validé ou tranché.
- Une échéance doit être une date, une période ou un délai mentionné.

Format obligatoire :
{
  "title": "titre court (5-8 mots)",
  "summary": "résumé en 2-3 phrases",
  "tasks": [
    {"text": "...", "assignee": "nom ou null", "priority": "haute/moyenne/basse", "confidence": "haute/moyenne/basse"}
  ],
  "decisions": [
    {"text": "...", "context": "...", "confidence": "haute/moyenne/basse"}
  ],
  "deadlines": [
    {"text": "...", "date": "YYYY-MM-DD ou null", "date_text": "expression entendue ou null", "related_task": "... ou null", "confidence": "haute/moyenne/basse"}
  ]
}

Si une catégorie est vide, renvoie un tableau vide [].`;

function safeParseJson(raw) {
  let cleaned = (raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback : tenter d'extraire le premier bloc { ... } trouvé dans le texte
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // abandon, on retombe sur le fallback texte ci-dessous
      }
    }
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY manquante');
    return res.status(500).json({ error: 'Configuration serveur incomplète (clé API manquante)' });
  }

  try {
    const { transcript } = req.body || {};
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 5) {
      return res.status(400).json({ error: 'Transcription vide ou trop courte pour être analysée' });
    }

    const model = process.env.EXTRACT_MODEL || 'llama-3.3-70b-versatile';

    let resp;
    try {
      resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: transcript.slice(0, 60000) }
          ],
          temperature: 0.2,
          max_tokens: 2500
        })
      });
    } catch (networkErr) {
      console.error('Erreur réseau vers Groq:', networkErr);
      return res.status(502).json({ error: "Impossible de joindre le service d'extraction" });
    }

    if (!resp.ok) {
      let detail = '';
      try { detail = await resp.text(); } catch {}
      console.error('Groq extract error:', resp.status, detail);
      if (resp.status === 401) {
        return res.status(500).json({ error: 'Clé API Groq invalide' });
      }
      return res.status(500).json({ error: "Échec de l'extraction IA" });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const parsed = safeParseJson(raw);

    if (!parsed) {
      console.error('JSON non parsable reçu du modèle:', raw.slice(0, 500));
      return res.status(200).json({
        title: null,
        summary: raw.slice(0, 400) || 'Résumé indisponible — réponse IA invalide.',
        tasks: [],
        decisions: [],
        deadlines: []
      });
    }

    return res.status(200).json({
      title: parsed.title || null,
      summary: parsed.summary || '',
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines : []
    });
  } catch (err) {
    console.error('Erreur inattendue /api/extract:', err);
    return res.status(500).json({ error: 'Erreur serveur inattendue' });
  }
};
