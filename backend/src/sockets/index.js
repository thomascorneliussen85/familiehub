export function registerSockets(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 Klient tilkoblet: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`🔌 Klient frakoblet: ${socket.id}`);
    });
  });
}
