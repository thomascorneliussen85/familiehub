const UNITS = { kg: ['g', 1000], g: ['g', 1], l: ['ml', 1000], dl: ['ml', 100], cl: ['ml', 10], ml: ['ml', 1], stk: ['stk', 1], ss: ['ss', 1], ts: ['ts', 1] };
export function combineIngredients(items) {
  const groups = new Map();
  for (const raw of items) {
    const text = raw.trim();
    if (!text) continue;
    const match = text.match(/^(\d+(?:[.,]\d+)?)\s+(?:(kg|g|ml|cl|dl|l|stk|ss|ts)\.?\s+)?(.+)$/i);
    if (!match) { if (!groups.has(text.toLowerCase())) groups.set(text.toLowerCase(), { text }); continue; }
    const [unit, multiplier] = UNITS[match[2]?.toLowerCase()] || ['', 1];
    const name = match[3].trim();
    const key = `${unit}:${name.toLowerCase()}`;
    const previous = groups.get(key);
    const amount = Number(match[1].replace(',', '.')) * multiplier;
    groups.set(key, { name, unit, amount: amount + (previous?.amount || 0) });
  }
  return [...groups.values()].map(item => item.text || `${Number(item.amount.toFixed(2)).toLocaleString('nb-NO', { useGrouping: false })} ${item.unit ? item.unit + ' ' : ''}${item.name}`);
}
