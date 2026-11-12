/**
 * Funkcja zdefiniowana WYŁĄCZNIE w rejestrze przechodzi przez kartę pola, edytor nastaw i blok
 * przekaźnika na schemacie (karta OCHRONA-JEDNO-ZRODLO, kryterium 2: rejestr funkcji generyczny).
 *
 * Deklaracja modułu `funkcjeEaz.ts`: „Nowa funkcja to wpis rejestru backendu — front nie ma
 * listy". Ten test przypina ją po stronie frontu: kod `99T` NIE istnieje w produkcie — dopisuje go
 * wyłącznie test do lustra rejestru (`slownikFunkcjiEaz.json`, `vi.mock` z zachowaniem całej
 * reszty słownika), a sterownik pola GPZ z migawki generatora backendu dostaje tę funkcję z
 * nastawami i wierszem macierzy wyzwoleń tak, jak zapisuje je operacja `update_protection_settings`
 * (strona backendu: `backend/tests/api/test_funkcja_tylko_w_rejestrze_api.py`).
 *
 * Iloczyn cech: {funkcja z rejestru, bez kodu produktu} × miejsce {blok przekaźnika na schemacie
 * (blok niesie każdą włączoną funkcję), karta pola po NATYWNYM kliku w ramkę bloku (nazwa, nastawy z jednostką, czas,
 * akcja E-27), edytor nastaw (pola ze schematu rejestru, zapis natywnym wpisem)} × {funkcja
 * włączona, wyłączona (znika z bloku i z karty)}.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EnergyNetworkModel, ProtectionAssignment } from '../../../types/enm';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useSelectionStore } from '../../selection';
import { useAppStateStore } from '../../app-state';
import { useRawResultOverlayStore } from '../../sld-overlay/rawResultOverlayStore';
import { useKontekstElementuKanwy } from '../../sld/shared/kontekstElementuKanwy';
import { SldCanvasV3Workspace } from '../../sld/v3/canvas/SldCanvasV3Workspace';
import { buildSceneV3 } from '../../sld/v3/scene/buildScene';
import { InspektorKanwyTestowy } from '../../network-build/inspektor-elementu/__tests__/inspektorKanwyTestowy';
import { EdytorNastawZabezpieczenia } from '../../../ui2/kreatory/przekaznik/EdytorNastawZabezpieczenia';
import { funkcjaEaz, wszystkieFunkcjeEaz } from '../funkcjeEaz';
import fxZ11 from '../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';

const KOD = '99T';
const NAZWA = 'funkcja testowa spoza kodu produktu';

vi.mock('../slownikFunkcjiEaz.json', async (importOriginal) => {
  const oryginal = (await importOriginal()) as { default: { funkcje: Record<string, unknown> } };
  return {
    default: {
      ...oryginal.default,
      funkcje: {
        ...oryginal.default.funkcje,
        '99T': {
          oznaczenie_pl: 'Ix>',
          ansi: null,
          nazwa_pl: 'funkcja testowa spoza kodu produktu',
          rodzaj: 'ZABEZPIECZENIE',
          wejscia_wymagane: ['I'],
          wejscia_opcjonalne: [],
          ocena: null,
          nastawy: [
            { klucz: 'prog_x_a', nazwa_pl: 'próg testowy', typ: 'LICZBA', jednostka: 'A', wartosci: [], dodatnia: true },
            { klucz: 'zwloka_s', nazwa_pl: 'zwłoka', typ: 'LICZBA', jednostka: 's', wartosci: [], dodatnia: true },
          ],
        },
      },
    },
  };
});

const ENM = (fxZ11 as unknown as { snapshot: EnergyNetworkModel }).snapshot;
/** Pierwszy sterownik pola GPZ z macierzą wyzwoleń (pole liniowe z wyłącznikiem). */
const STEROWNIK = (ENM.protection_assignments ?? []).find((p) => p.bay_ref?.startsWith('gpz/') && p.macierz_wyzwolen.length > 0)!;
const POLE = STEROWNIK.bay_ref!;
const WYLACZNIKI = [...new Set(STEROWNIK.macierz_wyzwolen.flatMap((w) => w.aparat_refs))].sort();

/** Sterownik po `update_protection_settings` (funkcje → [99T, …], nastawy 99T w grupie 1). */
function zFunkcjaRejestru(wlaczona = true): ProtectionAssignment {
  return {
    ...STEROWNIK,
    funkcje: [{ ref: KOD, kod: KOD, wlaczona }, ...STEROWNIK.funkcje],
    grupy_nastaw: [
      {
        numer: 1,
        funkcje: [
          {
            funkcja_ref: KOD,
            nastawy: [
              { klucz: 'prog_x_a', wartosc: 120, pochodzenie: 'PROJEKTANT' },
              { klucz: 'zwloka_s', wartosc: 0.4, pochodzenie: 'PROJEKTANT' },
            ],
          },
        ],
      },
    ],
    aktywna_grupa: 1,
    macierz_wyzwolen: [{ funkcja_ref: KOD, aparat_refs: WYLACZNIKI, pobudza_spz: false }, ...STEROWNIK.macierz_wyzwolen],
  };
}

function model(sterownik: ProtectionAssignment): EnergyNetworkModel {
  return {
    ...ENM,
    protection_assignments: (ENM.protection_assignments ?? []).map((p) => (p.ref_id === sterownik.ref_id ? sterownik : p)),
  };
}

const zapis = vi.fn();

beforeEach(() => {
  zapis.mockReset();
  useRawResultOverlayStore.getState().clear();
  useSelectionStore.getState().clearSelection();
});

afterEach(() => {
  cleanup();
  useKontekstElementuKanwy.getState().wyczysc();
  useAppStateStore.getState().reset();
  useSnapshotStore.getState().reset();
});

const SZER = 4000;
const WYS = 3000;
function skalaKanwy(svg: Element): number {
  const vb = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  return vb.length === 4 && vb[2] > 0 ? SZER / vb[2] : 0;
}

function renderKanwyZInspektorem(enm: EnergyNetworkModel) {
  useSnapshotStore.setState({ snapshot: enm });
  const wynik = render(
    <>
      <SldCanvasV3Workspace width={SZER} height={WYS} />
      <InspektorKanwyTestowy />
    </>,
  );
  // Wiersze bloku są rysowane od skali ~2 — dojazd natywnym kółkiem (jak projektant).
  const svg = wynik.container.querySelector('[data-testid="sld-canvas-v3"]')!;
  for (let i = 0; i < 40 && skalaKanwy(svg) < 2.2; i += 1) {
    fireEvent.wheel(svg, { clientX: SZER / 2, clientY: WYS / 2, deltaY: -140 });
  }
  return wynik;
}

describe('funkcja tylko w rejestrze — karta pola, edytor nastaw, blok przekaźnika', () => {
  it('warunek testu: kod 99T jest wyłącznie we wpisie testu (lustro rejestru po vi.mock)', () => {
    expect(funkcjaEaz(KOD)?.nazwaPl).toBe(NAZWA);
    expect(wszystkieFunkcjeEaz().filter((f) => f.kod === KOD)).toHaveLength(1);
    expect(STEROWNIK.funkcje.some((f) => f.kod === KOD)).toBe(false);
  });

  it.each([true, false])('blok przekaźnika na schemacie × funkcja włączona=%s', (wlaczona) => {
    const scena = buildSceneV3(model(zFunkcjaRejestru(wlaczona)));
    const przekaznik = scena.symbols.find((s) => s.meta?.ownerRef === POLE && s.symbolId === 'protectionRelay');
    expect(przekaznik, 'przekaźnik pola na scenie').toBeDefined();
    const wiersze = scena.labels.filter((l) => /#protection-codes-full(-\d+)?$/.test(l.ownerRef ?? '') && (l.ownerRef ?? '').startsWith(`${POLE}#`));
    // Jedna notacja bloku (ramka bez okręgu): kody funkcji wyłącznie w wierszach bloku.
    const wBloku = wiersze.flatMap((l) => l.text.split(' · '));
    expect(wBloku.includes(KOD)).toBe(wlaczona);
  });

  it.each([true, false])('karta pola po natywnym kliku w ramkę bloku zabezpieczeń × funkcja włączona=%s', (wlaczona) => {
    const { container } = renderKanwyZInspektorem(model(zFunkcjaRejestru(wlaczona)));
    const ramka = [...container.querySelectorAll('[data-hit-for][data-hit-klasa="adnotacja"]')].find(
      (el) => el.getAttribute('data-hit-owner-ref') === POLE,
    );
    expect(ramka, 'uchwyt ramki bloku zabezpieczeń pola').toBeDefined();
    fireEvent.click(ramka!);
    const sekcja = screen.getByTestId('inspektor-karta-zabezpieczenia');
    const wiersz = within(sekcja)
      .getAllByTestId('inspektor-karta-wiersz-funkcje_eaz')
      .find((w) => w.getAttribute('data-klucz') === KOD);
    if (!wlaczona) {
      expect(wiersz).toBeUndefined();
      return;
    }
    expect(wiersz).toBeDefined();
    const komorka = (k: string) => wiersz!.querySelector(`[data-kolumna="${k}"]`)!.textContent;
    expect(komorka('funkcja')).toBe('Ix> (99T)');
    expect(komorka('nazwa')).toBe(NAZWA);
    expect(komorka('nastawy')).toContain('120 A');
    expect(komorka('czas')).toContain('0,4 s');
    // Blok przekaźnika niesie każdą włączoną funkcję (odbiór B-02 2026-11-04) — karta nie ma
    // kolumny miejsca na schemacie; obecność kodu w bloku przypina test bloku wyżej.
    expect(wiersz!.querySelector('[data-kolumna="schemat"]')).toBeNull();
    expect(within(wiersz!).getByTestId('inspektor-karta-akcja-wiersza').getAttribute('data-cel')).toBe('E-27');
  });

  it('edytor nastaw: pola ze schematu rejestru, zapis natywnym wpisem niesie nastawy 99T', async () => {
    const user = userEvent.setup();
    const sterownik = { ...zFunkcjaRejestru(), grupy_nastaw: [] };
    useAppStateStore.getState().setActiveCase('case-1', 'Wariant bazowy');
    zapis.mockResolvedValue({ snapshot: model(sterownik), error: null });
    useSnapshotStore.setState({ snapshot: model(sterownik), error: null, executeDomainOperation: zapis } as never);
    render(<EdytorNastawZabezpieczenia urzadzenieRef={sterownik.ref_id} testid="edytor" />);
    const wiersz = screen.getByTestId(`edytor-${KOD}`);
    expect(wiersz).toHaveTextContent(NAZWA);
    await user.type(within(wiersz).getByTestId(`edytor-${KOD}-prog_x_a`), '150');
    await user.type(within(wiersz).getByTestId(`edytor-${KOD}-zwloka_s`), '0.3');
    await user.click(screen.getByTestId('edytor-zapisz'));
    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
    expect(zapis.mock.calls[0][1]).toBe('update_protection_settings');
    expect(zapis.mock.calls[0][2]).toEqual({
      protection_ref: sterownik.ref_id,
      grupa: 1,
      nastawy: { [KOD]: { prog_x_a: 150, zwloka_s: 0.3 } },
    });
  });
});
