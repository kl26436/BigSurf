// Direction 1 — Tag & Go
// By-the-book interpretation of the brief. Reuses existing patterns:
// .equip-row / .brand-header / chips / page-header / .row-card.
// Conservative refinement of what's already shipped. Easiest to ship.

const D1 = {};

// ── Landing — My gyms tab
D1.Landing = function ({ density }) {
  const pad = density === 'compact' ? 12 : density === 'spacious' ? 20 : 16;
  return (
    <EqPhone>
      <PageHeader title="Equipment" noBorder action={
        <button style={{
          width: 36, height: 36, borderRadius: 18,
          background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
          color: EQ_TOKENS.textMain, fontSize: 13,
        }}><i className="fas fa-magnifying-glass"></i></button>
      } />
      <ThreeTab value="gyms" />
      <ScrollArea>
        <div style={{ padding: `4px ${pad}px 16px` }}>
          {/* GPS detected */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', marginBottom: 10,
            background: EQ_TOKENS.primaryBg, border: `1px solid ${EQ_TOKENS.primaryBorder}`,
            borderRadius: 14, color: EQ_TOKENS.primary,
          }}>
            <i className="fas fa-location-dot" style={{ fontSize: 13 }}></i>
            <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>
              At <span style={{ color: EQ_TOKENS.textStrong }}>Absolute Recomp</span>
            </div>
            <span style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, fontWeight: 600 }}>GPS</span>
          </div>
          {EQ_DATA.gyms.map(g => <GymCard key={g.id} gym={g} />)}
          <button style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', marginTop: 8,
            padding: '14px 16px', borderRadius: 14,
            background: 'transparent', border: `1px dashed ${EQ_TOKENS.primaryBorder}`,
            color: EQ_TOKENS.primary, fontSize: 13, fontWeight: 700, fontFamily: FONT,
          }}>
            <i className="fas fa-plus"></i> Add a gym
          </button>
        </div>
      </ScrollArea>
      <EqBottomNav active="more" />
    </EqPhone>
  );
};

function GymCard({ gym }) {
  return (
    <div style={{
      background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
      borderRadius: 14, padding: '12px 14px', marginBottom: 8,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: gym.isCurrent ? EQ_TOKENS.primaryBg : EQ_TOKENS.bgCardHi,
        color: gym.isCurrent ? EQ_TOKENS.primary : EQ_TOKENS.textMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
      }}>
        <i className={`fas ${gym.id === 'home' ? 'fa-house' : gym.id === 'hotel' ? 'fa-hotel' : 'fa-dumbbell'}`}></i>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 14, fontWeight: 600, color: EQ_TOKENS.textStrong,
        }}>
          {gym.name}
          {gym.isCurrent && (
            <span style={{
              fontSize: 8.5, padding: '1px 6px', borderRadius: 999,
              background: EQ_TOKENS.primaryBg, color: EQ_TOKENS.primary,
              fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>Here</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted, marginTop: 2, fontWeight: 500 }}>
          {gym.city ? `${gym.city} · ` : ''}{gym.count} machines · {gym.lastVisit}
        </div>
      </div>
      <i className="fas fa-chevron-right" style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted }}></i>
    </div>
  );
}

// ── Gym detail
D1.GymDetail = function ({ density, showMeta }) {
  const pad = density === 'compact' ? 12 : density === 'spacious' ? 20 : 16;
  const grouped = groupByBp(EQ_DATA.items.filter(i => i.gyms.includes('absolute')));
  return (
    <EqPhone>
      <PageHeader back title="Absolute Recomp" subtitle="47 machines · updated 2 days ago" />
      <div style={{ padding: `8px ${pad}px 6px`, display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}
           className="bs-scroll">
        {EQ_DATA.bodyParts.slice(0, 6).map((bp, i) => (
          <Chip key={bp} active={i === 0} size="sm">{bp}</Chip>
        ))}
      </div>
      <ScrollArea>
        <div style={{ padding: `4px 0 16px` }}>
          {Object.entries(grouped).map(([bp, items]) => (
            <React.Fragment key={bp}>
              <BpHeader bp={bp} count={items.length} pad={pad} />
              {items.slice(0, 4).map(it => <EquipRow key={it.id} item={it} pad={pad} showMeta={showMeta} />)}
            </React.Fragment>
          ))}
        </div>
      </ScrollArea>
      <div style={{ padding: '8px 16px 16px', background: 'rgba(13,18,24,0.95)', borderTop: `1px solid ${EQ_TOKENS.borderSubtle}` }}>
        <button style={{
          width: '100%', padding: '13px 16px', borderRadius: 999,
          background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
          fontSize: 14, fontWeight: 700, fontFamily: FONT,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <i className="fas fa-plus"></i> Add equipment
        </button>
      </div>
    </EqPhone>
  );
};

function groupByBp(items) {
  const order = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio'];
  const out = {};
  for (const bp of order) {
    const xs = items.filter(i => i.bp === bp);
    if (xs.length) out[bp] = xs;
  }
  return out;
}

function BpHeader({ bp, count, pad }) {
  const c = EQ_TOKENS.bp[bp] || EQ_TOKENS.textVeryMuted;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `10px ${pad}px 8px`,
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <BPDot bp={bp} size={6} />
        <span style={{
          fontSize: 11, fontWeight: 700, color: EQ_TOKENS.textMuted,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>{bp}</span>
      </div>
      <span style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </span>
    </div>
  );
}

function EquipRow({ item, pad = 16, showMeta = true, trailing }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: `11px ${pad}px`,
      background: EQ_TOKENS.bgCard,
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
    }}>
      <TypeIcon type={item.type} size={36} radius={10} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 600, color: EQ_TOKENS.textStrong,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.name}</div>
        {showMeta && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 3, fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.brand} · {item.line}
            <TypePill type={item.type} />
          </div>
        )}
      </div>
      {trailing || <i className="fas fa-chevron-right" style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted }}></i>}
    </div>
  );
}

// ── Quick-add sheet
D1.QuickAdd = function ({ density }) {
  const pad = density === 'compact' ? 12 : density === 'spacious' ? 20 : 16;
  // Show as a phone with sheet covering ~78% from bottom
  return (
    <EqPhone scrollable={false}>
      {/* Dimmed backdrop */}
      <div style={{
        position: 'absolute', inset: 0, top: 44,
        background: 'rgba(0,0,0,0.55)',
      }} />
      {/* Sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        top: 130,
        background: EQ_TOKENS.bgSurface,
        borderRadius: '20px 20px 0 0',
        display: 'flex', flexDirection: 'column',
        border: `1px solid ${EQ_TOKENS.borderSubtle}`,
        overflow: 'hidden',
      }}>
        <SheetHandle />
        {/* Title row */}
        <div style={{ padding: `4px ${pad}px 10px`, flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: EQ_TOKENS.textStrong }}>Add to Absolute Recomp</div>
          <div style={{ fontSize: 11, color: EQ_TOKENS.textVeryMuted, marginTop: 2 }}>Tap machines you see · we'll add them all at once</div>
        </div>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          margin: `0 ${pad}px 10px`, padding: '11px 14px',
          background: EQ_TOKENS.bgCard, borderRadius: 14,
          border: `1px solid ${EQ_TOKENS.primaryBorder}`,
        }}>
          <i className="fas fa-magnifying-glass" style={{ color: EQ_TOKENS.primary, fontSize: 13 }}></i>
          <div style={{ flex: 1, fontSize: 14, color: EQ_TOKENS.textStrong, fontWeight: 500 }}>
            newtech<span style={{
              display: 'inline-block', width: 2, height: 14, marginLeft: 1,
              background: EQ_TOKENS.primary, verticalAlign: 'middle',
              animation: 'eqPulse 1s ease-in-out infinite',
            }}></span>
          </div>
          <i className="fas fa-xmark" style={{ color: EQ_TOKENS.textVeryMuted, fontSize: 12 }}></i>
        </div>
        {/* Body part chips */}
        <div style={{ padding: `0 ${pad}px 10px`, display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}
             className="bs-scroll">
          {EQ_DATA.bodyParts.slice(0, 5).map(bp => (
            <Chip key={bp} active={bp === 'All'} size="sm">{bp}</Chip>
          ))}
        </div>
        {/* Results — grouped */}
        <ScrollArea>
          <div style={{ paddingBottom: 12 }}>
            <SearchGroup brand="Newtech" line="Origin" />
            <CheckRow item={EQ_DATA.items[0]} pad={pad} checked />
            <CheckRow item={EQ_DATA.items.find(i => i.brand === 'Newtech' && i.line === 'Liberty')} pad={pad} disabled />
            <SearchGroup brand="Newtech" line="Plate-Loaded" />
            <CheckRow item={{ ...EQ_DATA.items[5], name: 'Newtech Plate Row', brand: 'Newtech', line: 'Plate-Loaded' }} pad={pad} />
            <CheckRow item={{ ...EQ_DATA.items[8], name: 'Newtech Hack Squat', brand: 'Newtech', line: 'Plate-Loaded' }} pad={pad} checked />
          </div>
        </ScrollArea>
        {/* Sticky bottom */}
        <div style={{
          padding: `10px ${pad}px 18px`,
          background: 'rgba(13,18,24,0.96)',
          borderTop: `1px solid ${EQ_TOKENS.borderSubtle}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button style={{
              background: 'transparent', border: 'none',
              color: EQ_TOKENS.textMuted, fontSize: 12, fontWeight: 600, fontFamily: FONT,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <i className="fas fa-plus-circle" style={{ fontSize: 12, color: EQ_TOKENS.primary }}></i>
              Can't find it?
            </button>
          </div>
          <button style={{
            width: '100%', padding: '13px 16px', borderRadius: 999,
            background: EQ_TOKENS.primary, color: '#04201a', border: 'none',
            fontSize: 14, fontWeight: 700, fontFamily: FONT,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            Done · 2 new
          </button>
        </div>
      </div>
    </EqPhone>
  );
};

function SearchGroup({ brand, line }) {
  return (
    <div style={{
      padding: '8px 16px 6px',
      background: EQ_TOKENS.bgApp,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: EQ_TOKENS.textMuted, letterSpacing: '0.04em' }}>
        <i className="fas fa-cube" style={{ fontSize: 9, marginRight: 6, color: EQ_TOKENS.textVeryMuted }}></i>
        {brand} <span style={{ color: EQ_TOKENS.textVeryMuted, fontWeight: 500 }}>› {line}</span>
      </div>
    </div>
  );
}

function CheckRow({ item, pad = 16, checked, disabled }) {
  if (!item) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: `11px ${pad}px`,
      background: EQ_TOKENS.bgCard,
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
      opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 6,
        background: checked ? EQ_TOKENS.primary : 'transparent',
        border: `1.5px solid ${checked ? EQ_TOKENS.primary : EQ_TOKENS.borderLight}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {checked && <i className="fas fa-check" style={{ color: '#04201a', fontSize: 11 }}></i>}
        {disabled && !checked && <i className="fas fa-check" style={{ color: EQ_TOKENS.textVeryMuted, fontSize: 11 }}></i>}
      </div>
      <TypeIcon type={item.type} size={30} radius={8} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: EQ_TOKENS.textStrong,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.name}</div>
        <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>
          {disabled ? 'Already at this gym' : <TypePill type={item.type} />}
        </div>
      </div>
    </div>
  );
}

// ── Machine detail
D1.MachineDetail = function ({ density }) {
  const pad = density === 'compact' ? 12 : density === 'spacious' ? 20 : 16;
  const item = EQ_DATA.items[0]; // Incline Chest Press 2
  return (
    <EqPhone>
      <PageHeader back title="Machine" action={
        <button style={{ background: 'transparent', border: 'none', color: EQ_TOKENS.primary, fontSize: 13, fontWeight: 600, fontFamily: FONT }}>
          Edit
        </button>
      } />
      <ScrollArea>
        {/* Hero */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: `16px ${pad}px`,
          background: EQ_TOKENS.bgCard,
          borderBottom: `1px solid ${EQ_TOKENS.border}`,
          marginBottom: 12,
        }}>
          <TypeIcon type={item.type} size={56} radius={14} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: EQ_TOKENS.textStrong, letterSpacing: '-0.01em' }}>{item.name}</div>
            <div style={{ fontSize: 12, color: EQ_TOKENS.textMuted, marginTop: 3 }}>{item.brand} · {item.line}</div>
            <div style={{ marginTop: 6 }}><TypePill type={item.type} size="md" /></div>
          </div>
        </div>
        {/* Exercises section */}
        <SectionLabel pad={pad}>Exercises</SectionLabel>
        {['Bench Press', 'Incline Press', 'Close-grip Press'].map((ex, i) => (
          <DetailRow key={ex} icon="fa-dumbbell" pad={pad}
            label={ex} meta={i === 0 ? 'PR · 225 lb · 3 days ago' : i === 1 ? 'Last · 185 lb · 6 days ago' : 'Not yet logged'} />
        ))}
        {/* Locations */}
        <SectionLabel pad={pad}>At these gyms</SectionLabel>
        {item.gyms.map(gId => {
          const g = EQ_DATA.gyms.find(x => x.id === gId);
          return g && <DetailRow key={gId} icon="fa-location-dot" pad={pad}
            label={g.name} meta={g.lastVisit}
            tint={g.isCurrent ? EQ_TOKENS.primary : null} />;
        })}
        {/* Form video */}
        <SectionLabel pad={pad}>Reference</SectionLabel>
        <DetailRow icon="fa-circle-play" pad={pad} label="Form check video" meta="2 min · external" tint={EQ_TOKENS.primary} />
        <div style={{ height: 24 }} />
      </ScrollArea>
    </EqPhone>
  );
};

function SectionLabel({ children, pad }) {
  return (
    <div style={{
      padding: `12px ${pad}px 8px`,
      fontSize: 10.5, fontWeight: 700, color: EQ_TOKENS.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{children}</div>
  );
}

function DetailRow({ icon, label, meta, tint, pad }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: `12px ${pad}px`,
      background: EQ_TOKENS.bgCard,
      borderBottom: `1px solid ${EQ_TOKENS.borderSubtle}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: tint ? `${tint}20` : EQ_TOKENS.bgCardHi,
        color: tint || EQ_TOKENS.textMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
      }}><i className={`fas ${icon}`}></i></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: EQ_TOKENS.textStrong }}>{label}</div>
        <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 2 }}>{meta}</div>
      </div>
      <i className="fas fa-chevron-right" style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted }}></i>
    </div>
  );
}

// ── History reconciliation
D1.History = function ({ density }) {
  const pad = density === 'compact' ? 12 : density === 'spacious' ? 20 : 16;
  return (
    <EqPhone>
      <PageHeader back title="Review history" subtitle="5 names from your history aren't in your library" />
      <ScrollArea>
        <div style={{ padding: `12px ${pad}px 16px` }}>
          <div style={{
            padding: '10px 12px', borderRadius: 10,
            background: EQ_TOKENS.warningBg, border: `1px solid ${EQ_TOKENS.warningBorder}`,
            color: EQ_TOKENS.textMain, fontSize: 12, lineHeight: 1.4, marginBottom: 14,
          }}>
            <i className="fas fa-circle-info" style={{ color: EQ_TOKENS.warning, marginRight: 6 }}></i>
            <strong style={{ color: EQ_TOKENS.textStrong }}>Link</strong> maps the old name to a machine you already have. <strong style={{ color: EQ_TOKENS.textStrong }}>Add</strong> creates a new entry.
          </div>
          {EQ_DATA.orphans.map(o => <OrphanCard key={o.id} o={o} />)}
        </div>
      </ScrollArea>
    </EqPhone>
  );
};

function OrphanCard({ o }) {
  return (
    <div style={{
      background: EQ_TOKENS.bgCard, border: `1px solid ${EQ_TOKENS.borderSubtle}`,
      borderRadius: 14, padding: 12, marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: EQ_TOKENS.warningBg, color: EQ_TOKENS.warning,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0,
        }}><i className="fas fa-circle-question"></i></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: EQ_TOKENS.textStrong, wordBreak: 'break-word' }}>
            "{o.name}"
          </div>
          <div style={{ fontSize: 10.5, color: EQ_TOKENS.textVeryMuted, marginTop: 2 }}>{o.context}</div>
        </div>
      </div>
      {o.suggestion && (
        <div style={{
          fontSize: 11, color: EQ_TOKENS.textMuted, marginBottom: 8,
          padding: '6px 10px', borderRadius: 8,
          background: 'rgba(29,211,176,0.06)', border: `1px solid ${EQ_TOKENS.primaryBorder}`,
        }}>
          <i className="fas fa-wand-magic-sparkles" style={{ color: EQ_TOKENS.primary, marginRight: 6, fontSize: 10 }}></i>
          Maybe: <strong style={{ color: EQ_TOKENS.textStrong }}>{o.suggestion}</strong>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <ActionBtn label="Add"   icon="fa-plus"  primary />
        <ActionBtn label="Link"  icon="fa-link"  accent />
        <ActionBtn label="Skip"  icon="fa-xmark" />
      </div>
    </div>
  );
}

function ActionBtn({ label, icon, primary, accent }) {
  let bg = EQ_TOKENS.bgCardHi, fg = EQ_TOKENS.textMain, border = EQ_TOKENS.border;
  if (primary) { bg = EQ_TOKENS.primary; fg = '#04201a'; border = EQ_TOKENS.primary; }
  else if (accent) { bg = EQ_TOKENS.primaryBg; fg = EQ_TOKENS.primary; border = EQ_TOKENS.primaryBorder; }
  return (
    <button style={{
      padding: '9px 8px', borderRadius: 10,
      background: bg, color: fg, border: `1px solid ${border}`,
      fontSize: 11.5, fontWeight: 700, fontFamily: FONT,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    }}>
      <i className={`fas ${icon}`} style={{ fontSize: 10 }}></i> {label}
    </button>
  );
}

// ── Browse catalog
D1.Browse = function ({ density }) {
  const pad = density === 'compact' ? 12 : density === 'spacious' ? 20 : 16;
  return (
    <EqPhone>
      <PageHeader title="Equipment" noBorder action={
        <button style={{
          width: 36, height: 36, borderRadius: 18,
          background: EQ_TOKENS.bgSurface, border: `1px solid ${EQ_TOKENS.border}`,
          color: EQ_TOKENS.textMain, fontSize: 13,
        }}><i className="fas fa-magnifying-glass"></i></button>
      } />
      <ThreeTab value="catalog" />
      <div style={{ padding: `0 ${pad}px 8px`, fontSize: 11, color: EQ_TOKENS.textVeryMuted, flexShrink: 0 }}>
        1,304 machines · 21 brands
      </div>
      <ScrollArea>
        <div style={{ paddingBottom: 16 }}>
          {EQ_DATA.brands.map((b, i) => (
            <BrandHeader key={b.id} brand={b} expanded={i === 0} pad={pad} />
          ))}
        </div>
      </ScrollArea>
      <EqBottomNav active="more" />
    </EqPhone>
  );
};

function BrandHeader({ brand, expanded, pad }) {
  const items = EQ_DATA.items.filter(it => it.brand === brand.name).slice(0, 3);
  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `12px ${pad}px`,
        background: EQ_TOKENS.bgSurface,
        borderBottom: `1px solid ${EQ_TOKENS.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 8,
            background: EQ_TOKENS.bgCardHi, color: EQ_TOKENS.textMain,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, letterSpacing: '-0.02em',
          }}>{brand.name[0]}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: EQ_TOKENS.textStrong }}>{brand.name}</div>
            <div style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted, marginTop: 1 }}>
              {brand.lines.length} lines · {brand.country}
            </div>
          </div>
        </div>
        <i className={`fas fa-chevron-${expanded ? 'down' : 'right'}`} style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted }}></i>
      </div>
      {expanded && (
        <>
          {brand.lines.slice(0, 2).map(line => (
            <React.Fragment key={line}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                padding: `8px ${pad}px 8px ${pad + 12}px`,
                background: EQ_TOKENS.bgApp, color: EQ_TOKENS.textMuted,
                fontSize: 11, fontWeight: 600,
              }}>
                <span><i className="fas fa-grip-vertical" style={{ marginRight: 6, fontSize: 9 }}></i>{line}</span>
                <span style={{ fontSize: 10, color: EQ_TOKENS.textVeryMuted }}>
                  {items.filter(it => it.line === line).length || 4}
                </span>
              </div>
              {items.filter(it => it.line === line).slice(0, 2).map(it => (
                <EquipRow key={it.id} item={it} pad={pad} showMeta={false} />
              ))}
            </React.Fragment>
          ))}
        </>
      )}
    </>
  );
}

Object.assign(window, { D1 });
