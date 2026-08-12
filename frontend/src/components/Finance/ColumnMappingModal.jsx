import { useState } from 'react';
import './ColumnMappingModal.css';

const DATE_FORMATS = ['DD.MM.YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'];

export default function ColumnMappingModal({ preview, onConfirm, onClose, importing }) {
  const [mapping, setMapping] = useState({
    date: preview.suggestedMapping.date || preview.headers[0] || '',
    amount: preview.suggestedMapping.amount || '',
    counterparty: preview.suggestedMapping.counterparty || '',
    description: preview.suggestedMapping.description || '',
    dateFormat: preview.suggestedMapping.dateFormat || preview.guessedDateFormat,
  });

  const canConfirm = mapping.date && mapping.amount;

  return (
    <div className="mapping-overlay" onClick={onClose}>
      <div className="mapping-modal" onClick={(e) => e.stopPropagation()}>
        <button className="mapping-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <div className="mapping-title">Bekreft kolonner</div>
        <div className="mapping-hint">
          Kjenner du igjen kolonnene under? Vi har gjettet ut fra overskriftene i filen din.
        </div>

        <div className="mapping-fields">
          <label className="mapping-field">
            <span>Dato-kolonne *</span>
            <select value={mapping.date} onChange={(e) => setMapping({ ...mapping, date: e.target.value })}>
              {preview.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className="mapping-field">
            <span>Datoformat</span>
            <select value={mapping.dateFormat} onChange={(e) => setMapping({ ...mapping, dateFormat: e.target.value })}>
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="mapping-field">
            <span>Beløp-kolonne *</span>
            <select value={mapping.amount} onChange={(e) => setMapping({ ...mapping, amount: e.target.value })}>
              <option value="">Velg…</option>
              {preview.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className="mapping-field">
            <span>Motpart-kolonne</span>
            <select
              value={mapping.counterparty}
              onChange={(e) => setMapping({ ...mapping, counterparty: e.target.value })}
            >
              <option value="">Ingen</option>
              {preview.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className="mapping-field">
            <span>Beskrivelse-kolonne</span>
            <select
              value={mapping.description}
              onChange={(e) => setMapping({ ...mapping, description: e.target.value })}
            >
              <option value="">Ingen</option>
              {preview.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mapping-preview">
          <div className="mapping-subtitle">Eksempelrader</div>
          <div className="mapping-preview-table">
            {preview.sampleRows.map((row, i) => (
              <div key={i} className="mapping-preview-row">
                <span>{row[mapping.date] ?? '–'}</span>
                <span>{row[mapping.amount] ?? '–'}</span>
                <span>{mapping.counterparty ? row[mapping.counterparty] ?? '–' : '–'}</span>
              </div>
            ))}
          </div>
        </div>

        <button className="btn btn-accent mapping-confirm" disabled={!canConfirm || importing} onClick={() => onConfirm(mapping)}>
          {importing ? 'Importerer…' : 'Importer transaksjoner'}
        </button>
      </div>
    </div>
  );
}
