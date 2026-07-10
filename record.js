// ============================================================
// Écho — record.js
// Choix technique : audio envoyé en base64 (pas FormData) car les
// fonctions serverless Vercel en CommonJS simple ne parsent pas le
// multipart sans dépendance supplémentaire (formidable/busboy).
// Le base64 gonfle la taille d'environ +33% : on limite donc le
// fichier réel à ~3 Mo pour rester sous la limite dure de 4,5 Mo
// par requête de Vercel une fois encodé.
// ============================================================

const MAX_REAL_BYTES = 3 * 1024 * 1024; // 3 Mo réels
const CHUNK_INTERVAL_MS = 4 * 60 * 1000; // 4 min par segment en live
const HARD_LIMIT_S = 30 * 60;
const WARNING_S = 25 * 60;

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'live';

const liveUI = document.getElementById('liveUI');
const importUI = document.getElementById('importUI');
const loadingUI = document.getElementById('loadingUI');
const errorUI = document.getElementById('errorUI');
const unsupportedUI = document.getElementById('unsupportedUI');

let mediaRecorder, stream, seconds = 0, timerInterval, isPaused = false;
let transcriptParts = [];
let pendingTranscriptions = [];

function showError(msg) {
  liveUI.style.display = 'none';
  importUI.style.display = 'none';
  loadingUI.style.display = 'none';
  unsupportedUI.style.display = 'none';
  errorUI.style.display = 'block';
  document.getElementById('errorMsg').textContent = msg;
}

function showLoading(text) {
  liveUI.style.display = 'none';
  importUI.style.display = 'none';
  errorUI.style.display = 'none';
  unsupportedUI.style.display = 'none';
  loadingUI.style.display = 'block';
  document.getElementById('loadingText').textContent = text;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

async function transcribeBase64(base64) {
  const resp = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: base64 })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || 'Échec de la transcription');
  }
  return data.transcript || '';
}

async function extractFromTranscript(transcript) {
  const resp = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || "Échec de l'extraction IA");
  }
  return data;
}

async function finalizeSession(fullTranscript) {
  if (!fullTranscript || fullTranscript.trim().length < 3) {
    showError("Aucune parole n'a pu être transcrite. Réessaie dans un environnement plus calme.");
    return;
  }
  showLoading('Extraction des tâches, décisions et échéances…');
  try {
    const extractResult = await extractFromTranscript(fullTranscript);
    const session = Echo.buildSession(extractResult, fullTranscript);
    Echo.setPendingResult(session);
    location.href = '/review.html?pending=1';
  } catch (err) {
    showError(err.message);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Lecture du fichier audio impossible'));
    r.readAsDataURL(blob);
  });
}

// ---------------- MODE LIVE ----------------
if (mode === 'live') {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    unsupportedUI.style.display = 'block';
  } else {
    liveUI.style.display = 'block';
    const pulseBtn = document.getElementById('pulseBtn');
    const statusEl = document.getElementById('recStatus');
    const timerEl = document.getElementById('timer');
    const stopBtn = document.getElementById('stopBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const warningBanner = document.getElementById('warningBanner');

    async function startRecording() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        showError("Impossible d'accéder au micro. Vérifie les permissions de l'application.");
        return;
      }

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';

      try {
        mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
          : new MediaRecorder(stream);
      } catch {
        showError("Ton navigateur ne supporte pas l'enregistrement audio requis.");
        return;
      }

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          const idx = transcriptParts.length;
          transcriptParts.push(''); // réserve la place pour garder l'ordre
          const task = (async () => {
            try {
              const base64 = await blobToBase64(e.data);
              const text = await transcribeBase64(base64);
              transcriptParts[idx] = text;
            } catch (err) {
              console.error('Segment ignoré :', err.message);
            }
          })();
          pendingTranscriptions.push(task);
        }
      };

      mediaRecorder.onerror = () => {
        showError("Une erreur d'enregistrement est survenue.");
      };

      mediaRecorder.start(CHUNK_INTERVAL_MS);
      statusEl.textContent = 'Enregistrement en cours…';
      stopBtn.style.display = 'flex';
      pauseBtn.style.display = 'flex';
      pulseBtn.style.pointerEvents = 'none';

      timerInterval = setInterval(() => {
        if (isPaused) return;
        seconds++;
        timerEl.textContent = Echo.formatTimer(seconds);
        if (seconds === WARNING_S) {
          warningBanner.innerHTML = '<div class="warning-banner">Plus que 5 minutes avant la limite de 30 min</div>';
        }
        if (seconds >= HARD_LIMIT_S) {
          stopRecording();
        }
      }, 1000);
    }

    function stopRecording() {
      clearInterval(timerInterval);
      statusEl.textContent = 'Arrêt en cours…';
      showLoading('Finalisation de la transcription…');

      const finish = async () => {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        // Attend que TOUS les segments audio soient transcrits avant de continuer,
        // même si l'appel réseau vers Groq Whisper prend plusieurs secondes.
        await Promise.all(pendingTranscriptions);
        await finalizeSession(transcriptParts.join(' ').trim());
      };

      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = finish;
        try { mediaRecorder.requestData(); } catch {}
        mediaRecorder.stop();
      } else {
        finish();
      }
    }

    pulseBtn.addEventListener('click', startRecording);
    pauseBtn.addEventListener('click', () => {
      if (!mediaRecorder) return;
      isPaused = !isPaused;
      if (isPaused) {
        mediaRecorder.pause();
        pauseBtn.textContent = 'Reprendre';
        pulseBtn.classList.add('paused');
        statusEl.textContent = 'En pause';
      } else {
        mediaRecorder.resume();
        pauseBtn.textContent = 'Pause';
        pulseBtn.classList.remove('paused');
        statusEl.textContent = 'Enregistrement en cours…';
      }
    });
    stopBtn.addEventListener('click', stopRecording);
  }

// ---------------- MODE IMPORT ----------------
} else if (mode === 'import') {
  const base64 = sessionStorage.getItem('echo_import_data');
  const name = sessionStorage.getItem('echo_import_name');
  const size = parseInt(sessionStorage.getItem('echo_import_size') || '0', 10);

  if (!base64) {
    showError("Aucun fichier trouvé. Reviens à l'accueil et réimporte ton audio.");
  } else {
    importUI.style.display = 'block';
    document.getElementById('importFileName').textContent = name || 'fichier audio';
    document.getElementById('importFileSize').textContent = formatBytes(size);

    const processBtn = document.getElementById('processImportBtn');
    const sizeErrorEl = document.getElementById('importSizeError');

    if (size > MAX_REAL_BYTES) {
      sizeErrorEl.style.display = 'block';
      sizeErrorEl.innerHTML = '<div class="error-banner">Fichier trop lourd pour cette V1. Découpez l\'audio ou utilisez un fichier plus court (max ~3 Mo).</div>';
      processBtn.disabled = true;
    }

    processBtn.addEventListener('click', async () => {
      showLoading('Transcription en cours…');
      try {
        const transcript = await transcribeBase64(base64);
        sessionStorage.removeItem('echo_import_data');
        sessionStorage.removeItem('echo_import_name');
        sessionStorage.removeItem('echo_import_size');
        await finalizeSession(transcript);
      } catch (err) {
        showError(err.message);
      }
    });
  }
}
