/**
 * GPZ-PARYTET cz. 2 (pkt 2): stan łączników pola z modelu — iloczyn cech:
 * rola gałęzi {wyłącznik, odłącznik, rozłącznik, sprzęgło, bezpiecznik} × przynależność
 * {equipment_refs, linked_ref aparatu} × status {open, closed} × rekord aparatu {brak,
 * zgodny, sprzeczny, nieznany, awaria} × liczność {0, 1, 2 zgodne, 2 sprzeczne};
 * uziemnik {brak aparatu, aparat bez rekordu, zamknięty, otwarty, awaria}.
 */
import { describe, expect, it } from 'vitest';
import type { Bay, BayDeviceState, BayPrimaryDevice, Branch } from '../../../../../types/enm';
import { stanyAparatowPolaZModelu } from '../stanAparatowPola';

function galaz(ref: string, type: string, status: 'open' | 'closed'): Branch {
  return { ref_id: ref, type, status, from_bus_ref: 'a', to_bus_ref: 'b', name: ref } as unknown as Branch;
}

function aparat(
  kind: BayPrimaryDevice['kind'],
  ref: string,
  opcje: { linked?: string; stan?: BayDeviceState } = {},
): BayPrimaryDevice {
  return {
    device_ref: ref,
    linked_ref: opcje.linked ?? null,
    symbol_ref: kind,
    kind,
    placement: 'MIDSTREAM',
    is_controllable: false,
    switch_state: opcje.stan ? { actual_state: opcje.stan } : null,
  };
}

function pole(equipment: string[], devices: BayPrimaryDevice[] = []): Pick<Bay, 'equipment_refs' | 'primary_devices'> {
  return { equipment_refs: equipment, primary_devices: devices };
}

function mapa(...galezie: Branch[]): Map<string, Branch> {
  return new Map(galezie.map((g) => [g.ref_id, g]));
}

describe('stanyAparatowPolaZModelu', () => {
  it('pole bez danych: wszystkie łączniki `unknown`, nigdy zamknięte z domysłu', () => {
    expect(stanyAparatowPolaZModelu(pole([]), mapa())).toEqual({
      cbState: 'unknown',
      dsState: 'unknown',
      esState: 'unknown',
      glownyLacznik: 'unknown',
    });
  });

  for (const status of ['open', 'closed'] as const) {
    for (const [typ, rola] of [
      ['breaker', 'cbState'],
      ['disconnector', 'dsState'],
      ['switch', 'dsState'],
      ['bus_coupler', 'dsState'],
    ] as const) {
      it(`${typ} (${status}) z equipment_refs → ${rola} = ${status}`, () => {
        const stany = stanyAparatowPolaZModelu(pole(['q']), mapa(galaz('q', typ, status)));
        expect(stany[rola]).toBe(status);
        const inna = rola === 'cbState' ? 'dsState' : 'cbState';
        expect(stany[inna]).toBe('unknown');
      });
      it(`${typ} (${status}) przez linked_ref aparatu → ${rola} = ${status}`, () => {
        const stany = stanyAparatowPolaZModelu(
          pole([], [aparat('CB', 'dev', { linked: 'q' })]),
          mapa(galaz('q', typ, status)),
        );
        expect(stany[rola]).toBe(status);
      });
    }
  }

  it('bezpiecznik nie daje stanu symbolu (glif bezpiecznika nie ma stanu)', () => {
    expect(stanyAparatowPolaZModelu(pole(['f']), mapa(galaz('f', 'fuse', 'closed')))).toEqual({
      cbState: 'unknown',
      dsState: 'unknown',
      esState: 'unknown',
      glownyLacznik: 'unknown',
    });
  });

  it.each([
    ['zgodny', 'zamkniety', 'closed'],
    ['zgodny z napędem rozbrojonym', 'zamkniety_naped_rozbrojony', 'closed'],
    ['sprzeczny', 'otwarty', 'unknown'],
    ['nieznany', 'nieznany', 'unknown'],
    // Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC: rekord „awaria" = położenie
    // niewiarygodne (`bad`, własny kafel) i ma pierwszeństwo przed `status` gałęzi; dawniej
    // `unknown`. Intencja bez zmian: awaria nigdy nie jest rysowana jako położenie z modelu.
    ['awaria', 'awaria', 'bad'],
  ] as const)('rekord aparatu %s ze statusem closed → %s', (_opis, rekord, oczekiwany) => {
    const stany = stanyAparatowPolaZModelu(
      pole(['q'], [aparat('CB', 'dev', { linked: 'q', stan: rekord })]),
      mapa(galaz('q', 'breaker', 'closed')),
    );
    expect(stany.cbState).toBe(oczekiwany);
  });

  it('dwa wyłączniki zgodne → ich stan; sprzeczne → `unknown`', () => {
    expect(
      stanyAparatowPolaZModelu(pole(['a', 'b']), mapa(galaz('a', 'breaker', 'open'), galaz('b', 'breaker', 'open'))).cbState,
    ).toBe('open');
    expect(
      stanyAparatowPolaZModelu(pole(['a', 'b']), mapa(galaz('a', 'breaker', 'open'), galaz('b', 'breaker', 'closed'))).cbState,
    ).toBe('unknown');
  });

  it('ref spoza gałęzi migawki (transformator, odcinek) nie daje stanu', () => {
    expect(stanyAparatowPolaZModelu(pole(['tr', 'brak']), mapa()).cbState).toBe('unknown');
    expect(
      stanyAparatowPolaZModelu(pole(['kabel']), mapa(galaz('kabel', 'cable', 'closed'))).cbState,
    ).toBe('unknown');
  });

  it.each([
    ['brak aparatu ES', [], 'unknown'],
    ['ES bez rekordu', [aparat('ES', 'es')], 'unknown'],
    ['ES zamknięty', [aparat('ES', 'es', { stan: 'zamkniety' })], 'closed'],
    ['ES otwarty', [aparat('ES', 'es', { stan: 'otwarty' })], 'open'],
    // Uziemnik w awarii: `bad` (rozszerzenie 5), nie „nieustalony".
    ['ES awaria', [aparat('ES', 'es', { stan: 'awaria' })], 'bad'],
    ['dwa ES, jeden bez rekordu', [aparat('ES', 'e1', { stan: 'otwarty' }), aparat('ES', 'e2')], 'unknown'],
  ] as const)('uziemnik: %s → %s', (_opis, aparaty, oczekiwany) => {
    expect(stanyAparatowPolaZModelu(pole([], [...aparaty]), mapa()).esState).toBe(oczekiwany);
  });

  it('łącznik główny: wyłącznik, gdy pole ma gałąź wyłącznika; inaczej odłącznik/rozłącznik', () => {
    expect(
      stanyAparatowPolaZModelu(pole(['a', 'b']), mapa(galaz('a', 'breaker', 'open'), galaz('b', 'disconnector', 'closed')))
        .glownyLacznik,
    ).toBe('open');
    expect(stanyAparatowPolaZModelu(pole(['b']), mapa(galaz('b', 'bus_coupler', 'closed'))).glownyLacznik).toBe('closed');
  });

  it('determinizm: kolejność equipment_refs nie zmienia wyniku', () => {
    const g = mapa(galaz('a', 'breaker', 'open'), galaz('b', 'disconnector', 'closed'));
    expect(stanyAparatowPolaZModelu(pole(['a', 'b']), g)).toEqual(stanyAparatowPolaZModelu(pole(['b', 'a']), g));
  });
});
