#!/usr/bin/env bash
# Installerer FamilieHub kamera-bro uten å kreve Github-tilgang (repoet er
# privat) – filene lastes i stedet ned fra selve FamilieHub-installasjonen,
# som allerede er offentlig tilgjengelig for familien.
#
# Bruk:
#   curl -fsSL https://<din-familiehub>.onrender.com/camera-bridge/install.sh | bash
set -e

FAMILIEHUB_URL="${FAMILIEHUB_URL:-https://familiehub-1.onrender.com}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/familiehub-camera-bridge}"

echo "🏠 FamilieHub kamera-bro – installasjon"
echo "   Laster ned fra: $FAMILIEHUB_URL"
echo ""

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 || ! command -v ffmpeg >/dev/null 2>&1; then
  echo "📦 Installerer node/npm/ffmpeg …"
  sudo apt update
  sudo apt install -y nodejs npm ffmpeg
fi

echo "⬇️  Laster ned bro-filer …"
mkdir -p "$INSTALL_DIR/src"
curl -fsSL "$FAMILIEHUB_URL/camera-bridge/package.json" -o "$INSTALL_DIR/package.json"
curl -fsSL "$FAMILIEHUB_URL/camera-bridge/package-lock.json" -o "$INSTALL_DIR/package-lock.json"
curl -fsSL "$FAMILIEHUB_URL/camera-bridge/src/index.js" -o "$INSTALL_DIR/src/index.js"
curl -fsSL "$FAMILIEHUB_URL/camera-bridge/src/discovery.js" -o "$INSTALL_DIR/src/discovery.js"
curl -fsSL "$FAMILIEHUB_URL/camera-bridge/src/streaming.js" -o "$INSTALL_DIR/src/streaming.js"

cd "$INSTALL_DIR"
echo "📦 Installerer avhengigheter …"
npm install --omit=dev --no-fund --no-audit

echo ""
echo "Hent bro-nøkkel i FamilieHub: Innstillinger → Enheter → \"Generer bro-nøkkel\""
read -rp "BRIDGE_ID: " BRIDGE_ID
read -rp "BRIDGE_API_KEY: " BRIDGE_API_KEY
echo ""
echo "Fra Tapo-appen: kameraet → Enhetsinnstillinger → Avansert → Tredjepartskompatibilitet (ONVIF)"
read -rp "TAPO_USERNAME: " TAPO_USERNAME
read -rsp "TAPO_PASSWORD: " TAPO_PASSWORD
echo ""

cat > .env <<EOF
FAMILIEHUB_URL=$FAMILIEHUB_URL
BRIDGE_ID=$BRIDGE_ID
BRIDGE_API_KEY=$BRIDGE_API_KEY
TAPO_USERNAME=$TAPO_USERNAME
TAPO_PASSWORD=$TAPO_PASSWORD
FFMPEG_PATH=ffmpeg
DISCOVERY_INTERVAL_MS=30000
EOF

if command -v systemctl >/dev/null 2>&1; then
  echo ""
  echo "⚙️  Setter opp autostart (systemd) …"
  NPM_PATH="$(command -v npm)"
  sudo tee /etc/systemd/system/familiehub-camera-bridge.service > /dev/null <<SERVICE
[Unit]
Description=FamilieHub kamera-bro
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$NPM_PATH start
Restart=always
RestartSec=5
User=$(whoami)

[Install]
WantedBy=multi-user.target
SERVICE
  sudo systemctl daemon-reload
  sudo systemctl enable --now familiehub-camera-bridge
  echo ""
  echo "✅ Ferdig! Broen kjører i bakgrunnen og starter automatisk ved oppstart."
  echo "   Status:  sudo systemctl status familiehub-camera-bridge"
  echo "   Logger:  journalctl -u familiehub-camera-bridge -f"
else
  echo ""
  echo "✅ Ferdig! Start broen med: cd $INSTALL_DIR && npm start"
fi
