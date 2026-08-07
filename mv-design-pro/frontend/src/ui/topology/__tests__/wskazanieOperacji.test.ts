/**
 * B-2 — JEDNO ŹRÓDŁO WSKAZANIA OPERACJI (`ui/topology/wskazanieOperacji.ts`).
 *
 * Reguła pierwszeństwa kandydatów jest wspólna dla DWÓCH mechanizmów, które
 * muszą wskazać ten sam obiekt: selekcji/inspektora (`ui2/kreatory/rama/
 * selekcjaPoOperacji.ts`) i kotwicy kamery (`ui/sld/v3/canvas/viewAnchor.ts`).
 * Test przypina zarówno samą regułę, jak i to, że selekcja nadal z niej czyta
 * (predykaty parami — CLAUDE.md „KLASA, NIE INSTANCJA" pkt 3): rozjazd tych
 * dwóch dałby projektantowi inspektor jednego obiektu i kadr drugiego.
 */
import { describe, expect, it } from 'vitest';

import { wskazanieOperacji } from '../wskazanieOperacji';
import { kanonicznyRefZOperacji, refZOperacji } from '../../../ui2/kreatory/rama/selekcjaPoOperacji';
import type { DomainOpResponseV1 } from '../../../types/enm';

describe('wskazanieOperacji — reguła pierwszeństwa kandydatów', () => {
  it('wskazanie jawne backendu jest PIERWSZYM kandydatem, utworzone idą po nim w kolejności odpowiedzi', () => {
    const w = wskazanieOperacji(
      { element_id: 'stn/a/station', element_type: 'substation', zoom_to: true },
      { created_element_ids: ['stn/a/sn_bus', 'seg/b/segment_L', 'stn/a/station'] },
    );
    expect(w?.kandydaci).toEqual(['stn/a/station', 'stn/a/sn_bus', 'seg/b/segment_L']);
    expect(w?.refWskazania).toBe('stn/a/station');
    expect(w?.typWskazania).toBe('substation');
  });

  it('bez wskazania jawnego kandydatami są wyłącznie elementy utworzone', () => {
    const w = wskazanieOperacji(null, { created_element_ids: ['bus/x/downstream', 'seg/x/segment'] });
    expect(w?.kandydaci).toEqual(['bus/x/downstream', 'seg/x/segment']);
    expect(w?.refWskazania).toBeNull();
  });

  it('brak wskazania i brak utworzonych ⇒ null (operacja niczego nie wskazała — np. usunięcie)', () => {
    expect(wskazanieOperacji(null, { created_element_ids: [] })).toBeNull();
    expect(wskazanieOperacji(undefined, undefined)).toBeNull();
    expect(wskazanieOperacji({ element_id: '   ', element_type: 'bus', zoom_to: true }, null)).toBeNull();
  });

  it('`zoom_to: false` (kontrakt SelectionHint) przenosi się jako `przenosKadr: false`', () => {
    const w = wskazanieOperacji({ element_id: 'bus/x', element_type: 'bus', zoom_to: false }, null);
    expect(w?.przenosKadr).toBe(false);
    // Domyślnie kadr wędruje za zmianą.
    expect(wskazanieOperacji({ element_id: 'bus/x', element_type: 'bus', zoom_to: true }, null)?.przenosKadr).toBe(true);
    expect(wskazanieOperacji(null, { created_element_ids: ['bus/x'] })?.przenosKadr).toBe(true);
  });

  it('duplikaty refów są zbijane (ten sam obiekt raz na liście kandydatów)', () => {
    const w = wskazanieOperacji(
      { element_id: 'sn/a/bay', element_type: 'bay', zoom_to: true },
      { created_element_ids: ['sn/a/bay', 'sn/a/bay', 'sn/a/switch'] },
    );
    expect(w?.kandydaci).toEqual(['sn/a/bay', 'sn/a/switch']);
  });
});

describe('B-2 — selekcja i kotwica kamery czytają z TEGO SAMEGO źródła', () => {
  const odpowiedz = {
    selection_hint: { element_id: 'stn/a/station', element_type: 'substation', zoom_to: true },
    changes: { created_element_ids: ['stn/a/sn_bus', 'seg/b/segment_L'], updated_element_ids: [], deleted_element_ids: [] },
    snapshot: null,
  } as unknown as DomainOpResponseV1;

  it('`refZOperacji` (selekcja) zwraca PIERWSZEGO kandydata wspólnej reguły', () => {
    const wspolne = wskazanieOperacji(odpowiedz.selection_hint, odpowiedz.changes);
    expect(refZOperacji(odpowiedz)).toBe(wspolne?.kandydaci[0]);
  });

  it('`kanonicznyRefZOperacji` (selekcja bez migawki) też idzie listą wspólnej reguły', () => {
    const wspolne = wskazanieOperacji(odpowiedz.selection_hint, odpowiedz.changes);
    expect(kanonicznyRefZOperacji(odpowiedz)).toBe(wspolne?.kandydaci[0]);
  });
});
