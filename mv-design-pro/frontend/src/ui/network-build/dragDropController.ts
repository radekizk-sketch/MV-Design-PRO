/**
 * dragDropController — HTML5 drag&drop dla palet → kanwy SLD (Iteracja 12).
 *
 * Wzorzec:
 *  - draggable element w palecie (BuildSidebar) ma onDragStart, który ustawia
 *    payload (PaletteDragPayload) w dataTransfer.
 *  - canvas (SldWorkspaceContainer) ma onDragOver/onDrop. onDrop deserializuje
 *    payload i wywołuje onPaletteDrop(payload, position).
 *
 * Payload jest deterministyczny i niezależny od backendu — to "intencja
 * inzyniera" (zinsertuj element X w pozycji Y), backend zatwierdzi/odrzuci.
 */

const MIME_TYPE = 'application/x.mvdesignpro-palette';

export type PaletteItemKind =
  | 'gpz'
  | 'station'
  | 'zksn'
  | 'branch_pole'
  | 'pv'
  | 'bess'
  | 'fw'
  | 'load'
  | 'nop';

export interface PaletteDragPayload {
  readonly kind: PaletteItemKind;
  readonly labelPl: string;
}

export function setPaletteDragData(
  event: React.DragEvent,
  payload: PaletteDragPayload,
): void {
  event.dataTransfer.setData(MIME_TYPE, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = 'copy';
}

export function readPaletteDragData(event: React.DragEvent): PaletteDragPayload | null {
  const raw = event.dataTransfer.getData(MIME_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.kind === 'string' && typeof parsed?.labelPl === 'string') {
      return { kind: parsed.kind as PaletteItemKind, labelPl: parsed.labelPl };
    }
    return null;
  } catch {
    return null;
  }
}

export function hasPaletteDragData(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes(MIME_TYPE);
}

export const PALETTE_MIME_TYPE = MIME_TYPE;
