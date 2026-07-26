import { useState } from 'react';
import CalendarPanel from '../Calendar/CalendarPanel';
import ChoresPanel from '../Chores/ChoresPanel';
import ShoppingPanel from '../Shopping/ShoppingPanel';
import WeatherBusPanel from '../WeatherBus/WeatherBusPanel';
import PowerPricePanel from '../PowerPrice/PowerPricePanel';
import SmartHomePanel from '../SmartHome/SmartHomePanel';
import GpsMapPanel from '../GpsMap/GpsMapPanel';
import MessageBoardPanel from '../MessageBoard/MessageBoardPanel';
import TimerPanel from '../Timer/TimerPanel';
import './Dashboard.css';

const PANELS = [
  { key: 'calendar', Component: CalendarPanel },
  { key: 'chores', Component: ChoresPanel },
  { key: 'shopping', Component: ShoppingPanel },
  { key: 'smarthome', Component: SmartHomePanel },
  { key: 'weatherbus', Component: WeatherBusPanel },
  { key: 'gps', Component: GpsMapPanel },
  { key: 'powerprice', Component: PowerPricePanel },
  { key: 'messages', Component: MessageBoardPanel },
  { key: 'timer', Component: TimerPanel },
];

export default function Dashboard() {
  const [expandedKey, setExpandedKey] = useState(null);

  return (
    <div className="dashboard-grid">
      {expandedKey && <div className="dashboard-backdrop" onClick={() => setExpandedKey(null)} />}
      {PANELS.map(({ key, Component }) => {
        const isExpanded = expandedKey === key;
        return (
          <div
            key={key}
            className={`panel-slot panel-slot-${key} ${isExpanded ? 'panel-slot-expanded' : ''}`}
          >
            <Component isExpanded={isExpanded} />
            {isExpanded ? (
              <button
                type="button"
                className="panel-collapse-btn"
                onClick={() => setExpandedKey(null)}
                aria-label="Lukk"
              >
                ✕
              </button>
            ) : (
              <button
                type="button"
                className="panel-expand-overlay"
                onClick={() => setExpandedKey(key)}
                aria-label="Vis større"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
