// ============================================================
// home.js - storico tornei conclusi + accesso tramite seed
// ============================================================

function formattaData(isoString) {
  if (!isoString) return '';
  // SQLite datetime('now') è UTC in formato "YYYY-MM-DD HH:MM:SS"
  const d = new Date(isoString.replace(' ', 'T') + 'Z');
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function caricaStorico() {
  const contenitore = document.getElementById('lista-storico');
  try {
    const tornei = await Api.getTorneiConclusi();
    if (tornei.length === 0) {
      contenitore.innerHTML = '<div class="vuoto">Nessun torneo concluso finora.</div>';
      return;
    }
    contenitore.innerHTML = tornei
      .map(
        (t) => `
      <a href="/tournament.html?seed=${t.seed}" style="text-decoration:none;color:inherit;">
        <div class="torneo-storico">
          <div>
            <div class="nome">${escapeHtml(t.nome)}</div>
            <div class="data">${formattaData(t.data_conclusione)} · Seed ${t.seed}</div>
          </div>
          <div class="vincitore">🏆 ${escapeHtml(t.vincitore_nome || '—')}</div>
        </div>
      </a>`
      )
      .join('');
  } catch (err) {
    contenitore.innerHTML = `<div class="msg-errore">${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

document.getElementById('btn-entra').addEventListener('click', entraConSeed);
document.getElementById('input-seed').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') entraConSeed();
});

async function entraConSeed() {
  const campo = document.getElementById('input-seed');
  const errBox = document.getElementById('errore-seed');
  errBox.innerHTML = '';
  const seed = campo.value.trim().toUpperCase();
  if (!seed) return;
  try {
    await Api.getTorneo(seed); // verifica che esista prima di navigare
    window.location.href = `/tournament.html?seed=${encodeURIComponent(seed)}`;
  } catch (err) {
    errBox.innerHTML = `<div class="msg-errore">${escapeHtml(err.message)}</div>`;
  }
}

caricaStorico();
