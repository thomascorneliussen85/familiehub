import './MemberBoard.css';

const DAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function eventTime(e) {
  return e.all_day
    ? 'Hele dagen'
    : new Date(e.start_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

function EventCard({ e, onEventClick }) {
  return (
    <div
      className="member-board-card"
      style={{ borderLeftColor: e.member_color || '#7c9cff' }}
      onClick={() => onEventClick(e)}
    >
      <span className="member-board-card-time">{eventTime(e)}</span>
      <span className="member-board-card-title">
        {e.recurrence === 'weekly' && '🔁 '}
        {e.title}
      </span>
    </div>
  );
}

export default function MemberBoard({ members, events, boardMode, days, onEventClick, onAddClick }) {
  return (
    <div className="member-board">
      {members.map((m) => {
        const memberEvents = events.filter((e) => e.member_id === m.id);
        return (
          <div key={m.id} className="member-board-col">
            <div className="member-board-header">
              <div className="member-board-avatar" style={{ borderColor: m.color }}>
                {m.avatar}
              </div>
              <span className="member-board-name">{m.name}</span>
              <button
                type="button"
                className="member-board-add"
                onClick={() => onAddClick(m.id, days[0])}
                aria-label={`Legg til for ${m.name}`}
              >
                +
              </button>
            </div>

            {boardMode === 'day' ? (
              <div className="member-board-cards">
                {memberEvents.filter((e) => isSameDay(new Date(e.start_at), days[0])).length === 0 && (
                  <div className="empty-hint member-board-empty">Ingen hendelser</div>
                )}
                {memberEvents
                  .filter((e) => isSameDay(new Date(e.start_at), days[0]))
                  .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
                  .map((e) => (
                    <EventCard key={e.id} e={e} onEventClick={onEventClick} />
                  ))}
              </div>
            ) : (
              <div className="member-board-week">
                {days.map((day, i) => {
                  const dayEvents = memberEvents
                    .filter((e) => isSameDay(new Date(e.start_at), day))
                    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
                  return (
                    <div key={i} className="member-board-week-day">
                      <div className="member-board-week-daylabel">
                        {DAY_LABELS[(day.getDay() + 6) % 7]} {day.getDate()}
                      </div>
                      {dayEvents.length === 0 ? (
                        <div className="member-board-week-empty">–</div>
                      ) : (
                        dayEvents.map((e) => <EventCard key={e.id} e={e} onEventClick={onEventClick} />)
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {members.length === 0 && (
        <div className="empty-hint">Ingen familiemedlemmer registrert ennå</div>
      )}
    </div>
  );
}
