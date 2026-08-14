import './ConnectionOverlay.css';

export default function ConnectionOverlay() {
  return (
    <div className="connection-overlay" role="status">
      <div className="connection-overlay-spinner" />
      <div className="connection-overlay-title">Oppdaterer FamilieHub …</div>
      <div className="connection-overlay-hint">Er tilbake om et lite øyeblikk</div>
    </div>
  );
}
