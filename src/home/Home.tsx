import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { deleteLesson, listLessons, type LessonSummary } from '../engine/persistence';
import type { Background } from '../engine/types';
import { importLesson, newLesson, openLesson } from '../state/lessons';
import { CREDITS, resetProfile, toast, ui, useUI, type AppearancePref, type DevicePref } from '../state/ui';
import { Segmented } from '../ui/controls';
import { BrandBackdrop } from './BrandBackdrop';
import { Popover } from '../ui/Popover';

declare const __APP_VERSION__: string;

const TEMPLATES: { bg: Background; label: string; icon: IconName; hint: string }[] = [
  { bg: 'blank', label: 'Blank', icon: 'bgBlank', hint: 'Free-form' },
  { bg: 'dots', label: 'Dots', icon: 'bgDots', hint: 'Sketching' },
  { bg: 'grid', label: 'Grid', icon: 'bgGrid', hint: 'Diagrams' },
  { bg: 'lined', label: 'Lined', icon: 'bgLined', hint: 'Writing' },
  { bg: 'graph', label: 'Graph', icon: 'bgGraph', hint: 'Math' },
];

/** CSS approximations of each paper for the template cards. */
const PAPER: Record<Background, CSSProperties> = {
  blank: {},
  dots: { backgroundImage: 'radial-gradient(var(--label-3) 1px, transparent 1.2px)', backgroundSize: '12px 12px' },
  grid: { backgroundImage: 'linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px)', backgroundSize: '14px 14px' },
  lined: { backgroundImage: 'linear-gradient(var(--hairline) 1px, transparent 1px)', backgroundSize: '100% 14px', boxShadow: 'inset 18px 0 0 -17px rgba(255,59,48,0.5)' },
  graph: {
    backgroundImage:
      'linear-gradient(var(--label-2), var(--label-2)), linear-gradient(var(--label-2), var(--label-2)), linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px)',
    backgroundSize: '100% 1.5px, 1.5px 100%, 8px 8px, 8px 8px',
    backgroundPosition: '0 50%, 50% 0, 0 0, 0 0',
    backgroundRepeat: 'no-repeat, no-repeat, repeat, repeat',
  },
};

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;
export function relativeTime(t: number, now = Date.now()) {
  const s = Math.round((t - now) / 1000);
  const abs = Math.abs(s);
  if (!rtf || abs < 45) return 'Just now';
  const [v, u]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 3600 ? [s / 60, 'minute'] : abs < 86400 ? [s / 3600, 'hour'] : abs < 604800 ? [s / 86400, 'day'] : [0, 'day'];
  if (!v) return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: abs > 31536000 ? 'numeric' : undefined });
  return rtf.format(Math.round(v), u);
}

function LessonCard({ lesson, onOpen, onDelete }: { lesson: LessonSummary; onOpen: () => void; onDelete: () => void }) {
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="spring block w-full overflow-hidden rounded-[22px] bg-cell text-left shadow-[0_1px_3px_rgba(0,0,0,0.06),0_0_0_0.5px_var(--hairline)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1),0_0_0_0.5px_var(--hairline)] active:scale-[0.98]"
      >
        <div className="aspect-[16/10] w-full overflow-hidden border-b border-hairline bg-white">
          {lesson.thumb ? (
            <img src={lesson.thumb} alt="" draggable={false} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[#C7C7CC]"><Icon name="scribble" size={40} /></div>
          )}
        </div>
        <div className="px-4 pt-3 pb-3.5">
          <p className="truncate text-headline font-semibold tracking-title text-label">{lesson.title}</p>
          <p className="mt-0.5 text-footnote text-label-2">
            {relativeTime(lesson.updatedAt)} · {lesson.pages} {lesson.pages === 1 ? 'page' : 'pages'}
          </p>
        </div>
      </button>
      <button
        type="button"
        aria-label={`Delete ${lesson.title}`}
        title="Delete lesson"
        onClick={onDelete}
        className="spring sheet absolute top-2.5 right-2.5 flex h-11 w-11 items-center justify-center rounded-full! text-danger opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 mobile:opacity-100"
      >
        <Icon name="trash" size={17} />
      </button>
    </li>
  );
}

/** Home: the app's welcome screen — start a lesson or pick up a recent one. */
export function Home({ onOpen }: { onOpen: () => void }) {
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [settings, setSettings] = useState(false);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const appearance = useUI((s) => s.appearance);
  const device = useUI((s) => s.device);
  const name = useUI((s) => s.name);

  const refresh = () => listLessons().then(setLessons);
  useEffect(() => {
    refresh();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (lessons ?? []).filter((l) => !q || l.title.toLowerCase().includes(q));
  }, [lessons, query]);

  const start = (bg: Background) => {
    newLesson(bg);
    onOpen();
  };

  const open = async (id: string) => {
    if (await openLesson(id)) onOpen();
    else {
      toast('That lesson couldn’t be opened');
      refresh();
    }
  };

  const remove = async (l: LessonSummary) => {
    if (!window.confirm(`Delete “${l.title}”? This can’t be undone.`)) return;
    await deleteLesson(l.id);
    refresh();
  };

  const importFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.flow,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        await importLesson(f, new Set((lessons ?? []).map((l) => l.id)));
        onOpen();
      } catch {
        toast('That isn’t a Flow file');
      }
    };
    input.click();
  };

  return (
    <div className="home-bg fade-in relative h-full overflow-x-hidden overflow-y-auto" style={{ touchAction: 'pan-y' }}>
      <BrandBackdrop />
      <div className="relative mx-auto max-w-[1080px] px-4 pt-[max(16px,env(safe-area-inset-top))] pb-16 sm:px-8">
        {/* Nav bar */}
        <header className="flex h-14 items-center justify-end">
          <button
            ref={settingsRef}
            type="button"
            aria-label="Settings"
            onClick={() => setSettings((v) => !v)}
            className="spring flex h-11 w-11 items-center justify-center rounded-full text-tint hover:bg-fill"
          >
            <Icon name="settings" size={21} />
          </button>
        </header>

        {/* Hero */}
        <section className="mt-6 sm:mt-10">
          <p className="text-subhead font-semibold text-label-2">{name ? `${greeting()}, ${name}` : greeting()}</p>
          <h1 className="mt-1 text-large-title font-bold tracking-title sm:text-[44px] sm:leading-[1.1]">
            {name ? (
              <>
                Welcome, <span className="text-tint">{name}</span>.
              </>
            ) : (
              'Ready to teach?'
            )}
          </h1>
          {name && <p className="mt-2 text-body text-label-2">Ready to teach? Start a lesson or pick up where you left off.</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => start('dots')}
              className="spring flex h-[50px] items-center gap-2 rounded-full bg-tint px-6 text-headline font-semibold text-white shadow-[0_4px_14px_var(--tint-glow)] hover:brightness-110 active:scale-[0.97]"
            >
              <Icon name="plus" size={16} /> New Lesson
            </button>
            <button
              type="button"
              onClick={importFile}
              className="spring flex h-[50px] items-center gap-2 rounded-full bg-cell px-6 text-headline font-semibold text-on-tint-soft shadow-[0_0_0_0.5px_var(--hairline)] active:scale-[0.97]"
            >
              <Icon name="folder" size={18} /> Open File…
            </button>
          </div>
        </section>

        {/* Templates */}
        <section className="mt-10" aria-labelledby="start-with">
          <h2 id="start-with" className="text-title-2 font-bold tracking-title">Start with</h2>
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {TEMPLATES.map((t) => (
              <li key={t.bg} className={t.bg === 'lined' ? 'max-sm:hidden' : ''}>
                <button
                  type="button"
                  onClick={() => start(t.bg)}
                  aria-label={`New ${t.label} lesson`}
                  className="spring group w-full rounded-[22px] bg-cell p-2 text-left shadow-[0_1px_3px_rgba(0,0,0,0.06),0_0_0_0.5px_var(--hairline)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1),0_0_0_0.5px_var(--hairline)] active:scale-[0.97]"
                >
                  <div className="aspect-[4/3] rounded-[14px] bg-bg shadow-[inset_0_0_0_0.5px_var(--hairline)]" style={PAPER[t.bg]} />
                  <div className="flex items-center gap-1.5 px-1.5 pt-2 pb-0.5">
                    <Icon name={t.icon} size={14} className="text-tint" />
                    <span className="text-subhead font-semibold text-label">{t.label}</span>
                    <span className="ml-auto truncate text-caption text-label-2 max-md:hidden">{t.hint}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Recents */}
        <section className="mt-10" aria-labelledby="recents">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="recents" className="text-title-2 font-bold tracking-title">Recent Lessons</h2>
            {lessons && lessons.length > 3 && (
              <label className="flex h-9 w-full items-center gap-2 rounded-[10px] bg-fill px-2.5 text-label-2 sm:w-64">
                <Icon name="search" size={15} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  aria-label="Search lessons"
                  className="min-w-0 flex-1 bg-transparent text-body text-label outline-none placeholder:text-label-2"
                />
              </label>
            )}
          </div>

          {lessons === null ? null : lessons.length === 0 ? (
            <div className="mt-3 flex flex-col items-center rounded-[26px] bg-cell px-6 py-12 text-center shadow-[0_0_0_0.5px_var(--hairline)]">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-tint-soft text-on-tint-soft"><Icon name="books" size={28} /></span>
              <p className="mt-4 text-headline font-semibold">No lessons yet</p>
              <p className="mt-1 max-w-sm text-subhead text-label-2">Lessons save automatically as you work and show up here, ready for your next session.</p>
            </div>
          ) : shown.length === 0 ? (
            <p className="mt-6 text-center text-subhead text-label-2">No lessons match “{query}”.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3">
              {shown.map((l) => (
                <LessonCard key={l.id} lesson={l} onOpen={() => open(l.id)} onDelete={() => remove(l)} />
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-14 text-center text-caption text-label-3">
          <p>{CREDITS}</p>
          <p className="mt-0.5">Version {__APP_VERSION__}</p>
        </footer>
      </div>

      <Popover open={settings} onClose={() => setSettings(false)} anchor={settingsRef} placement="bottom" label="Settings" className="w-[320px] max-w-[calc(100vw-24px)] p-4">
        <p className="mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Device</p>
        <Segmented<DevicePref>
          label="Device"
          value={device ?? 'desktop'}
          onChange={(v) => ui.set({ device: v })}
          options={[
            { value: 'mobile', label: <span className="flex items-center gap-1.5"><Icon name="tablet" size={15} />Mobile</span> },
            { value: 'desktop', label: <span className="flex items-center gap-1.5"><Icon name="desktop" size={15} />Desktop</span> },
          ]}
        />
        <p className="mt-4 mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Appearance</p>
        <Segmented<AppearancePref>
          label="Appearance"
          value={appearance}
          onChange={(v) => ui.set({ appearance: v })}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'Auto' },
          ]}
        />
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Profile</p>
          <label className="flex min-h-11 items-center gap-3">
            <Icon name="person" size={22} className="text-label-2" />
            <input
              value={name ?? ''}
              onChange={(e) => ui.set({ name: e.target.value.slice(0, 40) })}
              onBlur={(e) => ui.set({ name: e.target.value.trim().replace(/\s+/g, ' ') })}
              placeholder="First name"
              aria-label="First name"
              className="h-9 min-w-0 flex-1 rounded-[10px] bg-fill px-3 text-body text-label outline-none placeholder:text-label-3 focus:shadow-[0_0_0_2px_var(--tint)]"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Reset your profile? Flow will forget your name and device choice and show the welcome again. Your lessons are kept.')) return;
              setSettings(false);
              resetProfile();
            }}
            className="spring mt-2 flex h-11 w-full items-center justify-center rounded-full bg-fill text-subhead font-semibold text-danger hover:bg-fill-2 active:scale-[0.98]"
          >
            Reset Profile
          </button>
        </div>
      </Popover>
    </div>
  );
}
