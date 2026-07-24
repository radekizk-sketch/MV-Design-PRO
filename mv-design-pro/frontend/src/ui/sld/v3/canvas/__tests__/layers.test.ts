/**
 * W5 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §18 „Podwarstwy L2", P1) — wyrocznia
 * taksonomii podwarstw L2: kompletność+rozłączność mapowania na warstwy renderu,
 * stan zbiorczy (on/off/mixed) i master-toggle. Podwarstwa = WIDOCZNOŚĆ (test
 * bajt-inwariancji geometrii per stan żyje w `workspacePanels.test.tsx`).
 */
import { describe, expect, it } from 'vitest';
import {
  CANVAS_LAYER_IDS,
  L2_SUBLAYER_IDS,
  L2_SUBLAYER_MEMBERS,
  l2SublayerState,
  toggleL2Sublayer,
  type CanvasLayerId,
} from '../layers';

describe('layers — podwarstwy L2 (W5 §18)', () => {
  it('członkowie podwarstw pokrywają DOKŁADNIE warstwy renderu, bez powtórzeń (kompletność+rozłączność)', () => {
    const members = L2_SUBLAYER_IDS.flatMap((id) => L2_SUBLAYER_MEMBERS[id]);
    // rozłączność: żadna warstwa w dwóch podwarstwach
    expect(new Set(members).size).toBe(members.length);
    // kompletność: suma == pełny zestaw warstw renderu
    expect([...members].sort()).toEqual([...CANVAS_LAYER_IDS].sort());
  });

  it('l2SublayerState: on gdy wszyscy widoczni, off gdy wszyscy ukryci, mixed inaczej', () => {
    // L2A ma dwóch członków (stationsApparatus, derSources) — dobre do mixed.
    expect(l2SublayerState({}, 'L2A')).toBe('on'); // brak wpisu = widoczny
    const allOff: Partial<Record<CanvasLayerId, boolean>> = {
      stationsApparatus: false,
      derSources: false,
    };
    expect(l2SublayerState(allOff, 'L2A')).toBe('off');
    expect(l2SublayerState({ stationsApparatus: false }, 'L2A')).toBe('mixed');
  });

  it('toggleL2Sublayer: on→wszyscy ukryci; off/mixed→wszyscy widoczni (tri-state master)', () => {
    const off = toggleL2Sublayer({}, 'L2A'); // on → off
    expect(l2SublayerState(off, 'L2A')).toBe('off');
    const on = toggleL2Sublayer(off, 'L2A'); // off → on
    expect(l2SublayerState(on, 'L2A')).toBe('on');
    const fromMixed = toggleL2Sublayer({ stationsApparatus: false }, 'L2A');
    expect(l2SublayerState(fromMixed, 'L2A')).toBe('on'); // mixed → on
  });

  it('toggleL2Sublayer jest czysty (nie mutuje wejścia)', () => {
    const input = { stationsApparatus: true } as const;
    const snapshot = JSON.stringify(input);
    toggleL2Sublayer(input, 'L2A');
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
