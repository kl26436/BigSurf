// Direction 4 — Body Map
// Novel: gym-first inventory rendered as anatomical coverage. Gym cards show
// a body silhouette tinted by what's tagged. Gym detail leads with a tappable
// anatomy view. Browse catalog organizes machines by body region first.
// Best for "what can I train at this gym?" rather than "what brand do they have?"

const D4 = {};

// ── Landing — gym cards with coverage silhouette
D4.Landing = function ({ density, showMeta }) {
  return (
    <EqPhone>
      <div style={{ padding: '4px 16px 6px', flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em' }}>My gyms</div>
        <div style={{ fontSize: 12, color: EQ_TOKENS.textVeryMuted, marginTop: 2 }}>
          Coverage by body region · tap a gym to drill in
        </div>
      </div>
      <ThreeTab value="gyms" />
      <ScrollArea>
        <div style={{ padding: '4px 16px 16px' }}>
          {EQ_DATA.gyms.map(g => <D4GymCard key={g.id} gym={g} />)}
        </div>
      </ScrollArea>
      <EqBottomNav active="more" />
    </EqPhone>
  );
};

function D4GymCard({ gym }) {
  const c = gym.coverage;
  // Best-covered region
  const sorted = Object.entries(c).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const weak = sorted[sorted.length - 1];
  return (
    <div style={{
      background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
      borderRadius: 16, padding: 14, marginBottom: 10,
      display: 'flex', gap: 14,
    }}>
      <div style={{ flexShrink: 0 }}>
        <BodySilhouette coverage={c} width={62} height={102} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: EQ_TOKENS.textStrong, letterSpacing: '-0.01em' }}>{gym.name}</span>
          {gym.isCurrent && (
            <span style={{
              fontSize: 8.5, padding: '1px 5px', borderRadius: 4,
              background: EQ_TOKENS.primary, color: '#04201a',
              fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>Here</span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginBottom: 8 }}>
          {gym.count} machines · {gym.lastVisit}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <CovBar label="Strongest" region={top[0]} value={top[1]} />
          <CovBar label="Sparse" region={weak[0]} value={weak[1]} muted />
        </div>
      </div>
    </div>
  );
}

function CovBar({ label, region, value, muted }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9, color: EQ_TOKENS.textVeryMuted, fontWeight: 700, width: 50, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 11, color: EQ_TOKENS.textStrong, fontWeight: 600, textTransform: 'capitalize' }}>{region}</span>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.round(value * 100)}%`, height: '100%',
          background: muted ? EQ_TOKENS.warm : EQ_TOKENS.primary,
        }} />
      </div>
    </div>
  );
}

// ── Gym detail — anatomy at top, region drill
D4.GymDetail = function ({ density, showMeta }) {
  const items = EQ_DATA.items.filter(i => i.gyms.includes('absolute') && i.bp === 'chest');
  const gym = EQ_DATA.gyms[0];
  return (
    <EqPhone>
      <PageHeader back title="Absolute Recomp" subtitle="Tap a region to see machines" noBorder />
      <div style={{ padding: '4px 16px 12px', display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
        <BodySilhouette coverage={gym.coverage} width={92} height={150} />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {['chest', 'back', 'legs', 'shoulders', 'arms', 'core'].map(bp => {
            const v = gym.coverage[bp] || 0;
            const active = bp === 'chest';
            return (
              <button key={bp} style={{
                padding: '7px 8px', borderRadius: 8,
                background: active ? EQ_TOKENS.primaryBg : EQ_TOKENS.bgCard,
                border: `1px solid ${active ? EQ_TOKENS.primaryBorder : EQ_TOKENS.borderSubtle}`,
                color: active ? EQ_TOKENS.primary : EQ_TOKENS.textMain,
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                fontFamily: FONT,
              }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'capitalize' }}>{bp}</span>
                <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', color: active ? EQ_TOKENS.primary : EQ_TOKENS.textStrong }}>
                  {Math.round(v * 14)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{
        padding: '12px 16px 8px',
        borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BPDot bp="chest" size={8} />
          <span style={{ fontSize: 14, fontWeight: 700, color: EQ_TOKENS.textStrong }}>Chest</span>
          <span style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted, fontWeight: 600 }}>· 4 machines</span>
        </div>
        <button style={{ background: 'transparent', border: 'none', color: EQ_TOKENS.primary, fontSize: 12, fontWeight: 600, fontFamily: FONT }}>
          <i className="fas fa-plus" style={{ marginRight: 4 }}></i>Add
        </button>
      </div>
      <ScrollArea>
        <div style={{ padding: '0 0 16px' }}>
          {items.map(it => <D4Row key={it.id} item={it} showMeta={showMeta} />)}
        </div>
      </ScrollArea>
    </EqPhone>
  );
};

function D4Row({ item, showMeta = true }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 16px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
    }}>
      <TypeIcon type={item.type} size={36} radius={10} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: EQ_TOKENS.textStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
        {showMeta && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 2,
          }}>
            {item.brand} · {item.line}
            <TypePill type={item.type} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {item.exercises.slice(0, 1).map(e => (
          <span key={e} style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, fontWeight: 500 }}>{item.exercises.length} ex</span>
        ))}
        <i className="fas fa-chevron-right" style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginLeft: 4 }}></i>
      </div>
    </div>
  );
}

// ── Quick-add — region-led, then catalog
D4.QuickAdd = function ({ density }) {
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
        <div style={{ padding: '4px 16px 10px', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: EQ_TOKENS.textStrong }}>What did you see?</div>
          <div style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>Search by name, or tap the area you're standing in</div>
        </div>
        {/* Search */}
        <div style={{
          margin: '0 16px 12px', padding: '11px 14px',
          background: EQ_TOKENS.bgCard, borderRadius: 12,
          border: `1px solid ${EQ_TOKENS.border}`,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <i className="fas fa-magnifying-glass" style={{ color: EQ_TOKENS.textVeryMuted, fontSize: 13 }}></i>
          <div style={{ flex: 1, fontSize: 13.5, color: EQ_TOKENS.textVeryMuted }}>Machine name or brand…</div>
        </div>
        {/* Body picker */}
        <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
          <BodySilhouette coverage={{ chest: 0.85 }} width={62} height={104} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: EQ_TOKENS.textVeryMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Or tap a region</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {[
                { id: 'chest', label: 'Chest', active: true },
                { id: 'back', label: 'Back' },
                { id: 'legs', label: 'Legs' },
                { id: 'shoulders', label: 'Shoulders' },
                { id: 'arms', label: 'Arms' },
                { id: 'core', label: 'Core' },
              ].map(b => (
                <button key={b.id} style={{
                  padding: '6px 10px', borderRadius: 8,
                  background: b.active ? EQ_TOKENS.bp[b.id] + '26' : 'transparent',
                  border: `1px solid ${b.active ? EQ_TOKENS.bp[b.id] : EQ_TOKENS.border}`,
                  color: b.active ? EQ_TOKENS.bp[b.id] : EQ_TOKENS.textMuted,
                  fontSize: 11, fontWeight: 600, fontFamily: FONT,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  {b.label}
                  <span style={{ fontSize: 9, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                    {b.id === 'chest' ? 4 : b.id === 'back' ? 6 : b.id === 'legs' ? 8 : 3}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Heading */}
        <div style={{
          padding: '10px 16px 6px',
          fontSize: 10.5, fontWeight: 700, color: EQ_TOKENS.bp.chest,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`,
          background: EQ_TOKENS.bgApp,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>Chest machines · catalog</span>
          <span style={{ color: EQ_TOKENS.textVeryMuted, fontWeight: 600 }}>4 unselected</span>
        </div>
        <ScrollArea>
          <D4QuickAddRow item={EQ_DATA.items[0]} checked />
          <D4QuickAddRow item={EQ_DATA.items[1]} />
          <D4QuickAddRow item={EQ_DATA.items[2]} disabled />
          <D4QuickAddRow item={EQ_DATA.items[3]} checked />
        </ScrollArea>
        <div style={{ padding: '10px 16px 18px', background: 'rgba(13,18,24,0.96)', borderTop: `1px solid ${EQ_TOKENS.borderSubtle}` }}>
          <button style={{
            width: '100%', padding: '13px', borderRadius: 999,
            background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
            fontSize: 13.5, fontWeight: 800, fontFamily: FONT,
          }}>
            Add 2 to gym
          </button>
        </div>
      </div>
    </EqPhone>
  );
};

function D4QuickAddRow({ item, checked, disabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
      opacity: disabled ? 0.5 : 1,
      background: checked ? 'rgba(29,211,176,0.05)' : 'transparent',
    }}>
      <TypeIcon type={item.type} size={32} radius={9} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: EQ_TOKENS.textStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
        <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>
          {disabled ? 'Already tagged' : `${item.brand} · ${item.line}`}
        </div>
      </div>
      <div style={{
        width: 24, height: 24, borderRadius: 7,
        background: checked ? EQ_TOKENS.primary : 'transparent',
        border: `1.5px solid ${checked ? EQ_TOKENS.primary : EQ_TOKENS.borderLight}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {(checked || disabled) && <i className="fas fa-check" style={{ color: checked ? '#04201a' : EQ_TOKENS.textVeryMuted, fontSize: 12 }}></i>}
      </div>
    </div>
  );
}

// ── Machine detail — body region highlighted
D4.MachineDetail = function ({ density }) {
  const item = EQ_DATA.items[0];
  return (
    <EqPhone>
      <PageHeader back title="" noBorder />
      <ScrollArea>
        <div style={{ padding: '4px 16px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <BodySilhouette coverage={{ chest: 1 }} width={68} height={112} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, color: EQ_TOKENS.bp.chest, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Targets · Chest
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {item.name}
            </div>
            <div style={{ fontSize: 12, color: EQ_TOKENS.textMuted, marginTop: 4 }}>
              {item.brand} · {item.line}
            </div>
            <div style={{ marginTop: 8 }}>
              <TypePill type={item.type} size="md" />
            </div>
          </div>
        </div>

        <SectionLabel pad={16}>What it trains</SectionLabel>
        <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {item.exercises.map(ex => (
            <span key={ex} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 999,
              background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
              fontSize: 12, fontWeight: 600, color: EQ_TOKENS.textMain,
            }}>
              <i className="fas fa-dumbbell" style={{ fontSize: 10, color: EQ_TOKENS.primary }}></i>
              {ex}
            </span>
          ))}
        </div>

        <SectionLabel pad={16}>Your numbers</SectionLabel>
        <div style={{
          margin: '0 16px 14px',
          background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
          borderRadius: 14, padding: 14,
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center',
        }}>
          {[
            { v: '42', l: 'Sessions' },
            { v: '225', l: 'PR · lb' },
            { v: '3d', l: 'Last' },
          ].map(s => (
            <div key={s.l}>
              <div style={{ fontSize: 19, fontWeight: 800, color: EQ_TOKENS.textStrong, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{s.v}</div>
              <div style={{ fontSize: 9.5, color: EQ_TOKENS.textVeryMuted, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 3 }}>{s.l}</div>
            </div>
          ))}
        </div>

        <SectionLabel pad={16}>Available at</SectionLabel>
        {item.gyms.map(gId => {
          const g = EQ_DATA.gyms.find(x => x.id === gId);
          return g && (
            <div key={gId} style={{
              margin: '0 16px 6px', padding: '10px 12px',
              background: EQ_TOKENS.bgCard, border: `1px solid ${g.isCurrent ? EQ_TOKENS.primaryBorder : EQ_TOKENS.borderSubtle}`,
              borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <i className="fas fa-location-dot" style={{ color: g.isCurrent ? EQ_TOKENS.primary : EQ_TOKENS.textMuted, fontSize: 14 }}></i>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: EQ_TOKENS.textStrong }}>{g.name}</div>
                <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>{g.lastVisit}</div>
              </div>
              {g.isCurrent && <span style={{ fontSize: 8.5, padding: '1px 5px', borderRadius: 4, background: EQ_TOKENS.primary, color: '#04201a', fontWeight: 800, letterSpacing: '0.04em' }}>HERE</span>}
            </div>
          );
        })}
        <div style={{ height: 14 }} />
      </ScrollArea>
    </EqPhone>
  );
};

// ── History reconciliation — body-tinted suggestions
D4.History = function ({ density }) {
  return (
    <EqPhone>
      <PageHeader back title="Reconcile" subtitle="5 old names · we'll group by body region" />
      <ScrollArea>
        <div style={{ padding: '8px 0 16px' }}>
          <D4OrphanGroup bp="chest" orphans={[EQ_DATA.orphans[0]]} />
          <D4OrphanGroup bp="back" orphans={[EQ_DATA.orphans[1], EQ_DATA.orphans[4]]} />
          <D4OrphanGroup bp="legs" orphans={[EQ_DATA.orphans[3]]} />
          <D4OrphanGroup bp="arms" orphans={[EQ_DATA.orphans[2]]} />
        </div>
      </ScrollArea>
    </EqPhone>
  );
};

function D4OrphanGroup({ bp, orphans }) {
  const c = EQ_TOKENS.bp[bp];
  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`, borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
        background: EQ_TOKENS.bgApp,
      }}>
        <span style={{ width: 4, height: 12, borderRadius: 2, background: c }}></span>
        <span style={{ fontSize: 11, fontWeight: 700, color: c, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{bp}</span>
        <span style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, fontWeight: 600 }}>{orphans.length}</span>
      </div>
      {orphans.map(o => (
        <div key={o.id} style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: EQ_TOKENS.textStrong }}>"{o.name}"</div>
              <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>{o.context}</div>
              {o.suggestion && (
                <div style={{ fontSize: 11, color: EQ_TOKENS.textMain, marginTop: 6 }}>
                  → <strong style={{ color: c }}>{o.suggestion}</strong>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <button style={{
                padding: '5px 10px', borderRadius: 6,
                background: o.suggestion ? c : EQ_TOKENS.primary, color: '#04201a', border: 'none',
                fontSize: 11, fontWeight: 700, fontFamily: FONT,
              }}>{o.suggestion ? 'Link' : 'Add'}</button>
              <button style={{
                padding: '5px 10px', borderRadius: 6,
                background: 'transparent', color: EQ_TOKENS.textVeryMuted,
                border: `1px solid ${EQ_TOKENS.border}`,
                fontSize: 11, fontWeight: 600, fontFamily: FONT,
              }}>Skip</button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// ── Browse catalog — by body region first
D4.Browse = function ({ density }) {
  const regions = [
    { bp: 'chest', count: 184 },
    { bp: 'back', count: 226 },
    { bp: 'legs', count: 312 },
    { bp: 'shoulders', count: 142 },
    { bp: 'arms', count: 188 },
    { bp: 'core', count: 64 },
    { bp: 'cardio', count: 102 },
  ];
  return (
    <EqPhone>
      <div style={{ padding: '4px 16px 8px', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em' }}>Browse</div>
        <div style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted, marginTop: 2 }}>1,304 machines · by region</div>
      </div>
      <ThreeTab value="catalog" />
      <ScrollArea>
        <div style={{ padding: '4px 16px 16px' }}>
          {/* Full body picker */}
          <div style={{
            background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
            borderRadius: 16, padding: 14, marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <BodySilhouette coverage={Object.fromEntries(regions.map(r => [r.bp, 1]))} width={70} height={114} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: EQ_TOKENS.textVeryMuted, marginBottom: 4, fontWeight: 600 }}>Total in catalog</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                1,304
              </div>
              <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 4 }}>across 21 brands</div>
            </div>
          </div>
          {/* Region rows */}
          {regions.map(r => (
            <div key={r.bp} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', marginBottom: 6,
              background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
              borderRadius: 12,
            }}>
              <span style={{
                width: 36, height: 36, borderRadius: 10,
                background: EQ_TOKENS.bp[r.bp] + '22',
                color: EQ_TOKENS.bp[r.bp],
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}>
                <BPDot bp={r.bp} size={10} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: EQ_TOKENS.textStrong, textTransform: 'capitalize' }}>{r.bp}</div>
                <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>
                  {r.count} machines · 18 brands
                </div>
              </div>
              <i className="fas fa-chevron-right" style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted }}></i>
            </div>
          ))}
        </div>
      </ScrollArea>
      <EqBottomNav active="more" />
    </EqPhone>
  );
};

Object.assign(window, { D4 });
