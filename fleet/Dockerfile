# Bygger og kjører FamilieHub Fleet (backend + det bygde dashbord-frontend-
# bygget, servert statisk av backenden). Selvstendig fra hoved-appens
# Dockerfile siden fleet/ er en helt egen, separat deploybar tjeneste
# (tenkt for Google Cloud Run, ikke Render som hoved-appen).
FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 bygges fra kildekode ved npm install og trenger disse.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY fleet/backend/package.json fleet/backend/package.json
COPY fleet/frontend/package.json fleet/frontend/package.json
RUN npm ci --prefix fleet/backend && npm ci --prefix fleet/frontend

COPY fleet/backend fleet/backend
COPY fleet/frontend fleet/frontend
COPY fleet/shared fleet/shared
RUN npm run build --prefix fleet/frontend

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/fleet/backend/package.json fleet/backend/package.json
COPY --from=build /app/fleet/backend/node_modules fleet/backend/node_modules
COPY --from=build /app/fleet/backend/src fleet/backend/src
COPY --from=build /app/fleet/shared fleet/shared
COPY --from=build /app/fleet/frontend/dist fleet/frontend/dist

WORKDIR /app/fleet/backend
# Cloud Run injiserer PORT selv – config.js leser process.env.PORT.
EXPOSE 4100
CMD ["node", "src/index.js"]
