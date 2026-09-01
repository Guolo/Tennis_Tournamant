// ============================================================
// tournament.js - cuore della UI di gestione del torneo:
// mostra il match "corrente" con pulsanti rapidi per i set,
// gestisce "Salta Match", "Termina Torneo", il calendario del
// girone all'italiana per giornate e la classifica (ordinata
// per set vinti). Si adatta automaticamente alla modalità
// sola-lettura quando il torneo è concluso.
// ============================================================

const parametriUrl = new URLSearchParams(window.location.search);
const seed = (parametriUrl.get('seed') || '').toUpperCase();
const eNuovo = parametriUrl.get('nuovo') === '1';

let statoCorrente = null; // ultima risposta completa dal server

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

if (!seed) {
  document.getElementById('area-contenuto').innerHTML =
    '<div class="msg-errore">Nessun seed specificato.</div>';
} else {
  document.getElementById('testo-seed').textContent = seed;
  if (eNuovo) document.getElementById('banner-nuovo').style.display = 'block';
  caricaTorneo();
}

async function caricaTorneo() {
  try {
    const dati = await Api.getTorneo(seed);
    statoCorrente = dati;
    render(dati);
  } catch (err) {
    document.getElementById('area-contenuto').innerHTML = '';
    document.getElementById('area-errore').innerHTML =
      `<div class="msg-errore">${escapeHtml(err.message)}</div>`;
  }
}

// Numero di set necessari a vincere il match, dato il formato del torneo
function setNecessari(formatoSet) {
  return formatoSet === 5 ? 3 : 2;
}

// Sceglie quale match proporre come "match corrente" da giocare:
// tra i match 'pronto', preferisce quelli non saltati; se non ce ne
// sono, mostra il primo saltato disponibile (si torna a giocarlo).
function trovaMatchCorrente(match) {
  const pronti = match.filter((m) => m.stato === 'pronto');
  if (pronti.length === 0) return null;
  const nonSaltati = pronti.filter((m) => !m.saltato);
  const lista = nonSaltati.length > 0 ? nonSaltati : pronti;
  lista.sort((a, b) => (a.round - b.round) || (a.posizione - b.posizione));
  return lista[0];
}

function nomeGiocatore(giocatori, id) {
  if (!id) return 'Da definire';
  const g = giocatori.find((x) => x.id === id);
  return g ? g.nome : '—';
}

function render(dati) {
  const { torneo, giocatori, match, classifica } = dati;
  const eDoppio = torneo.tipo === 'doppio';
  document.title = `${torneo.nome} · Torneo Tennis`;
  document.getElementById('titolo-torneo').textContent = torneo.nome;

  document.getElementById('testo-banner-nuovo').textContent = eDoppio ? 'Match creato!' : 'Torneo creato!';
  document.getElementById('testo-banner-concluso').textContent = eDoppio ? 'Match concluso' : 'Torneo concluso';
  document.getElementById('btn-termina').textContent = eDoppio ? '🏁 Termina Match' : '🏁 Termina Torneo';

  const concluso = torneo.stato === 'concluso';
  document.getElementById('footer-torneo').style.display = concluso ? 'none' : 'block';
  document.getElementById('banner-concluso').style.display = concluso ? 'block' : 'none';
  if (concluso) {
    document.getElementById('nome-vincitore-finale').textContent = torneo.vincitore_nome || '—';
    document.getElementById('banner-nuovo').style.display = 'none';
  }

  const area = document.getElementById('area-contenuto');
  area.innerHTML = '';

  if (!concluso) {
    const matchCorrente = trovaMatchCorrente(match);
    if (matchCorrente) {
      area.appendChild(renderCardMatchCorrente(matchCorrente, giocatori, torneo));
    } else {
      const infoCard = document.createElement('div');
      infoCard.className = 'card';
      infoCard.innerHTML =
        '<div class="vuoto">Tutti i match del girone sono stati giocati. Puoi terminare il torneo per pubblicare la classifica finale.</div>';
      area.appendChild(infoCard);
    }
  }

  area.appendChild(renderClassifica(classifica, concluso, eDoppio));
  area.appendChild(renderCalendario(match, giocatori, torneo));
}

// ---- Card del match "da giocare adesso" -----------------------------------
function renderCardMatchCorrente(m, giocatori, torneo) {
  const necessari = setNecessari(torneo.formato_set);
  const setVintiA = m.set.filter((s) => s.vincitore_id === m.giocatore_a_id).length;
  const setVintiB = m.set.filter((s) => s.vincitore_id === m.giocatore_b_id).length;

  const card = document.createElement('div');
  card.className = 'card match-attivo';

  const pallini = (vinti) => {
    let html = '';
    for (let i = 0; i < necessari; i++) {
      html += `<div class="set-pallino ${i < vinti ? 'vinto' : ''}">${i + 1}</div>`;
    }
    return html;
  };

  card.innerHTML = `
    <p class="card-titolo">
      Match in corso · Giornata ${m.round}
      ${m.saltato ? '<span class="badge badge-saltato">Ripreso</span>' : ''}
    </p>
    <div class="giocatore-riga">
      <span class="giocatore-nome">${escapeHtml(nomeGiocatore(giocatori, m.giocatore_a_id))}</span>
      <div class="set-punti">${pallini(setVintiA)}</div>
    </div>
    <div class="vs">VS</div>
    <div class="giocatore-riga">
      <span class="giocatore-nome">${escapeHtml(nomeGiocatore(giocatori, m.giocatore_b_id))}</span>
      <div class="set-punti">${pallini(setVintiB)}</div>
    </div>

    <div class="pulsanti-set">
      <button class="btn-set-a" data-lato="A">Punto set: ${escapeHtml(nomeGiocatore(giocatori, m.giocatore_a_id))}</button>
      <button class="btn-set-b" data-lato="B">Punto set: ${escapeHtml(nomeGiocatore(giocatori, m.giocatore_b_id))}</button>
    </div>

    <div class="azioni-match">
      <button class="btn-neutro" data-azione="annulla" ${m.set.length === 0 ? 'disabled' : ''}>↩ Annulla ultimo set</button>
      <button class="btn-neutro" data-azione="salta">⏭ Salta Match</button>
    </div>

    ${m.set.length > 0 ? `
      <p class="card-titolo mt-16">Set giocati</p>
      ${renderElencoSetModificabili(m, giocatori, true)}
    ` : ''}
  `;

  card.querySelectorAll('[data-lato]').forEach((btn) => {
    btn.addEventListener('click', () => registraSet(m.id, btn.dataset.lato));
  });
  card.querySelector('[data-azione="annulla"]').addEventListener('click', () => annullaSet(m.id));
  card.querySelector('[data-azione="salta"]').addEventListener('click', () => saltaMatch(m.id, true));

  return card;
}

// ---- Elenco dei set di un match, con pulsanti per modificarne il
// vincitore (usato sia nel match corrente sia, in forma richiudibile,
// nel calendario per correggere match già conclusi). ------------------------
function renderElencoSetModificabili(m, giocatori, modificabile) {
  if (!m.set || m.set.length === 0) {
    return '<p class="nessun-set">Nessun set ancora registrato.</p>';
  }
  const nomeA = nomeGiocatore(giocatori, m.giocatore_a_id);
  const nomeB = nomeGiocatore(giocatori, m.giocatore_b_id);

  return `
    <div class="elenco-set">
      ${m.set
        .map((s) => {
          const vinceA = s.vincitore_id === m.giocatore_a_id;
          return `
          <div class="riga-set">
            <div class="riga-set-testo">
              <span class="set-label">Set ${s.numero_set}</span>
              <span class="set-vincitore">${escapeHtml(vinceA ? nomeA : nomeB)}</span>
            </div>
            ${modificabile ? `
              <div class="modifica-set-azioni">
                <button class="btn-piccolo ${vinceA ? 'btn-set-selezionato' : 'btn-neutro'}"
                  data-modifica-lato="A" data-set-id="${s.id}" data-match-id="${m.id}">${escapeHtml(nomeA)}</button>
                <button class="btn-piccolo ${!vinceA ? 'btn-set-selezionato' : 'btn-neutro'}"
                  data-modifica-lato="B" data-set-id="${s.id}" data-match-id="${m.id}">${escapeHtml(nomeB)}</button>
              </div>` : ''}
          </div>`;
        })
        .join('')}
    </div>
  `;
}

// ---- Classifica del girone, ordinata per set vinti --------------------------
function renderClassifica(classifica, concluso, eDoppio) {
  const card = document.createElement('div');
  card.className = 'card';

  const righe = classifica
    .map(
      (r) => `
      <tr class="${r.posizione === 1 && concluso ? 'riga-vincitore' : ''}">
        <td class="cl-pos">${r.posizione}${r.posizione === 1 && concluso ? ' 🏆' : ''}</td>
        <td class="cl-nome">${escapeHtml(r.nome)}</td>
        <td>${r.partite_giocate}</td>
        <td>${r.partite_vinte}</td>
        <td class="cl-set">${r.set_vinti}</td>
        <td>${r.set_persi}</td>
        <td>${r.differenza_set > 0 ? '+' : ''}${r.differenza_set}</td>
      </tr>`
    )
    .join('');

  card.innerHTML = `
    <p class="card-titolo">${concluso ? '🏆 Classifica finale' : 'Classifica'}</p>
    <div class="scroll-tabella">
      <table class="tabella-classifica">
        <thead>
          <tr>
            <th>#</th>
            <th>${eDoppio ? 'Team' : 'Giocatore'}</th>
            <th title="Partite giocate">PG</th>
            <th title="Partite vinte">PV</th>
            <th title="Set vinti">SV</th>
            <th title="Set persi">SP</th>
            <th title="Differenza set">DIFF</th>
          </tr>
        </thead>
        <tbody>${righe}</tbody>
      </table>
    </div>
    <p class="nota-classifica">Ordinata per set vinti (a parità: differenza set, poi partite vinte).</p>
  `;
  return card;
}

// ---- Calendario del girone, raggruppato per giornata -------------------------
function renderCalendario(match, giocatori, torneo) {
  const torneoInCorso = torneo.stato !== 'concluso';
  const contenitore = document.createElement('div');
  const titoloSezione = document.createElement('p');
  titoloSezione.className = 'card-titolo mt-16';
  titoloSezione.style.padding = '0 4px';
  titoloSezione.textContent = 'Calendario incontri';
  contenitore.appendChild(titoloSezione);

  const numeroGiornate = Math.max(...match.map((m) => m.round));

  for (let giornata = 1; giornata <= numeroGiornate; giornata++) {
    const titolo = document.createElement('div');
    titolo.className = 'round-titolo';
    titolo.textContent = `Giornata ${giornata}`;
    contenitore.appendChild(titolo);

    const matchDellaGiornata = match
      .filter((m) => m.round === giornata)
      .sort((a, b) => a.posizione - b.posizione);

    matchDellaGiornata.forEach((m) => {
      const box = document.createElement('div');
      box.className = 'mini-match';
      const aVince = m.vincitore_id && m.vincitore_id === m.giocatore_a_id;
      const bVince = m.vincitore_id && m.vincitore_id === m.giocatore_b_id;

      let statoTesto = '';
      if (m.stato === 'concluso') statoTesto = '<span class="badge badge-concluso">Concluso</span>';
      else if (m.saltato) statoTesto = '<span class="badge badge-saltato">Saltato</span>';
      else statoTesto = '<span class="badge badge-corso">Pronto</span>';

      const puntiSet = (idGiocatore) =>
        m.set.filter((s) => s.vincitore_id === idGiocatore).length;

      const idPannello = `pannello-modifica-${m.id}`;
      const mostraModifica = torneoInCorso && m.set.length > 0;

      box.innerHTML = `
        <div class="riga ${aVince ? 'vince' : ''}">
          <span>${escapeHtml(nomeGiocatore(giocatori, m.giocatore_a_id))}</span>
          <span>${m.set.length ? puntiSet(m.giocatore_a_id) : ''}</span>
        </div>
        <div class="riga ${bVince ? 'vince' : ''}">
          <span>${escapeHtml(nomeGiocatore(giocatori, m.giocatore_b_id))}</span>
          <span>${m.set.length ? puntiSet(m.giocatore_b_id) : ''}</span>
        </div>
        <div class="riga-stato-modifica">
          <div class="stato-mini">${statoTesto}</div>
          ${mostraModifica ? `<button class="link-modifica" data-toggle-modifica data-target-panel="${idPannello}">✎ Modifica set</button>` : ''}
        </div>
        ${mostraModifica ? `<div class="pannello-modifica nascosto" id="${idPannello}">${renderElencoSetModificabili(m, giocatori, true)}</div>` : ''}
      `;
      contenitore.appendChild(box);
    });
  }

  return contenitore;
}

// ---- Azioni che chiamano le API e ri-renderizzano --------------------------
async function registraSet(matchId, lato) {
  try {
    const dati = await Api.registraSet(seed, matchId, lato);
    statoCorrente = dati;
    render(dati);
  } catch (err) {
    mostraErrore(err.message);
  }
}

async function annullaSet(matchId) {
  try {
    const dati = await Api.annullaSet(seed, matchId);
    statoCorrente = dati;
    render(dati);
  } catch (err) {
    mostraErrore(err.message);
  }
}

async function modificaSet(matchId, setId, lato) {
  try {
    const dati = await Api.modificaSet(seed, matchId, setId, lato);
    statoCorrente = dati;
    render(dati);
  } catch (err) {
    mostraErrore(err.message);
  }
}

// Listener delegato: gestisce sia il tap sui pulsanti "Modifica set"
// (riassegna il vincitore di un set) sia l'apertura/chiusura del
// pannello richiudibile nel calendario, senza dover ri-agganciare
// gli handler ad ogni render.
document.addEventListener('click', (e) => {
  const btnModifica = e.target.closest('[data-modifica-lato]');
  if (btnModifica) {
    modificaSet(
      Number(btnModifica.dataset.matchId),
      Number(btnModifica.dataset.setId),
      btnModifica.dataset.modificaLato
    );
    return;
  }
  const btnToggle = e.target.closest('[data-toggle-modifica]');
  if (btnToggle) {
    const pannello = document.getElementById(btnToggle.dataset.targetPanel);
    if (pannello) pannello.classList.toggle('nascosto');
  }
});

async function saltaMatch(matchId, saltato) {
  try {
    const dati = await Api.saltaMatch(seed, matchId, saltato);
    statoCorrente = dati;
    render(dati);
  } catch (err) {
    mostraErrore(err.message);
  }
}

function mostraErrore(msg) {
  const box = document.getElementById('area-errore');
  box.innerHTML = `<div class="msg-errore">${escapeHtml(msg)}</div>`;
  setTimeout(() => (box.innerHTML = ''), 4000);
}

document.getElementById('btn-termina').addEventListener('click', async () => {
  const eDoppio = statoCorrente?.torneo?.tipo === 'doppio';
  const oggetto = eDoppio ? 'il match' : 'il torneo';
  if (!confirm(`Terminare definitivamente ${oggetto}? Da questo momento non sarà più modificabile.`)) {
    return;
  }
  try {
    const dati = await Api.terminaTorneo(seed);
    statoCorrente = dati;
    render(dati);
  } catch (err) {
    mostraErrore(err.message);
  }
});
