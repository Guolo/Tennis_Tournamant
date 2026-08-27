// ============================================================
// create.js - form dinamico per creare un nuovo torneo
// ============================================================

const listaGiocatori = document.getElementById('lista-giocatori');
let contatoreGiocatori = 0;

function aggiungiRigaGiocatore(valore = '') {
  contatoreGiocatori++;
  const riga = document.createElement('div');
  riga.className = 'riga-giocatore';
  riga.innerHTML = `
    <input type="text" placeholder="Giocatore ${contatoreGiocatori}" value="${valore}" />
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
    if (!el.value) el.placeholder = `Giocatore ${i + 1}`;
  });
}

// Parte con 4 slot vuoti, un numero comodo per iniziare
for (let i = 0; i < 4; i++) aggiungiRigaGiocatore();

document.getElementById('btn-aggiungi').addEventListener('click', () => aggiungiRigaGiocatore());

document.getElementById('btn-conferma').addEventListener('click', async () => {
  const errBox = document.getElementById('errore-creazione');
  errBox.innerHTML = '';

  const nome = document.getElementById('nome-torneo').value.trim();
  const formatoSet = Number(document.querySelector('input[name="formato"]:checked').value);
  const nomiGiocatori = Array.from(listaGiocatori.querySelectorAll('input'))
    .map((el) => el.value.trim())
    .filter((v) => v.length > 0);

  if (nomiGiocatori.length < 2) {
    errBox.innerHTML = '<div class="msg-errore">Inserisci almeno 2 giocatori.</div>';
    return;
  }

  const btn = document.getElementById('btn-conferma');
  btn.disabled = true;
  btn.textContent = 'Creazione in corso…';

  try {
    const { seed } = await Api.creaTorneo({
      nome: nome || undefined,
      giocatori: nomiGiocatori,
      formatoSet,
    });
    window.location.href = `/tournament.html?seed=${encodeURIComponent(seed)}&nuovo=1`;
  } catch (err) {
    errBox.innerHTML = `<div class="msg-errore">${err.message}</div>`;
    btn.disabled = false;
    btn.textContent = 'Conferma e genera tabellone';
  }
});
