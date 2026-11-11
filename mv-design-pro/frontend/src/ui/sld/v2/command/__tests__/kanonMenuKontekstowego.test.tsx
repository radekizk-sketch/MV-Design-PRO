/**
 * Kanon menu kontekstowego SLD na ŻYWEJ ścieżce (V12K-352).
 *
 * `docs/v12xx/SLD_CAD_ENGINE_V12.md` § „Kanoniczne menu kontekstowe" wiąże TREŚĆ menu:
 * stałą kolejność sekcji (Otwórz, Edytuj, Dodaj, Analizuj, Wyniki, Uzasadnienie, Raport,
 * Operacje, Usuń), „Usuń" na końcu i zakres pozycji per obiekt (pole SN, odcinek SN,
 * stacja SN/nN, źródło i przyłączenie). Dawniej przypinały to testy modułu
 * `context-menu/contextMenuRegistry.ts`, którego żaden ekran nie renderował (deklaracja bez
 * pokrycia produktu). Ten test czyta JEDYNĄ żywą ścieżkę: `SLD_MENU_REGISTRY` →
 * `getMenuActions` → `SldContextMenuController` → `wykonawcaAkcjiMenu` (ta sama funkcja
 * wybiera gałąź w `useSldActionExecutor`).
 *
 * ILOCZYN CECH (reguła KLASA, NIE INSTANCJA): {pole SN (bay, apparatus), odcinek SN
 * (cable_segment_sn, overhead_line_sn), stacja SN/nN (station), źródło (der_pv, der_bess,
 * der_fw, der)} × {kolejność sekcji w rejestrze, kolejność nagłówków sekcji w wyrenderowanym
 * menu, każda akcja ma wykonawcę, „Usuń" na końcu (rejestr i ekran)} — plus te same cechy
 * dla POZOSTAŁYCH rodzajów rejestru (tło, GPZ, sekcja, ZK SN, słup), żeby nowy rodzaj nie
 * mógł ominąć kanonu.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SldContextMenuController } from '../../../../context-menu/SldContextMenuController';
import { wykonawcaAkcjiMenu } from '../../../shared/sldActionExecutor';
import {
  SEKCJE_MENU_SLD,
  SLD_MENU_REGISTRY,
  getMenuActions,
  type SldElementKindForMenu,
} from '../SldCommandService';

afterEach(() => {
  cleanup();
});

/** Obiekty z tabeli kanonu → rodzaje menu żywego rejestru, które je przedstawiają. */
const OBIEKTY_KANONU: ReadonlyArray<readonly [string, SldElementKindForMenu]> = [
  ['pole SN', 'bay'],
  ['pole SN (aparat pola na kanwie)', 'apparatus'],
  ['odcinek SN (kabel)', 'cable_segment_sn'],
  ['odcinek SN (linia napowietrzna)', 'overhead_line_sn'],
  ['stacja SN/nN', 'station'],
  ['źródło PV', 'der_pv'],
  ['źródło BESS', 'der_bess'],
  ['źródło FW', 'der_fw'],
  ['źródło OZE bez rozpoznanego podtypu', 'der'],
];

const WSZYSTKIE_RODZAJE = Object.keys(SLD_MENU_REGISTRY) as SldElementKindForMenu[];
const POZOSTALE_RODZAJE = WSZYSTKIE_RODZAJE.filter(
  (rodzaj) => !OBIEKTY_KANONU.some(([, kanoniczny]) => kanoniczny === rodzaj),
).map((rodzaj) => [rodzaj, rodzaj] as const);

const ILOCZYN = [...OBIEKTY_KANONU, ...POZOSTALE_RODZAJE];

function indeksSekcji(sekcja: string): number {
  return (SEKCJE_MENU_SLD as readonly string[]).indexOf(sekcja);
}

function renderMenu(rodzaj: SldElementKindForMenu) {
  return render(
    <SldContextMenuController
      request={{ kind: rodzaj, elementId: `ref/${rodzaj}`, clientX: 10, clientY: 10 }}
      mode="MODEL_EDIT"
      onAction={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe('Kanon sekcji menu kontekstowego (V12K-352)', () => {
  it('lista sekcji jest dokładnie kanonem dokumentu SLD_CAD_ENGINE_V12', () => {
    expect([...SEKCJE_MENU_SLD]).toEqual([
      'Otwórz',
      'Edytuj',
      'Dodaj',
      'Analizuj',
      'Wyniki',
      'Uzasadnienie',
      'Raport',
      'Operacje',
      'Usuń',
    ]);
  });

  it('obejmuje każdy rodzaj żywego rejestru (żaden rodzaj nie omija kanonu)', () => {
    expect(ILOCZYN.map(([, rodzaj]) => rodzaj).sort()).toEqual([...WSZYSTKIE_RODZAJE].sort());
  });
});

describe.each(ILOCZYN)('%s (%s) — kanon na żywym rejestrze', (_obiekt, rodzaj) => {
  const pozycje = SLD_MENU_REGISTRY[rodzaj];

  it('ma co najmniej jedną pozycję', () => {
    expect(pozycje.length).toBeGreaterThan(0);
  });

  it('sekcje w rejestrze idą w kolejności kanonu', () => {
    const indeksy = pozycje.map((pozycja) => indeksSekcji(pozycja.section));
    for (const [i, indeks] of indeksy.entries()) {
      expect(indeks, `Pozycja „${pozycje[i].id}" ma sekcję spoza kanonu`).toBeGreaterThanOrEqual(0);
      if (i > 0) {
        expect(
          indeks,
          `Pozycja „${pozycje[i].id}" (${pozycje[i].section}) stoi po „${pozycje[i - 1].id}" (${pozycje[i - 1].section})`,
        ).toBeGreaterThanOrEqual(indeksy[i - 1]);
      }
    }
  });

  it('każda pozycja ma wykonawcę w useSldActionExecutor', () => {
    const bezWykonawcy = pozycje
      .filter((pozycja) => wykonawcaAkcjiMenu(pozycja.id, rodzaj) === null)
      .map((pozycja) => pozycja.id);
    expect(bezWykonawcy).toEqual([]);
  });

  it('„Usuń" stoi na końcu, a każda pozycja usuwająca jest w sekcji „Usuń"', () => {
    const usuwajace = pozycje.filter((pozycja) => pozycja.section === 'Usuń');
    expect(pozycje.slice(pozycje.length - usuwajace.length)).toEqual(usuwajace);
    for (const pozycja of pozycje) {
      expect(pozycja.id.startsWith('delete-'), pozycja.id).toBe(pozycja.section === 'Usuń');
    }
  });

  it('wyrenderowane menu pokazuje nagłówki sekcji w kolejności kanonu, „Usuń" ostatnie', () => {
    renderMenu(rodzaj);
    const menu = screen.getByRole('menu');
    const naglowki = within(menu)
      .getAllByTestId('context-menu-sekcja')
      .map((naglowek) => naglowek.getAttribute('data-sekcja') ?? '');
    const oczekiwane = SEKCJE_MENU_SLD.filter((sekcja) =>
      pozycje.some((pozycja) => pozycja.section === sekcja),
    );
    // Każda sekcja raz, w kolejności kanonu (nagłówek przy każdej zmianie sekcji).
    expect(naglowki).toEqual(oczekiwane);
    const pozycjeEkranu = within(menu).getAllByRole('menuitem');
    expect(pozycjeEkranu.map((pozycja) => pozycja.getAttribute('data-testid'))).toEqual(
      getMenuActions(rodzaj).map((pozycja) => `sld-menu-${pozycja.id}`),
    );
    if (pozycje.some((pozycja) => pozycja.section === 'Usuń')) {
      expect(pozycjeEkranu[pozycjeEkranu.length - 1].getAttribute('data-sekcja')).toBe('Usuń');
    }
  });
});

/**
 * Zakres kanonu per obiekt (tabela „Obiekt SLD | Rejestr | Zakres"). Każdy wiersz zakresu
 * wskazuje pozycję ŻYWEGO rejestru, która go realizuje. Pozycje zakresu bez realnej operacji
 * ani przejścia (raport elementu, automatyka pola, edycja Q(U)/cos φ(P)) są opisane
 * w dokumencie kanonu jako luki z brakującym ogniwem — nie udają tu pokrycia.
 */
const ZAKRES_KANONU: ReadonlyArray<readonly [SldElementKindForMenu, string, readonly string[]]> = [
  ['bay', 'inspektor / konfiguracja pola', ['open-bay']],
  ['bay', 'aparatura', ['configure-equipment']],
  ['bay', 'przekładniki', ['configure-cts-vts']],
  ['bay', 'zabezpieczenia', ['configure-protection']],
  ['bay', 'wyprowadzenie odcinka', ['start-branch', 'append-station-on-endpoint']],
  ['bay', 'wyniki', ['show-results']],
  ['bay', 'uzasadnienie', ['show-rationale']],
  ['bay', 'operacje łącznikowe', ['open-switch', 'close-switch', 'set-normal-open-point']],
  ['bay', 'usunięcie', ['delete-bay']],
  ['cable_segment_sn', 'inspektor', ['open-segment-card']],
  ['cable_segment_sn', 'edycja odcinka', ['edit-laying', 'change-family-to-overhead']],
  ['cable_segment_sn', 'typ katalogowy', ['change-catalog']],
  ['cable_segment_sn', 'wstawienie stacji / ZK SN', ['insert-station', 'insert-zksn']],
  ['cable_segment_sn', 'podział', ['conscious-split-on-segment']],
  ['cable_segment_sn', 'kontynuacja magistrali', ['continue-trunk-from-endpoint']],
  ['cable_segment_sn', 'wyniki', ['show-results']],
  ['cable_segment_sn', 'uzasadnienie', ['show-rationale']],
  ['cable_segment_sn', 'usunięcie', ['delete-segment']],
  ['overhead_line_sn', 'inspektor', ['open-segment-card']],
  ['overhead_line_sn', 'edycja odcinka', ['edit-line', 'change-family-to-cable']],
  ['overhead_line_sn', 'typ katalogowy', ['change-catalog']],
  ['overhead_line_sn', 'wstawienie stacji / słupa', ['insert-station', 'insert-pole']],
  ['overhead_line_sn', 'podział', ['conscious-split-on-segment']],
  ['overhead_line_sn', 'kontynuacja magistrali', ['continue-trunk-from-endpoint']],
  ['overhead_line_sn', 'wyniki', ['show-results']],
  ['overhead_line_sn', 'uzasadnienie', ['show-rationale']],
  ['overhead_line_sn', 'usunięcie', ['delete-segment']],
  ['station', 'inspektor / konfigurator', ['open-station-config']],
  ['station', 'pola SN', ['edit-station-bays']],
  ['station', 'transformator', ['edit-station-transformer']],
  ['station', 'strona nN', ['show-station-nn']],
  ['station', 'obciążenia', ['add-load']],
  ['station', 'źródła', ['add-source', 'add-genset', 'add-ups']],
  ['station', 'wyniki', ['show-results']],
  ['station', 'uzasadnienie', ['show-rationale']],
  ['station', 'usunięcie', ['delete-station']],
  ['der_pv', 'profil źródła (dane modułu NC RfG)', ['edit-source-module']],
  ['der_pv', 'FRT/LVRT/HVRT', ['show-frt-hvrt']],
  ['der_pv', 'zgodność przyłączeniowa', ['show-ncrfg']],
  ['der_pv', 'wkład zwarciowy', ['show-sc-contributions']],
  ['der_pv', 'wyniki', ['show-results']],
  ['der_pv', 'uzasadnienie', ['show-rationale']],
];

describe('Zakres kanonu per obiekt na żywym rejestrze', () => {
  it.each(ZAKRES_KANONU)('%s: %s', (rodzaj, _zakres, wymagane) => {
    const identyfikatory = SLD_MENU_REGISTRY[rodzaj].map((pozycja) => pozycja.id);
    for (const id of wymagane) {
      expect(identyfikatory, `Rodzaj „${rodzaj}" bez pozycji „${id}"`).toContain(id);
    }
  });

  it.each(['der_bess', 'der_fw', 'der'] as const)(
    '%s ma ten sam zakres źródła co PV (pozycje niezależne od podtypu)',
    (rodzaj) => {
      const identyfikatory = SLD_MENU_REGISTRY[rodzaj].map((pozycja) => pozycja.id);
      for (const id of ['edit-source-module', 'show-ncrfg', 'show-results', 'show-sc-contributions', 'show-rationale']) {
        expect(identyfikatory, `Rodzaj „${rodzaj}" bez pozycji „${id}"`).toContain(id);
      }
    },
  );
});
