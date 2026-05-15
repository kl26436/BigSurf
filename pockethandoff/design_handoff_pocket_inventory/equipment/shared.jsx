// Equipment Library — shared phone frame, tokens, and common bits
// Strict-match aesthetic: pulls real values from BigSurf-B/styles/tokens.css.

const EQ_TOKENS = {
  bgApp: '#05070b',
  bgSurface: '#0d1218',
  bgCard: '#111820',
  bgCardHi: '#172030',
  bgTertiary: '#1a2028',
  border: '#1a2028',
  borderSubtle: 'rgba(255,255,255,0.06)',
  borderLight: 'rgba(255,255,255,0.10)',
  textStrong: '#f6f9ff',
  textMain: '#c4cad4',
  textMuted: '#b0b8c1',
  textSecondary: '#9aa3ad',
  textVeryMuted: '#6b7785',
  primary: '#1dd3b0',
  primaryDark: '#0fa48a',
  primaryBg: 'rgba(29,211,176,0.12)',
  primaryBgStrong: 'rgba(29,211,176,0.20)',
  primaryBorder: 'rgba(29,211,176,0.30)',
  warm: '#f7a865',
  warmBg: 'rgba(247,168,101,0.15)',
  warmBorder: 'rgba(247,168,101,0.30)',
  warning: '#f0c24b',
  warningBg: 'rgba(240,194,75,0.12)',
  warningBorder: 'rgba(240,194,75,0.30)',
  success: '#36c46b',
  successBg: 'rgba(54,196,107,0.12)',
  danger: '#e35d6a',
  dangerBg: 'rgba(227,93,106,0.12)',
  gold: '#ffd700',
  mutedBg: 'rgba(176,184,193,0.10)',
  // Equipment-type colors (from tokens.css)
  equip: {
    plateLoaded:  { fg: '#5b7fb8', bg: 'rgba(91,127,184,0.15)',  icon: 'fa-cog' },
    selectorized: { fg: '#56c2b6', bg: 'rgba(86,194,182,0.15)',  icon: 'fa-th-list' },
    machine:      { fg: '#4a90d9', bg: 'rgba(74,144,217,0.15)',  icon: 'fa-cogs' },
    barbell:      { fg: '#d96a4a', bg: 'rgba(217,106,74,0.15)',  icon: 'fa-grip-lines' },
    dumbbell:     { fg: '#d9a74a', bg: 'rgba(217,167,74,0.15)',  icon: 'fa-dumbbell' },
    cable:        { fg: '#7b4ad9', bg: 'rgba(123,74,217,0.15)',  icon: 'fa-link' },
    bench:        { fg: '#4ad9a7', bg: 'rgba(74,217,167,0.15)',  icon: 'fa-couch' },
    rack:         { fg: '#d94a7a', bg: 'rgba(217,74,122,0.15)',  icon: 'fa-archway' },
    cardio:       { fg: '#e35d6a', bg: 'rgba(227,93,106,0.15)',  icon: 'fa-heart-pulse' },
    bodyweight:   { fg: '#4ad9d9', bg: 'rgba(74,217,217,0.15)',  icon: 'fa-child-reaching' },
    other:        { fg: '#b0b8c1', bg: 'rgba(176,184,193,0.10)', icon: 'fa-circle-question' },
  },
  // Body-part tint (cat-*)
  bp: {
    chest:     '#4A90D9',
    back:      '#D94A7A',
    legs:      '#7B4AD9',
    shoulders: '#56B6C2',
    arms:      '#E06C75',
    core:      '#4AD9A7',
    cardio:    '#D9A74A',
  },
};

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';

// Phone frame — 375x812. Status bar uses dark notch. Content area is below status bar.
function EqPhone({ children, accent, noNav, scrollable = true }) {
  const a = accent || EQ_TOKENS.primary;
  return (
    <div style={{
      width: 375, height: 812,
      background: EQ_TOKENS.bgApp,
      borderRadius: 44,
      border: '8px solid #0a0d12',
      boxShadow: '0 20px 60px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.04)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
      fontFamily: FONT,
      color: EQ_TOKENS.textMain,
    }}>
      <StatusBar />
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        overflow: scrollable ? 'hidden' : 'visible',
      }}>
        {children}
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div style={{
      height: 44, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px 0 28px',
      fontSize: 14, fontWeight: 600, color: EQ_TOKENS.textStrong,
      position: 'relative',
      zIndex: 5,
    }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>9:41</span>
      <div style={{
        position: 'absolute', left: '50%', top: 8, transform: 'translateX(-50%)',
        width: 110, height: 28, background: '#000', borderRadius: 16,
      }} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
        <i className="fas fa-signal"></i>
        <i className="fas fa-wifi"></i>
        <i className="fas fa-battery-full"></i>
      </span>
    </div>
  );
}

// Page header — matches the .page-header pattern (back + title + optional action)
function PageHeader({ back, onBack, title, subtitle, action, accent, noBorder }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 16px 12px',
      borderBottom: noBorder ? 'none' : `1px solid ${EQ_TOKENS.borderSubtle}`,
      flexShrink: 0,
    }}>
      {back && (
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: 16,
          background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
          color: EQ_TOKENS.textMain, cursor: onBack ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13,
        }}>
          <i className="fas fa-chevron-left"></i>
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 18, fontWeight: 700, color: EQ_TOKENS.textStrong,
          letterSpacing: '-0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

// Three-tab segmented control — for landing page
function ThreeTab({ value, onChange, accent }) {
  const a = accent || EQ_TOKENS.primary;
  const tabs = [
    { id: 'gyms', label: 'My gyms' },
    { id: 'library', label: 'All equipment' },
    { id: 'catalog', label: 'Browse catalog' },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4,
      padding: 4, margin: '8px 16px 12px',
      background: EQ_TOKENS.bgSurface,
      border: `1px solid ${EQ_TOKENS.border}`,
      borderRadius: 999, flexShrink: 0,
    }}>
      {tabs.map(t => {
        const active = (value || 'gyms') === t.id;
        return (
          <button key={t.id} onClick={() => onChange && onChange(t.id)} style={{
            border: 'none', cursor: 'pointer',
            padding: '7px 6px', borderRadius: 999,
            background: active ? 'rgba(29,211,176,0.20)' : 'transparent',
            color: active ? a : EQ_TOKENS.textMuted,
            fontSize: 11.5, fontWeight: 600, letterSpacing: '-0.005em',
            fontFamily: FONT,
          }}>{t.label}</button>
        );
      })}
    </div>
  );
}

// Chip — filter pill (matches .chip)
function Chip({ active, accent, children, icon, count, onClick, size = 'md' }) {
  const a = accent || EQ_TOKENS.primary;
  const pad = size === 'sm' ? '5px 10px' : '7px 12px';
  const fs = size === 'sm' ? 11 : 12;
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, borderRadius: 999,
      background: active ? 'rgba(29,211,176,0.20)' : EQ_TOKENS.bgSurface,
      border: `1px solid ${active ? 'rgba(29,211,176,0.30)' : EQ_TOKENS.border}`,
      color: active ? a : EQ_TOKENS.textMuted,
      fontSize: fs, fontWeight: 600, fontFamily: FONT,
      whiteSpace: 'nowrap', cursor: 'pointer',
    }}>
      {icon && <i className={`fas ${icon}`} style={{ fontSize: fs - 2 }}></i>}
      {children}
      {count != null && (
        <span style={{
          fontSize: fs - 2, color: active ? a : EQ_TOKENS.textVeryMuted,
          fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        }}>{count}</span>
      )}
    </button>
  );
}

// Type icon — 40x40 colored square (matches .equip-row__icon)
function TypeIcon({ type, size = 40, radius = 12 }) {
  const t = EQ_TOKENS.equip[type] || EQ_TOKENS.equip.other;
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: t.bg, color: t.fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.45),
      flexShrink: 0,
    }}>
      <i className={`fas ${t.icon}`}></i>
    </div>
  );
}

// Type pill — small inline pill matching .equip-row__type-pill
function TypePill({ type, size = 'sm' }) {
  const t = EQ_TOKENS.equip[type] || EQ_TOKENS.equip.other;
  const label = ({
    plateLoaded: 'Plate-Loaded', selectorized: 'Selectorized', machine: 'Machine',
    barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable', bench: 'Bench',
    rack: 'Rack', cardio: 'Cardio', bodyweight: 'Bodyweight', other: 'Other',
  })[type] || type;
  return (
    <span style={{
      display: 'inline-block',
      padding: size === 'sm' ? '1px 7px' : '2px 9px',
      borderRadius: 999,
      background: t.bg, color: t.fg,
      fontSize: size === 'sm' ? 9.5 : 11,
      fontWeight: 700, letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

// Body-part dot
function BPDot({ bp, size = 8 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: EQ_TOKENS.bp[bp] || EQ_TOKENS.textVeryMuted,
      display: 'inline-block', flexShrink: 0,
    }} />
  );
}

// Bottom nav — matches dashboard variant
function EqBottomNav({ active = 'more', accent }) {
  const a = accent || EQ_TOKENS.primary;
  const items = [
    { id: 'home', icon: 'fa-house', label: 'Home' },
    { id: 'stats', icon: 'fa-chart-line', label: 'Stats' },
    { id: 'fab', icon: 'fa-dumbbell', fab: true },
    { id: 'history', icon: 'fa-calendar', label: 'History' },
    { id: 'more', icon: 'fa-ellipsis', label: 'More' },
  ];
  return (
    <div style={{
      height: 78, flexShrink: 0,
      background: 'rgba(13,18,24,0.92)',
      backdropFilter: 'blur(20px)',
      borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
      paddingTop: 10,
    }}>
      {items.map(i => i.fab ? (
        <button key={i.id} style={{
          width: 52, height: 52, borderRadius: '50%',
          background: a, color: '#04201a', border: 'none',
          transform: 'translateY(-10px)',
          boxShadow: `0 10px 24px ${a}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>
          <i className={`fas ${i.icon}`}></i>
        </button>
      ) : (
        <button key={i.id} style={{
          background: 'transparent', border: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          color: active === i.id ? a : EQ_TOKENS.textVeryMuted,
          fontSize: 10, fontWeight: 500,
          padding: '4px 8px', cursor: 'pointer',
        }}>
          <i className={`fas ${i.icon}`} style={{ fontSize: 17 }}></i>
          <span>{i.label}</span>
        </button>
      ))}
    </div>
  );
}

// Generic scroll area
function ScrollArea({ children, style }) {
  return (
    <div className="bs-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', ...style }}>
      {children}
    </div>
  );
}

// Bottom-sheet handle bar
function SheetHandle() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 4, flexShrink: 0 }}>
      <div style={{ width: 38, height: 4, borderRadius: 2, background: EQ_TOKENS.borderLight }} />
    </div>
  );
}

// Body silhouette — used in direction 4 (Body Map)
function BodySilhouette({ coverage = {}, accent, width = 80, height = 130 }) {
  // coverage: { chest: 0..1, back: 0..1, legs: ..., shoulders: ..., arms: ..., core: ... }
  const a = accent || EQ_TOKENS.primary;
  const fill = (v) => v == null ? 'rgba(255,255,255,0.04)' : `rgba(29,211,176,${0.18 + v * 0.6})`;
  return (
    <svg width={width} height={height} viewBox="0 0 80 130" fill="none">
      {/* head */}
      <circle cx="40" cy="11" r="8" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)" />
      {/* shoulders */}
      <path d="M 16 30 Q 16 24 22 22 L 58 22 Q 64 24 64 30 L 60 36 L 20 36 Z" fill={fill(coverage.shoulders)} stroke="rgba(255,255,255,0.08)" />
      {/* chest */}
      <path d="M 22 36 L 58 36 L 56 56 L 24 56 Z" fill={fill(coverage.chest)} stroke="rgba(255,255,255,0.08)" />
      {/* core */}
      <path d="M 24 56 L 56 56 L 54 75 L 26 75 Z" fill={fill(coverage.core)} stroke="rgba(255,255,255,0.08)" />
      {/* arms (left + right) */}
      <path d="M 6 32 Q 4 38 6 60 L 14 62 Q 16 42 18 32 Z" fill={fill(coverage.arms)} stroke="rgba(255,255,255,0.08)" />
      <path d="M 74 32 Q 76 38 74 60 L 66 62 Q 64 42 62 32 Z" fill={fill(coverage.arms)} stroke="rgba(255,255,255,0.08)" />
      {/* legs */}
      <path d="M 26 75 L 38 75 L 36 124 L 26 124 Z" fill={fill(coverage.legs)} stroke="rgba(255,255,255,0.08)" />
      <path d="M 42 75 L 54 75 L 54 124 L 44 124 Z" fill={fill(coverage.legs)} stroke="rgba(255,255,255,0.08)" />
    </svg>
  );
}

// Keyframes / global styles once
if (typeof document !== 'undefined' && !document.getElementById('eq-keyframes')) {
  const s = document.createElement('style');
  s.id = 'eq-keyframes';
  s.textContent = `
    @keyframes eqPulse { 0%,100%{opacity:1} 50%{opacity:0.55} }
    .bs-scroll{ overflow-y:auto; -ms-overflow-style:none; scrollbar-width:none; }
    .bs-scroll::-webkit-scrollbar{ display:none; }
    .eq-fade-mask {
      mask-image: linear-gradient(to bottom, #000 88%, transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, #000 88%, transparent 100%);
    }
  `;
  document.head.appendChild(s);
}

Object.assign(window, {
  EQ_TOKENS, FONT,
  EqPhone, StatusBar, PageHeader, ThreeTab, Chip,
  TypeIcon, TypePill, BPDot, EqBottomNav, ScrollArea, SheetHandle, BodySilhouette,
});
