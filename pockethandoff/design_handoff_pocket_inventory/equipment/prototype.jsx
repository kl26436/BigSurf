// Pocket Inventory — clickable prototype
// Renders a single phone frame with a screen stack. Tap rows / buttons /
// tabs to navigate. Equipment and Exercise libraries share a top toggle
// so they read as the same app.

function PocketPrototypeStack({ density = 'regular', showMeta = true, accent, initialStack }) {
  const [stack, setStack] = React.useState(initialStack || ['equipLanding']);
  const [showAdd, setShowAdd] = React.useState(false);
  const [ctx, setCtx] = React.useState({ gymId: 'absolute', itemId: '1', exId: 'e1' });
  const [toast, setToast] = React.useState(null);
  const a = accent || EQ_TOKENS.primary;

  const top = stack[stack.length - 1];

  const goTo = (screen, c) => {
    if (c) setCtx({ ...ctx, ...c });
    setStack([...stack, screen]);
  };
  const goBack = () => {
    if (stack.length > 1) setStack(stack.slice(0, -1));
  };
  const reset = (screen) => setStack([screen]);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const nav = {
    goBack,
    goEquipLanding: () => reset('equipLanding'),
    goLibrary:      () => reset('equipAll'),
    goBrowse:       () => reset('equipCatalog'),
    goEx:           () => reset('exLibrary'),
    goGym:    (gymId) => goTo('gymDetail', { gymId }),
    goMachine: (itemId) => goTo('machineDetail', { itemId }),
    goHistory:      () => goTo('history'),
    goAdd:          () => setShowAdd(true),
    closeAdd:       () => { setShowAdd(false); flash('Added 3 machines to Absolute Recomp'); },
    goExDetail: (exId) => goTo('exDetail', { exId }),
  };

  let screen;
  switch (top) {
    case 'equipLanding':
      screen = <D2.Landing density={density} showMeta={showMeta} nav={nav} accent={a} />;
      break;
    case 'equipAll':
      screen = <D2.GymDetail density={density} showMeta={showMeta} nav={nav} gymId="absolute" />;
      break;
    case 'equipCatalog':
      screen = <D2.Browse density={density} nav={nav} accent={a} />;
      break;
    case 'gymDetail':
      screen = <D2.GymDetail density={density} showMeta={showMeta} nav={nav} gymId={ctx.gymId} />;
      break;
    case 'machineDetail':
      screen = <D2.MachineDetail density={density} nav={nav} itemId={ctx.itemId} />;
      break;
    case 'history':
      screen = <D2.History density={density} nav={nav} />;
      break;
    case 'exLibrary':
      screen = <ExLibrary density={density} showMeta={showMeta} accent={a}
                 onPick={(ex) => goTo('exDetail', { exId: ex.id })}
                 onTabSwitch={(t) => t === 'equipment' && reset('equipLanding')} />;
      break;
    case 'exDetail': {
      const ex = EX_DATA.exercises.find(e => e.id === ctx.exId) || EX_DATA.exercises[0];
      screen = <ExDetail ex={ex} onBack={goBack} accent={a} />;
      break;
    }
    default:
      screen = <D2.Landing density={density} showMeta={showMeta} nav={nav} accent={a} />;
  }

  return (
    <div style={{ position: 'relative', width: 375, height: 812 }}>
      {screen}
      {showAdd && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          <D2.QuickAdd density={density} nav={nav} />
        </div>
      )}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 36, left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 16px', borderRadius: 999,
          background: EQ_TOKENS.bgCardHi, color: EQ_TOKENS.textStrong,
          border: `1px solid ${EQ_TOKENS.borderSubtle}`,
          fontSize: 12, fontWeight: 600, fontFamily: FONT,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
          animation: 'pkToast 280ms ease-out',
          zIndex: 100,
        }}>
          <i className="fas fa-circle-check" style={{ color: EQ_TOKENS.primary, marginRight: 6 }}></i>
          {toast}
        </div>
      )}
    </div>
  );
}

if (typeof document !== 'undefined' && !document.getElementById('pk-anim')) {
  const s = document.createElement('style');
  s.id = 'pk-anim';
  s.textContent = `
    @keyframes pkToast { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { PocketPrototypeStack });
