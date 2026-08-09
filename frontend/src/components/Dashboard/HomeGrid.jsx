import { useEffect, useMemo, useState } from 'react';
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import CalendarPanel from '../Calendar/CalendarPanel';
import ChoresPanel from '../Chores/ChoresPanel';
import ShoppingPanel from '../Shopping/ShoppingPanel';
import DinnerPlanPanel from '../DinnerPlan/DinnerPlanPanel';
import './HomeGrid.css';

const LAYOUT_KEY = 'familiehub-home-layout';
const COLS = 4;
const ROWS = 2;
// Under denne bredden er ikke draing/endring av størrelse med fingeren
// naturlig – rutene stables i stedet i en enkel, rullbar liste.
const MOBILE_BREAKPOINT = 560;

const TILES = {
  calendar: CalendarPanel,
  chores: ChoresPanel,
  shopping: ShoppingPanel,
  dinnerplan: DinnerPlanPanel,
};

const DEFAULT_LAYOUT = [
  { i: 'calendar', x: 0, y: 0, w: 2, h: 1, minW: 1, minH: 1 },
  { i: 'chores', x: 2, y: 0, w: 2, h: 1, minW: 1, minH: 1 },
  { i: 'shopping', x: 0, y: 1, w: 2, h: 1, minW: 1, minH: 1 },
  { i: 'dinnerplan', x: 2, y: 1, w: 2, h: 1, minW: 1, minH: 1 },
];

function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY));
    if (Array.isArray(saved) && saved.length === DEFAULT_LAYOUT.length && saved.every((item) => TILES[item.i])) {
      return saved;
    }
  } catch {
    // ignorer korrupt lagret layout, bruk standard
  }
  return DEFAULT_LAYOUT;
}

// Faste rutebarn med stabil referanse (kun én gang) – react-grid-layout
// sammenligner "children" mellom rendringer, og posisjon/størrelse styres
// separat via "layout"-proppen, ikke ved å bygge om barna på hvert dra.
const CHILDREN = Object.entries(TILES).map(([key, Tile]) => (
  <div key={key}>
    <Tile />
  </div>
));

export default function HomeGrid() {
  const { width, containerRef, mounted } = useContainerWidth();
  const [height, setHeight] = useState(0);
  const [layout, setLayout] = useState(loadLayout);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const rowHeight = useMemo(() => (height > 0 ? Math.max(70, Math.floor(height / ROWS) - 6) : 150), [height]);
  const isMobile = width > 0 && width < MOBILE_BREAKPOINT;

  function handleLayoutChange(next) {
    setLayout(next);
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
  }

  return (
    <div className="home-grid-container" ref={containerRef}>
      {mounted && isMobile && (
        <div className="home-grid-stack">
          {Object.entries(TILES).map(([key, Tile]) => (
            <div key={key} className="home-grid-stack-item">
              <Tile />
            </div>
          ))}
        </div>
      )}
      {mounted && !isMobile && (
        <ReactGridLayout
          className="home-grid"
          width={width}
          layout={layout}
          gridConfig={{ cols: COLS, rowHeight, margin: [6, 6] }}
          dragConfig={{ enabled: true, handle: '.panel-header' }}
          resizeConfig={{ enabled: true, handles: ['se'] }}
          onLayoutChange={handleLayoutChange}
        >
          {CHILDREN}
        </ReactGridLayout>
      )}
    </div>
  );
}
