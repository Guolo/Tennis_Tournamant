// ============================================================
// create.js - form dinamico per creare un nuovo torneo (girone
// all'italiana) o un nuovo match di doppio (sfida singola tra
// 2 coppie). La modalità arriva dal parametro ?tipo= in URL,
// impostato dal selettore nella home.
// ============================================================

const parametriUrl = new URLSearchParams(window.location.search);
const tipo = parametriUrl.get('tipo') === 'doppio' ? 'doppio' : 'torneo';

const TESTI_TIPO = {
  torneo: {
    titoloPagina: 'Nuovo Torneo',
    labelNome: 'Nome del torneo',
    placeholderNome: 'Es. Torneo Sociale Estate 2026',
    labelPartecipanti: 'Partecipanti',
    placeholderRiga: (i) => `Giocatore ${i}`,
    erroreMinimo: 'Inserisci almeno 2 giocatori.',
    testoConferma: 'Conferma e genera tabellone',
  },
  doppio: {
    titoloPagina: 'Nuovo Match Doppio',
    labelNome: 'Nome del match (opzionale)',
    placeholderNome: 'Es. Finale amichevole',
    labelPartecipanti: 'Giocatori',
    placeholderGiocatore: ['Giocatore 1', 'Giocatore 2', 'Giocatore 3', 'Giocatore 4'],
    erroreMinimo: 'Inserisci i nomi di tutti e 4 i giocatori.',
    testoConferma: 'Conferma e inizia match',
  },
};

const testi = TESTI_TIPO[tipo];

document.getElementById('titolo-pagina').textContent = testi.titoloPagina;
document.getElementById('label-nome').textContent = testi.labelNome;
document.getElementById('nome-torneo').placeholder = testi.placeholderNome;
document.getElementById('label-partecipanti').textContent = testi.labelPartecipanti;
document.getElementById('btn-conferma').textContent = testi.testoConferma;

const listaGiocatori = document.getElementById('lista-giocatori');
const btnAggiungi = document.getElementById('btn-aggiungi');

function aggiungiRigaGiocatore(valore = '') {
  const numeroPlaceholder = listaGiocatori.children.length + 1;
  const riga = document.createElement('div');
  riga.className = 'riga-giocatore';
  riga.innerHTML = `
    <input type="text" placeholder="${testi.placeholderRiga(numeroPlaceholder)}" value="${valore}" />
    <button type="button" class="rimuovi" title="Rimuovi">✕</button>
  `;
  riga.querySelector('.rimuovi').addEventListener('click', () => {
    riga.remove();
    aggiornaPlaceholder();
  });
  listaGiocatori.appendChild(riga);
}

function aggiornaPlaceholder() {
  const input = listaGiocatori.querySelectorAll('input');
  input.forEach((el, i) => {
    if (!el.value) el.placeholder = testi.placeholderRiga(i + 1);
  });
}

// Un singolo campo nome, senza pulsante di rimozione: usato per il form
// del doppio, che ha sempre esattamente 4 giocatori a slot fissi.
function aggiungiCampoNome(placeholder) {
  const riga = document.createElement('div');
  riga.className = 'riga-giocatore';
  riga.innerHTML = `<input type="text" class="input-giocatore-doppio" placeholder="${placeholder}" />`;
  listaGiocatori.appendChild(riga);
}

if (tipo === 'doppio') {
  // Coppia 1 = giocatore 1 + giocatore 2, Coppia 2 = giocatore 3 + giocatore 4:
  // l'abbinamento è quello scelto dall'utente in base alla posizione in cui
  // inserisce i nomi, non c'è alcun rimescolamento.
  aggiungiCampoNome(testi.placeholderGiocatore[0]);
  aggiungiCampoNome(testi.placeholderGiocatore[1]);
  const vs = document.createElement('div');
  vs.className = 'vs';
  vs.textContent = 'VS';
  listaGiocatori.appendChild(vs);
  aggiungiCampoNome(testi.placeholderGiocatore[2]);
  aggiungiCampoNome(testi.placeholderGiocatore[3]);
  btnAggiungi.style.display = 'none';
} else {
  // Parte con 4 slot vuoti, un numero comodo per iniziare
  for (let i = 0; i < 4; i++) aggiungiRigaGiocatore();
  btnAggiungi.addEventListener('click', () => aggiungiRigaGiocatore());
}

document.getElementById('btn-conferma').addEventListener('click', async () => {
  const errBox = document.getElementById('errore-creazione');
  errBox.innerHTML = '';

  const nome = document.getElementById('nome-torneo').value.trim();
  const formatoSet = Number(document.querySelector('input[name="formato"]:checked').value);

  let nomiGiocatori;

  if (tipo === 'doppio') {
    const nomi = Array.from(listaGiocatori.querySelectorAll('.input-giocatore-doppio')).map((el) =>
      el.value.trim()
    );
    if (nomi.some((v) => v.length === 0)) {
      errBox.innerHTML = `<div class="msg-errore">${testi.erroreMinimo}</div>`;
      return;
    }
    // Le coppie sono fisse in base alla posizione: 1+2 contro 3+4.
    nomiGiocatori = [`${nomi[0]} & ${nomi[1]}`, `${nomi[2]} & ${nomi[3]}`];
  } else {
    nomiGiocatori = Array.from(listaGiocatori.querySelectorAll('input'))
      .map((el) => el.value.trim())
      .filter((v) => v.length > 0);
    if (nomiGiocatori.length < 2) {
      errBox.innerHTML = `<div class="msg-errore">${testi.erroreMinimo}</div>`;
      return;
    }
  }

  const btn = document.getElementById('btn-conferma');
  btn.disabled = true;
  btn.textContent = 'Creazione in corso…';

  try {
    const { seed } = await Api.creaTorneo({
      nome: nome || undefined,
      giocatori: nomiGiocatori,
      formatoSet,
      tipo,
    });
    window.location.href = `/tournament.html?seed=${encodeURIComponent(seed)}&nuovo=1`;
  } catch (err) {
    errBox.innerHTML = `<div class="msg-errore">${err.message}</div>`;
    btn.disabled = false;
    btn.textContent = testi.testoConferma;
  }
});
