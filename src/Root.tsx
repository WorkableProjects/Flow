import { useEffect, useRef, useState } from 'react';
import App from './App';
import { Home } from './home/Home';
import { Onboarding } from './home/Onboarding';
import { useAppearance } from './hooks/useAppearance';
import { closeCurrent, newLesson, openLesson } from './state/lessons';
import { lightweight, useUI } from './state/ui';
import { Logo } from './ui/Logo';
import { Toast } from './ui/Toast';

type Screen = 'loading' | 'home' | 'board';

/** How long Home ⇄ Board transitions run (matches the CSS below). */
const OPEN_MS = 560;
const CLOSE_MS = 440;

/** Circle-reveal geometry: centred on the tap, big enough to cover the window. */
function revealStyle(p: { x: number; y: number }): React.CSSProperties {
  const w = window.innerWidth, h = window.innerHeight;
  const r = Math.hypot(Math.max(p.x, w - p.x), Math.max(p.y, h - p.y));
  return { ['--ox' as string]: `${p.x}px`, ['--oy' as string]: `${p.y}px`, ['--r' as string]: `${Math.ceil(r)}px` };
}

/**
 * App shell: Home (welcome + recents) ⇄ Board. First launch asks for the
 * device type. Deep links: `?lesson=new` or `?lesson=<id>` open a board directly.
 */
export function Root() {
  useAppearance();
  const device = useUI((s) => s.device);
  const name = useUI((s) => s.name);
  const [screen, setScreen] = useState<Screen>('loading');
  // The screen underneath during a transition, and which way it's going.
  const [behind, setBehind] = useState<Screen | null>(null);
  const [motion, setMotion] = useState<'pending' | 'open' | 'close' | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const lastTap = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    if (device) document.documentElement.dataset.device = device;
    else delete document.documentElement.dataset.device;
  }, [device]);

  // Transitions grow from (and shrink back to) wherever the user tapped.
  useEffect(() => {
    const down = (e: PointerEvent) => (lastTap.current = { x: e.clientX, y: e.clientY });
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, []);

  useEffect(() => {
    const link = new URLSearchParams(location.search).get('lesson');
    if (link === 'new') {
      newLesson();
      setScreen('board');
    } else if (link) {
      openLesson(link).then((ok) => setScreen(ok ? 'board' : 'home'));
    } else setScreen('home');
    return () => clearTimeout(timer.current);
  }, []);

  const tapPoint = () => lastTap.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  /** Home → Board: the lesson opens out of the tap; Home recedes behind it. */
  const openBoard = () => {
    clearTimeout(timer.current);
    if (lightweight()) {
      setBehind(null);
      setMotion(null);
      setScreen('board');
      return;
    }
    setOrigin(tapPoint());
    setBehind('home');
    // Hold the board closed until it has mounted and painted, so a heavy
    // first render can't eat the animation.
    setMotion('pending');
    setScreen('board');
  };

  useEffect(() => {
    if (motion !== 'pending') return;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      setMotion('open');
      timer.current = window.setTimeout(() => {
        setBehind(null);
        setMotion(null);
      }, OPEN_MS);
    };
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(start);
    });
    // Background tabs may not run animation frames: never leave the board held closed.
    const fallback = window.setTimeout(start, 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [motion]);

  /** Board → Home: save, then the board folds back into the tap as Home returns. */
  const goHome = async () => {
    await closeCurrent();
    clearTimeout(timer.current);
    if (lightweight()) {
      setBehind(null);
      setMotion(null);
      setScreen('home');
      return;
    }
    setOrigin(tapPoint());
    setBehind('board');
    setMotion('close');
    setScreen('home');
    timer.current = window.setTimeout(() => {
      setBehind(null);
      setMotion(null);
    }, CLOSE_MS);
  };

  const showHome = screen === 'home' || behind === 'home';
  const showBoard = screen === 'board' || behind === 'board';

  return (
    <>
      {screen === 'loading' && (
        <div className="fixed inset-0 flex items-center justify-center bg-grouped" aria-hidden>
          <Logo size={96} className="drop-shadow-[0_10px_24px_var(--tint-glow)]" />
        </div>
      )}
      {showHome && (
        <div className={`fixed inset-0 ${screen !== 'home' ? 'pointer-events-none' : ''} ${motion === 'open' ? 'home-recede' : motion === 'close' ? 'home-return' : ''}`} inert={screen !== 'home'}>
          <Home onOpen={openBoard} />
        </div>
      )}
      {showBoard && (
        <div
          className={`fixed inset-0 z-10 ${screen !== 'board' ? 'pointer-events-none' : ''} ${motion === 'pending' ? 'screen-held' : motion === 'open' ? 'screen-reveal' : motion === 'close' ? 'screen-conceal' : ''}`}
          style={motion ? revealStyle(origin) : undefined}
          inert={screen !== 'board'}
        >
          <App onHome={goHome} />
        </div>
      )}
      {screen === 'home' && !motion && (!device || name === null) && <Onboarding />}
      <Toast />
    </>
  );
}
