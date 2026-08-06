import { usePinnedCamera } from '../../context/PinnedCameraContext';
import './FloatingCameraView.css';

export default function FloatingCameraView() {
  const { pinnedCamera, unpinCamera } = usePinnedCamera();

  if (!pinnedCamera) return null;

  return (
    <div className="floating-camera">
      <div className="floating-camera-header">
        <span className="floating-camera-name">📹 {pinnedCamera.name}</span>
        <button className="floating-camera-close" onClick={unpinCamera} aria-label="Lukk">
          ✕
        </button>
      </div>
      <img
        key={pinnedCamera.id}
        className="floating-camera-stream"
        src={`/api/cameras/${pinnedCamera.id}/stream`}
        alt={pinnedCamera.name}
      />
    </div>
  );
}
