# Bygger og kjører hele FamilieHub (backend + det bygde frontend-bygget,
# servert statisk av backenden – samme mønster som produksjonshostingen på
# Render). Ett image, siden dette er en monolitt (npm workspaces), ikke en
# mikrotjeneste-arkitektur.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 bygges fra kildekode ved npm install og trenger disse.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY backend backend
COPY frontend frontend
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# npm-workspaces hoister avhengigheter til rot-node_modules – kopierer kun
# den (ikke backend/node_modules, som normalt ikke finnes separat i et
# workspace-oppsett uten versjonskonflikter).
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/backend backend
COPY --from=build /app/frontend/package.json frontend/package.json
COPY --from=build /app/frontend/dist frontend/dist

EXPOSE 4000
CMD ["npm", "run", "start"]
