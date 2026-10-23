/**
 * Karta GPZ-H5-SCALENIE-APARATURY — menu pola i aparatu na stronie 110 kV.
 *
 * Po co: strona 110 kV GPZ jest wyłącznie funkcjonalną granicą zasilania sieci SN (decyzja
 * właściciela 2026-10-22). Backend odmawia na niej wyposażenia pola
 * (`bay_equipment.bay_hv_boundary`), przekładników, zabezpieczeń, ogranicznika i budowy SN
 * (`*.bus_hv_boundary`). Po scaleniu z łańcuchem aparatury kanwa rysuje łącznik szyn 110 kV
 * (gałąź `bus_coupler`) i pola 110 kV, a menu aparatu oferowało na nich „Skonfiguruj
 * przekładniki” pod nagłówkiem „Aparat pola SN” — pozycję, którą backend odrzuca.
 *
 * Iloczyn cech: obiekt menu {pole (rekord `bays`), aparat pola `⟨pole⟩#⟨rodzaj⟩`, gałąź
 * łączeniowa} × pasmo {WN (oba końce), WN (jeden koniec — tor pola liniowego: zacisk linii ×
 * szyna sekcji), SN} × pozycja {każda z `POZYCJE_APARATURY_SN_POZA_GRANICA_WN`, pozycje stanu
 * łącznika}. Wyrocznia z napięcia szyn migawki, nie z funkcji pod testem.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import {
  POWOD_GRANICY_WN_PL,
  POZYCJE_APARATURY_SN_POZA_GRANICA_WN,
} from '../../v2/command/SldCommandService';
import { naglowekRodzajuMenu } from '../../../context-menu/SldContextMenuController';
import { akcjeElementu, czyObiektGranicyWn, kontekstDostepnosciAkcji } from '../akcjeElementu';
import type { CanvasMenuSubject } from '../../v3/canvas/canvasMenuSubject';

type Pasmo = 'wn' | 'wn-jeden-koniec' | 'sn';
type Obiekt = 'pole' | 'aparat' | 'galaz';

/** Szyny: `a`/`b` w paśmie danego wariantu; `z` — zacisk o napięciu WN (tor pola liniowego). */
function migawka(pasmo: Pasmo): EnergyNetworkModel {
  const u = pasmo === 'sn' ? 15 : 110;
  const koniec = pasmo === 'wn-jeden-koniec' ? 'n' : 'b';
  return {
    buses: [
      { id: 'a', ref_id: 'a', voltage_kv: u },
      { id: 'b', ref_id: 'b', voltage_kv: u },
      // Szyna spoza pasma WN dla wariantu „jeden koniec": gałąź WN–SN (wystarczy jeden koniec).
      { id: 'n', ref_id: 'n', voltage_kv: 15 },
    ],
    branches: [
      {
        id: 'q1', ref_id: 'q1', name: 'Q1', type: 'bus_coupler', status: 'open',
        from_bus_ref: 'a', to_bus_ref: koniec, tags: [], meta: {},
      },
    ],
    bays: [{ id: 'pole-1', ref_id: 'pole-1', bay_role: 'COUPLER', bus_ref: pasmo === 'wn-jeden-koniec' ? 'n' : 'a', equipment_refs: ['q1'] }],
    substations: [],
  } as unknown as EnergyNetworkModel;
}

function temat(obiekt: Obiekt): CanvasMenuSubject {
  switch (obiekt) {
    case 'pole':
      return { menuKind: 'bay', modelRef: 'pole-1', kotwica: 'pole' } as CanvasMenuSubject;
    case 'aparat':
      return { menuKind: 'apparatus', modelRef: 'pole-1#cb', kotwica: 'pole' } as CanvasMenuSubject;
    case 'galaz':
      return { menuKind: 'apparatus', modelRef: 'q1', kotwica: 'galaz', rodzinaGalezi: 'bus_coupler' } as CanvasMenuSubject;
  }
}

/** Oczekiwana granica z danych wariantu: pole — napięcie JEGO szyny; gałąź — którykolwiek koniec. */
function oczekiwanaGranica(obiekt: Obiekt, pasmo: Pasmo): boolean {
  if (pasmo === 'sn') return false;
  if (pasmo === 'wn') return true;
  // Jeden koniec WN: gałąź jest na granicy, pole (na szynie SN `n`) nie.
  return obiekt === 'galaz';
}

describe('menu pola i aparatu na stronie 110 kV — obiekt × pasmo × pozycja', () => {
  for (const obiekt of ['pole', 'aparat', 'galaz'] as const) {
    for (const pasmo of ['wn', 'wn-jeden-koniec', 'sn'] as const) {
      it(`${obiekt} × ${pasmo}`, () => {
        const enm = migawka(pasmo);
        const t = temat(obiekt);
        const granica = oczekiwanaGranica(obiekt, pasmo);
        expect(czyObiektGranicyWn(enm, t.modelRef)).toBe(granica);
        const kontekst = kontekstDostepnosciAkcji(enm, null, t, 'NONE');
        expect(kontekst.granicaWn === true).toBe(granica);

        const akcje = akcjeElementu(enm, null, t, 'NONE');
        const aparaturaSn = akcje.filter((a) => POZYCJE_APARATURY_SN_POZA_GRANICA_WN.has(a.id));
        expect(aparaturaSn.length, 'menu ma pozycje aparatury SN').toBeGreaterThan(0);
        for (const a of aparaturaSn) {
          if (granica) {
            expect(a.disabled, `${a.id} zablokowana na granicy 110 kV`).toBe(true);
            expect(a.disabledReasonPl).toBe(POWOD_GRANICY_WN_PL);
          } else {
            expect(a.disabledReasonPl, `${a.id} bez powodu granicy poza 110 kV`).not.toBe(POWOD_GRANICY_WN_PL);
          }
        }
        // Łącznik pola 110 kV pozostaje łącznikiem: pozycje stanu nie są blokowane granicą.
        for (const id of ['open-switch', 'close-switch', 'set-normal-open-point']) {
          const a = akcje.find((x) => x.id === id);
          expect(a, `menu ma pozycję ${id}`).toBeDefined();
          expect(a!.disabledReasonPl).not.toBe(POWOD_GRANICY_WN_PL);
        }
        // Nagłówek nazywa obiekt 110 kV wyłącznie na granicy.
        const naglowek = naglowekRodzajuMenu(t.menuKind, kontekst);
        expect(naglowek.includes('110 kV')).toBe(granica);
        expect(naglowek.includes(' SN')).toBe(!granica);
      });
    }
  }

  it('brak migawki i obiekt spoza pól i gałęzi — brak pomiaru, bez blokady', () => {
    expect(czyObiektGranicyWn(null, 'q1')).toBe(false);
    expect(czyObiektGranicyWn(migawka('wn'), 'nieistniejacy')).toBe(false);
  });
});
