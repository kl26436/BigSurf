// Direction 2 — Pocket Inventory
// Dense / power-user. More info per row, more metadata, count chips everywhere.
// For people managing big multi-gym libraries. Trades whitespace for context.

const D2 = {};

// ── Landing — gym cards w/ type-stack strip
D2.Landing = function ({ density, showMeta, nav, accent }) {
  const a = accent || EQ_TOKENS.primary;
  return (
    <EqPhone>
      <div style={{ padding: '6px 14px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em' }}>Library</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <CircBtn icon="fa-magnifying-glass" />
          <CircBtn icon="fa-bars-staggered" />
        </div>
      </div>
      {nav && <LibToggle current="equipment" nav={nav} accent={a} />}
      <CompactTabs value="gyms" onChange={nav && ((v) => v === 'catalog' && nav.goBrowse?.())} />
      <ScrollArea>
        <div style={{ padding: '0 12px 14px' }}>
          {nav && (
            <div onClick={() => nav.goHistory?.()} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', marginBottom: 8,
              background: EQ_TOKENS.warningBg, border: `1px solid ${EQ_TOKENS.warningBorder}`,
              borderRadius: 10, cursor: 'pointer',
            }}>
              <i className="fas fa-circle-exclamation" style={{ color: EQ_TOKENS.warning, fontSize: 12 }}></i>
              <div style={{ flex: 1, fontSize: 11.5, color: EQ_TOKENS.textStrong, fontWeight: 600 }}>
                5 names from your history aren't in your library
              </div>
              <span style={{ fontSize: 11, color: EQ_TOKENS.warning, fontWeight: 700 }}>Review →</span>
            </div>
          )}
          {/* Compact stat strip */}
          <div style={{
            display: 'flex', gap: 6, marginBottom: 10,
          }}>
            <StatStrip label="Gyms" value="4" />
            <StatStrip label="Machines" value="89" />
            <StatStrip label="Brands" value="14" />
            <StatStrip label="Orphans" value="5" warn />
          </div>
          {EQ_DATA.gyms.map(g => (
            <D2GymCard key={g.id} gym={g} showMeta={showMeta}
              onClick={nav && (() => nav.goGym?.(g.id))} />
          ))}
        </div>
      </ScrollArea>
      <EqBottomNav active="more" />
    </EqPhone>
  );
};

function LibToggle({ current, nav, accent }) {
  return (
    <div style={{
      display: 'flex', gap: 4, padding: 4,
      margin: '0 14px 8px',
      background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
      borderRadius: 999, flexShrink: 0,
    }}>
      <button onClick={() => nav?.goEx?.()} style={{
        flex: 1, padding: '7px 6px', borderRadius: 999,
        background: current === 'exercises' ? 'rgba(29,211,176,0.20)' : 'transparent',
        border: 'none', color: current === 'exercises' ? accent : EQ_TOKENS.textMuted,
        fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
      }}>Exercises</button>
      <button onClick={() => nav?.goEquipLanding?.()} style={{
        flex: 1, padding: '7px 6px', borderRadius: 999,
        background: current === 'equipment' ? 'rgba(29,211,176,0.20)' : 'transparent',
        border: 'none', color: current === 'equipment' ? accent : EQ_TOKENS.textMuted,
        fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
      }}>Equipment</button>
    </div>
  );
}

function CircBtn({ icon }) {
  return (
    <button style={{
      width: 34, height: 34, borderRadius: 17,
      background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
      color: EQ_TOKENS.textMain, fontSize: 12,
    }}><i className={`fas ${icon}`}></i></button>
  );
}

function CompactTabs({ value, onChange }) {
  const tabs = [
    { id: 'gyms', label: 'Gyms', count: 4 },
    { id: 'library', label: 'Library', count: 89 },
    { id: 'catalog', label: 'Catalog', count: '1.3k' },
  ];
  return (
    <div style={{
      display: 'flex', gap: 16, padding: '4px 16px 10px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
      flexShrink: 0,
    }}>
      {tabs.map(t => {
        const active = (value || 'gyms') === t.id;
        return (
          <button key={t.id} onClick={() => onChange && onChange(t.id)} style={{
            background: 'transparent', border: 'none', padding: '8px 0 6px',
            cursor: 'pointer',
            color: active ? EQ_TOKENS.textStrong : EQ_TOKENS.textVeryMuted,
            fontSize: 13, fontWeight: 700, fontFamily: FONT,
            borderBottom: `2px solid ${active ? EQ_TOKENS.primary : 'transparent'}`,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {t.label}
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 999,
              background: active ? EQ_TOKENS.primaryBg : EQ_TOKENS.mutedBg,
              color: active ? EQ_TOKENS.primary : EQ_TOKENS.textVeryMuted,
              fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            }}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatStrip({ label, value, warn }) {
  return (
    <div style={{
      flex: 1, padding: '8px 6px',
      background: warn ? EQ_TOKENS.warningBg : EQ_TOKENS.bgCard,
      border: `1px solid ${warn ? EQ_TOKENS.warningBorder : EQ_TOKENS.borderSubtle}`,
      borderRadius: 10, textAlign: 'center',
    }}>
      <div style={{
        fontSize: 16, fontWeight: 800,
        color: warn ? EQ_TOKENS.warning : EQ_TOKENS.textStrong,
        letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>{value}</div>
      <div style={{
        fontSize: 9, fontWeight: 700, color: EQ_TOKENS.textVeryMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3,
      }}>{label}</div>
    </div>
  );
}

function D2GymCard({ gym, onClick }) {
  // Synthesize a type breakdown
  const breakdown = [
    { type: 'plateLoaded', count: Math.round(gym.count * 0.32) },
    { type: 'selectorized', count: Math.round(gym.count * 0.22) },
    { type: 'cable', count: Math.round(gym.count * 0.18) },
    { type: 'rack', count: Math.round(gym.count * 0.10) },
    { type: 'cardio', count: Math.round(gym.count * 0.10) },
    { type: 'other', count: Math.round(gym.count * 0.08) },
  ].filter(b => b.count > 0);
  return (
    <div onClick={onClick} style={{
      background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
      borderRadius: 12, padding: '10px 12px', marginBottom: 8,
      borderLeft: gym.isCurrent ? `3px solid ${EQ_TOKENS.primary}` : `3px solid transparent`,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: EQ_TOKENS.textStrong }}>{gym.name}</span>
            {gym.isCurrent && (
              <span style={{
                fontSize: 8.5, padding: '1px 5px', borderRadius: 4,
                background: EQ_TOKENS.primary, color: '#04201a',
                fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>Here</span>
            )}
          </div>
          <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 2 }}>
            {gym.city || 'No location'} · {gym.lastVisit}
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: EQ_TOKENS.textStrong, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
          {gym.count}
        </div>
        <i className="fas fa-chevron-right" style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginLeft: 4 }}></i>
      </div>
      {/* Type breakdown bar */}
      <div style={{ marginTop: 8, display: 'flex', borderRadius: 4, overflow: 'hidden', height: 6 }}>
        {breakdown.map((b, i) => (
          <div key={i} style={{
            flex: b.count, background: EQ_TOKENS.equip[b.type]?.fg || EQ_TOKENS.textVeryMuted,
            opacity: 0.85,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        {breakdown.slice(0, 4).map((b, i) => {
          const t = EQ_TOKENS.equip[b.type];
          const label = ({
            plateLoaded: 'Plate', selectorized: 'Select', cable: 'Cable',
            rack: 'Rack', bench: 'Bench', cardio: 'Cardio', other: 'Other',
          })[b.type] || b.type;
          return (
            <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: t.fg }}></span>
              <span style={{ color: EQ_TOKENS.textMuted }}>{label}</span>
              <span style={{ color: EQ_TOKENS.textVeryMuted, fontVariantNumeric: 'tabular-nums' }}>{b.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Gym detail — dense list, body-part as chips + sticky group headers
D2.GymDetail = function ({ density, showMeta, nav, gymId }) {
  const gym = EQ_DATA.gyms.find(g => g.id === (gymId || 'absolute')) || EQ_DATA.gyms[0];
  const items = EQ_DATA.items.filter(i => i.gyms.includes('absolute'));
  const grouped = groupByBp2(items);
  return (
    <EqPhone>
      <div style={{ padding: '6px 14px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => nav?.goBack?.()} style={{
            width: 30, height: 30, borderRadius: 15,
            background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
            color: EQ_TOKENS.textMain, fontSize: 12, cursor: 'pointer',
          }}><i className="fas fa-chevron-left"></i></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.01em' }}>
              {gym.name}
            </div>
            <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>
              {gym.count} machines · 12 brands · {gym.lastVisit}
            </div>
          </div>
          <button onClick={() => nav?.goAdd?.()} style={{
            padding: '6px 10px', borderRadius: 999,
            background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
            fontSize: 11.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
          }}>+ Add</button>
        </div>
      </div>
      <div style={{
        padding: '4px 12px 8px', display: 'flex', gap: 5, overflowX: 'auto', flexShrink: 0,
        borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
      }} className="bs-scroll">
        {EQ_DATA.bodyParts.map((bp, i) => (
          <Chip key={bp} active={i === 0} size="sm" count={i === 0 ? 47 : Math.max(2, 14 - i * 2)}>{bp}</Chip>
        ))}
      </div>
      <ScrollArea>
        <div style={{ padding: '0 0 16px' }}>
          {Object.entries(grouped).map(([bp, xs]) => (
            <React.Fragment key={bp}>
              <D2GroupHeader bp={bp} count={xs.length} />
              {xs.map(it => (
                <D2Row key={it.id} item={it} showMeta={showMeta}
                  onClick={nav && (() => nav.goMachine?.(it.id))} />
              ))}
            </React.Fragment>
          ))}
        </div>
      </ScrollArea>
    </EqPhone>
  );
};

function groupByBp2(items) {
  const order = ['chest', 'back', 'legs', 'shoulders', 'arms'];
  const out = {};
  for (const bp of order) {
    const xs = items.filter(i => i.bp === bp);
    if (xs.length) out[bp] = xs;
  }
  return out;
}

function D2GroupHeader({ bp, count }) {
  const c = EQ_TOKENS.bp[bp];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 14px',
      background: EQ_TOKENS.bgSurface,
      borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`,
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 4, height: 11, background: c, borderRadius: 2 }}></span>
        <span style={{ fontSize: 11, fontWeight: 700, color: EQ_TOKENS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {bp}
        </span>
        <span style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </div>
      <i className="fas fa-chevron-down" style={{ fontSize: 9, color: EQ_TOKENS.textVeryMuted }}></i>
    </div>
  );
}

function D2Row({ item, showMeta = true, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
      alignItems: 'center', gap: 10,
      padding: '8px 14px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <TypeIcon type={item.type} size={28} radius={7} />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: EQ_TOKENS.textStrong,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.name}</div>
        {showMeta && (
          <div style={{
            fontSize: 9.5, color: EQ_TOKENS.textVeryMuted, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.brand} · {item.line}</div>
        )}
      </div>
      <TypePill type={item.type} />
      <span style={{ fontSize: 9.5, color: EQ_TOKENS.textVeryMuted, fontWeight: 600 }}>{item.lastUsed}</span>
    </div>
  );
}

// ── Quick-add — split-pane keyboard up, chips inline, sticky batch counter
D2.QuickAdd = function ({ density, nav }) {
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
        <div style={{
          padding: '4px 14px 8px',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: EQ_TOKENS.textStrong }}>
            Quick-add <span style={{ color: EQ_TOKENS.textVeryMuted, fontWeight: 500 }}>→ Absolute Recomp</span>
          </div>
          <button onClick={() => nav?.closeAdd?.()} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: EQ_TOKENS.textMuted, fontSize: 13, fontWeight: 600, fontFamily: FONT,
          }}>Cancel</button>
        </div>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          margin: '0 14px 8px', padding: '8px 12px',
          background: EQ_TOKENS.bgCard, borderRadius: 10,
          border: `1px solid ${EQ_TOKENS.primaryBorder}`,
        }}>
          <i className="fas fa-magnifying-glass" style={{ color: EQ_TOKENS.primary, fontSize: 12 }}></i>
          <div style={{ flex: 1, fontSize: 13.5, color: EQ_TOKENS.textStrong, fontWeight: 500 }}>incline</div>
          <span style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, fontWeight: 600 }}>14 results</span>
        </div>
        {/* Type filter chips */}
        <div style={{ padding: '0 14px 8px', display: 'flex', gap: 4, overflowX: 'auto', flexShrink: 0 }} className="bs-scroll">
          {['All', 'Chest', 'Back', 'Legs', 'Shoulders'].map((bp, i) => (
            <Chip key={bp} active={i === 1} size="sm">{bp}</Chip>
          ))}
        </div>
        {/* Results */}
        <ScrollArea>
          <D2GroupHeader bp="chest" count={6} />
          <D2CheckRow item={EQ_DATA.items[0]} checked />
          <D2CheckRow item={{ ...EQ_DATA.items[1], name: 'Iso-Lateral Incline Press' }} />
          <D2CheckRow item={{ ...EQ_DATA.items[2], name: 'Incline Pec Deck' }} />
          <D2CheckRow item={{ ...EQ_DATA.items[3], name: 'Incline Cable Press' }} disabled />
          <D2GroupHeader bp="shoulders" count={2} />
          <D2CheckRow item={{ ...EQ_DATA.items[14], name: 'Incline Lateral Raise' }} checked />
          <D2CheckRow item={{ ...EQ_DATA.items[14], name: 'Incline Rear Delt Fly' }} />
        </ScrollArea>
        {/* Sticky batch counter */}
        <div style={{
          padding: '10px 14px 14px',
          background: 'rgba(13,18,24,0.96)',
          borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`,
          flexShrink: 0,
        }}>
          <button onClick={() => nav?.closeAdd?.()} style={{
            width: '100%', padding: '12px 16px', borderRadius: 12,
            background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
            fontSize: 13.5, fontWeight: 800, fontFamily: FONT, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: '#04201a', color: EQ_TOKENS.primary,
                fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
                fontVariantNumeric: 'tabular-nums',
              }}>3</span>
              Add to gym
            </span>
            <i className="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    </EqPhone>
  );
};

function D2CheckRow({ item, checked, disabled }) {
  if (!item) return null;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto auto 1fr auto',
      alignItems: 'center', gap: 10,
      padding: '8px 14px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
      opacity: disabled ? 0.5 : 1,
      background: checked ? 'rgba(29,211,176,0.05)' : 'transparent',
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: 5,
        background: checked ? EQ_TOKENS.primary : 'transparent',
        border: `1.5px solid ${checked ? EQ_TOKENS.primary : EQ_TOKENS.borderLight}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {(checked || disabled) && <i className="fas fa-check" style={{
          color: checked ? '#04201a' : EQ_TOKENS.textVeryMuted, fontSize: 10
        }}></i>}
      </div>
      <TypeIcon type={item.type} size={26} radius={6} />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: EQ_TOKENS.textStrong,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.name}</div>
        <div style={{
          fontSize: 9.5, color: EQ_TOKENS.textVeryMuted, marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {disabled ? 'Already at this gym' : `${item.brand} · ${item.line}`}
        </div>
      </div>
      <TypePill type={item.type} />
    </div>
  );
}

// ── Machine detail — dense info architecture
D2.MachineDetail = function ({ density, nav, itemId }) {
  const item = EQ_DATA.items.find(x => x.id === itemId) || EQ_DATA.items[0];
  return (
    <EqPhone>
      <PageHeader back onBack={() => nav?.goBack?.()} title={item.name} subtitle={`${item.brand} · ${item.line}`} action={
        <button style={{ background: 'transparent', border: 'none', color: EQ_TOKENS.primary, fontSize: 13, fontWeight: 600, fontFamily: FONT }}>Edit</button>
      } />
      <ScrollArea>
        <div style={{ padding: '10px 14px 4px' }}>
          {/* Stat grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
            <D2Stat label="Sessions" value="42" sub="lifetime" />
            <D2Stat label="PR" value="225" sub="×5 · bench" />
            <D2Stat label="Last" value="3d" sub="Tuesday" />
          </div>
          {/* Tag row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <TypePill type={item.type} size="md" />
            <span style={{
              padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: EQ_TOKENS.bp.chest + '26', color: EQ_TOKENS.bp.chest,
            }}>Chest</span>
            <span style={{
              padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: EQ_TOKENS.mutedBg, color: EQ_TOKENS.textMuted,
            }}>2 locations</span>
          </div>
        </div>
        {/* Section: exercises */}
        <D2SectionLabel>Exercises ({item.exercises.length})</D2SectionLabel>
        {[
          { name: 'Bench Press',        meta: 'PR 225 ×5 · 3d',     hot: true },
          { name: 'Incline Press',      meta: 'Last 185 ×8 · 6d',   hot: false },
          { name: 'Close-grip Press',   meta: 'Not logged',         hot: false },
        ].map(ex => (
          <D2DetailRow key={ex.name} icon="fa-dumbbell" name={ex.name} meta={ex.meta} hot={ex.hot} />
        ))}
        <D2SectionLabel>At these gyms (2)</D2SectionLabel>
        {item.gyms.map(gId => {
          const g = EQ_DATA.gyms.find(x => x.id === gId);
          return g && <D2DetailRow key={gId} icon="fa-location-dot"
            name={g.name} meta={`${g.city || ''} · ${g.lastVisit}`}
            here={g.isCurrent} />;
        })}
        <D2SectionLabel>Notes</D2SectionLabel>
        <div style={{
          margin: '0 14px 14px', padding: '10px 12px',
          background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
          borderRadius: 10, fontSize: 12, color: EQ_TOKENS.textMain, lineHeight: 1.45,
        }}>
          Sticker on R side · pin to 14 for normal warmup · seat 4
        </div>
      </ScrollArea>
    </EqPhone>
  );
};

function D2Stat({ label, value, sub }) {
  return (
    <div style={{
      padding: '8px 8px',
      background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: EQ_TOKENS.textVeryMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, marginTop: 3 }}>{value}</div>
      <div style={{ fontSize: 9.5, color: EQ_TOKENS.textVeryMuted, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function D2SectionLabel({ children }) {
  return (
    <div style={{
      padding: '12px 14px 6px',
      fontSize: 10.5, fontWeight: 700, color: EQ_TOKENS.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{children}</div>
  );
}

function D2DetailRow({ icon, name, meta, hot, here }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 14px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: hot ? EQ_TOKENS.warmBg : here ? EQ_TOKENS.primaryBg : EQ_TOKENS.bgCardHi,
        color: hot ? EQ_TOKENS.warm : here ? EQ_TOKENS.primary : EQ_TOKENS.textMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0,
      }}><i className={`fas ${icon}`}></i></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: EQ_TOKENS.textStrong, display: 'flex', alignItems: 'center', gap: 6 }}>
          {name}
          {here && <span style={{ fontSize: 8.5, padding: '1px 5px', borderRadius: 4, background: EQ_TOKENS.primary, color: '#04201a', fontWeight: 800, letterSpacing: '0.04em' }}>HERE</span>}
        </div>
        <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>{meta}</div>
      </div>
      <i className="fas fa-chevron-right" style={{ fontSize: 9, color: EQ_TOKENS.textVeryMuted }}></i>
    </div>
  );
}

// ── History reconciliation — table-y, with suggestion-first
D2.History = function ({ density, nav }) {
  return (
    <EqPhone>
      <PageHeader back onBack={() => nav?.goBack?.()} title="Reconcile history" subtitle="5 orphan names · 49 sessions affected" action={
        <button style={{
          padding: '5px 10px', borderRadius: 999,
          background: EQ_TOKENS.primaryBg, color: EQ_TOKENS.primary,
          border: `1px solid ${EQ_TOKENS.primaryBorder}`,
          fontSize: 11, fontWeight: 700, fontFamily: FONT,
        }}>Auto-link all</button>
      } />
      <ScrollArea>
        <div style={{ padding: '8px 0 16px' }}>
          {EQ_DATA.orphans.map(o => <D2Orphan key={o.id} o={o} />)}
        </div>
      </ScrollArea>
    </EqPhone>
  );
};

function D2Orphan({ o }) {
  const hasSuggestion = !!o.suggestion;
  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: EQ_TOKENS.textStrong }}>"{o.name}"</div>
          <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>{o.context}</div>
        </div>
        <button style={{
          padding: '6px 10px', borderRadius: 8,
          background: hasSuggestion ? EQ_TOKENS.primary : EQ_TOKENS.bgCardHi,
          color: hasSuggestion ? '#04201a' : EQ_TOKENS.textMain,
          border: hasSuggestion ? 'none' : `1px solid ${EQ_TOKENS.border}`,
          fontSize: 11, fontWeight: 700, fontFamily: FONT,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <i className={`fas ${hasSuggestion ? 'fa-link' : 'fa-plus'}`} style={{ fontSize: 10 }}></i>
          {hasSuggestion ? 'Link' : 'Add new'}
        </button>
      </div>
      {hasSuggestion && (
        <div style={{
          padding: '6px 10px', borderRadius: 8,
          background: 'rgba(29,211,176,0.06)',
          border: `1px solid ${EQ_TOKENS.primaryBorder}`,
          fontSize: 11, color: EQ_TOKENS.textMuted,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <i className="fas fa-wand-magic-sparkles" style={{ color: EQ_TOKENS.primary, fontSize: 10 }}></i>
          → <strong style={{ color: EQ_TOKENS.textStrong }}>{o.suggestion}</strong>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, color: EQ_TOKENS.textVeryMuted }}>
            <i className="fas fa-pen-to-square"></i>
            <i className="fas fa-xmark"></i>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Browse catalog — brand grid + dense rows
D2.Browse = function ({ density, nav, accent }) {
  const a = accent || EQ_TOKENS.primary;
  return (
    <EqPhone>
      <div style={{ padding: '6px 14px 4px', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em' }}>Library</div>
      </div>
      {nav && <LibToggle current="equipment" nav={nav} accent={a} />}
      <CompactTabs value="catalog" onChange={nav && ((v) => v === 'gyms' ? nav.goEquipLanding?.() : v === 'library' ? nav.goLibrary?.() : null)} />
      {/* Search */}
      <div style={{
        margin: '8px 14px 8px', padding: '8px 12px',
        background: EQ_TOKENS.bgCard, borderRadius: 10,
        border: `1px solid ${EQ_TOKENS.border}`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <i className="fas fa-magnifying-glass" style={{ color: EQ_TOKENS.textVeryMuted, fontSize: 12 }}></i>
        <div style={{ flex: 1, fontSize: 12.5, color: EQ_TOKENS.textVeryMuted }}>Search 1,304 machines</div>
      </div>
      <ScrollArea>
        <D2SectionLabel>Brands · 21</D2SectionLabel>
        <div style={{ padding: '0 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {EQ_DATA.brands.slice(0, 6).map(b => (
            <div key={b.id} style={{
              padding: '10px 8px',
              background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
              borderRadius: 10, textAlign: 'center',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: EQ_TOKENS.textStrong,
                letterSpacing: '-0.01em', marginBottom: 4,
              }}>{b.name}</div>
              <div style={{ fontSize: 9, color: EQ_TOKENS.textVeryMuted, fontVariantNumeric: 'tabular-nums' }}>
                {b.lines.length} lines
              </div>
            </div>
          ))}
        </div>
        <D2SectionLabel>Popular at Absolute Recomp</D2SectionLabel>
        {EQ_DATA.items.slice(0, 6).map(it => <D2Row key={it.id} item={it} showMeta />)}
      </ScrollArea>
    </EqPhone>
  );
};

Object.assign(window, { D2 });
