import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import './PowerPricePanel.css';

function Bars({ hours, currentHour, cheapest }) {
  if (!hours || hours.length === 0) return <div className="empty-hint">Ingen priser</div>;
  const max = Math.max(...hours.map((h) => h.nokPerKwh));
  return (
    <div className="price-bars">
      {hours.map((h) => {
        const hour = new Date(h.time).getHours();
        const isNow = hour === currentHour;
        const isCheap = cheapest.includes(h.time);
        const heightPct = Math.max(4, (h.nokPerKwh / max) * 100);
        return (
          <div key={h.time} className="price-bar-col" title={`kl ${hour}: ${h.nokPerKwh.toFixed(2)} kr/kWh`}>
            <div className="price-bar-track">
              <div
                className={`price-bar ${isNow ? 'price-bar-now' : ''} ${isCheap ? 'price-bar-cheap' : ''}`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <span className="price-bar-hour">{hour}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function PowerPricePanel() {
  const [data, setData] = useState(null);
  const [showTomorrow, setShowTomorrow] = useState(false);

  useEffect(() => {
    api.get('/power-price').then(setData).catch(() => {});
    const id = setInterval(() => {
      api.get('/power-price').then(setData).catch(() => {});
    }, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const hours = showTomorrow ? data?.tomorrow : data?.today;
  const currentPrice = data?.today?.find((h) => new Date(h.time).getHours() === data.currentHour);

  return (
    <section className="panel panel-powerprice">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">⚡</span> Strømpris
          {currentPrice && <span className="price-now-badge">{currentPrice.nokPerKwh.toFixed(2)} kr/kWh nå</span>}
        </div>
        <div className="price-toggle">
          <button
            className={`btn ${!showTomorrow ? 'btn-accent' : ''}`}
            onClick={() => setShowTomorrow(false)}
          >
            I dag
          </button>
          <button
            className={`btn ${showTomorrow ? 'btn-accent' : ''}`}
            onClick={() => setShowTomorrow(true)}
            disabled={!data?.tomorrow}
          >
            I morgen
          </button>
        </div>
      </div>
      <div className="panel-body">
        {showTomorrow && !data?.tomorrow && (
          <div className="empty-hint">Morgendagens priser publiseres normalt rundt kl. 13</div>
        )}
        <Bars
          hours={hours}
          currentHour={showTomorrow ? -1 : data?.currentHour}
          cheapest={showTomorrow ? data?.cheapestTomorrow || [] : data?.cheapestToday || []}
        />
      </div>
    </section>
  );
}
