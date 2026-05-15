// Direction 3 — Color Atlas
// Equipment-type color forward. Lean hard on the --equip-* color tokens
// so every screen reads as a color-coded inventory. Browse catalog is
// organized by type (Plate-Loaded / Selectorized / Cable / etc.) — a
// cross-cut against the standard brand grouping.

const D3 = {};

// ── Landing
D3.Landing = function ({ density, showMeta }) {
  return (
    <EqPhone>
      <div style={{ padding: '4px 16px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em' }}>Atlas</div>
          <div style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted, fontWeight: 600 }}>89 across 4 gyms</div>
        </div>
      </div>
      <ThreeTab value="gyms" />
      <ScrollArea>
        <div style={{ padding: '4px 16px 16px' }}>
          {EQ_DATA.gyms.map(g => <D3GymCard key={g.id} gym={g} />)}
          <button style={{
            width: '100%', padding: '14px',
            marginTop: 6, borderRadius: 14,
            background: 'transparent', border: `1px dashed ${EQ_TOKENS.borderLight}`,
            color: EQ_TOKENS.textMuted, fontSize: 13, fontWeight: 600, fontFamily: FONT,
          }}>
            <i className="fas fa-plus" style={{ marginRight: 6 }}></i> Add a gym
          </button>
        </div>
      </ScrollArea>
      <EqBottomNav active="more" />
    </EqPhone>
  );
};

function D3GymCard({ gym }) {
  // Hand-tuned type breakdown for color stripe
  const stripe = [
    { type: 'plateLoaded',  pct: 0.32 },
    { type: 'selectorized', pct: 0.22 },
    { type: 'cable',        pct: 0.16 },
    { type: 'rack',         pct: 0.10 },
    { type: 'bench',        pct: 0.08 },
    { type: 'cardio',       pct: 0.08 },
    { type: 'other',        pct: 0.04 },
  ];
  return (
    <div style={{
      background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
      borderRadius: 16, padding: 14, marginBottom: 10,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: EQ_TOKENS.textStrong, letterSpacing: '-0.01em' }}>{gym.name}</span>
            {gym.isCurrent && (
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: EQ_TOKENS.primary,
                boxShadow: `0 0 0 3px rgba(29,211,176,0.18)`,
                animation: 'eqPulse 1.6s ease-in-out infinite',
              }}></span>
            )}
          </div>
          <div style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted }}>
            {gym.city || 'No location'} · {gym.lastVisit}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: EQ_TOKENS.textStrong, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>{gym.count}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: EQ_TOKENS.textVeryMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>machines</div>
        </div>
      </div>
      {/* Stripe */}
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        {stripe.map((s, i) => (
          <div key={i} style={{ flex: s.pct * 100, background: EQ_TOKENS.equip[s.type].fg }} />
        ))}
      </div>
      {/* Type legend (top 3) */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { type: 'plateLoaded',  label: 'Plate', count: Math.round(gym.count * 0.32) },
          { type: 'selectorized', label: 'Select', count: Math.round(gym.count * 0.22) },
          { type: 'cable',        label: 'Cable', count: Math.round(gym.count * 0.16) },
          { type: 'rack',         label: 'Rack',  count: Math.round(gym.count * 0.10) },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: EQ_TOKENS.textMuted, fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: EQ_TOKENS.equip[s.type].fg }}></span>
            {s.label} <span style={{ color: EQ_TOKENS.textVeryMuted, fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Gym detail — large colored tiles per row
D3.GymDetail = function ({ density, showMeta }) {
  const items = EQ_DATA.items.filter(i => i.gyms.includes('absolute'));
  return (
    <EqPhone>
      <PageHeader back title="Absolute Recomp" subtitle="Color-coded by equipment type" />
      {/* Type filter strip */}
      <div style={{ padding: '8px 14px 10px', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }} className="bs-scroll">
        <Chip active size="sm">All</Chip>
        {['plateLoaded', 'selectorized', 'cable', 'rack', 'bench', 'cardio'].map(t => (
          <D3TypeChip key={t} type={t} />
        ))}
      </div>
      <ScrollArea>
        <div style={{ padding: '0 0 16px' }}>
          {items.slice(0, 11).map(it => <D3Row key={it.id} item={it} showMeta={showMeta} />)}
        </div>
      </ScrollArea>
    </EqPhone>
  );
};

function D3TypeChip({ type, active }) {
  const t = EQ_TOKENS.equip[type];
  const label = ({
    plateLoaded: 'Plate', selectorized: 'Select', machine: 'Machine',
    barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable', bench: 'Bench',
    rack: 'Rack', cardio: 'Cardio', bodyweight: 'BW',
  })[type];
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 999,
      background: active ? t.bg : 'transparent',
      border: `1px solid ${active ? t.fg : EQ_TOKENS.border}`,
      color: active ? t.fg : EQ_TOKENS.textMuted,
      fontSize: 11, fontWeight: 600, fontFamily: FONT,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.fg }}></span>
      {label}
    </button>
  );
}

function D3Row({ item, showMeta = true }) {
  const t = EQ_TOKENS.equip[item.type];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
      borderLeft: `3px solid ${t.fg}`,
    }}>
      <TypeIcon type={item.type} size={42} radius={12} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: EQ_TOKENS.textStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
        {showMeta && (
          <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.brand} · {item.line}
          </div>
        )}
      </div>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: EQ_TOKENS.textVeryMuted, fontWeight: 600 }}>
        <BPDot bp={item.bp} size={6} /> {item.bp}
      </span>
    </div>
  );
}

// ── Quick-add — type-grouped, large color tiles
D3.QuickAdd = function ({ density }) {
  return (
    <EqPhone scrollable={false}>
      <div style={{ position: 'absolute', inset: 0, top: 44, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        top: 90,
        background: EQ_TOKENS.bgSurface,
        borderRadius: '20px 20px 0 0',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <SheetHandle />
        <div style={{ padding: '4px 16px 8px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: EQ_TOKENS.textStrong }}>Quick add</div>
          <div style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>Walking Absolute Recomp · tap what you see</div>
        </div>
        {/* Search */}
        <div style={{
          margin: '0 16px 10px', padding: '12px 14px',
          background: EQ_TOKENS.bgCard, borderRadius: 14,
          border: `1px solid ${EQ_TOKENS.primaryBorder}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <i className="fas fa-magnifying-glass" style={{ color: EQ_TOKENS.primary, fontSize: 14 }}></i>
          <div style={{ flex: 1, fontSize: 14, color: EQ_TOKENS.textVeryMuted }}>Type a machine name…</div>
        </div>
        {/* Type quick-filters */}
        <div style={{ padding: '0 16px 8px', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: EQ_TOKENS.textVeryMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            Or filter by type
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }} className="bs-scroll">
            {['plateLoaded', 'selectorized', 'cable', 'rack', 'bench', 'cardio'].map(t => (
              <D3TypeChip key={t} type={t} active={t === 'plateLoaded'} />
            ))}
          </div>
        </div>
        <ScrollArea>
          <D3TypeHeader type="plateLoaded" count="3 unselected" />
          <D3CheckRow item={EQ_DATA.items[0]} checked />
          <D3CheckRow item={EQ_DATA.items[1]} disabled />
          <D3CheckRow item={EQ_DATA.items[8]} checked />
          <D3CheckRow item={EQ_DATA.items[9]} />
          <D3TypeHeader type="cable" count="2 unselected" />
          <D3CheckRow item={EQ_DATA.items[3]} />
          <D3CheckRow item={EQ_DATA.items[4]} />
        </ScrollArea>
        <div style={{ padding: '10px 16px 18px', background: 'rgba(13,18,24,0.96)', borderTop: `1px solid ${EQ_TOKENS.borderSubtle}` }}>
          <button style={{
            width: '100%', padding: '13px 16px', borderRadius: 999,
            background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
            fontSize: 14, fontWeight: 800, fontFamily: FONT,
          }}>
            Add 2 to gym
          </button>
        </div>
      </div>
    </EqPhone>
  );
};

function D3TypeHeader({ type, count }) {
  const t = EQ_TOKENS.equip[type];
  const label = ({
    plateLoaded: 'Plate-Loaded', selectorized: 'Selectorized', cable: 'Cable',
    rack: 'Rack', bench: 'Bench', cardio: 'Cardio',
  })[type];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px',
      background: EQ_TOKENS.bgApp,
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>
          <i className={`fas ${t.icon}`}></i>
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: t.fg, letterSpacing: '-0.005em' }}>{label}</span>
      </div>
      <span style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, fontWeight: 600 }}>{count}</span>
    </div>
  );
}

function D3CheckRow({ item, checked, disabled }) {
  const t = EQ_TOKENS.equip[item.type];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 16px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
      background: checked ? `${t.fg}10` : 'transparent',
      opacity: disabled ? 0.5 : 1,
    }}>
      <TypeIcon type={item.type} size={36} radius={10} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: EQ_TOKENS.textStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
        <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 2 }}>
          {disabled ? 'Already at this gym' : `${item.brand} · ${item.line}`}
        </div>
      </div>
      <div style={{
        width: 24, height: 24, borderRadius: 7,
        background: checked ? t.fg : 'transparent',
        border: `1.5px solid ${checked ? t.fg : EQ_TOKENS.borderLight}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {(checked || disabled) && <i className="fas fa-check" style={{ color: checked ? '#04201a' : EQ_TOKENS.textVeryMuted, fontSize: 12 }}></i>}
      </div>
    </div>
  );
}

// ── Machine detail — big colored hero
D3.MachineDetail = function ({ density }) {
  const item = EQ_DATA.items[0];
  const t = EQ_TOKENS.equip[item.type];
  return (
    <EqPhone>
      <PageHeader back title="" noBorder action={
        <button style={{
          width: 34, height: 34, borderRadius: 17,
          background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
          color: EQ_TOKENS.textMain, fontSize: 12,
        }}><i className="fas fa-ellipsis"></i></button>
      } />
      <ScrollArea>
        {/* Hero — gradient color band */}
        <div style={{
          padding: '20px 18px 22px',
          background: `linear-gradient(160deg, ${t.fg}30 0%, ${t.fg}08 60%, transparent 100%)`,
          borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -20, right: -20,
            width: 140, height: 140, borderRadius: '50%',
            background: `radial-gradient(circle, ${t.fg}24 0%, transparent 70%)`,
          }} />
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: t.bg, color: t.fg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
            marginBottom: 12,
          }}><i className={`fas ${t.icon}`}></i></div>
          <div style={{ fontSize: 20, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            {item.name}
          </div>
          <div style={{ fontSize: 12, color: EQ_TOKENS.textMuted, marginTop: 4 }}>
            {item.brand} · {item.line}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            <TypePill type={item.type} size="md" />
            <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: EQ_TOKENS.bp.chest + '26', color: EQ_TOKENS.bp.chest }}>Chest</span>
          </div>
        </div>

        <div style={{ padding: '14px 16px' }}>
          {/* Stats card */}
          <div style={{
            background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
            borderRadius: 14, padding: 14, marginBottom: 14,
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
          }}>
            {[
              { label: 'Sessions', value: '42' },
              { label: 'PR', value: '225×5' },
              { label: 'Last', value: '3d' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: EQ_TOKENS.textStrong, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{s.value}</div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: EQ_TOKENS.textVeryMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <D3Section title="3 exercises">
            {['Bench Press', 'Incline Press', 'Close-grip Press'].map(ex => (
              <D3InlineRow key={ex} icon="fa-dumbbell" tint={t.fg} label={ex} />
            ))}
          </D3Section>

          <D3Section title="2 gyms">
            {item.gyms.map(g => {
              const gym = EQ_DATA.gyms.find(x => x.id === g);
              return gym && <D3InlineRow key={g} icon="fa-location-dot" tint={gym.isCurrent ? EQ_TOKENS.primary : EQ_TOKENS.textMuted} label={gym.name} meta={gym.lastVisit} />;
            })}
          </D3Section>
        </div>
      </ScrollArea>
    </EqPhone>
  );
};

function D3Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: EQ_TOKENS.textVeryMuted,
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
      }}>{title}</div>
      <div style={{
        background: EQ_TOKENS.bgCard, borderRadius: 14,
        border: `1px solid ${EQ_TOKENS.borderSubtle}`,
        overflow: 'hidden',
      }}>{children}</div>
    </div>
  );
}

function D3InlineRow({ icon, tint, label, meta }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
    }}>
      <i className={`fas ${icon}`} style={{ color: tint, fontSize: 12, width: 16, textAlign: 'center' }}></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: EQ_TOKENS.textStrong }}>{label}</div>
        {meta && <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>{meta}</div>}
      </div>
      <i className="fas fa-chevron-right" style={{ fontSize: 9, color: EQ_TOKENS.textVeryMuted }}></i>
    </div>
  );
}

// ── History reconciliation — color-led
D3.History = function ({ density }) {
  return (
    <EqPhone>
      <PageHeader back title="Old names" subtitle="5 unmapped · we'll color them by guess" />
      <ScrollArea>
        <div style={{ padding: '12px 16px 16px' }}>
          {EQ_DATA.orphans.map(o => <D3Orphan key={o.id} o={o} />)}
        </div>
      </ScrollArea>
    </EqPhone>
  );
};

function D3Orphan({ o }) {
  // Map suggestion to type
  const suggType = o.suggestion?.toLowerCase().includes('bench') ? 'plateLoaded'
    : o.suggestion?.toLowerCase().includes('pulldown') ? 'cable'
    : o.suggestion?.toLowerCase().includes('rack') ? 'rack'
    : null;
  const t = suggType && EQ_TOKENS.equip[suggType];
  return (
    <div style={{
      background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
      borderRadius: 14, padding: 12, marginBottom: 10,
      borderLeft: `4px solid ${t ? t.fg : EQ_TOKENS.warm}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: o.suggestion ? 10 : 0 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11,
          background: t ? t.bg : EQ_TOKENS.warmBg,
          color: t ? t.fg : EQ_TOKENS.warm,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
        }}>
          <i className={`fas ${t ? t.icon : 'fa-circle-question'}`}></i>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: EQ_TOKENS.textStrong }}>"{o.name}"</div>
          <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 2 }}>{o.context}</div>
        </div>
      </div>
      {o.suggestion ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{
            flex: 1, padding: '8px 8px', borderRadius: 8,
            background: t ? t.fg : EQ_TOKENS.primary, color: '#04201a', border: 'none',
            fontSize: 11.5, fontWeight: 700, fontFamily: FONT,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <i className="fas fa-link" style={{ fontSize: 10 }}></i>
            Link → {o.suggestion.split('(')[0].trim()}
          </button>
          <button style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'transparent', color: EQ_TOKENS.textMuted,
            border: `1px solid ${EQ_TOKENS.border}`,
            fontSize: 11, fontWeight: 600, fontFamily: FONT,
          }}>Other</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{
            flex: 1, padding: '8px 8px', borderRadius: 8,
            background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
            fontSize: 11.5, fontWeight: 700, fontFamily: FONT,
          }}>Add as new</button>
          <button style={{
            flex: 1, padding: '8px 8px', borderRadius: 8,
            background: EQ_TOKENS.bgCardHi, color: EQ_TOKENS.textMain,
            border: `1px solid ${EQ_TOKENS.border}`,
            fontSize: 11.5, fontWeight: 700, fontFamily: FONT,
          }}>Pick from library</button>
          <button style={{
            padding: '8px 10px', borderRadius: 8,
            background: 'transparent', color: EQ_TOKENS.textVeryMuted,
            border: `1px solid ${EQ_TOKENS.border}`,
            fontSize: 11, fontWeight: 600, fontFamily: FONT,
          }}><i className="fas fa-xmark"></i></button>
        </div>
      )}
    </div>
  );
}

// ── Browse catalog — by TYPE, not brand
D3.Browse = function ({ density }) {
  const types = [
    { type: 'plateLoaded',  label: 'Plate-Loaded',  count: 312, desc: 'Iso-lateral & lever' },
    { type: 'selectorized', label: 'Selectorized',  count: 289, desc: 'Pin-loaded stack' },
    { type: 'cable',        label: 'Cable',         count: 184, desc: 'Pulley & crossover' },
    { type: 'rack',         label: 'Power Rack',    count: 92,  desc: 'Squat & half rack' },
    { type: 'bench',        label: 'Bench',         count: 144, desc: 'Flat / incline / decline' },
    { type: 'cardio',       label: 'Cardio',        count: 102, desc: 'Tread, bike, row, climber' },
    { type: 'dumbbell',     label: 'Dumbbell',      count: 88,  desc: 'Hex, urethane, sets' },
    { type: 'bodyweight',   label: 'Bodyweight',    count: 56,  desc: 'Bars, towers, rigs' },
  ];
  return (
    <EqPhone>
      <div style={{ padding: '4px 16px 8px', flexShrink: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em' }}>Atlas</div>
      </div>
      <ThreeTab value="catalog" />
      <ScrollArea>
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            fontSize: 11, color: EQ_TOKENS.textVeryMuted, marginBottom: 10,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>By equipment type</span>
            <span style={{ color: EQ_TOKENS.primary, fontWeight: 600 }}>By brand →</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {types.map(g => {
              const t = EQ_TOKENS.equip[g.type];
              return (
                <div key={g.type} style={{
                  padding: 12,
                  background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
                  borderRadius: 14, position: 'relative', overflow: 'hidden',
                  borderTop: `3px solid ${t.fg}`,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: t.bg, color: t.fg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                    marginBottom: 8,
                  }}><i className={`fas ${t.icon}`}></i></div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: EQ_TOKENS.textStrong, lineHeight: 1.15 }}>{g.label}</div>
                  <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 2, lineHeight: 1.3 }}>{g.desc}</div>
                  <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: t.fg, fontVariantNumeric: 'tabular-nums' }}>{g.count} machines</div>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
      <EqBottomNav active="more" />
    </EqPhone>
  );
};

Object.assign(window, { D3 });
