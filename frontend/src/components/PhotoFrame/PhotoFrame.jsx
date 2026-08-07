import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import Clock from '../Clock/Clock';
import './PhotoFrame.css';

const SLIDE_MS = 10000;

export default function PhotoFrame() {
  const [photos, setPhotos] = useState([]);
  const [index, setIndex] = useState(0);
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    api.get('/photos').then(setPhotos).catch(() => {});
    api.get('/weather').then((w) => setWeather(w.hourly?.[0])).catch(() => {});
  }, []);

  useEffect(() => {
    if (photos.length === 0) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % photos.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [photos]);

  const current = photos[index];

  return (
    <div className="photo-frame">
      {current ? (
        <img className="photo-frame-image" src={current.url} alt="" />
      ) : (
        <div className="photo-frame-empty">
          Legg bilder i <code>/photos</code>-mappen for å vise fotoramme
        </div>
      )}
      <div className="photo-frame-overlay">
        <Clock size="large" />
        {weather && (
          <div className="photo-frame-weather">{Math.round(weather.temperature)}°</div>
        )}
      </div>
    </div>
  );
}
