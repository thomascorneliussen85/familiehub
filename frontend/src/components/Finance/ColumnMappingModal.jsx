import { useState } from 'react';
import './ColumnMappingModal.css';

const DATE_FORMATS = ['DD.MM.YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'];

export default function ColumnMappingModal({ preview, onConfirm, onClose, importing }) {
  // Noen banker (f.eks. SR-Bank) eksporterer "Inn"/"Ut" som to separate
  // kolonner i stedet for ett fortegnet beløp – starter i riktig modus hvis
  // vi klarte å gjette det automatisk.
  const [splitAmount, setSplitAmount] = useState(
    !preview.suggestedMapping.amount && Boolean(preview.suggestedMapping.creditColumn || preview.suggestedMapping.debitColumn)
  );
  const [mapping, setMapping] = useState({
    date: preview.suggestedMapping.date || preview.headers[0] || '',
    amount: preview.suggestedMapping.amount || '',
    creditColumn: preview.suggestedMapping.creditColumn || '',
    debitColumn: preview.suggestedMapping.debitColumn || '',
    counterparty: preview.suggestedMapping.counterparty || '',
    description: preview.suggestedMapping.description || '',
    dateFormat: preview.suggestedMapping.dateFormat || preview.guessedDateFormat,
  });

  const canConfirm = mapping.date && (splitAmount ? mapping.creditColumn || mapping.debitColumn : mapping.amount);

  function confirm() {
    const payload = splitAmount
      ? { ...mapping, amount: undefined }
      : { ...mapping, creditColumn: undefined, debitColumn: undefined };
    onConfirm(payload);
  }

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

        <label className="mapping-split-toggle">
          <input type="checkbox" checked={splitAmount} onChange={(e) => setSplitAmount(e.target.checked)} />
          Banken min bruker to kolonner for beløp (f.eks. «Inn» og «Ut») i stedet for én
        </label>

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

          {splitAmount ? (
            <>
              <label className="mapping-field">
                <span>Inn-kolonne (innbetaling)</span>
                <select
                  value={mapping.creditColumn}
                  onChange={(e) => setMapping({ ...mapping, creditColumn: e.target.value })}
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
                <span>Ut-kolonne (utbetaling)</span>
                <select
                  value={mapping.debitColumn}
                  onChange={(e) => setMapping({ ...mapping, debitColumn: e.target.value })}
                >
                  <option value="">Ingen</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
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
          )}

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
                <span>
                  {splitAmount
                    ? (mapping.creditColumn && row[mapping.creditColumn]) || (mapping.debitColumn && row[mapping.debitColumn]) || '–'
                    : row[mapping.amount] ?? '–'}
                </span>
                <span>{mapping.counterparty ? row[mapping.counterparty] ?? '–' : '–'}</span>
              </div>
            ))}
          </div>
        </div>

        <button className="btn btn-accent mapping-confirm" disabled={!canConfirm || importing} onClick={confirm}>
          {importing ? 'Importerer…' : 'Importer transaksjoner'}
        </button>
      </div>
    </div>
  );
}
