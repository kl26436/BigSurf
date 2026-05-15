// Exercise Library — Pocket Inventory vocabulary
// Reuses D2's row/group/section primitives so equipment & exercise pages
// read as the same app. Tabs (All / Favorites / Recent), body-part filter
// chips, equipment-type icons on each row, dense metadata.

const EX_DATA = {
  // Compact exercise list. equipType references EQ_TOKENS.equip keys
  // so the row icons match the equipment library.
  exercises: [
    // Chest
    { id: 'e1',  name: 'Bench Press',          bp: 'chest',  equipType: 'barbell',     equipment: 'Olympic barbell',  pr: '225 ×5',  last: '3d', uses: 42, fav: true },
    { id: 'e2',  name: 'Incline Press',        bp: 'chest',  equipType: 'plateLoaded', equipment: 'Incline Chest Press 2', pr: '185 ×8', last: '6d', uses: 28 },
    { id: 'e3',  name: 'Cable Fly',            bp: 'chest',  equipType: 'cable',       equipment: 'Cable Crossover',  pr: '40 ×12',  last: '6d', uses: 31, fav: true },
    { id: 'e4',  name: 'Push-up',              bp: 'chest',  equipType: 'bodyweight',  equipment: 'Bodyweight',       pr: '40 reps', last: '10d', uses: 14 },
    { id: 'e5',  name: 'Dumbbell Bench Press', bp: 'chest',  equipType: 'dumbbell',    equipment: 'Dumbbell rack',    pr: '80 ×8',   last: '12d', uses: 9 },
    // Back
    { id: 'e6',  name: 'Pull-up',              bp: 'back',   equipType: 'bodyweight',  equipment: 'Pullup Tower',     pr: 'BW+45',   last: 'Sun', uses: 36, fav: true },
    { id: 'e7',  name: 'Lat Pulldown',         bp: 'back',   equipType: 'cable',       equipment: 'Lat Pulldown',     pr: '180 ×8',  last: 'Mon', uses: 38 },
    { id: 'e8',  name: 'Seated Row',           bp: 'back',   equipType: 'cable',       equipment: 'Seated Cable Row', pr: '160 ×10', last: '3 wk', uses: 17 },
    { id: 'e9',  name: 'Iso Row',              bp: 'back',   equipType: 'plateLoaded', equipment: 'Iso-Row',          pr: '90 ×8',   last: '6d', uses: 22 },
    { id: 'e10', name: 'Deadlift',             bp: 'back',   equipType: 'barbell',     equipment: 'Olympic barbell',  pr: '405 ×3',  last: 'Tue', uses: 48, fav: true },
    // Legs
    { id: 'e11', name: 'Back Squat',           bp: 'legs',   equipType: 'rack',        equipment: 'Power Rack',       pr: '315 ×5',  last: 'Tue', uses: 56, fav: true },
    { id: 'e12', name: 'Hack Squat',           bp: 'legs',   equipType: 'plateLoaded', equipment: 'Hack Squat',       pr: '4 plates×6', last: 'Fri', uses: 24 },
    { id: 'e13', name: 'Leg Press',            bp: 'legs',   equipType: 'plateLoaded', equipment: 'Leg Press 45°',    pr: '6 plates×10', last: 'Fri', uses: 31 },
    { id: 'e14', name: 'Leg Extension',        bp: 'legs',   equipType: 'selectorized',equipment: 'Leg Extension',    pr: '170 ×12', last: 'Fri', uses: 26 },
    { id: 'e15', name: 'Leg Curl',             bp: 'legs',   equipType: 'selectorized',equipment: 'Lying Leg Curl',   pr: '120 ×10', last: 'Fri', uses: 22 },
    // Shoulders
    { id: 'e16', name: 'Shoulder Press',       bp: 'shoulders', equipType: 'plateLoaded', equipment: 'Shoulder Press', pr: '150 ×6', last: '5d', uses: 18 },
    { id: 'e17', name: 'Lateral Raise',        bp: 'shoulders', equipType: 'selectorized', equipment: 'Lateral Raise',pr: '25 ×12', last: '8d', uses: 14 },
    // Arms
    { id: 'e18', name: 'Preacher Curl',        bp: 'arms', equipType: 'bench',        equipment: 'Preacher Curl',    pr: '70 ×8',   last: '4d', uses: 19 },
    { id: 'e19', name: 'Tricep Pushdown',      bp: 'arms', equipType: 'cable',        equipment: 'Tricep Pushdown',  pr: '70 ×12',  last: '4d', uses: 24, fav: true },
    { id: 'e20', name: 'Dumbbell Curl',        bp: 'arms', equipType: 'dumbbell',     equipment: 'Dumbbell rack',    pr: '40 ×8',   last: 'Mon', uses: 20 },
    // Core
    { id: 'e21', name: 'Plank',                bp: 'core', equipType: 'bodyweight',   equipment: 'Bodyweight',       pr: '3:20',    last: '2 wk', uses: 12 },
    { id: 'e22', name: 'Cable Crunch',         bp: 'core', equipType: 'cable',        equipment: 'Cable Crossover',  pr: '120 ×15', last: '8d', uses: 8 },
  ],
};

// ── Exercise Library — main screen
function ExLibrary({ density, showMeta, onPick, onBack, onTabSwitch, activeTab = 'all', accent }) {
  const a = accent || EQ_TOKENS.primary;
  const visible = EX_DATA.exercises.filter(ex => {
    if (activeTab === 'favs') return ex.fav;
    if (activeTab === 'recent') return ex.uses >= 24;
    return true;
  });
  const grouped = groupExBp(visible);

  return (
    <EqPhone>
      {/* Header */}
      <div style={{ padding: '6px 14px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onBack && (
            <button onClick={onBack} style={{
              width: 30, height: 30, borderRadius: 15,
              background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
              color: EQ_TOKENS.textMain, fontSize: 12, cursor: 'pointer',
            }}><i className="fas fa-chevron-left"></i></button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.01em' }}>Exercises</div>
            <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>
              {EX_DATA.exercises.length} in your library
            </div>
          </div>
          <button style={{
            width: 34, height: 34, borderRadius: 17,
            background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
            color: EQ_TOKENS.textMain, fontSize: 12, cursor: 'pointer',
          }}><i className="fas fa-plus"></i></button>
        </div>
      </div>
      {/* Library / Equipment context toggle */}
      {onTabSwitch && (
        <div style={{
          display: 'flex', gap: 4, padding: '4px',
          margin: '0 14px 8px',
          background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
          borderRadius: 999, flexShrink: 0,
        }}>
          <SegBtn label="Exercises" active onClick={() => {}} accent={a} />
          <SegBtn label="Equipment" onClick={() => onTabSwitch('equipment')} accent={a} />
        </div>
      )}
      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: 14, padding: '4px 16px 8px',
        borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
        flexShrink: 0,
      }}>
        {[
          { id: 'all',    label: 'All',     count: EX_DATA.exercises.length },
          { id: 'favs',   label: 'Favorites', count: EX_DATA.exercises.filter(e => e.fav).length },
          { id: 'recent', label: 'Recent',  count: EX_DATA.exercises.filter(e => e.uses >= 24).length },
          { id: 'custom', label: 'Custom',  count: 3 },
        ].map(tt => {
          const active = activeTab === tt.id;
          return (
            <div key={tt.id} style={{
              padding: '6px 0 6px',
              color: active ? EQ_TOKENS.textStrong : EQ_TOKENS.textVeryMuted,
              fontSize: 12.5, fontWeight: 700,
              borderBottom: `2px solid ${active ? a : 'transparent'}`,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              {tt.label}
              <span style={{
                fontSize: 9.5, padding: '1px 5px', borderRadius: 999,
                background: active ? `${a}1f` : EQ_TOKENS.mutedBg,
                color: active ? a : EQ_TOKENS.textVeryMuted,
                fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              }}>{tt.count}</span>
            </div>
          );
        })}
      </div>
      {/* Search */}
      <div style={{
        margin: '10px 14px 6px',
        padding: '8px 12px',
        background: EQ_TOKENS.bgCard, borderRadius: 10,
        border: `1px solid ${EQ_TOKENS.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        <i className="fas fa-magnifying-glass" style={{ color: EQ_TOKENS.textVeryMuted, fontSize: 12 }}></i>
        <div style={{ flex: 1, fontSize: 13, color: EQ_TOKENS.textVeryMuted }}>Search exercises…</div>
      </div>
      {/* Body part filter chips */}
      <div style={{
        padding: '6px 12px 10px', display: 'flex', gap: 5, overflowX: 'auto',
        flexShrink: 0,
      }} className="bs-scroll">
        {EQ_DATA.bodyParts.map((bp, i) => (
          <Chip key={bp} active={i === 0} size="sm"
            count={i === 0 ? visible.length : Math.max(2, visible.filter(e => e.bp === bp.toLowerCase()).length)}>
            {bp}
          </Chip>
        ))}
      </div>
      {/* Suggested chips */}
      <div style={{
        padding: '0 14px 10px',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 9.5, fontWeight: 700, color: EQ_TOKENS.textVeryMuted,
          letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <i className="fas fa-location-dot" style={{ color: a, fontSize: 9 }}></i>
          For Absolute Recomp
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {EX_DATA.exercises.filter(e => e.fav).slice(0, 4).map(ex => (
            <button key={ex.id} onClick={() => onPick && onPick(ex)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 999,
              background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
              color: EQ_TOKENS.textStrong, fontSize: 11, fontWeight: 600, fontFamily: FONT,
              cursor: 'pointer',
            }}>
              <TypeIcon type={ex.equipType} size={16} radius={4} />
              {ex.name}
            </button>
          ))}
        </div>
      </div>
      <ScrollArea>
        <div style={{ padding: '0 0 16px' }}>
          {Object.entries(grouped).map(([bp, xs]) => (
            <React.Fragment key={bp}>
              <D2GroupHeader bp={bp} count={xs.length} />
              {xs.map(ex => (
                <ExRow key={ex.id} ex={ex} onPick={onPick} showMeta={showMeta} />
              ))}
            </React.Fragment>
          ))}
        </div>
      </ScrollArea>
    </EqPhone>
  );
}

function SegBtn({ label, active, onClick, accent }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '7px 6px', borderRadius: 999,
      background: active ? 'rgba(29,211,176,0.20)' : 'transparent',
      border: 'none', color: active ? accent : EQ_TOKENS.textMuted,
      fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
    }}>{label}</button>
  );
}

function groupExBp(items) {
  const order = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];
  const out = {};
  for (const bp of order) {
    const xs = items.filter(i => i.bp === bp);
    if (xs.length) out[bp] = xs;
  }
  return out;
}

function ExRow({ ex, onPick, showMeta = true }) {
  return (
    <button onClick={() => onPick && onPick(ex)} style={{
      width: '100%',
      display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
      alignItems: 'center', gap: 10,
      padding: '8px 14px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
      background: 'transparent', border: 'none', borderLeft: 'none', borderRight: 'none', borderTop: 'none',
      textAlign: 'left', cursor: 'pointer', fontFamily: FONT,
    }}>
      <TypeIcon type={ex.equipType} size={28} radius={7} />
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 12.5, fontWeight: 600, color: EQ_TOKENS.textStrong,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {ex.name}
          {ex.fav && <i className="fas fa-star" style={{ fontSize: 9, color: EQ_TOKENS.gold }}></i>}
        </div>
        {showMeta && (
          <div style={{
            fontSize: 9.5, color: EQ_TOKENS.textVeryMuted, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{ex.equipment}</div>
        )}
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, color: EQ_TOKENS.textMain,
        fontVariantNumeric: 'tabular-nums', textAlign: 'right',
      }}>
        {ex.pr}
        <div style={{ fontSize: 9, fontWeight: 500, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>PR</div>
      </span>
      <span style={{ fontSize: 9.5, color: EQ_TOKENS.textVeryMuted, fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{ex.last}</span>
    </button>
  );
}

// ── Exercise Detail
function ExDetail({ ex, onBack, accent }) {
  if (!ex) ex = EX_DATA.exercises[0];
  const a = accent || EQ_TOKENS.primary;
  const t = EQ_TOKENS.equip[ex.equipType];
  return (
    <EqPhone>
      <PageHeader back={!!onBack} title={ex.name} subtitle={ex.equipment}
        action={
          <button style={{
            width: 34, height: 34, borderRadius: 17,
            background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
            color: ex.fav ? EQ_TOKENS.gold : EQ_TOKENS.textMain, fontSize: 12,
          }}><i className={`fa${ex.fav ? 's' : 'r'} fa-star`}></i></button>
        }
      />
      <ScrollArea>
        <div style={{ padding: '10px 14px 4px' }}>
          {/* Stat grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
            <D2Stat label="Sessions" value={String(ex.uses)} sub="lifetime" />
            <D2Stat label="PR" value={ex.pr} sub="best ever" />
            <D2Stat label="Last" value={ex.last} sub="ago" />
          </div>
          {/* Tag row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <span style={{
              padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: EQ_TOKENS.bp[ex.bp] + '26', color: EQ_TOKENS.bp[ex.bp],
              textTransform: 'capitalize',
            }}>{ex.bp}</span>
            <TypePill type={ex.equipType} size="md" />
          </div>
        </div>

        <D2SectionLabel>Recent sessions</D2SectionLabel>
        {[
          { date: 'Tue · Apr 14', sets: '225 ×5, 215 ×6, 205 ×7', volume: '4,755 lb' },
          { date: 'Sat · Apr 11', sets: '215 ×5, 215 ×5, 205 ×6', volume: '4,375 lb' },
          { date: 'Tue · Apr  7', sets: '215 ×4, 205 ×6, 195 ×6', volume: '3,920 lb' },
        ].map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 14px',
            borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: i === 0 ? EQ_TOKENS.warmBg : EQ_TOKENS.bgCardHi,
              color: i === 0 ? EQ_TOKENS.warm : EQ_TOKENS.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, flexShrink: 0,
            }}><i className={`fas ${i === 0 ? 'fa-fire' : 'fa-dumbbell'}`}></i></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: EQ_TOKENS.textStrong }}>{s.date}</div>
              <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>{s.sets}</div>
            </div>
            <div style={{
              fontSize: 12, fontWeight: 700, color: EQ_TOKENS.textStrong,
              fontVariantNumeric: 'tabular-nums', textAlign: 'right',
            }}>{s.volume}</div>
          </div>
        ))}

        <D2SectionLabel>Used at</D2SectionLabel>
        {[
          { gym: 'Absolute Recomp', meta: 'Austin · 42 sessions', here: true },
          { gym: 'Strip District',  meta: 'Las Vegas · 4 sessions' },
        ].map((g, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 14px',
            borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
          }}>
            <i className="fas fa-location-dot" style={{
              color: g.here ? a : EQ_TOKENS.textMuted, fontSize: 13, width: 18, textAlign: 'center',
            }}></i>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: EQ_TOKENS.textStrong }}>
                {g.gym}
                {g.here && <span style={{ fontSize: 8.5, padding: '1px 5px', borderRadius: 4, background: a, color: '#04201a', fontWeight: 800, letterSpacing: '0.04em' }}>HERE</span>}
              </div>
              <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>{g.meta}</div>
            </div>
            <i className="fas fa-chevron-right" style={{ fontSize: 9, color: EQ_TOKENS.textVeryMuted }}></i>
          </div>
        ))}

        <D2SectionLabel>Equipment that does this</D2SectionLabel>
        {EQ_DATA.items.filter(i => i.exercises.some(e => e === ex.name || e.toLowerCase().includes(ex.name.toLowerCase().split(' ')[0]))).slice(0, 4).map(it => (
          <D2Row key={it.id} item={it} showMeta />
        ))}
        <div style={{ height: 16 }} />
      </ScrollArea>
      <div style={{
        padding: '10px 14px 14px',
        background: 'rgba(13,18,24,0.96)',
        borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`,
        display: 'flex', gap: 8, flexShrink: 0,
      }}>
        <button style={{
          flex: 1, padding: '13px', borderRadius: 999,
          background: a, color: '#04201a', border: 'none',
          fontSize: 13.5, fontWeight: 800, fontFamily: FONT,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: `0 8px 24px ${a}40`, cursor: 'pointer',
        }}>
          <i className="fas fa-plus"></i> Add to workout
        </button>
        <button style={{
          width: 48, height: 48, borderRadius: 24,
          background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
          color: EQ_TOKENS.textMain, fontSize: 13,
        }}><i className="fas fa-chart-line"></i></button>
      </div>
    </EqPhone>
  );
}

Object.assign(window, { EX_DATA, ExLibrary, ExDetail });
