import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';

// Norske bank-CSV-er varierer overraskende mye i encoding/skilletegn/format
// (DNB, Sparebanken Vest, Bulder, Sbanken, Nordea er alle litt forskjellige),
// så denne modulen gjetter fornuftige standardverdier for
// mapping-veiviseren (ColumnMappingModal) i stedet for å anta ett bestemt
// bankformat.

const DELIMITER_CANDIDATES = [';', ',', '\t'];
const DATE_FORMATS = [
  { format: 'YYYY-MM-DD', regex: /^(\d{4})-(\d{2})-(\d{2})$/, order: ['y', 'm', 'd'] },
  { format: 'DD.MM.YYYY', regex: /^(\d{2})\.(\d{2})\.(\d{4})$/, order: ['d', 'm', 'y'] },
  { format: 'DD/MM/YYYY', regex: /^(\d{2})\/(\d{2})\/(\d{4})$/, order: ['d', 'm', 'y'] },
  { format: 'DD-MM-YYYY', regex: /^(\d{2})-(\d{2})-(\d{4})$/, order: ['d', 'm', 'y'] },
];

// UTF-8 med ugyldige byte-sekvenser dekodes til U+FFFD ("replacement
// character") – bruker det som signal om at filen faktisk er Latin-1/Windows-1252
// (vanlig i eldre eksporter fra norske nettbanker).
export function detectEncoding(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf8';
  }
  const asUtf8 = buffer.toString('utf8');
  return asUtf8.includes('�') ? 'latin1' : 'utf8';
}

export function decodeBuffer(buffer, encoding) {
  if (encoding === 'latin1') return iconv.decode(buffer, 'win1252');
  return buffer.toString('utf8').replace(/^﻿/, '');
}

export function detectDelimiter(sampleText) {
  const firstLines = sampleText.split(/\r?\n/).slice(0, 5).filter(Boolean);
  let best = DELIMITER_CANDIDATES[0];
  let bestCount = -1;
  for (const candidate of DELIMITER_CANDIDATES) {
    const counts = firstLines.map((line) => line.split(candidate).length - 1);
    const min = Math.min(...counts);
    if (min > 0 && min > bestCount) {
      bestCount = min;
      best = candidate;
    }
  }
  return best;
}

export function detectDateFormat(sampleValue) {
  const trimmed = (sampleValue || '').trim();
  const match = DATE_FORMATS.find((f) => f.regex.test(trimmed));
  return match ? match.format : 'DD.MM.YYYY';
}

export function parseDate(rawValue, dateFormat) {
  const trimmed = (rawValue || '').trim();
  const def = DATE_FORMATS.find((f) => f.format === dateFormat) || DATE_FORMATS[1];
  const m = def.regex.exec(trimmed);
  if (!m) return null;
  const parts = {};
  def.order.forEach((key, i) => {
    parts[key] = m[i + 1];
  });
  if (!parts.y || !parts.m || !parts.d) return null;
  return `${parts.y}-${parts.m}-${parts.d}`;
}

// Håndterer norsk tallformat ("1 234,56" / "1.234,56") og vanlig
// engelsk/API-format ("1234.56"), samt beløp med mellomrom/valutategn.
export function parseAmount(rawValue) {
  let s = (rawValue || '').toString().trim().replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastComma > lastDot) {
    // Komma er desimalskilletegn ("1.234,56" eller "1 234,56")
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma > -1) {
    // Komma er tusenskilletegn ("1,234.56")
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseRows(buffer) {
  const encoding = detectEncoding(buffer);
  const text = decodeBuffer(buffer, encoding);
  const delimiter = detectDelimiter(text);
  const rows = parse(text, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
  return { encoding, delimiter, rows };
}

// Brukes av opplastingsruten til å vise ColumnMappingModal: kolonnenavn +
// noen eksempelrader, pluss et gjettet format klienten kan forhåndsutfylle
// mappingen med.
export function previewCsv(buffer, { sampleRows = 5 } = {}) {
  const { encoding, delimiter, rows } = parseRows(buffer);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const firstDateLikeValue = headers.length > 0 ? rows[0][headers[0]] : '';
  return {
    encoding,
    delimiter,
    headers,
    sampleRows: rows.slice(0, sampleRows),
    guessedDateFormat: detectDateFormat(firstDateLikeValue),
    totalRows: rows.length,
  };
}

// mapping: { date, amount, counterparty, description, dateFormat } for
// banker med ett fortegnet beløp-felt, ELLER { date, creditColumn,
// debitColumn, counterparty, description, dateFormat } for banker som
// eksporterer "Inn"/"Ut" (kreditert/debitert) som to separate kolonner i
// stedet for ett beløp med fortegn (f.eks. SR-Bank) – kolonnenavn fra
// headers over, bekreftet/rettet av brukeren i veiviseren.
export function parseTransactions(buffer, mapping) {
  const { rows } = parseRows(buffer);
  const dateFormat = mapping.dateFormat || 'DD.MM.YYYY';
  const useSplitAmount = !mapping.amount && (mapping.creditColumn || mapping.debitColumn);
  const results = [];
  const errors = [];
  rows.forEach((row, index) => {
    const date = parseDate(row[mapping.date], dateFormat);
    let amount;
    if (useSplitAmount) {
      const credit = mapping.creditColumn ? parseAmount(row[mapping.creditColumn]) : null;
      const debit = mapping.debitColumn ? parseAmount(row[mapping.debitColumn]) : null;
      // En rad har typisk kun én av de to fylt ut – fortegnet er implisitt
      // gitt av hvilken kolonne som har en verdi, ikke det rå tallet i seg
      // selv (noen banker skriver "Ut" som positivt tall).
      amount = credit === null && debit === null ? null : (credit || 0) - Math.abs(debit || 0);
    } else {
      amount = parseAmount(row[mapping.amount]);
    }
    if (!date || amount === null) {
      errors.push({ row: index + 1, raw: row });
      return;
    }
    results.push({
      date,
      amount,
      counterparty: mapping.counterparty ? (row[mapping.counterparty] || '').trim() : '',
      rawDescription: mapping.description ? (row[mapping.description] || '').trim() : '',
    });
  });
  return { transactions: results, errors };
}
