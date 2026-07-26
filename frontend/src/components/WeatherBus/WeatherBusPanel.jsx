import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import './WeatherBusPanel.css';

const SYMBOL_EMOJI = {
  clearsky: '☀️',
  fair: '🌤️',
  partlycloudy: '⛅',
  cloudy: '☁️',
  rain: '🌧️',
  lightrain: '🌦️',
  heavyrain: '🌧️',
  rainshowers: '🌦️',
  lightrainshowers: '🌦️',
  heavyrainshowers: '🌧️',
  snow: '❄️',
  snowshowers: '🌨️',
  sleet: '🌨️',
  thunder: '⛈️',
  fog: '🌫️',
};

function iconFor(symbolCode) {
  if (!symbolCode) return '🌡️';
  const base = symbolCode.replace(/_day|_night|_polartwilight/g, '');
  return SYMBOL_EMOJI[base] || '🌡️';
}

export default function WeatherBusPanel() {
  const [weather, setWeather] = useState(null);
  const [bus, setBus] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get('/weather').then(setWeather).catch(() => setError(true));
    api.get('/bus').then(setBus).catch(() => {});
    const id = setInterval(() => {
      api.get('/bus').then(setBus).catch(() => {});
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const now = weather?.hourly?.[0];
  const next6 = weather?.hourly?.slice(1, 7) ?? [];

  return (
    <section className="panel panel-weatherbus">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🌦️</span> Vær &amp; buss
        </div>
      </div>
      <div className="panel-body">
        {error && <div className="empty-hint">Klarte ikke å hente værmelding</div>}
        {now && (
          <div className="weather-now">
            <span className="weather-now-icon">{iconFor(now.symbolCode)}</span>
            <span className="weather-now-temp">{Math.round(now.temperature)}°</span>
          </div>
        )}
        <div className="weather-hours">
          {next6.map((h) => (
            <div key={h.time} className="weather-hour">
              <span className="weather-hour-time">
                {new Date(h.time).toLocaleTimeString('nb-NO', { hour: '2-digit' })}
              </span>
              <span>{iconFor(h.symbolCode)}</span>
              <span className="weather-hour-temp">{Math.round(h.temperature)}°</span>
            </div>
          ))}
        </div>

        <div className="bus-section">
          <div className="bus-heading">🚌 {bus?.stopName || 'Busstider'}</div>
          {!bus?.configured && (
            <div className="empty-hint">Sett ENTUR_STOP_ID i .env for å vise busstider</div>
          )}
          {bus?.configured && bus.departures.length === 0 && (
            <div className="empty-hint">Ingen avganger nå</div>
          )}
          <ul className="bus-list">
            {bus?.departures?.map((d, i) => (
              <li key={i} className="bus-item">
                <span className="bus-line">{d.line}</span>
                <span className="bus-dest">{d.destination}</span>
                <span className="bus-time">
                  {new Date(d.time).toLocaleTimeString('nb-NO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
