import { useEffect, useState } from 'react';
import { socket } from '../../lib/socket';
import './PairingPendingBanner.css';

export default function PairingPendingBanner({ onOpenSettings }) {
  const [pending, setPending] = useState([]);

  useEffect(() => {
    function onPending(list) {
      setPending(list);
    }
    socket.on('relay:pending-update', onPending);
    return () => socket.off('relay:pending-update', onPending);
  }, []);

  if (pending.length === 0) return null;

  return (
    <button className="pairing-pending-banner" onClick={onOpenSettings}>
      👋 {pending[0].familyName} ønsker å bli vennefamilie — trykk for å godkjenne
    </button>
  );
}
