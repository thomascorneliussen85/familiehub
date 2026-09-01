import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import Clock from '../Clock/Clock';
import './PhotoFrame.css';

const SLIDE_MS = 10000;
const NATTMODUS_START_TIME = 23; // kl 23
const NATTMODUS_SLUTT_TIME = 6; // til kl 06

// Nattmodus krysser midnatt (23 -> 06), så "innenfor" betyr time >= start
// ELLER time < slutt, ikke et vanlig start<=time<=slutt-intervall.
function erNattmodus() {
  const t = new Date().getHours();
  return t >= NATTMODUS_START_TIME || t < NATTMODUS_SLUTT_TIME;
}

export default function PhotoFrame() {
  const [photos, setPhotos] = useState([]);
  const [index, setIndex] = useState(0);
  const [weather, setWeather] = useState(null);
  const [nattmodus, setNattmodus] = useState(erNattmodus);

  useEffect(() => {
    api.get('/photos').then(setPhotos).catch(() => {});
    api.get('/weather').then((w) => setWeather(w.hourly?.[0])).catch(() => {});
  }, []);

  useEffect(() => {
    if (photos.length === 0 || nattmodus) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % photos.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [photos, nattmodus]);

  // Sjekker hvert minutt om vi har krysset inn i/ut av nattmodus-vinduet –
  // fotorammen kan allerede være aktiv (idle) når klokken passerer 23:00,
  // og skal da gå til helt svart uten at noen trenger å røre skjermen.
  useEffect(() => {
    const id = setInterval(() => setNattmodus(erNattmodus()), 60000);
    return () => clearInterval(id);
  }, []);

  if (nattmodus) {
    return <div className="photo-frame photo-frame-natt" />;
  }

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
