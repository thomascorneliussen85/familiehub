#!/usr/bin/env bash
# Installerer en egen FamilieHub-instans (inkl. Økonomimodulen) på en
# Raspberry Pi (eller annen Linux-maskin) via Docker Compose. Kjøres FRA
# roten av et allerede nedlastet/klonet FamilieHub-repo – i motsetning til
# camera-bridge/install.sh, som laster ned enkeltfiler fra en kjørende
# instans, trenger hoved-appen hele kildekoden for å bygges (se Dockerfile).
#
# Bruk:
#   cd familiehub
#   ./scripts/install-finance-pi.sh
set -e

if [ ! -f "docker-compose.yml" ] || [ ! -f "package.json" ]; then
  echo "❌ Kjør dette skriptet fra roten av FamilieHub-repoet (der docker-compose.yml ligger)."
  exit 1
fi

echo "🏠 FamilieHub – selvhosting-installasjon"
echo ""

if ! command -v docker >/dev/null 2>&1; then
  echo "📦 Installerer Docker …"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$(whoami)"
  echo "⚠️  Docker-gruppen ble lagt til brukeren din – du må logge ut og inn igjen (eller kjøre 'newgrp docker') før docker-kommandoer fungerer uten sudo."
fi

DOCKER_COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker-compose"
fi

if [ -f ".env" ]; then
  echo "ℹ️  .env finnes allerede – hopper over oppsett av miljøvariabler. Slett filen først om du vil starte på nytt."
else
  echo "📝 Setter opp .env …"
  cp .env.example .env

  JWT_SECRET="$(openssl rand -hex 32)"
  FINANCE_KEY="$(openssl rand -hex 32)"
  sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$JWT_SECRET#" .env
  sed -i "s#^FINANCE_ENCRYPTION_KEY=.*#FINANCE_ENCRYPTION_KEY=$FINANCE_KEY#" .env

  echo ""
  read -rp "Familienavn (hovedfamilien på denne installasjonen): " FAMILY_NAME
  read -rp "E-post (for førstegangs innlogging): " ADMIN_EMAIL
  read -rsp "Passord (minst 8 tegn): " ADMIN_PASSWORD
  echo ""
  read -rp "Domene (for HTTPS via Cloudflare Tunnel, f.eks. familiehub.eksempel.no): " DOMAIN

  sed -i "s#^FAMILY_NAME=.*#FAMILY_NAME=$FAMILY_NAME#" .env
  sed -i "s#^INITIAL_ADMIN_EMAIL=.*#INITIAL_ADMIN_EMAIL=$ADMIN_EMAIL#" .env
  sed -i "s#^INITIAL_ADMIN_PASSWORD=.*#INITIAL_ADMIN_PASSWORD=$ADMIN_PASSWORD#" .env
  sed -i "s#^INITIAL_ADMIN_FAMILY_NAME=.*#INITIAL_ADMIN_FAMILY_NAME=$FAMILY_NAME#" .env
  sed -i "s#^CORS_ORIGIN=.*#CORS_ORIGIN=https://$DOMAIN#" .env
fi

if [ ! -f "cloudflared/config.yml" ]; then
  echo ""
  echo "⚠️  cloudflared/config.yml mangler ennå. Cloudflare Tunnel må settes opp manuelt "
  echo "   ÉN gang (krever innlogging i nettleseren), se cloudflared/config.yml.example og README.md."
  echo "   Uten den vil ikke appen være tilgjengelig fra utsiden med HTTPS – lokal tilgang på "
  echo "   http://<pi-ens-lokale-ip>:4000 fungerer likevel."
fi

echo ""
echo "🚀 Starter FamilieHub …"
$DOCKER_COMPOSE up -d --build

echo ""
echo "✅ Ferdig! FamilieHub kjører nå."
echo "   Status:  $DOCKER_COMPOSE ps"
echo "   Logger:  $DOCKER_COMPOSE logs -f app"
echo "   Lokal tilgang: http://$(hostname -I 2>/dev/null | awk '{print $1}'):4000"
