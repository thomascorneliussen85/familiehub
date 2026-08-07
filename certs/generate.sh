#!/usr/bin/env bash
# Genererer/fornyer det lokale https-sertifikatet for FamilieHub sin
# utviklingsserver (Vite), slik at talegjenkjenning (Web Speech API) fungerer
# når appen åpnes fra et nettbrett via en vanlig IP-adresse på hjemmenettverket.
#
# Bruk: certs/generate.sh <lokal-IP-adresse>
# Finn IP-adressen på Windows med:  ipconfig   (se "IPv4-adresse" under Wi-Fi)
set -e
LAN_IP="${1:?Bruk: certs/generate.sh <lokal-IP-adresse>, f.eks. certs/generate.sh 10.0.0.3}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cat > "$DIR/san.cnf" << EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = familiehub.local

[v3_req]
keyUsage = keyEncipherment, dataEncipherment, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = familiehub.local
IP.1 = 127.0.0.1
IP.2 = $LAN_IP
EOF

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$DIR/key.pem" -out "$DIR/cert.pem" \
  -days 3650 -config "$DIR/san.cnf" -extensions v3_req

echo "✅ Sertifikat generert for $LAN_IP (gyldig i 10 år)."
echo "   Restart 'npm run dev' for at Vite skal ta det i bruk."
