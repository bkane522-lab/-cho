# Écho — PWA de transcription et extraction de réunions

## Variables d'environnement à ajouter sur Vercel

| Variable | Obligatoire | Description |
|---|---|---|
| `GROQ_API_KEY` | Oui | Clé API Groq (utilisée côté serveur uniquement, jamais exposée au front) |
| `TRANSCRIBE_MODEL` | Non | Modèle de transcription. Défaut : `whisper-large-v3-turbo` |
| `EXTRACT_MODEL` | Non | Modèle d'extraction. Défaut : `llama-3.3-70b-versatile` |

## Notes techniques

- **Audio en base64, pas FormData** : les fonctions serverless Vercel en CommonJS simple ne parsent pas le multipart entrant sans dépendance (formidable/busboy). Le front envoie l'audio encodé en base64 en JSON, et `/api/transcribe.js` reconstruit un multipart pour l'appel sortant vers Groq.
- **Limite de taille** : fixée à 3 Mo réels côté front (`MAX_REAL_BYTES` dans `record.js`). Le base64 gonfle la taille d'environ +33%, donc 3 Mo réels ≈ 4 Mo encodés, ce qui reste sous la limite dure de 4,5 Mo par requête de Vercel.
- **Stockage** : localStorage uniquement pour cette V1 (`app.js` centralise tous les accès storage — migration vers IndexedDB ou Upstash KV facilitée).
- **Pas de compte utilisateur.**

## Structure

```
/
├── index.html
├── record.html
├── review.html
├── history.html
├── style.css
├── app.js
├── record.js
├── review.js
├── history.js
└── /api
    ├── transcribe.js
    ├── extract.js
    └── export.js
```
