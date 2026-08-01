import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { playChime } from '../../lib/chime';
import './FriendPlayToast.css';

export default function FriendPlayToast() {
  const [toast, setToast] = useState(null);
  const seenIds = useRef(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    api
      .get('/play-status')
      .then((data) => {
        data.friends.forEach((f) => seenIds.current.add(f.id));
      })
      .finally(() => {
        initialized.current = true;
      });

    function onUpdate(data) {
      const newFriend = initialized.current
        ? data.friends.find((f) => !seenIds.current.has(f.id))
        : null;
      data.friends.forEach((f) => seenIds.current.add(f.id));
      if (newFriend) {
        setToast(`${newFriend.childName} er ute og leker!`);
        playChime();
        setTimeout(() => setToast(null), 6000);
      }
    }
    socket.on('play-status:update', onUpdate);
    return () => socket.off('play-status:update', onUpdate);
  }, []);

  if (!toast) return null;

  return <div className="friend-play-toast">🛝 {toast}</div>;
}
