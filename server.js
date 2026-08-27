// ============================================================
// server.js
// API REST per la gestione dei tornei di tennis + serve il
// frontend statico da /public.
// ============================================================

const express = require('express');
const path = require('path');
const {
  creaTorneo,
  registraSet,
  annullaUltimoSet,
  modificaSet,
  saltaMatch,
  terminaTorneo,
  getTorneiConclusi,
  getTorneoCompleto,
  pulisciTorneiAbbandonati,
} = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3333;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Piccolo helper per uniformare la gestione errori
function handler(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(400).json({ errore: err.message || 'Errore imprevisto.' });
    }
  };
}

// ---- Home Page: elenco tornei conclusi -----------------------------------
app.get(
  '/api/tornei/conclusi',
  handler((req, res) => {
    res.json(getTorneiConclusi());
  })
);

// ---- Creazione nuovo torneo -----------------------------------------------
app.post(
  '/api/tornei',
  handler((req, res) => {
    const { nome, giocatori, formatoSet } = req.body;
    const seed = creaTorneo({ nome, giocatori, formatoSet });
    res.status(201).json({ seed });
  })
);

// ---- Recupero torneo (in corso o concluso) tramite seed --------------------
app.get(
  '/api/tornei/:seed',
  handler((req, res) => {
    const dati = getTorneoCompleto(req.params.seed);
    if (!dati) return res.status(404).json({ errore: 'Seed non trovato.' });
    res.json(dati);
  })
);

// ---- Registra un set vinto da 'A' o 'B' in un match -------------------------
app.post(
  '/api/tornei/:seed/match/:matchId/set',
  handler((req, res) => {
    const { lato } = req.body; // 'A' | 'B'
    const dati = registraSet(req.params.seed, Number(req.params.matchId), lato);
    res.json(dati);
  })
);

// ---- Annulla l'ultimo set registrato (correzione errori) -------------------
app.post(
  '/api/tornei/:seed/match/:matchId/annulla-set',
  handler((req, res) => {
    const dati = annullaUltimoSet(req.params.seed, Number(req.params.matchId));
    res.json(dati);
  })
);

// ---- Modifica il vincitore di un set già registrato -------------------------
app.post(
  '/api/tornei/:seed/match/:matchId/set/:setId/modifica',
  handler((req, res) => {
    const { lato } = req.body; // 'A' | 'B'
    const dati = modificaSet(
      req.params.seed,
      Number(req.params.matchId),
      Number(req.params.setId),
      lato
    );
    res.json(dati);
  })
);

// ---- Salta / rimetti in gioco un match --------------------------------------
app.post(
  '/api/tornei/:seed/match/:matchId/salta',
  handler((req, res) => {
    const saltato = req.body.saltato !== false; // default true
    const dati = saltaMatch(req.params.seed, Number(req.params.matchId), saltato);
    res.json(dati);
  })
);

// ---- Termina il torneo (sola lettura da qui in poi) -------------------------
app.post(
  '/api/tornei/:seed/termina',
  handler((req, res) => {
    const dati = terminaTorneo(req.params.seed);
    res.json(dati);
  })
);

// Qualsiasi altra rotta non-API serve l'app (routing lato client semplice)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Pulizia automatica tornei abbandonati ---------------------------------
// I tornei mai terminati (stato 'in_corso') vengono eliminati dopo 14 giorni
// dalla creazione. I tornei conclusi non vengono mai toccati. Gira una volta
// all'avvio e poi periodicamente, così non serve un cron esterno né alcuna
// configurazione aggiuntiva.
const GIORNI_SCADENZA_TORNEI_ABBANDONATI = 14;
const INTERVALLO_PULIZIA_MS = 6 * 60 * 60 * 1000; // ogni 6 ore

pulisciTorneiAbbandonati(GIORNI_SCADENZA_TORNEI_ABBANDONATI);
setInterval(
  () => pulisciTorneiAbbandonati(GIORNI_SCADENZA_TORNEI_ABBANDONATI),
  INTERVALLO_PULIZIA_MS
);

app.listen(PORT, () => {
  console.log(`Tennis Tournament App in ascolto su http://localhost:${PORT}`);
});
