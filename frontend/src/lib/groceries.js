export function groceryCategory(name) {
  const text = name.toLowerCase();
  if (/melk|ost|yoghurt|yogurt|smør|fløte|rømme|egg|kylling|kjøtt|laks|fisk|skinke/.test(text)) return 'Kjøl og ferskvarer';
  if (/tomat|løk|potet|gulrot|salat|agurk|paprika|brokkoli|eple|banan|sitron|avokado|hvitløk/.test(text)) return 'Frukt og grønt';
  if (/ris|pasta|mel\b|havre|sukker|salt|pepper|olje|bønner|linser|krydder/.test(text)) return 'Tørrvarer';
  if (/frossen|frosne|isbit/.test(text)) return 'Frysevarer';
  return 'Annet';
}

// Only scale unambiguous leading quantities. Free text stays visible for review.
export function scaleIngredient(text, factor) {
  const match = text.match(/^(\d+(?:[.,]\d+)?|[½¼¾])\s+(.+)$/);
  if (!match) return text;
  const quantity = { '½': .5, '¼': .25, '¾': .75 }[match[1]] ?? Number(match[1].replace(',', '.'));
  return `${Number((quantity * factor).toFixed(2)).toLocaleString('nb-NO', { useGrouping: false })} ${match[2]}`;
}
