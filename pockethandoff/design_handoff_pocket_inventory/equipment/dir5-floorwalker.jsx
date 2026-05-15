// Direction 5 — Floorwalker
// Optimized for one-handed thumb operation while walking the gym floor.
// All primary controls anchored to the bottom half. Big keyboard-friendly
// search. Large checkbox cards in a 2-up grid. The quick-add sheet is the
// signature flow — every other screen is dressed to support it.

const D5 = {};

// ── Landing — gym tiles 2-up, primary action at bottom
D5.Landing = function ({ density, showMeta }) {
  return (
    <EqPhone>
      <div style={{ padding: '4px 18px 4px', flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em' }}>Gyms</div>
      </div>
      <div style={{
        margin: '6px 16px 12px', padding: '10px 12px',
        background: EQ_TOKENS.primaryBg, border: `1px solid ${EQ_TOKENS.primaryBorder}`,
        borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0,
      }}>
        <i className="fas fa-location-dot" style={{ color: EQ_TOKENS.primary, fontSize: 14 }}></i>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: EQ_TOKENS.textStrong }}>You're at Absolute Recomp</div>
          <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>47 machines tagged · 3 nearby unmatched</div>
        </div>
      </div>
      <ScrollArea>
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {EQ_DATA.gyms.map(g => <D5GymTile key={g.id} gym={g} />)}
            <button style={{
              padding: '20px 12px', borderRadius: 14,
              background: 'transparent', border: `1px dashed ${EQ_TOKENS.borderLight}`,
              color: EQ_TOKENS.textMuted, fontSize: 12, fontWeight: 600, fontFamily: FONT,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
              minHeight: 110,
            }}>
              <i className="fas fa-plus" style={{ fontSize: 16, color: EQ_TOKENS.primary }}></i>
              Add gym
            </button>
          </div>
        </div>
      </ScrollArea>
      {/* Bottom-anchored primary */}
      <div style={{ padding: '8px 16px 14px', background: 'rgba(13,18,24,0.96)', borderTop: `1px solid ${EQ_TOKENS.borderSubtle}` }}>
        <button style={{
          width: '100%', padding: '14px', borderRadius: 999,
          background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
          fontSize: 14, fontWeight: 800, fontFamily: FONT,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: `0 8px 24px rgba(29,211,176,0.30)`,
        }}>
          <i className="fas fa-bolt"></i> Tag what I see
        </button>
      </div>
    </EqPhone>
  );
};

function D5GymTile({ gym }) {
  return (
    <div style={{
      padding: '12px 12px',
      background: EQ_TOKENS.bgCard,
      border: `1px solid ${gym.isCurrent ? EQ_TOKENS.primaryBorder : EQ_TOKENS.borderSubtle}`,
      borderRadius: 14,
      minHeight: 110,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          {gym.isCurrent && <span style={{ width: 6, height: 6, borderRadius: '50%', background: EQ_TOKENS.primary, animation: 'eqPulse 1.6s ease-in-out infinite' }}></span>}
          <span style={{
            fontSize: 12.5, fontWeight: 700, color: EQ_TOKENS.textStrong,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{gym.name}</span>
        </div>
        <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>{gym.city || 'No location'}</div>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {gym.count}
        </div>
        <div style={{ fontSize: 9, color: EQ_TOKENS.textVeryMuted, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>
          machines
        </div>
      </div>
    </div>
  );
}

// ── Gym detail — list + persistent bottom action bar
D5.GymDetail = function ({ density, showMeta }) {
  const items = EQ_DATA.items.filter(i => i.gyms.includes('absolute'));
  return (
    <EqPhone>
      <PageHeader back title="Absolute Recomp" subtitle="47 machines" action={
        <button style={{
          width: 34, height: 34, borderRadius: 17,
          background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
          color: EQ_TOKENS.textMain, fontSize: 12,
        }}><i className="fas fa-ellipsis"></i></button>
      } />
      <div style={{ padding: '4px 14px 8px', display: 'flex', gap: 5, overflowX: 'auto', flexShrink: 0 }} className="bs-scroll">
        {EQ_DATA.bodyParts.slice(0, 6).map((bp, i) => (
          <Chip key={bp} active={i === 0} size="sm">{bp}</Chip>
        ))}
      </div>
      <ScrollArea>
        <div style={{ paddingBottom: 8 }}>
          {items.slice(0, 9).map(it => <D5GymRow key={it.id} item={it} showMeta={showMeta} />)}
        </div>
      </ScrollArea>
      {/* Big bottom action bar */}
      <div style={{
        padding: '10px 16px 14px',
        background: 'rgba(13,18,24,0.96)',
        borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`,
        display: 'flex', gap: 8, flexShrink: 0,
      }}>
        <button style={{
          flex: 1, padding: '13px', borderRadius: 999,
          background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
          fontSize: 13.5, fontWeight: 800, fontFamily: FONT,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: `0 8px 24px rgba(29,211,176,0.30)`,
        }}>
          <i className="fas fa-bolt"></i> Tag more machines
        </button>
        <button style={{
          width: 48, height: 48, borderRadius: 24,
          background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
          color: EQ_TOKENS.textMain, fontSize: 14,
        }}><i className="fas fa-microphone"></i></button>
      </div>
    </EqPhone>
  );
};

function D5GymRow({ item, showMeta = true }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
    }}>
      <TypeIcon type={item.type} size={40} radius={12} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: EQ_TOKENS.textStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
        {showMeta && (
          <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 2 }}>
            {item.brand} · last used {item.lastUsed}
          </div>
        )}
      </div>
      <i className="fas fa-chevron-right" style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted }}></i>
    </div>
  );
}

// ── Quick-add — THE flagship. Bottom-anchored search w/ keyboard, 2-up cards.
D5.QuickAdd = function ({ density }) {
  return (
    <EqPhone scrollable={false}>
      {/* Full sheet — almost full screen */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        top: 44,
        background: EQ_TOKENS.bgApp,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Slim header */}
        <div style={{
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
        }}>
          <button style={{
            background: 'transparent', border: 'none',
            color: EQ_TOKENS.textMuted, fontSize: 13, fontWeight: 600, fontFamily: FONT,
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <i className="fas fa-chevron-down"></i>
          </button>
          <div style={{ fontSize: 13, fontWeight: 700, color: EQ_TOKENS.textStrong }}>Absolute Recomp</div>
          <div style={{ width: 24 }}></div>
        </div>
        {/* Body part chips */}
        <div style={{ padding: '10px 14px 6px', display: 'flex', gap: 5, overflowX: 'auto', flexShrink: 0 }} className="bs-scroll">
          {['All', 'Chest', 'Back', 'Legs', 'Shoulders'].map((bp, i) => (
            <Chip key={bp} active={i === 0} size="sm">{bp}</Chip>
          ))}
        </div>
        {/* Results — 2-up cards */}
        <ScrollArea>
          <div style={{ padding: '8px 14px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: EQ_TOKENS.textVeryMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Suggested · 4 unselected
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <D5TileCard item={EQ_DATA.items[0]} checked />
              <D5TileCard item={EQ_DATA.items[1]} />
              <D5TileCard item={EQ_DATA.items[8]} checked />
              <D5TileCard item={EQ_DATA.items[10]} />
              <D5TileCard item={EQ_DATA.items[2]} disabled />
              <D5TileCard item={EQ_DATA.items[3]} />
            </div>
          </div>
        </ScrollArea>
        {/* Sticky search just above keyboard */}
        <div style={{
          padding: '8px 12px 8px',
          background: EQ_TOKENS.bgSurface,
          borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`,
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px',
            background: EQ_TOKENS.bgCard, borderRadius: 14,
            border: `1.5px solid ${EQ_TOKENS.primary}`,
          }}>
            <i className="fas fa-magnifying-glass" style={{ color: EQ_TOKENS.primary, fontSize: 14 }}></i>
            <div style={{ flex: 1, fontSize: 15, color: EQ_TOKENS.textStrong, fontWeight: 500 }}>
              hack squat<span style={{
                display: 'inline-block', width: 2, height: 16, marginLeft: 1,
                background: EQ_TOKENS.primary, verticalAlign: 'middle',
                animation: 'eqPulse 1s ease-in-out infinite',
              }}></span>
            </div>
            <i className="fas fa-microphone" style={{ color: EQ_TOKENS.textMuted, fontSize: 14 }}></i>
          </div>
          <button style={{
            position: 'relative',
            width: 52, height: 52, borderRadius: 26,
            background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
            fontSize: 15, fontWeight: 800, fontFamily: FONT,
            boxShadow: `0 8px 20px rgba(29,211,176,0.30)`,
          }}>
            <i className="fas fa-check"></i>
            <span style={{
              position: 'absolute', top: -4, right: -4,
              minWidth: 22, height: 22, padding: '0 6px',
              borderRadius: 11, background: EQ_TOKENS.warm, color: '#04201a',
              border: `2px solid ${EQ_TOKENS.bgSurface}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            }}>2</span>
          </button>
        </div>
        {/* Fake keyboard */}
        <D5Keyboard />
      </div>
    </EqPhone>
  );
};

function D5TileCard({ item, checked, disabled }) {
  return (
    <div style={{
      padding: 12,
      background: checked ? 'rgba(29,211,176,0.08)' : EQ_TOKENS.bgCard,
      border: `1.5px solid ${checked ? EQ_TOKENS.primary : EQ_TOKENS.borderSubtle}`,
      borderRadius: 14,
      position: 'relative',
      opacity: disabled ? 0.5 : 1,
      minHeight: 96,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <TypeIcon type={item.type} size={32} radius={9} />
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: checked ? EQ_TOKENS.primary : 'transparent',
          border: `1.5px solid ${checked ? EQ_TOKENS.primary : EQ_TOKENS.borderLight}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {(checked || disabled) && <i className="fas fa-check" style={{ color: checked ? '#04201a' : EQ_TOKENS.textVeryMuted, fontSize: 11 }}></i>}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: EQ_TOKENS.textStrong, lineHeight: 1.2, marginBottom: 3 }}>{item.name}</div>
        <div style={{ fontSize: 9.5, color: EQ_TOKENS.textVeryMuted, fontWeight: 500 }}>
          {disabled ? 'Already tagged' : item.brand}
        </div>
      </div>
    </div>
  );
}

function D5Keyboard() {
  const rows = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['z','x','c','v','b','n','m'],
  ];
  return (
    <div style={{
      background: '#1c1f25', padding: '8px 4px 12px',
      borderTop: `1px solid rgba(255,255,255,0.08)`, flexShrink: 0,
    }}>
      {rows.map((row, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 7,
          paddingLeft: i === 1 ? 14 : i === 2 ? 38 : 0,
          paddingRight: i === 1 ? 14 : i === 2 ? 38 : 0,
        }}>
          {i === 2 && <D5Key wide style={{ marginRight: 4 }}><i className="fas fa-arrow-up"></i></D5Key>}
          {row.map(c => <D5Key key={c}>{c}</D5Key>)}
          {i === 2 && <D5Key wide style={{ marginLeft: 4 }}><i className="fas fa-delete-left"></i></D5Key>}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, paddingLeft: 4, paddingRight: 4 }}>
        <D5Key style={{ flex: 0.7 }}>123</D5Key>
        <D5Key style={{ flex: 0.6 }}>🌐</D5Key>
        <D5Key style={{ flex: 3.5 }}>space</D5Key>
        <D5Key style={{ flex: 1.2, background: EQ_TOKENS.primary, color: '#04201a' }}>search</D5Key>
      </div>
    </div>
  );
}

function D5Key({ children, wide, style }) {
  return (
    <div style={{
      background: '#2c3037', color: '#eee',
      fontSize: 12, fontWeight: 500,
      padding: '7px 0',
      borderRadius: 5,
      minWidth: wide ? 36 : 28,
      flex: wide ? 0 : 1,
      textAlign: 'center',
      boxShadow: '0 1px 0 rgba(0,0,0,0.4)',
      fontFamily: FONT,
      ...style,
    }}>{children}</div>
  );
}

// ── Machine detail — actions anchored to bottom
D5.MachineDetail = function ({ density }) {
  const item = EQ_DATA.items[0];
  return (
    <EqPhone>
      <PageHeader back title="" noBorder action={
        <button style={{ background: 'transparent', border: 'none', color: EQ_TOKENS.primary, fontSize: 13, fontWeight: 600, fontFamily: FONT }}>
          <i className="fas fa-star-of-life"></i>
        </button>
      } />
      <ScrollArea>
        <div style={{ padding: '4px 18px 16px' }}>
          <TypeIcon type={item.type} size={64} radius={18} />
          <div style={{ fontSize: 22, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.02em', marginTop: 14, lineHeight: 1.15 }}>
            {item.name}
          </div>
          <div style={{ fontSize: 13, color: EQ_TOKENS.textMuted, marginTop: 5 }}>{item.brand} · {item.line}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            <TypePill type={item.type} size="md" />
            <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: EQ_TOKENS.bp.chest + '26', color: EQ_TOKENS.bp.chest }}>Chest</span>
          </div>
          {/* Big stat row */}
          <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
            {[
              { v: '42', l: 'Sessions' },
              { v: '225 lb', l: 'PR' },
              { v: '3d', l: 'Last' },
            ].map(s => (
              <div key={s.l} style={{
                flex: 1, padding: '10px 8px',
                background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
                borderRadius: 12, textAlign: 'center',
              }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: EQ_TOKENS.textStrong, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: EQ_TOKENS.textVeryMuted, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 4 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18, fontSize: 11, fontWeight: 700, color: EQ_TOKENS.textVeryMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Exercises</div>
          {item.exercises.map((ex, i) => (
            <div key={ex} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 0',
              borderBottom: i < item.exercises.length - 1 ? `1px solid ${EQ_TOKENS.borderSubtle}` : 'none',
            }}>
              <i className="fas fa-dumbbell" style={{ color: EQ_TOKENS.primary, fontSize: 13, width: 16 }}></i>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: EQ_TOKENS.textStrong }}>{ex}</div>
              <i className="fas fa-chevron-right" style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted }}></i>
            </div>
          ))}
        </div>
      </ScrollArea>
      {/* Bottom action */}
      <div style={{ padding: '10px 16px 14px', background: 'rgba(13,18,24,0.96)', borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`, display: 'flex', gap: 8 }}>
        <button style={{
          flex: 1, padding: '13px', borderRadius: 999,
          background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
          fontSize: 14, fontWeight: 800, fontFamily: FONT,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: `0 8px 24px rgba(29,211,176,0.30)`,
        }}>
          <i className="fas fa-bolt"></i> Use in workout
        </button>
        <button style={{
          width: 48, height: 48, borderRadius: 24,
          background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
          color: EQ_TOKENS.textMain, fontSize: 13,
        }}><i className="fas fa-circle-play"></i></button>
      </div>
    </EqPhone>
  );
};

// ── History reconciliation — large swipeable cards
D5.History = function ({ density }) {
  return (
    <EqPhone>
      <PageHeader back title="Fix history" subtitle="5 names need a home" />
      <ScrollArea>
        <div style={{ padding: '12px 16px 16px' }}>
          {EQ_DATA.orphans.map((o, i) => <D5OrphanCard key={o.id} o={o} primary={i === 0} />)}
        </div>
      </ScrollArea>
      <div style={{ padding: '8px 16px 14px', background: 'rgba(13,18,24,0.96)', borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`, display: 'flex', gap: 8 }}>
        <button style={{
          flex: 1, padding: '13px', borderRadius: 999,
          background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
          fontSize: 13.5, fontWeight: 800, fontFamily: FONT,
        }}>Apply all suggestions</button>
        <button style={{
          padding: '13px 18px', borderRadius: 999,
          background: 'transparent', color: EQ_TOKENS.textMuted, border: `1px solid ${EQ_TOKENS.border}`,
          fontSize: 13.5, fontWeight: 700, fontFamily: FONT,
        }}>Later</button>
      </div>
    </EqPhone>
  );
};

function D5OrphanCard({ o, primary }) {
  return (
    <div style={{
      background: primary ? EQ_TOKENS.bgCardHi : EQ_TOKENS.bgCard,
      border: `1px solid ${primary ? EQ_TOKENS.borderLight : EQ_TOKENS.borderSubtle}`,
      borderRadius: 16, padding: 14, marginBottom: 10,
      position: 'relative', overflow: 'hidden',
    }}>
      {primary && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          fontSize: 9, padding: '2px 6px', borderRadius: 4,
          background: EQ_TOKENS.warningBg, color: EQ_TOKENS.warning,
          fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>Up next</div>
      )}
      <div style={{ fontSize: 9.5, fontWeight: 700, color: EQ_TOKENS.textVeryMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
        Old name
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.01em' }}>"{o.name}"</div>
      <div style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted, marginTop: 4 }}>{o.context}</div>
      {o.suggestion && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(29,211,176,0.08)',
          border: `1px solid ${EQ_TOKENS.primaryBorder}`,
          borderRadius: 12,
        }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: EQ_TOKENS.primary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Best match</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: EQ_TOKENS.textStrong }}>{o.suggestion}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button style={{
          flex: 1, padding: '11px 8px', borderRadius: 10,
          background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
          fontSize: 12, fontWeight: 800, fontFamily: FONT,
        }}>{o.suggestion ? 'Link' : 'Add new'}</button>
        <button style={{
          padding: '11px 14px', borderRadius: 10,
          background: 'transparent', color: EQ_TOKENS.textMuted,
          border: `1px solid ${EQ_TOKENS.border}`,
          fontSize: 12, fontWeight: 600, fontFamily: FONT,
        }}>Other</button>
        <button style={{
          padding: '11px 14px', borderRadius: 10,
          background: 'transparent', color: EQ_TOKENS.textVeryMuted,
          border: `1px solid ${EQ_TOKENS.border}`,
          fontSize: 12, fontWeight: 600, fontFamily: FONT,
        }}>Skip</button>
      </div>
    </div>
  );
}

// ── Browse catalog — search-first, recent brands as fast picks
D5.Browse = function ({ density }) {
  return (
    <EqPhone>
      <PageHeader title="Browse" subtitle="Discover machines not in your library" />
      {/* Big top search */}
      <div style={{ padding: '4px 16px 12px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          background: EQ_TOKENS.bgCard, borderRadius: 16,
          border: `1px solid ${EQ_TOKENS.border}`,
        }}>
          <i className="fas fa-magnifying-glass" style={{ color: EQ_TOKENS.textMuted, fontSize: 15 }}></i>
          <div style={{ flex: 1, fontSize: 15, color: EQ_TOKENS.textVeryMuted }}>Search 1,304 machines…</div>
          <i className="fas fa-microphone" style={{ color: EQ_TOKENS.textMuted, fontSize: 15 }}></i>
        </div>
      </div>
      <ScrollArea>
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: EQ_TOKENS.textVeryMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            Top brands
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {EQ_DATA.brands.slice(0, 6).map(b => (
              <button key={b.id} style={{
                padding: '14px 12px', borderRadius: 14,
                background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
                textAlign: 'left', cursor: 'pointer', fontFamily: FONT,
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: EQ_TOKENS.textStrong, letterSpacing: '-0.01em' }}>{b.name}</div>
                <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 3 }}>{b.lines.length} lines · {b.country}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: EQ_TOKENS.textVeryMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            Browse by type
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['plateLoaded', 'selectorized', 'cable', 'rack', 'bench', 'cardio', 'dumbbell', 'bodyweight'].map(t => <D3TypeChip key={t} type={t} />)}
          </div>
        </div>
      </ScrollArea>
      <EqBottomNav active="more" />
    </EqPhone>
  );
};

Object.assign(window, { D5 });
