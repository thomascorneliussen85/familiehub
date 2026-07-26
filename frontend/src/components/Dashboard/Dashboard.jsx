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

export default function Dashboard() {
  return (
    <div className="dashboard-grid">
      <CalendarPanel />
      <ChoresPanel />
      <ShoppingPanel />
      <WeatherBusPanel />
      <SmartHomePanel />
      <GpsMapPanel />
      <PowerPricePanel />
      <MessageBoardPanel />
      <TimerPanel />
    </div>
  );
}
