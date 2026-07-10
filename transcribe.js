// ============================================================
// /api/transcribe.js
// Reçoit l'audio en base64 (JSON), le convertit en multipart
// pour l'API Groq Whisper, et retourne { transcript }.
// Choix base64 plutôt que FormData côté client : une fonction
// serverless Vercel en CommonJS simple ne parse pas le multipart
// entrant sans dépendance supplémentaire (formidable/busboy).
// On reconstruit nous-mêmes un multipart pour l'appel sortant vers Groq.
// ============================================================

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY manquante');
    return res.status(500).json({ error: "Configuration serveur incomplète (clé API manquante)" });
  }

  try {
    const { audio } = req.body || {};
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ error: 'Audio manquant ou invalide' });
    }

    const commaIdx = audio.indexOf(',');
    const base64Data = commaIdx !== -1 ? audio.slice(commaIdx + 1) : audio;

    let buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch {
      return res.status(400).json({ error: 'Impossible de décoder le fichier audio' });
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Fichier audio vide' });
    }

    const boundary = '----EchoBoundary' + Date.now() + Math.random().toString(36).slice(2);
    const model = process.env.TRANSCRIBE_MODEL || 'whisper-large-v3-turbo';

    const preFile = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`
    );
    const postFile = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([preFile, buffer, postFile]);

    let resp;
    try {
      resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
      });
    } catch (networkErr) {
      console.error('Erreur réseau vers Groq:', networkErr);
      return res.status(502).json({ error: 'Impossible de joindre le service de transcription' });
    }

    if (!resp.ok) {
      let detail = '';
      try { detail = await resp.text(); } catch {}
      console.error('Groq Whisper error:', resp.status, detail);
      if (resp.status === 401) {
        return res.status(500).json({ error: 'Clé API Groq invalide' });
      }
      if (resp.status === 413) {
        return res.status(413).json({ error: 'Fichier audio trop volumineux pour la transcription' });
      }
      return res.status(500).json({ error: 'Échec de la transcription' });
    }

    const data = await resp.json();
    return res.status(200).json({ transcript: data.text || '' });
  } catch (err) {
    console.error('Erreur inattendue /api/transcribe:', err);
    return res.status(500).json({ error: 'Erreur serveur inattendue' });
  }
};
