import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { BoardCanvas } from './canvas/BoardCanvas';
import { getController } from './canvas/instance';
import { TextEditor, type EditRequest } from './canvas/TextEditor';
import { channelSupported, TutorSync } from './engine/sync';
import { useAppearance } from './hooks/useAppearance';
import { useAutosave } from './hooks/useAutosave';
import { useShortcuts } from './hooks/useShortcuts';
import { board } from './state/board';
import { useUI } from './state/ui';
import { ActionsBar, SelectionBar, TitleBar, ZoomBar } from './ui/Bars';
import { Curtain } from './ui/Curtain';
import { EquationSheet } from './ui/EquationSheet';
import { ElementsSheet } from './ui/ElementsSheet';
import { usePresence } from './hooks/usePresence';
import { GlassProvider } from './ui/GlassProvider';
import { PagesPanel } from './ui/PagesPanel';
import { Timer } from './ui/Timer';
import { ToolDock } from './ui/ToolDock';
import { FpsMeter, frameSink } from './ui/FpsMeter';
import { CustomizeSheet, ShortcutsSheet } from './ui/Sheets';
import type { ControllerEvents } from './canvas/controller';

export default function App({ onHome }: { onHome: () => void }) {
  const appearance = useAppearance();
  const liquid = useUI((s) => s.liquidGlass && s.device !== 'mobile');
  const timer = usePresence(useUI((s) => s.timerOpen));
  const stage = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<EditRequest | null>(null);
  const sync = useRef<TutorSync | null>(null);
  useShortcuts();
  useAutosave();

  useEffect(() => {
    if (!channelSupported()) return;
    const s = new TutorSync(board, () => getController()?.viewport ?? { width: window.innerWidth, height: window.innerHeight });
    sync.current = s;
    return () => s.destroy();
  }, []);

  const events = useMemo<ControllerEvents>(
    () => ({
      // Mount the editor synchronously so the very next keystroke lands in it.
      onEditText: (r) => flushSync(() => setEditing(r)),
      onPresence: (p) => sync.current?.presence(p),
      onFrame: frameSink,
    }),
    [],
  );

  return (
    <GlassProvider root={stage} enabled={liquid}>
      {/* Stage: the Liquid Glass root. Glass bars must be its direct children. */}
      <main ref={stage} className="fixed inset-0 overflow-hidden" data-liquid="off">
        <BoardCanvas appearance={appearance} events={events} />
        <Curtain />
        {editing && <TextEditor key={editing.element.id} request={editing} appearance={appearance} onDone={() => setEditing(null)} />}
        <TitleBar onHome={onHome} />
        <ActionsBar appearance={appearance} />
        {timer.mounted && <Timer leaving={timer.leaving} />}
        <SelectionBar appearance={appearance} />
        <ToolDock appearance={appearance} />
        <ZoomBar />
      </main>
      <PagesPanel appearance={appearance} />
      <EquationSheet appearance={appearance} />
      <ElementsSheet appearance={appearance} />
      <ShortcutsSheet />
      <CustomizeSheet />
      <FpsMeter />
    </GlassProvider>
  );
}
