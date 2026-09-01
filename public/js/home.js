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

// ---- Selettore Torneo / Doppio ---------------------------------------------
let tipoAttivo = 'torneo';

// Ricorda l'ultima modalità scelta tra un reload e l'altro. Avvolto in
// try/catch perché localStorage può non essere disponibile (es. modalità
// di navigazione privata su alcuni browser): in quel caso si ricade
// silenziosamente sul default 'torneo', senza rompere la pagina.
const CHIAVE_TIPO_SALVATO = 'tornei-tipo-attivo';

function leggiTipoSalvato() {
  try {
    return localStorage.getItem(CHIAVE_TIPO_SALVATO) === 'doppio' ? 'doppio' : 'torneo';
  } catch {
    return 'torneo';
  }
}

function salvaTipo(tipo) {
  try {
    localStorage.setItem(CHIAVE_TIPO_SALVATO, tipo);
  } catch {
    // ignorato: se non si può salvare, la pagina funziona comunque
  }
}

const TESTI_TIPO = {
  torneo: {
    linkNuovo: '/create.html?tipo=torneo',
    labelNuovo: '+ Nuovo Torneo',
    titoloStorico: 'Storico Tornei',
    vuoto: 'Nessun torneo concluso finora.',
  },
  doppio: {
    linkNuovo: '/create.html?tipo=doppio',
    labelNuovo: '+ Nuovo Match Doppio',
    titoloStorico: 'Storico Match Doppio',
    vuoto: 'Nessun match di doppio concluso finora.',
  },
};

function applicaTipo(tipo) {
  tipoAttivo = tipo;
  salvaTipo(tipo);
  document.querySelectorAll('.toggle-opzione').forEach((btn) => {
    const attivo = btn.dataset.tipo === tipo;
    btn.classList.toggle('attivo', attivo);
    btn.setAttribute('aria-selected', attivo ? 'true' : 'false');
  });
  indicatoreToggle.classList.toggle('a-destra', tipo === 'doppio');
  const testi = TESTI_TIPO[tipo];
  document.getElementById('link-nuovo').href = testi.linkNuovo;
  document.getElementById('link-nuovo').textContent = testi.labelNuovo;
  document.getElementById('titolo-storico').textContent = testi.titoloStorico;
  caricaStorico();
}

const toggleModalita = document.getElementById('toggle-modalita');
const indicatoreToggle = document.getElementById('toggle-indicatore');

// ---- Tap diretto su "Torneo" / "Doppio" ------------------------------------
// Un vero trascinamento (gestito sotto) marca `appenaTrascinato = true` per
// far ignorare al click sintetico generato dal browser al rilascio del dito,
// che altrimenti applicherebbe due volte lo stesso cambio (o uno sbagliato).
//
// NOTA: dopo un trascinamento con movimento reale, molti browser mobile NON
// generano affatto il click sintetico finale (un gesto con spostamento viene
// trattato come pan, non come tap). Se contassimo solo su quel click per
// resettare il flag, `appenaTrascinato` resterebbe bloccato a `true` e
// "mangerebbe" il tap successivo sull'altra opzione senza applicarlo. Il
// timeout qui sotto fa scadere il flag da solo, indipendentemente dal fatto
// che il click arrivi.
let appenaTrascinato = false;
let timerResetTrascinamento = null;

function marcaAppenaTrascinato() {
  appenaTrascinato = true;
  clearTimeout(timerResetTrascinamento);
  // Tempo più che sufficiente per lasciar passare l'eventuale click sintetico
  // del browser, ma abbastanza breve da non "rubare" un tap successivo genuino.
  timerResetTrascinamento = setTimeout(() => {
    appenaTrascinato = false;
  }, 400);
}

toggleModalita.addEventListener('click', (e) => {
  if (appenaTrascinato) {
    appenaTrascinato = false;
    clearTimeout(timerResetTrascinamento);
    return;
  }
  const btn = e.target.closest('.toggle-opzione');
  if (!btn) return;
  applicaTipo(btn.dataset.tipo);
});

// ---- Trascinamento del pallino -----------------------------------------------
// Oltre al tap, il pallino può essere trascinato da un lato all'altro: segue
// il dito/il mouse in tempo reale (senza transition, per non introdurre
// ritardo) e allo scioglimento del gesto scatta verso l'opzione più vicina,
// riattivando la transition per un piccolo "snap" animato.
const SOGLIA_TRASCINAMENTO = 6; // px di movimento minimo prima di considerarlo un vero trascinamento
let trascinamento = null;

toggleModalita.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return; // solo tasto sinistro
  trascinamento = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startTraslazione: tipoAttivo === 'doppio' ? indicatoreToggle.getBoundingClientRect().width : 0,
    maxTraslazione: indicatoreToggle.getBoundingClientRect().width,
    attivo: false, // diventa true solo superata la soglia: fino ad allora potrebbe essere un semplice tap
    ultimaTraslazione: 0,
  };
});

toggleModalita.addEventListener('pointermove', (e) => {
  if (!trascinamento || e.pointerId !== trascinamento.pointerId) return;
  const delta = e.clientX - trascinamento.startX;

  if (!trascinamento.attivo) {
    if (Math.abs(delta) < SOGLIA_TRASCINAMENTO) return;
    trascinamento.attivo = true;
    toggleModalita.setPointerCapture(trascinamento.pointerId);
    indicatoreToggle.style.transition = 'none';
  }

  const nuovaTraslazione = Math.min(
    Math.max(trascinamento.startTraslazione + delta, 0),
    trascinamento.maxTraslazione
  );
  trascinamento.ultimaTraslazione = nuovaTraslazione;
  indicatoreToggle.style.transform = `translateX(${nuovaTraslazione}px)`;

  // Anteprima in tempo reale di quale opzione verrebbe selezionata rilasciando ora
  const anteprimaTipo = nuovaTraslazione > trascinamento.maxTraslazione / 2 ? 'doppio' : 'torneo';
  document.querySelectorAll('.toggle-opzione').forEach((btn) => {
    btn.classList.toggle('attivo', btn.dataset.tipo === anteprimaTipo);
  });
});

function terminaTrascinamento(e) {
  if (!trascinamento || (e && e.pointerId !== trascinamento.pointerId)) return;

  if (trascinamento.attivo) {
    toggleModalita.releasePointerCapture(trascinamento.pointerId);
    indicatoreToggle.style.transition = ''; // riabilita la transition per lo "snap" finale
    indicatoreToggle.style.transform = ''; // la classe 'a-destra' (impostata da applicaTipo) prende il controllo
    const tipoFinale =
      trascinamento.ultimaTraslazione > trascinamento.maxTraslazione / 2 ? 'doppio' : 'torneo';
    marcaAppenaTrascinato(); // ignora l'eventuale click sintetico che seguirà, e si auto-resetta comunque
    applicaTipo(tipoFinale);
  }
  trascinamento = null;
}

toggleModalita.addEventListener('pointerup', terminaTrascinamento);
toggleModalita.addEventListener('pointercancel', terminaTrascinamento);

async function caricaStorico() {
  const contenitore = document.getElementById('lista-storico');
  contenitore.innerHTML = '<div class="spinner">Caricamento…</div>';
  try {
    const tornei = await Api.getTorneiConclusi(tipoAttivo);
    if (tornei.length === 0) {
      contenitore.innerHTML = `<div class="vuoto">${TESTI_TIPO[tipoAttivo].vuoto}</div>`;
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

// Applicazione iniziale del tipo salvato: se è 'doppio', la classe 'a-destra'
// aggiunta da applicaTipo() farebbe scivolare visibilmente l'indicatore da
// sinistra (posizione di default) a destra, dato che ha una transition CSS.
// Al caricamento della pagina non deve esserci alcuna animazione: la
// disabilitiamo un istante, applichiamo il tipo, forziamo un reflow e solo
// dopo la riattiviamo, così le interazioni successive dell'utente restano animate.
const tipoIniziale = leggiTipoSalvato();
indicatoreToggle.style.transition = 'none';
applicaTipo(tipoIniziale);
indicatoreToggle.getBoundingClientRect(); // forza il reflow prima di riabilitare la transition
indicatoreToggle.style.transition = '';
