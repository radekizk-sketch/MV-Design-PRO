/**
 * Testy dragDropController (Iteracja 12) — HTML5 drag&drop helpers.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  PALETTE_MIME_TYPE,
  hasPaletteDragData,
  readPaletteDragData,
  setPaletteDragData,
  type PaletteDragPayload,
} from '../dragDropController';

function createMockDragEvent(overrides?: Partial<{ types: string[]; data: Record<string, string> }>): React.DragEvent {
  const types = overrides?.types ?? [];
  const data = overrides?.data ?? {};
  return {
    dataTransfer: {
      setData: vi.fn((type: string, value: string) => {
        data[type] = value;
        if (!types.includes(type)) types.push(type);
      }),
      getData: vi.fn((type: string) => data[type] ?? ''),
      types,
      effectAllowed: '',
      dropEffect: '',
    },
  } as unknown as React.DragEvent;
}

describe('dragDropController', () => {
  it('PALETTE_MIME_TYPE jest stabilnym MIME type', () => {
    expect(PALETTE_MIME_TYPE).toBe('application/x.mvdesignpro-palette');
  });

  it('setPaletteDragData zapisuje payload jako JSON', () => {
    const event = createMockDragEvent();
    const payload: PaletteDragPayload = { kind: 'gpz', labelPl: 'GPZ Centralny' };
    setPaletteDragData(event, payload);
    expect(event.dataTransfer.setData).toHaveBeenCalledWith(
      PALETTE_MIME_TYPE,
      JSON.stringify(payload),
    );
    expect(event.dataTransfer.effectAllowed).toBe('copy');
  });

  it('readPaletteDragData deserializuje payload', () => {
    const payload: PaletteDragPayload = { kind: 'pv', labelPl: 'PV-1' };
    const event = createMockDragEvent({
      types: [PALETTE_MIME_TYPE],
      data: { [PALETTE_MIME_TYPE]: JSON.stringify(payload) },
    });
    const result = readPaletteDragData(event);
    expect(result).toEqual(payload);
  });

  it('readPaletteDragData zwraca null gdy brak danych', () => {
    const event = createMockDragEvent();
    expect(readPaletteDragData(event)).toBeNull();
  });

  it('readPaletteDragData zwraca null gdy payload nie jest poprawnym JSON', () => {
    const event = createMockDragEvent({
      types: [PALETTE_MIME_TYPE],
      data: { [PALETTE_MIME_TYPE]: 'invalid-json{' },
    });
    expect(readPaletteDragData(event)).toBeNull();
  });

  it('readPaletteDragData zwraca null gdy payload nie ma kind/labelPl', () => {
    const event = createMockDragEvent({
      types: [PALETTE_MIME_TYPE],
      data: { [PALETTE_MIME_TYPE]: JSON.stringify({ foo: 'bar' }) },
    });
    expect(readPaletteDragData(event)).toBeNull();
  });

  it('hasPaletteDragData wykrywa MIME type w types', () => {
    const eventWithData = createMockDragEvent({ types: [PALETTE_MIME_TYPE] });
    const eventWithout = createMockDragEvent();
    expect(hasPaletteDragData(eventWithData)).toBe(true);
    expect(hasPaletteDragData(eventWithout)).toBe(false);
  });
});
