/*
 * Kontener trzech paneli: LEWY (nawigacja/kontekst) · ŚRODKOWY (warsztat, zawsze
 * widoczny) · PRAWY (inspektor, chowany). Uchwyty zmieniają szerokość (granice
 * z useShellStore), 2× klik na uchwycie zwija/rozwija panel, ArrowLeft/Right =
 * zmiana szerokości z klawiatury (SPEC_UKLAD_PANELI §1, karta §4a).
 */

import { useCallback, useRef, type ReactNode } from 'react';
import { RAIL_WIDTH, clampLeftWidth, clampRightWidth } from './useShellStore';
import { SHELL_STRINGS } from './strings';

const KEYBOARD_STEP = 16;

interface PanelLayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onResizeLeft: (width: number) => void;
  onResizeRight: (width: number) => void;
}

export function PanelLayout({
  left,
  center,
  right,
  leftWidth,
  rightWidth,
  leftCollapsed,
  rightCollapsed,
  onToggleLeft,
  onToggleRight,
  onResizeLeft,
  onResizeRight,
}: PanelLayoutProps) {
  const dragRef = useRef<{ startX: number; startWidth: number; side: 'left' | 'right' } | null>(null);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = event.clientX - drag.startX;
      if (drag.side === 'left') {
        onResizeLeft(clampLeftWidth(drag.startWidth + delta));
      } else {
        onResizeRight(clampRightWidth(drag.startWidth - delta));
      }
    },
    [onResizeLeft, onResizeRight],
  );

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopDrag);
  }, [handlePointerMove]);

  const startDrag = useCallback(
    (side: 'left' | 'right') => (event: React.PointerEvent) => {
      dragRef.current = {
        startX: event.clientX,
        startWidth: side === 'left' ? leftWidth : rightWidth,
        side,
      };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopDrag);
    },
    [leftWidth, rightWidth, handlePointerMove, stopDrag],
  );

  const leftColWidth = leftCollapsed ? RAIL_WIDTH : leftWidth;
  const rightColWidth = rightCollapsed ? 0 : rightWidth;
  const gridTemplateColumns = `${leftColWidth}px 6px minmax(0, 1fr) ${
    rightCollapsed ? '0px' : '6px'
  } ${rightColWidth}px`;

  const onLeftHandleKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') onResizeLeft(clampLeftWidth(leftWidth - KEYBOARD_STEP));
    if (event.key === 'ArrowRight') onResizeLeft(clampLeftWidth(leftWidth + KEYBOARD_STEP));
  };
  const onRightHandleKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') onResizeRight(clampRightWidth(rightWidth + KEYBOARD_STEP));
    if (event.key === 'ArrowRight') onResizeRight(clampRightWidth(rightWidth - KEYBOARD_STEP));
  };

  return (
    <div className="mvd-body" style={{ gridTemplateColumns }} data-testid="mvd-body">
      {left}

      <button
        type="button"
        className="mvd-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={SHELL_STRINGS.toggleLeft}
        onDoubleClick={onToggleLeft}
        onPointerDown={startDrag('left')}
        onKeyDown={onLeftHandleKey}
        data-testid="mvd-handle-left"
      />

      <main className="mvd-center" aria-label={SHELL_STRINGS.workspaceLabel} data-testid="mvd-center">
        {center}
      </main>

      <button
        type="button"
        className="mvd-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={SHELL_STRINGS.toggleRight}
        hidden={rightCollapsed}
        onDoubleClick={onToggleRight}
        onPointerDown={startDrag('right')}
        onKeyDown={onRightHandleKey}
        data-testid="mvd-handle-right"
      />

      <aside
        className="mvd-inspector"
        aria-label={SHELL_STRINGS.inspectorHeading}
        hidden={rightCollapsed}
        data-testid="mvd-inspector"
      >
        {right}
      </aside>
    </div>
  );
}
