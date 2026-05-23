import { describe, expect, it } from 'vitest';
import {
  startDrag,
  updateDrag,
  completeDrag,
  cancelDrag,
  distanceMoved,
  isMeaningfulDrag,
  describeDropTarget,
} from '../bayPortDragHelper';

describe('startDrag', () => {
  it('ustawia state na dragging z koordynatami', () => {
    const s = startDrag('bay-1', 'port-out', 100, 200);
    expect(s.type).toBe('dragging');
    if (s.type === 'dragging') {
      expect(s.sourceBayRef).toBe('bay-1');
      expect(s.sourceX).toBe(100);
      expect(s.sourceY).toBe(200);
    }
  });
});

describe('updateDrag', () => {
  it('aktualizuje currentX/Y', () => {
    let s = startDrag('bay-1', 'port-out', 100, 200);
    s = updateDrag(s, 150, 250);
    if (s.type === 'dragging') {
      expect(s.currentX).toBe(150);
      expect(s.currentY).toBe(250);
    }
  });

  it('no-op gdy state != dragging', () => {
    const s = cancelDrag();
    const s2 = updateDrag(s, 100, 100);
    expect(s2.type).toBe('idle');
  });
});

describe('completeDrag — connect to terminal', () => {
  it('zwraca connect_to_terminal result', () => {
    const s = startDrag('bay-1', 'port-out', 100, 200);
    const { newState, result } = completeDrag(s, { type: 'terminal', ref: 'term-5' });
    expect(newState.type).toBe('idle');
    expect(result?.type).toBe('connect_to_terminal');
    if (result?.type === 'connect_to_terminal') {
      expect(result.targetTerminalRef).toBe('term-5');
    }
  });
});

describe('completeDrag — empty space', () => {
  it('zwraca create_zksn z koordynatami', () => {
    const s = startDrag('bay-1', 'port-out', 100, 200);
    const { result } = completeDrag(s, { type: 'empty', x: 500, y: 600 });
    expect(result?.type).toBe('create_zksn');
    if (result?.type === 'create_zksn') {
      expect(result.x).toBe(500);
      expect(result.y).toBe(600);
    }
  });
});

describe('completeDrag — cancel', () => {
  it('zwraca cancel result', () => {
    const s = startDrag('bay-1', 'port-out', 100, 200);
    const { result } = completeDrag(s, { type: 'cancel' });
    expect(result?.type).toBe('cancel');
  });
});

describe('distanceMoved', () => {
  it('Pitagoras', () => {
    let s = startDrag('bay-1', 'port-out', 0, 0);
    s = updateDrag(s, 3, 4);
    expect(distanceMoved(s)).toBe(5);
  });

  it('0 gdy state idle', () => {
    expect(distanceMoved({ type: 'idle' })).toBe(0);
  });
});

describe('isMeaningfulDrag', () => {
  it('false dla mniej niż 10 px', () => {
    let s = startDrag('bay-1', 'port', 100, 100);
    s = updateDrag(s, 105, 105);
    expect(isMeaningfulDrag(s)).toBe(false);
  });

  it('true dla >= 10 px', () => {
    let s = startDrag('bay-1', 'port', 0, 0);
    s = updateDrag(s, 10, 10);
    expect(isMeaningfulDrag(s)).toBe(true);
  });
});

describe('describeDropTarget', () => {
  it('PL opis per typ', () => {
    expect(
      describeDropTarget({
        type: 'connect_to_terminal',
        sourceBayRef: 'b1',
        targetTerminalRef: 't1',
      }),
    ).toContain('Łączenie');
    expect(
      describeDropTarget({ type: 'create_zksn', sourceBayRef: 'b1', x: 0, y: 0 }),
    ).toContain('ZKSN');
    expect(describeDropTarget({ type: 'cancel', sourceBayRef: 'b1' })).toContain('Anulowanie');
  });
});
