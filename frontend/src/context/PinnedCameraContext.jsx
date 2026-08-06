import { createContext, useContext, useState, useCallback } from 'react';

const PinnedCameraContext = createContext(null);

export function PinnedCameraProvider({ children }) {
  const [pinnedCamera, setPinnedCamera] = useState(null);

  const pinCamera = useCallback((camera) => setPinnedCamera(camera), []);
  const unpinCamera = useCallback(() => setPinnedCamera(null), []);

  return (
    <PinnedCameraContext.Provider value={{ pinnedCamera, pinCamera, unpinCamera }}>
      {children}
    </PinnedCameraContext.Provider>
  );
}

export function usePinnedCamera() {
  return useContext(PinnedCameraContext);
}
