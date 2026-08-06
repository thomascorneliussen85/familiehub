import { useEffect, useState } from 'react';

function computePeriod(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 10) return 'morgen';
  if (hour >= 10 && hour < 18) return 'dag';
  return 'kveld';
}

export function useTimeOfDay() {
  const [period, setPeriod] = useState(() => computePeriod(new Date()));

  useEffect(() => {
    const id = setInterval(() => {
      setPeriod(computePeriod(new Date()));
    }, 30000);
    return () => clearInterval(id);
  }, []);

  return { period, isDark: period === 'kveld' };
}
