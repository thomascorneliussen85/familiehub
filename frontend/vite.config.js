import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const keyPath = path.join(projectRoot, 'certs/key.pem')
const certPath = path.join(projectRoot, 'certs/cert.pem')

// https er nødvendig for at nettbrett skal kunne bruke talegjenkjenning
// (Web Speech API) når FamilieHub åpnes over en vanlig lokal IP-adresse –
// nettlesere krever en "secure context" (https, eller localhost) for det.
// Se certs/README.md for hvordan sertifikatet genereres/fornyes.
const httpsConfig =
  fs.existsSync(keyPath) && fs.existsSync(certPath)
    ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
    : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    https: httpsConfig,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/photos': { target: 'http://localhost:4000', changeOrigin: true },
      '/reward-images': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', changeOrigin: true, ws: true },
    },
  },
})
