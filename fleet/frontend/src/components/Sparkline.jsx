// Enkel, avhengighetsfri linjegraf (ingen chart-bibliotek) – nok til å vise
// en trend over tid for oppetid/minnebruk på hub-detaljsiden.
export default function Sparkline({ data, color = '#5b8def', height = 60 }) {
  const points = data.filter((v) => v != null);
  if (points.length < 2) return null;

  const width = 400;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
