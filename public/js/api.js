// ============================================================
// api.js - piccolo wrapper fetch condiviso da tutte le pagine
// ============================================================

const Api = {
  async _richiesta(url, opzioni) {
    const risposta = await fetch(url, opzioni);
    const dati = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      throw new Error(dati.errore || 'Errore di comunicazione con il server.');
    }
    return dati;
  },

  getTorneiConclusi(tipo = 'torneo') {
    return this._richiesta(`/api/tornei/conclusi?tipo=${encodeURIComponent(tipo)}`);
  },

  creaTorneo(payload) {
    return this._richiesta('/api/tornei', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getTorneo(seed) {
    return this._richiesta(`/api/tornei/${encodeURIComponent(seed)}`);
  },

  registraSet(seed, matchId, lato) {
    return this._richiesta(`/api/tornei/${seed}/match/${matchId}/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lato }),
    });
  },

  annullaSet(seed, matchId) {
    return this._richiesta(`/api/tornei/${seed}/match/${matchId}/annulla-set`, {
      method: 'POST',
    });
  },

  modificaSet(seed, matchId, setId, lato) {
    return this._richiesta(`/api/tornei/${seed}/match/${matchId}/set/${setId}/modifica`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lato }),
    });
  },

  saltaMatch(seed, matchId, saltato) {
    return this._richiesta(`/api/tornei/${seed}/match/${matchId}/salta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saltato }),
    });
  },

  terminaTorneo(seed) {
    return this._richiesta(`/api/tornei/${seed}/termina`, { method: 'POST' });
  },
};
