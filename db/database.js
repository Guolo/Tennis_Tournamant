// ============================================================
// database.js
// Connessione SQLite + logica "core" del torneo a girone
// all'italiana: creazione, generazione calendario (tutti contro
// tutti), registrazione set, salta match, calcolo classifica,
// conclusione torneo.
// ============================================================

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { customAlphabet } = require('nanoid');

// Il file del database vive in una sottocartella dedicata (db/data),
// separata dal codice sorgente: così il volume Docker persistente può
// montare SOLO questa cartella, senza rischiare di "congelare" anche
// database.js/schema.sql a una versione vecchia ad ogni rebuild.
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'tornei.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Inizializza lo schema se non esiste ancora
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// Migrazione leggera: i database creati con una versione dello schema
// precedente all'introduzione della modalità "doppio" non hanno ancora la
// colonna 'tipo'. La aggiungiamo qui se manca, così i tornei già esistenti
// restano tutti classificati come 'torneo' (comportamento invariato).
const colonneTornei = db.prepare('PRAGMA table_info(Tornei)').all();
if (!colonneTornei.some((c) => c.name === 'tipo')) {
  db.exec("ALTER TABLE Tornei ADD COLUMN tipo TEXT NOT NULL DEFAULT 'torneo'");
}
db.exec('CREATE INDEX IF NOT EXISTS idx_tornei_tipo_stato ON Tornei(tipo, stato)');

// Alfabeto senza caratteri ambigui (0/O, 1/I/l) per un codice facile da
// leggere e ridigitare a bordo campo.
const generaSeed = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

// ------------------------------------------------------------
// Utility: mischia un array (Fisher-Yates)
// ------------------------------------------------------------
function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Numero di set necessari per vincere un match, dato il formato (3 o 5)
function setNecessariPerVincere(formatoSet) {
  return formatoSet === 5 ? 3 : 2;
}

// ------------------------------------------------------------
// Genera il calendario di un girone all'italiana con il
// "metodo del cerchio": ogni giocatore incontra tutti gli altri
// esattamente una volta, distribuiti su più giornate bilanciate.
// Se il numero di giocatori è dispari si usa uno slot "riposo"
// (null) che semplicemente non genera nessun match quella giornata.
// Ritorna: array di giornate, ognuna un array di coppie [idA, idB].
// ------------------------------------------------------------
function generaCalendarioGironeItaliano(giocatoriIds) {
  let elenco = shuffle(giocatoriIds);
  if (elenco.length % 2 !== 0) elenco.push(null); // bye/riposo

  const n = elenco.length;
  const numeroGiornate = n - 1;
  const meta = n / 2;
  const giornate = [];

  // arr[0] resta fisso, il resto ruota di una posizione ad ogni giornata
  let arr = elenco.slice();

  for (let g = 0; g < numeroGiornate; g++) {
    const coppie = [];
    for (let i = 0; i < meta; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== null && b !== null) coppie.push([a, b]);
    }
    giornate.push(coppie);

    // Ruota tutti gli elementi tranne il primo
    const fisso = arr[0];
    const resto = arr.slice(1);
    resto.unshift(resto.pop());
    arr = [fisso, ...resto];
  }

  return giornate;
}

// ------------------------------------------------------------
// Creazione di un nuovo torneo + generazione automatica del
// calendario a girone all'italiana (round robin).
// ------------------------------------------------------------
function creaTorneo({ nome, giocatori, formatoSet, tipo }) {
  const tipoNormalizzato = tipo === 'doppio' ? 'doppio' : 'torneo';

  if (!Array.isArray(giocatori)) {
    throw new Error('Elenco giocatori non valido.');
  }
  if (tipoNormalizzato === 'doppio') {
    // Un match di doppio è una sfida singola tra due coppie: esattamente
    // 2 "giocatori" (in realtà i nomi delle due coppie, es. "Rossi/Bianchi").
    if (giocatori.length !== 2) {
      throw new Error('Un match di doppio richiede esattamente 2 coppie.');
    }
  } else if (giocatori.length < 2) {
    throw new Error('Servono almeno 2 giocatori per creare un torneo.');
  }
  if (![3, 5].includes(Number(formatoSet))) {
    throw new Error('Formato set non valido (deve essere 3 o 5).');
  }

  // Genera un seed univoco (riprova in caso di collisione, molto improbabile)
  let seed;
  do {
    seed = generaSeed();
  } while (db.prepare('SELECT id FROM Tornei WHERE seed = ?').get(seed));

  const nomeDefault =
    tipoNormalizzato === 'doppio'
      ? `${giocatori[0].trim()} vs ${giocatori[1].trim()}`
      : `Torneo ${seed}`;

  const transazione = db.transaction(() => {
    const infoTorneo = db
      .prepare(
        `INSERT INTO Tornei (seed, nome, tipo, formato_set, numero_giocatori)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(seed, nome || nomeDefault, tipoNormalizzato, Number(formatoSet), giocatori.length);
    const torneoId = infoTorneo.lastInsertRowid;

    // Inserisce i giocatori
    const insGiocatore = db.prepare(
      'INSERT INTO Giocatori (torneo_id, nome) VALUES (?, ?)'
    );
    const giocatoriIds = giocatori.map((nomeGiocatore) => {
      const r = insGiocatore.run(torneoId, nomeGiocatore.trim());
      return r.lastInsertRowid;
    });

    // Genera il calendario "tutti contro tutti"
    const giornate = generaCalendarioGironeItaliano(giocatoriIds);

    const insMatch = db.prepare(
      `INSERT INTO Match (torneo_id, round, posizione, giocatore_a_id, giocatore_b_id, stato)
       VALUES (?, ?, ?, ?, ?, 'pronto')`
    );

    giornate.forEach((coppie, indiceGiornata) => {
      coppie.forEach(([idA, idB], posizione) => {
        insMatch.run(torneoId, indiceGiornata + 1, posizione, idA, idB);
      });
    });

    return seed;
  });

  return transazione();
}

// ------------------------------------------------------------
// Segna un match come concluso con un vincitore. Nel girone
// all'italiana non c'è propagazione: ogni match è indipendente.
// ------------------------------------------------------------
function concludiMatch(matchId, vincitoreId) {
  db.prepare(
    "UPDATE Match SET vincitore_id = ?, stato = 'concluso', saltato = 0 WHERE id = ?"
  ).run(vincitoreId, matchId);
}

// ------------------------------------------------------------
// Ricalcola l'esito di un match "rigiocando" virtualmente i set
// nel loro ordine cronologico (numero_set), fermandosi non appena
// un giocatore raggiunge i set necessari per vincere. Questo serve
// perché una modifica al vincitore di un set passato può anticipare
// il momento in cui il match si sarebbe dovuto concludere: eventuali
// set registrati DOPO quel punto non sarebbero mai dovuti esistere
// (es. modificando il 2° set di un "al meglio dei 3" in modo che
// decida già la partita, il 3° set giocato per errore va rimosso,
// altrimenti continuerebbe a contare in classifica).
// Se invece nessuno raggiunge i set necessari con i set esistenti,
// il match torna/resta "pronto" (nessun set viene eliminato in
// questo caso: sono tutti legittimi, semplicemente non bastano
// ancora a decidere il match).
// ------------------------------------------------------------
function ricalcolaEsitoMatch(matchId, giocatoreAId, giocatoreBId, necessari) {
  const setOrdinati = db
    .prepare('SELECT * FROM SetPartita WHERE match_id = ? ORDER BY numero_set')
    .all(matchId);

  let vintiA = 0;
  let vintiB = 0;
  let vincitore = null;
  let numeroSetConclusivo = null;

  for (const s of setOrdinati) {
    if (s.vincitore_id === giocatoreAId) vintiA++;
    else vintiB++;

    if (vintiA >= necessari) {
      vincitore = giocatoreAId;
      numeroSetConclusivo = s.numero_set;
      break;
    }
    if (vintiB >= necessari) {
      vincitore = giocatoreBId;
      numeroSetConclusivo = s.numero_set;
      break;
    }
  }

  if (vincitore) {
    // Rimuove eventuali set giocati dopo la conclusione: non
    // sarebbero mai dovuti esistere.
    db.prepare('DELETE FROM SetPartita WHERE match_id = ? AND numero_set > ?').run(
      matchId,
      numeroSetConclusivo
    );
    concludiMatch(matchId, vincitore);
  } else {
    db.prepare(
      "UPDATE Match SET vincitore_id = NULL, stato = 'pronto', saltato = 0 WHERE id = ?"
    ).run(matchId);
  }
}

// ------------------------------------------------------------
// Registra il set vinto da un giocatore (A o B) in un match.
// Se il numero di set necessari viene raggiunto, il match viene
// concluso automaticamente.
// ------------------------------------------------------------
function registraSet(seed, matchId, lato) {
  const torneo = getTorneoBySeed(seed);
  if (!torneo) throw new Error('Torneo non trovato.');
  if (torneo.stato === 'concluso') throw new Error('Il torneo è concluso: sola lettura.');

  const match = db
    .prepare('SELECT * FROM Match WHERE id = ? AND torneo_id = ?')
    .get(matchId, torneo.id);
  if (!match) throw new Error('Match non trovato.');
  if (match.stato !== 'pronto') throw new Error('Il match non è pronto per essere giocato.');
  if (!['A', 'B'].includes(lato)) throw new Error('Lato non valido.');

  const vincitoreSetId = lato === 'A' ? match.giocatore_a_id : match.giocatore_b_id;

  const transazione = db.transaction(() => {
    const setEsistenti = db
      .prepare('SELECT COUNT(*) AS n FROM SetPartita WHERE match_id = ?')
      .get(matchId).n;
    db.prepare(
      'INSERT INTO SetPartita (match_id, numero_set, vincitore_id) VALUES (?, ?, ?)'
    ).run(matchId, setEsistenti + 1, vincitoreSetId);

    const necessari = setNecessariPerVincere(torneo.formato_set);
    ricalcolaEsitoMatch(matchId, match.giocatore_a_id, match.giocatore_b_id, necessari);
  });
  transazione();

  return getTorneoCompleto(seed);
}

// ------------------------------------------------------------
// Annulla l'ultimo set registrato per un match (correzione errori
// di tap). Se il match era già concluso grazie a quel set, lo
// riapre semplicemente (nessuna propagazione da disfare, essendo
// un girone all'italiana).
// ------------------------------------------------------------
function annullaUltimoSet(seed, matchId) {
  const torneo = getTorneoBySeed(seed);
  if (!torneo) throw new Error('Torneo non trovato.');
  if (torneo.stato === 'concluso') throw new Error('Il torneo è concluso: sola lettura.');

  const match = db.prepare('SELECT * FROM Match WHERE id = ?').get(matchId);
  if (!match) throw new Error('Match non trovato.');

  const ultimoSet = db
    .prepare('SELECT * FROM SetPartita WHERE match_id = ? ORDER BY numero_set DESC LIMIT 1')
    .get(matchId);
  if (!ultimoSet) throw new Error('Nessun set da annullare.');

  const transazione = db.transaction(() => {
    db.prepare('DELETE FROM SetPartita WHERE id = ?').run(ultimoSet.id);
    if (match.stato === 'concluso') {
      db.prepare("UPDATE Match SET vincitore_id = NULL, stato = 'pronto' WHERE id = ?").run(
        matchId
      );
    }
  });
  transazione();

  return getTorneoCompleto(seed);
}

// ------------------------------------------------------------
// Modifica il vincitore di un set GIA' registrato (es. per
// correggere un errore di tap notato in un secondo momento,
// anche su un match già concluso). Consentito solo finché il
// torneo è in corso. Dopo la modifica, il match viene
// ricalcolato "rigiocando" i set in ordine cronologico
// (ricalcolaEsitoMatch):
// - se un giocatore raggiunge i set necessari, il match
//   resta/diventa concluso con quel vincitore, ed eventuali set
//   successivi giocati per errore (perché il match sarebbe già
//   dovuto finire prima) vengono eliminati automaticamente;
// - altrimenti il match torna "pronto" (riapre), utile ad es.
//   se la modifica toglie la vittoria a chi era stato dato
//   vincitore.
// ------------------------------------------------------------
function modificaSet(seed, matchId, setId, lato) {
  const torneo = getTorneoBySeed(seed);
  if (!torneo) throw new Error('Torneo non trovato.');
  if (torneo.stato === 'concluso') throw new Error('Il torneo è concluso: sola lettura.');
  if (!['A', 'B'].includes(lato)) throw new Error('Lato non valido.');

  const match = db
    .prepare('SELECT * FROM Match WHERE id = ? AND torneo_id = ?')
    .get(matchId, torneo.id);
  if (!match) throw new Error('Match non trovato.');

  const setRiga = db
    .prepare('SELECT * FROM SetPartita WHERE id = ? AND match_id = ?')
    .get(setId, matchId);
  if (!setRiga) throw new Error('Set non trovato.');

  const nuovoVincitoreSet = lato === 'A' ? match.giocatore_a_id : match.giocatore_b_id;

  const transazione = db.transaction(() => {
    db.prepare('UPDATE SetPartita SET vincitore_id = ? WHERE id = ?').run(
      nuovoVincitoreSet,
      setId
    );

    const necessari = setNecessariPerVincere(torneo.formato_set);
    ricalcolaEsitoMatch(matchId, match.giocatore_a_id, match.giocatore_b_id, necessari);
  });
  transazione();

  return getTorneoCompleto(seed);
}

// ------------------------------------------------------------
// "Salta Match": marca il match come posticipato in modo che la
// UI proponga il prossimo match disponibile. Il match resta
// comunque giocabile in seguito.
// ------------------------------------------------------------
function saltaMatch(seed, matchId, saltato) {
  const torneo = getTorneoBySeed(seed);
  if (!torneo) throw new Error('Torneo non trovato.');
  if (torneo.stato === 'concluso') throw new Error('Il torneo è concluso: sola lettura.');

  db.prepare('UPDATE Match SET saltato = ? WHERE id = ? AND torneo_id = ?').run(
    saltato ? 1 : 0,
    matchId,
    torneo.id
  );
  return getTorneoCompleto(seed);
}

// ------------------------------------------------------------
// Restituisce l'id del vincitore dello scontro diretto tra due
// giocatori all'interno dello stesso torneo (o null se il match
// tra i due non esiste o non è ancora concluso). Usato come
// spareggio in classifica in caso di parità totale tra due
// giocatori.
// ------------------------------------------------------------
function getVincitoreScontroDiretto(torneoId, idGiocatoreA, idGiocatoreB) {
  const m = db
    .prepare(
      `SELECT vincitore_id FROM Match
       WHERE torneo_id = ? AND stato = 'concluso'
         AND ((giocatore_a_id = ? AND giocatore_b_id = ?)
           OR (giocatore_a_id = ? AND giocatore_b_id = ?))`
    )
    .get(torneoId, idGiocatoreA, idGiocatoreB, idGiocatoreB, idGiocatoreA);
  return m ? m.vincitore_id : null;
}

// ------------------------------------------------------------
// Calcola la classifica del girone: per ogni giocatore conta
// partite giocate/vinte e soprattutto set vinti/persi, che è il
// criterio principale di ordinamento richiesto. A parità di set
// vinti si usa come spareggio la differenza set, poi le partite
// vinte, poi (a parità totale tra due giocatori) lo scontro
// diretto, e infine il nome come ultimissima ancora di salvezza.
// ------------------------------------------------------------
function calcolaClassifica(torneoId) {
  const giocatori = db
    .prepare('SELECT * FROM Giocatori WHERE torneo_id = ?')
    .all(torneoId);

  const righe = giocatori.map((g) => {
    const partiteGiocate = db
      .prepare(
        `SELECT COUNT(*) AS n FROM Match
         WHERE torneo_id = ? AND stato = 'concluso' AND (giocatore_a_id = ? OR giocatore_b_id = ?)`
      )
      .get(torneoId, g.id, g.id).n;

    const partiteVinte = db
      .prepare(
        `SELECT COUNT(*) AS n FROM Match
         WHERE torneo_id = ? AND stato = 'concluso' AND vincitore_id = ?`
      )
      .get(torneoId, g.id).n;

    const setVinti = db
      .prepare(
        `SELECT COUNT(*) AS n FROM SetPartita sp
         JOIN Match m ON m.id = sp.match_id
         WHERE m.torneo_id = ? AND sp.vincitore_id = ?`
      )
      .get(torneoId, g.id).n;

    const setPersi = db
      .prepare(
        `SELECT COUNT(*) AS n FROM SetPartita sp
         JOIN Match m ON m.id = sp.match_id
         WHERE m.torneo_id = ? AND sp.vincitore_id != ?
           AND (m.giocatore_a_id = ? OR m.giocatore_b_id = ?)`
      )
      .get(torneoId, g.id, g.id, g.id).n;

    return {
      giocatore_id: g.id,
      nome: g.nome,
      partite_giocate: partiteGiocate,
      partite_vinte: partiteVinte,
      set_vinti: setVinti,
      set_persi: setPersi,
      differenza_set: setVinti - setPersi,
    };
  });

  righe.sort((a, b) => {
    if (b.set_vinti !== a.set_vinti) return b.set_vinti - a.set_vinti;
    if (b.differenza_set !== a.differenza_set) return b.differenza_set - a.differenza_set;
    if (b.partite_vinte !== a.partite_vinte) return b.partite_vinte - a.partite_vinte;

    const vincitoreDiretto = getVincitoreScontroDiretto(
      torneoId,
      a.giocatore_id,
      b.giocatore_id
    );
    if (vincitoreDiretto === a.giocatore_id) return -1;
    if (vincitoreDiretto === b.giocatore_id) return 1;

    return a.nome.localeCompare(b.nome);
  });

  return righe.map((r, i) => ({ posizione: i + 1, ...r }));
}

// ------------------------------------------------------------
// Termina definitivamente il torneo: calcola la classifica finale,
// registra il primo classificato come vincitore, e blocca ogni
// ulteriore modifica (il seed diventa di sola lettura).
// ------------------------------------------------------------
function terminaTorneo(seed) {
  const torneo = getTorneoBySeed(seed);
  if (!torneo) throw new Error('Torneo non trovato.');
  if (torneo.stato === 'concluso') return getTorneoCompleto(seed);

  const classifica = calcolaClassifica(torneo.id);
  const primoClassificato = classifica.length > 0 ? classifica[0].giocatore_id : null;

  db.prepare(
    `UPDATE Tornei SET stato = 'concluso', data_conclusione = datetime('now'),
     vincitore_finale_id = ? WHERE id = ?`
  ).run(primoClassificato, torneo.id);

  return getTorneoCompleto(seed);
}

// ------------------------------------------------------------
// Elimina i tornei "abbandonati": mai terminati (stato 'in_corso')
// e creati da più di N giorni (default 14). I tornei conclusi non
// vengono mai toccati e restano nello storico per sempre. Grazie a
// ON DELETE CASCADE sulle foreign key, cancellando la riga in
// Tornei vengono rimossi automaticamente anche Giocatori, Match e
// SetPartita collegati.
// ------------------------------------------------------------
function pulisciTorneiAbbandonati(giorni = 14) {
  const risultato = db
    .prepare(
      `DELETE FROM Tornei
       WHERE stato = 'in_corso'
         AND data_creazione <= datetime('now', ?)`
    )
    .run(`-${giorni} days`);

  if (risultato.changes > 0) {
    console.log(
      `Pulizia automatica: eliminati ${risultato.changes} torneo/i mai terminato/i, più vecchio/i di ${giorni} giorni.`
    );
  }
  return risultato.changes;
}

// ------------------------------------------------------------
// Query di lettura
// ------------------------------------------------------------
function getTorneoBySeed(seed) {
  return db.prepare('SELECT * FROM Tornei WHERE seed = ?').get((seed || '').toUpperCase());
}

function getTorneiConclusi(tipo) {
  const tipoNormalizzato = tipo === 'doppio' ? 'doppio' : 'torneo';
  return db
    .prepare(
      `SELECT t.id, t.seed, t.nome, t.data_creazione, t.data_conclusione,
              g.nome AS vincitore_nome
       FROM Tornei t
       LEFT JOIN Giocatori g ON g.id = t.vincitore_finale_id
       WHERE t.stato = 'concluso' AND t.tipo = ?
       ORDER BY t.data_conclusione DESC`
    )
    .all(tipoNormalizzato);
}

// Restituisce il torneo con giocatori, calendario/match, set e
// classifica aggiornata, pronto per il frontend.
function getTorneoCompleto(seed) {
  const torneo = getTorneoBySeed(seed);
  if (!torneo) return null;

  const giocatori = db
    .prepare('SELECT * FROM Giocatori WHERE torneo_id = ? ORDER BY id')
    .all(torneo.id);

  const match = db
    .prepare('SELECT * FROM Match WHERE torneo_id = ? ORDER BY round, posizione')
    .all(torneo.id);

  const setStmt = db.prepare('SELECT * FROM SetPartita WHERE match_id = ? ORDER BY numero_set');
  const matchConSet = match.map((m) => ({
    ...m,
    set: setStmt.all(m.id),
  }));

  const classifica = calcolaClassifica(torneo.id);
  const vincitore = giocatori.find((g) => g.id === torneo.vincitore_finale_id) || null;

  return {
    torneo: { ...torneo, vincitore_nome: vincitore ? vincitore.nome : null },
    giocatori,
    match: matchConSet,
    classifica,
  };
}

module.exports = {
  db,
  creaTorneo,
  registraSet,
  annullaUltimoSet,
  modificaSet,
  saltaMatch,
  terminaTorneo,
  getTorneoBySeed,
  getTorneiConclusi,
  getTorneoCompleto,
  calcolaClassifica,
  setNecessariPerVincere,
  pulisciTorneiAbbandonati,
};
