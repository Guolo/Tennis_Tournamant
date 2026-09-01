-- ============================================================
-- SCHEMA DATABASE - Gestione Tornei di Tennis (Girone all'italiana)
-- ============================================================

-- Tabella principale: un torneo = una sessione identificata da un "seed"
-- alfanumerico univoco, usato anche come codice di recupero da altri device.
CREATE TABLE IF NOT EXISTS Tornei (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    seed                TEXT UNIQUE NOT NULL,          -- codice di recupero (es. "X7K9-P2QZ")
    nome                TEXT NOT NULL,
    tipo                TEXT NOT NULL DEFAULT 'torneo' CHECK (tipo IN ('torneo', 'doppio')), -- girone completo o singolo match di doppio
    formato_set         INTEGER NOT NULL CHECK (formato_set IN (3, 5)), -- al meglio dei 3 o 5 set
    stato               TEXT NOT NULL DEFAULT 'in_corso' CHECK (stato IN ('in_corso', 'concluso')),
    numero_giocatori    INTEGER NOT NULL,
    data_creazione      TEXT NOT NULL DEFAULT (datetime('now')),
    data_conclusione    TEXT,
    vincitore_finale_id INTEGER,                       -- primo in classifica al termine del torneo
    FOREIGN KEY (vincitore_finale_id) REFERENCES Giocatori(id)
);

-- Giocatori iscritti a un torneo.
CREATE TABLE IF NOT EXISTS Giocatori (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    torneo_id   INTEGER NOT NULL,
    nome        TEXT NOT NULL,
    FOREIGN KEY (torneo_id) REFERENCES Tornei(id) ON DELETE CASCADE
);

-- Match del girone all'italiana: ogni giocatore incontra tutti gli altri
-- esattamente una volta. "round" rappresenta la "giornata" di calendario
-- (calcolata con il metodo del cerchio, per bilanciare gli incontri),
-- "posizione" l'ordine del match all'interno della giornata.
CREATE TABLE IF NOT EXISTS Match (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    torneo_id           INTEGER NOT NULL,
    round               INTEGER NOT NULL, -- giornata di calendario
    posizione           INTEGER NOT NULL,
    giocatore_a_id      INTEGER NOT NULL,
    giocatore_b_id      INTEGER NOT NULL,
    vincitore_id        INTEGER,
    stato               TEXT NOT NULL DEFAULT 'pronto'
                         CHECK (stato IN ('pronto', 'concluso')),
    saltato             INTEGER NOT NULL DEFAULT 0, -- 1 = posticipato con "Salta Match"
    FOREIGN KEY (torneo_id) REFERENCES Tornei(id) ON DELETE CASCADE,
    FOREIGN KEY (giocatore_a_id) REFERENCES Giocatori(id),
    FOREIGN KEY (giocatore_b_id) REFERENCES Giocatori(id),
    FOREIGN KEY (vincitore_id) REFERENCES Giocatori(id)
);

-- Set giocati all'interno di un match. Ogni riga = un set assegnato
-- con un tap rapido al Giocatore A o B. E' la base della classifica
-- finale, ordinata per numero totale di set vinti.
CREATE TABLE IF NOT EXISTS SetPartita (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id      INTEGER NOT NULL,
    numero_set    INTEGER NOT NULL,
    vincitore_id  INTEGER NOT NULL,
    FOREIGN KEY (match_id) REFERENCES Match(id) ON DELETE CASCADE,
    FOREIGN KEY (vincitore_id) REFERENCES Giocatori(id)
);

CREATE INDEX IF NOT EXISTS idx_giocatori_torneo ON Giocatori(torneo_id);
CREATE INDEX IF NOT EXISTS idx_match_torneo ON Match(torneo_id);
CREATE INDEX IF NOT EXISTS idx_set_match ON SetPartita(match_id);
CREATE INDEX IF NOT EXISTS idx_tornei_seed ON Tornei(seed);
-- Nota: l'indice su (tipo, stato) viene creato da database.js dopo l'eventuale
-- migrazione, perché su un database creato con uno schema precedente la
-- colonna 'tipo' potrebbe non esistere ancora al momento in cui questo file
-- viene eseguito.
