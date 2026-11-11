/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC: klik (NATYWNY — uchwyt trafienia warstwy `sld-v3-trafienia`,
 * jak mysz; bez syntetycznego `dispatchEvent`) w dowolny obiekt bloku przekaźnika otwiera kartę
 * POLA w prawym inspektorze, z wyróżnioną sekcją „Zabezpieczenia i automatyka": wiersz na każdą
 * funkcję `Bay.protection_codes` (kod IEEE C37.2 + nazwa polska ze słownika backendu) i akcja
 * prowadząca do nastaw (E-27 przy urządzeniu, kreator urządzenia bez niego).
 *
 * Wyrocznia niezależna od kodu produkcyjnego: pole = człon `data-hit-owner-ref` przed `#`
 * (zapis warstwy trafień), treść wierszy z SUROWEGO `slownikFunkcjiEaz.json` i `Bay` fikstury.
 *
 * Iloczyn cech: pole {bez urządzenia zabezpieczeniowego (akcja: kreator urządzenia), z urządzeniem
 * (akcja: nastawy E-27)} × obiekt bloku {ramka bloku (symbol bloku zabezpieczeń — prostokątna ramka bez okręgu,
 * korekta v2 2026-11-04), wiersz kodów, wiersz „U0", linia
 * wyłączania, pozostałe adnotacje (tabliczka CT, numer urządzenia)}. Każda klasa obecna w DOM jest
 * klikana; obecność ramki i wiersza kodów jest warunkiem testu (nie cichy brak).
 *
 * Stacje SN poza GPZ: blok stacji NIE rzutuje dziś adnotacji zabezpieczeń z modelu
 * (`enmToSldAdapter.ts::buildExplicitStationMiniBays` — 171 okręgów na substracie 52 stacji to
 * zmiana wyglądu czekająca na werdykt właściciela B-02), więc na kanwie nie ma czego kliknąć;
 * reguła kliku (`poleAdnotacjiZabezpieczen`) jest wspólna i nie rozróżnia rodzaju rozdzielni
 * (test jednostkowy `poleAdnotacjiZabezpieczen.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';
import { useKontekstElementuKanwy } from '../../../shared/kontekstElementuKanwy';
import { InspektorKanwyTestowy } from '../../../../network-build/inspektor-elementu/__tests__/inspektorKanwyTestowy';
import { buildSceneV3 } from '../../scene/buildScene';
import { useAppStateStore } from '../../../../app-state';
import { useNetworkBuildStore } from '../../../../network-build/networkBuildStore';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';
import slownik from '../../../../shared/slownikFunkcjiEaz.json';

const here = dirname(fileURLToPath(import.meta.url));
// GPZ z urządzeniem zabezpieczeniowym w modelu (`ProtectionAssignment` wskazany przez
// `Bay.protection_ref`) — akcja wiersza prowadzi do nastaw (E-27).
const enmZUrzadzeniem = (
  JSON.parse(
    readFileSync(resolve(here, '..', '..', 'scene', '__tests__', 'fixtures', 'gpzProtectionDataPath.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;
const enmGpz = (fxZ11 as unknown as { snapshot: EnergyNetworkModel }).snapshot;

const ROZDZIELNIE = [
  ['GPZ Z.11 (pola bez urządzenia zabezpieczeniowego)', enmGpz],
  ['GPZ z urządzeniami zabezpieczeniowymi', enmZUrzadzeniem],
] as const;

/** Wyrocznia „pole ma urządzenie": przypisanie wskazane refem pola albo wyłącznikiem pola. */
function maUrzadzenie(enm: EnergyNetworkModel, bay: EnergyNetworkModel['bays'][number]): boolean {
  const refyPola = new Set([...bay.equipment_refs, ...(bay.primary_devices ?? []).map((d) => d.device_ref)]);
  return (enm.protection_assignments ?? []).some(
    (pa) => (bay.protection_ref != null && pa.ref_id === bay.protection_ref) || refyPola.has(pa.breaker_ref),
  );
}

type KlasaObiektu = 'ramka bloku' | 'wiersz kodów' | 'wiersz U0' | 'linia wyłączania' | 'inna adnotacja';
const KLASY: readonly KlasaObiektu[] = ['ramka bloku', 'wiersz kodów', 'wiersz U0', 'linia wyłączania', 'inna adnotacja'];

function klasaObiektu(ownerRef: string): KlasaObiektu {
  const przyrostek = ownerRef.includes('#') ? ownerRef.slice(ownerRef.indexOf('#') + 1) : '';
  if (przyrostek === '') return 'ramka bloku';
  if (/^protection-codes-full(-\d+)?$/.test(przyrostek)) return 'wiersz kodów';
  if (/^zrodlo-u0(-\d+)?$/.test(przyrostek)) return 'wiersz U0';
  if (przyrostek === 'trip-line') return 'linia wyłączania';
  return 'inna adnotacja';
}

afterEach(() => {
  cleanup();
  useRawResultOverlayStore.getState().clear();
  useKontekstElementuKanwy.getState().wyczysc();
});

const zaznaczone = () => useSelectionStore.getState().selectedElements.map((e) => e.id);
const FUNKCJE = slownik.funkcje as Record<string, { nazwa_pl: string; ansi: string | null }>;

function przygotuj(enm: EnergyNetworkModel) {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useSnapshotStore.setState({ snapshot: enm });
  const wynik = render(
    <>
      <SldCanvasV3Workspace width={SZER} height={WYS} lodOverride={2} />
      <InspektorKanwyTestowy />
    </>,
  );
  // Wiersze bloku są rysowane od skali ~2 (próg czytelności planu etykiet) — projektant dojeżdża
  // tam natywnym kółkiem myszy, tak samo test (ścieżka realna, nie wymuszony stan kamery).
  const svg = wynik.container.querySelector('[data-testid="sld-canvas-v3"]')!;
  for (let i = 0; i < 40 && skalaKanwy(svg) < 2.2; i += 1) {
    fireEvent.wheel(svg, { clientX: SZER / 2, clientY: WYS / 2, deltaY: -140 });
  }
  return wynik;
}

const SZER = 4000;
const WYS = 3000;
function skalaKanwy(svg: Element): number {
  const vb = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  return vb.length === 4 && vb[2] > 0 ? SZER / vb[2] : 0;
}

/**
 * Uchwyty obiektów warstwy zabezpieczeń pól, które MAJĄ funkcje w modelu — pierwszy z każdej
 * klasy. Zbiór refów warstwy pochodzi ze SCENY (symbole i odcinki `protectionAnnotation`,
 * etykiety `ownerKind: 'protection'`), nie z obsługi kliku; uchwyt w DOM to węzeł trafienia
 * (`data-hit-for`, rola obrysu) o tym refie — ramka bloku ma klasę `adnotacja`, wiersze `etykieta`.
 */
function uchwytyWgKlasy(container: HTMLElement, enm: EnergyNetworkModel): Map<KlasaObiektu, Element> {
  const polaZKodami = new Set(enm.bays.filter((b) => (b.protection_codes ?? []).length > 0).map((b) => b.ref_id));
  const scena = buildSceneV3(enm, 2);
  const refyWarstwy = new Set<string>([
    ...scena.symbols.filter((x) => x.meta?.elementKind === 'protectionAnnotation').map((x) => x.meta!.ownerRef!),
    ...scena.segments.filter((x) => x.meta?.elementKind === 'protectionAnnotation').map((x) => x.meta!.ownerRef!),
    ...scena.labels.filter((x) => x.ownerKind === 'protection').map((x) => x.ownerRef),
  ]);
  const wynik = new Map<KlasaObiektu, Element>();
  for (const el of Array.from(container.querySelectorAll('[data-hit-for][data-hit-role="obrys"]'))) {
    const owner = el.getAttribute('data-hit-owner-ref') ?? '';
    if (!refyWarstwy.has(owner) || !polaZKodami.has(owner.split('#')[0])) continue;
    // Ramka bloku niesie ref POLA — ten sam co aparaty pola; rozróżnia ją klasa trafienia.
    if (!owner.includes('#') && el.getAttribute('data-hit-klasa') !== 'adnotacja') continue;
    const klasa = klasaObiektu(owner);
    if (!wynik.has(klasa)) wynik.set(klasa, el);
  }
  return wynik;
}

describe('klik w blok przekaźnika → karta pola, sekcja „Zabezpieczenia i automatyka"', () => {
  beforeEach(() => useRawResultOverlayStore.getState().clear());

  for (const [nazwa, enm] of ROZDZIELNIE) {
    it(`${nazwa}: w DOM są uchwyty ramki bloku i wiersza kodów (warunek iloczynu)`, () => {
      const { container } = przygotuj(enm);
      const klasy = uchwytyWgKlasy(container, enm);
      expect(klasy.has('ramka bloku')).toBe(true);
      expect(klasy.has('wiersz kodów')).toBe(true);
    });

    for (const klasa of KLASY) {
      it(`${nazwa} × ${klasa}`, () => {
        const { container } = przygotuj(enm);
        const uchwyt = uchwytyWgKlasy(container, enm).get(klasa);
        if (!uchwyt) {
          // Jawny brak klasy w tej rozdzielni (np. linia wyłączania rysowana tylko w GPZ) —
          // kompletność iloczynu pilnuje test „warunek iloczynu" powyżej.
          return;
        }
        const pole = (uchwyt.getAttribute('data-hit-owner-ref') ?? '').split('#')[0];
        const bay = enm.bays.find((b) => b.ref_id === pole)!;
        fireEvent.click(uchwyt);

        expect(zaznaczone()).toEqual([pole]);
        const panel = screen.getByTestId('inspektor-element-kanwy');
        expect(panel).toHaveAttribute('data-element-id', pole);
        const sekcja = screen.getByTestId('inspektor-karta-zabezpieczenia');
        expect(sekcja).toHaveAttribute('data-wyrozniona', 'true');
        expect(within(sekcja).getByRole('heading', { name: 'Zabezpieczenia i automatyka' })).toBeInTheDocument();

        const wiersze = within(sekcja).getAllByTestId('inspektor-karta-wiersz-funkcje_eaz');
        const kody = bay.protection_codes ?? [];
        expect(wiersze.map((w) => w.getAttribute('data-klucz-wiersza'))).toEqual(kody);
        wiersze.forEach((w, i) => {
          const wpis = FUNKCJE[kody[i]];
          expect(wpis, `kod ${kody[i]} w słowniku`).toBeDefined();
          expect(w.textContent).toContain(wpis.nazwa_pl);
          if (wpis.ansi) expect(w.textContent).toContain(`ANSI ${wpis.ansi}`);
          const akcja = within(w).getByTestId('inspektor-karta-akcja-wiersza');
          expect(akcja.getAttribute('data-cel')).toBe(maUrzadzenie(enm, bay) ? 'E-27' : 'add_relay');
        });
      });
    }
  }

  it('klik w ramkę bloku, a potem w tło — zaznaczenie i karta zdjęte', () => {
    const { container } = przygotuj(enmGpz);
    fireEvent.click(uchwytyWgKlasy(container, enmGpz).get('ramka bloku')!);
    expect(screen.getByTestId('inspektor-element-kanwy')).toBeInTheDocument();
    fireEvent.click(container.querySelector('[data-testid="sld-canvas-v3"]')!);
    expect(zaznaczone()).toEqual([]);
    expect(screen.queryByTestId('inspektor-element-kanwy')).toBeNull();
  });

  // Akcja wiersza (przejście do nastaw) — natywny klik w przycisk wiersza po natywnym kliku w ramkę bloku.
  // Iloczyn: pole {bez urządzenia, z urządzeniem} × tryb {edycja modelu, tylko odczyt wyników}.
  // Nastawy urządzenia (ekran E-27) są odczytem — przycisk zawsze; dodanie urządzenia to zmiana
  // modelu — tylko w trybie edycji.
  for (const [nazwa, enm] of ROZDZIELNIE) {
    for (const tryb of ['MODEL_EDIT', 'RESULT_VIEW'] as const) {
      it(`akcja wiersza: ${nazwa} × tryb ${tryb}`, () => {
        const ekran = vi.fn();
        const operacja = vi.fn();
        useNetworkBuildStore.setState({ openRouteSurface: ekran, openOperationForm: operacja });
        useAppStateStore.setState({ activeMode: tryb });
        try {
          const { container } = przygotuj(enm);
          const uchwyt = uchwytyWgKlasy(container, enm).get('ramka bloku')!;
          const pole = uchwyt.getAttribute('data-hit-owner-ref')!;
          const bay = enm.bays.find((b) => b.ref_id === pole)!;
          fireEvent.click(uchwyt);
          const sekcja = screen.getByTestId('inspektor-karta-zabezpieczenia');
          const przyciski = within(sekcja).queryAllByTestId('inspektor-karta-akcja-wiersza');
          const zUrzadzeniem = maUrzadzenie(enm, bay);
          const oczekiwanaLiczba = zUrzadzeniem || tryb === 'MODEL_EDIT' ? (bay.protection_codes ?? []).length : 0;
          expect(przyciski).toHaveLength(oczekiwanaLiczba);
          if (oczekiwanaLiczba === 0) return;
          fireEvent.click(przyciski[0]);
          if (zUrzadzeniem) {
            expect(ekran).toHaveBeenCalledWith('E-27');
            expect(operacja).not.toHaveBeenCalled();
          } else {
            expect(operacja).toHaveBeenCalledWith('add_relay', { bay_ref: pole });
            expect(ekran).not.toHaveBeenCalled();
          }
        } finally {
          useAppStateStore.setState({ activeMode: 'MODEL_EDIT' });
        }
      });
    }
  }

  it('iloczyn pokrywa obie wartości cechy „urządzenie" (warunek testu)', () => {
    const pierwszePole = (enm: EnergyNetworkModel) => {
      const { container } = przygotuj(enm);
      const pole = uchwytyWgKlasy(container, enm).get('ramka bloku')!.getAttribute('data-hit-owner-ref')!;
      cleanup();
      return maUrzadzenie(enm, enm.bays.find((b) => b.ref_id === pole)!);
    };
    expect(ROZDZIELNIE.map(([, enm]) => pierwszePole(enm))).toEqual([false, true]);
  });
});
