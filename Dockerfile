# ============================================================
# Dockerfile - Tennis Tournament App
# Build multi-stage: uno stage installa le dipendenze (incluso
# il modulo nativo better-sqlite3, che richiede un compilatore),
# lo stage finale è più leggero e gira come utente non-root.
# ============================================================

FROM node:20-alpine AS base
WORKDIR /app

# ---- Stage "deps": installa le dipendenze npm ------------------------------
FROM base AS deps
# python3/make/g++ servono a node-gyp per compilare better-sqlite3
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# ---- Stage finale: immagine di runtime -------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Cartella del database SQLite: creata ed assegnata all'utente non privilegiato
# "node" già presente nell'immagine ufficiale, così il container non gira come root.
# La sottocartella "data" è quella che verrà montata come volume persistente:
# va creata e assegnata QUI, prima del mount, altrimenti il volume verrebbe
# creato da Docker come root e "node" non potrebbe scriverci dentro.
RUN mkdir -p /app/db/data && chown -R node:node /app
USER node

EXPOSE 3333

# Solo db/data va persistito con un volume (vedi docker-compose.yml): è la
# cartella che contiene tornei.db. Il resto di db/ (database.js, schema.sql)
# resta parte dell'immagine e si aggiorna ad ogni rebuild.
VOLUME ["/app/db/data"]

CMD ["node", "server.js"]
