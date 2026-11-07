import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { socket } from '../lib/socket';

const FamilyMembersContext = createContext({ members: [], refresh: () => {} });

export function FamilyMembersProvider({ children }) {
  const [members, setMembers] = useState([]);

  const refresh = useCallback(() => {
    api.get('/family-members').then(setMembers).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    socket.on('family-members:update', refresh);
    return () => socket.off('family-members:update', refresh);
  }, [refresh]);

  return (
    <FamilyMembersContext.Provider value={{ members, refresh }}>
      {children}
    </FamilyMembersContext.Provider>
  );
}

export function useFamilyMembers() {
  return useContext(FamilyMembersContext);
}
