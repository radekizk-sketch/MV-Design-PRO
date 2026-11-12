/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC: klik (NATYWNY — uchwyt trafienia warstwy `sld-v3-trafienia`,
 * jak mysz; bez syntetycznego `dispatchEvent`) w dowolny obiekt bloku przekaźnika otwiera kartę
 * POLA w prawym inspektorze, z wyróżnioną sekcją „Zabezpieczenia i automatyka": wiersz na każdą
 * włączoną funkcję sterownika pola (karta OCHRONA-JEDNO-ZRODLO: `ProtectionAssignment` z `bay_ref`
 * pola — jedyne źródło funkcji; kod IEEE C37.2 + nazwa polska ze słownika backendu) i akcja
 * prowadząca do nastaw sterownika (E-27).
 *
 * Wyrocznia niezależna od kodu produkcyjnego: pole = człon `data-hit-owner-ref` przed `#`
 * (zapis warstwy trafień), treść wierszy z SUROWEGO `slownikFunkcjiEaz.json` i SUROWEGO rekordu
 * sterownika z fikstury (funkcje `wlaczona !== false`, klucz wiersza = `ref` funkcji).
 *
 * Iloczyn cech: sterownik pola {z szablonu pola — funkcje bez nastaw, z nastawami grupy} × obiekt
 * bloku {ramka bloku (symbol bloku zabezpieczeń — prostokątna ramka bez okręgu, korekta v2
 * 2026-11-04), wiersz kodów, wiersz „U0", linia wyłączania, pozostałe adnotacje (tabliczka CT,
 * numer urządzenia)} × tryb {edycja modelu, odczyt wyników}. Każda klasa obecna w DOM jest
 * klikana; obecność ramki i wiersza kodów jest warunkiem testu (nie cichy brak). Pole BEZ
 * sterownika nie ma funkcji, więc nie ma bloku przekaźnika — przypięte osobnym testem (akcja
 * „dodaj zabezpieczenie" karty pola bez sterownika: `kartaTechnicznaElementu.parytet.test.tsx`).
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
// GPZ ze sterownikami pól z nastawami grupy 1 (pola liniowe i transformatorowe GPZ).
const enmZUrzadzeniem = (
  JSON.parse(
    readFileSync(resolve(here, '..', '..', 'scene', '__tests__', 'fixtures', 'gpzProtectionDataPath.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;
const enmGpz = (fxZ11 as unknown as { snapshot: EnergyNetworkModel }).snapshot;

const ROZDZIELNIE = [
  ['GPZ Z.11 (sterowniki z szablonu pola, bez nastaw)', enmGpz],
  ['GPZ ze sterownikami z nastawami', enmZUrzadzeniem],
] as const;

/** Wyrocznia: surowy rekord sterownika pola z fikstury (`bay_ref` pola). */
function sterownikZFikstury(enm: EnergyNetworkModel, bayRef: string) {
  return (enm.protection_assignments ?? []).find((pa) => pa.bay_ref === bayRef);
}

/** Wyrocznia wierszy karty: włączone funkcje sterownika (klucz = `ref`, kod do słownika). */
function funkcjeWlaczone(enm: EnergyNetworkModel, bayRef: string): { ref: string; kod: string }[] {
  return (sterownikZFikstury(enm, bayRef)?.funkcje ?? []).filter((f) => f.wlaczona !== false);
}

/** Wyrocznia cechy iloczynu: sterownik ma zapisane nastawy w którejś grupie. */
function maNastawy(enm: EnergyNetworkModel, bayRef: string): boolean {
  return (sterownikZFikstury(enm, bayRef)?.grupy_nastaw ?? []).some((g) => (g.funkcje ?? []).length > 0);
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
      <SldCanvasV3Workspace width={SZER} height={WYS} />
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
  const polaZKodami = new Set(enm.bays.filter((b) => funkcjeWlaczone(enm, b.ref_id).length > 0).map((b) => b.ref_id));
  const scena = buildSceneV3(enm);
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
        fireEvent.click(uchwyt);

        expect(zaznaczone()).toEqual([pole]);
        const panel = screen.getByTestId('inspektor-element-kanwy');
        expect(panel).toHaveAttribute('data-element-id', pole);
        const sekcja = screen.getByTestId('inspektor-karta-zabezpieczenia');
        expect(sekcja).toHaveAttribute('data-wyrozniona', 'true');
        expect(within(sekcja).getByRole('heading', { name: 'Zabezpieczenia i automatyka' })).toBeInTheDocument();

        const wiersze = within(sekcja).getAllByTestId('inspektor-karta-wiersz-funkcje_eaz');
        const funkcje = funkcjeWlaczone(enm, pole);
        expect(wiersze.map((w) => w.getAttribute('data-klucz'))).toEqual(funkcje.map((f) => f.ref));
        wiersze.forEach((w, i) => {
          const wpis = FUNKCJE[funkcje[i].kod];
          expect(wpis, `kod ${funkcje[i].kod} w słowniku`).toBeDefined();
          expect(w.textContent).toContain(wpis.nazwa_pl);
          const akcja = within(w).getByTestId('inspektor-karta-akcja-wiersza');
          expect(akcja.getAttribute('data-cel')).toBe('E-27');
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

  // Akcja wiersza (przejście do nastaw) — natywny klik w przycisk wiersza po natywnym kliku w ramkę
  // bloku. Iloczyn: sterownik {z szablonu, z nastawami} × tryb {edycja modelu, tylko odczyt wyników}.
  // Nastawy sterownika (ekran E-27) są odczytem — przycisk w obu trybach, na każdym wierszu.
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
          fireEvent.click(uchwyt);
          const sekcja = screen.getByTestId('inspektor-karta-zabezpieczenia');
          const przyciski = within(sekcja).queryAllByTestId('inspektor-karta-akcja-wiersza');
          expect(przyciski).toHaveLength(funkcjeWlaczone(enm, pole).length);
          fireEvent.click(przyciski[0]);
          expect(ekran).toHaveBeenCalledWith('E-27');
          expect(operacja).not.toHaveBeenCalled();
        } finally {
          useAppStateStore.setState({ activeMode: 'MODEL_EDIT' });
        }
      });
    }
  }

  it('iloczyn pokrywa obie wartości cechy „sterownik z nastawami" (warunek testu)', () => {
    const pierwszePole = (enm: EnergyNetworkModel) => {
      const { container } = przygotuj(enm);
      const pole = uchwytyWgKlasy(container, enm).get('ramka bloku')!.getAttribute('data-hit-owner-ref')!;
      cleanup();
      return maNastawy(enm, pole);
    };
    expect(ROZDZIELNIE.map(([, enm]) => pierwszePole(enm))).toEqual([false, true]);
  });

  it('pole bez sterownika: brak funkcji — brak bloku przekaźnika tego pola na kanwie', () => {
    const { container: przed } = przygotuj(enmGpz);
    const pole = uchwytyWgKlasy(przed, enmGpz).get('ramka bloku')!.getAttribute('data-hit-owner-ref')!;
    cleanup();
    const bezSterownika: EnergyNetworkModel = {
      ...enmGpz,
      protection_assignments: (enmGpz.protection_assignments ?? []).filter((pa) => pa.bay_ref !== pole),
    };
    const { container } = przygotuj(bezSterownika);
    const uchwytyPola = [...container.querySelectorAll('[data-hit-klasa="adnotacja"][data-hit-owner-ref]')].filter(
      (el) => (el.getAttribute('data-hit-owner-ref') ?? '').split('#')[0] === pole,
    );
    expect(uchwytyPola).toEqual([]);
    // Pozostałe pola ze sterownikami nadal mają blok (usunięcie dotyczy jednego pola).
    expect(uchwytyWgKlasy(container, bezSterownika).has('ramka bloku')).toBe(true);
  });
});
