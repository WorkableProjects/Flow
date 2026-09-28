import { useEffect } from 'react';
import { getController } from '../canvas/instance';
import {
  copySelection,
  cutSelection,
  deleteSelection,
  groupSelection,
  nudgeSelection,
  ungroupSelection,
  duplicateSelection,
  goToPage,
  handlePaste,
  insertImage,
  openDocument,
  openFlowFile,
  pickImage,
  redo,
  reorderSelection,
  saveDocument,
  selectAll,
  undo,
} from '../state/actions';
import { board } from '../state/board';
import { screenToWorld } from '../engine/geometry';
import { ui } from '../state/ui';
import { selectToolByKey } from '../ui/ToolDock';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

/** Global keyboard, clipboard and drag-and-drop handling for the editor. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const ctrl = getController();

      if (mod) {
        const map: Record<string, () => void> = {
          z: () => (e.shiftKey ? redo() : undo()),
          y: redo,
          d: duplicateSelection,
          g: () => (e.shiftKey ? ungroupSelection() : groupSelection()),
          "'": () => ui.set({ snapGrid: !ui.get().snapGrid }),
          a: selectAll,
          s: saveDocument,
          o: openDocument,
          '0': () => ctrl?.setZoom(1),
          '1': () => ctrl?.zoomToFit(),
          '=': () => ctrl?.zoomBy(1.25),
          '+': () => ctrl?.zoomBy(1.25),
          '-': () => ctrl?.zoomBy(1 / 1.25),
        };
        const fn = map[k];
        if (fn) {
          e.preventDefault();
          fn();
        }
        return;
      }
      if (e.altKey) {
        if (e.code === 'KeyP') ui.set({ pagesOpen: !ui.get().pagesOpen });
        return;
      }

      switch (e.key) {
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          deleteSelection();
          return;
        case 'Escape':
          ui.set({ selection: new Set(), pagesOpen: false });
          ctrl?.cancelInteraction();
          return;
        case 'PageUp':
          e.preventDefault();
          goToPage(-1);
          return;
        case 'PageDown':
          e.preventDefault();
          goToPage(1);
          return;
        case ']':
        case '}':
          reorderSelection(e.shiftKey || e.key === '}' ? 'front' : 'forward');
          return;
        case '[':
        case '{':
          reorderSelection(e.shiftKey || e.key === '{' ? 'back' : 'backward');
          return;
        case '?':
          ui.set({ shortcutsOpen: !ui.get().shortcutsOpen });
          return;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!ui.get().selection.size) return;
          e.preventDefault();
          const d = e.shiftKey ? 10 : 1;
          const [dx, dy] = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key]!;
          nudgeSelection(dx, dy);
          return;
        }
      }
      if (k === 'c') {
        const c = ui.get().curtain;
        ui.set({ curtain: { ...c, on: !c.on } });
        return;
      }
      if (k === 'i') {
        pickImage();
        return;
      }
      if (k.length === 1 && !e.repeat) selectToolByKey(k);
    };

    const onCopy = (e: ClipboardEvent) => !isTyping(e.target) && copySelection(e);
    const onCut = (e: ClipboardEvent) => !isTyping(e.target) && cutSelection(e);
    const onPaste = (e: ClipboardEvent) => handlePaste(e);

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      const flow = files.find((f) => f.name.endsWith('.flow'));
      if (flow) {
        await openFlowFile(flow);
        return;
      }
      const ctrl = getController();
      const at = ctrl ? screenToWorld(board.page.camera, e.clientX, e.clientY) : undefined;
      for (const f of files.filter((f) => f.type.startsWith('image/'))) await insertImage(f, at);
    };

    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}
