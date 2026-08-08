import { io } from 'socket.io-client';

// Sokkelen krever samme økt-cookie som resten av appen (se
// backend/src/sockets/index.js), så den kobler seg IKKE til automatisk ved
// oppstart – AuthContext kaller socket.connect()/disconnect() når
// innloggingsstatusen er avklart.
export const socket = io({
  autoConnect: false,
  reconnection: true,
  withCredentials: true,
});
