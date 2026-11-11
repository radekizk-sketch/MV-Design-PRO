/*
 * Powrót ze schematu i rejestr widoczności kanwy (karta SLD-SKALA-I-NAWIGACJA, część W).
 *
 * Przypięte obietnice docstringów (KLASA §4 — deklaracja bez testu = fałszywa pewność):
 *   - wpis powrotu jest JEDEN (nie stos): kolejne wejście nadpisuje poprzednie;
 *   - wpis nie przeżywa wyjścia ze schematu inną drogą niż „Wróć do";
 *   - powrót wykonuje się wyłącznie jawnym „Wróć do", nigdy samoczynnie (pułapka
 *     z `e2e/pulapka-nawigacji-po-biegu.spec.ts`);
 *   - ekran źródłowy odbiera swój stan lokalny po ponownym montażu (`useStanPowrotu`);
 *   - przewinięcie warsztatu wraca na swoje miejsce;
 *   - rejestr kanwy liczy montaże (dwie kanwy, odmontowanie jednej → nadal widoczna);
 *   - predykat warsztatu „Schemat pokazuje kanwę" i predykat rozwiniętej powierzchni.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook } from '@testing-library/react';

import { ustawMigawkeZElementami, zamontujKanweSchematu } from '../../../test/schematTestowy';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useSelectionStore } from '../../../ui/selection/store';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useShellStore } from '../useShellStore';
import {
  OKNO_PRZEWINIECIA_MS,
  useEkranZrodlowy,
  usePowrotZeSchematu,
  useStanPowrotu,
  useWyborPowrotu,
  wrocDoEkranu,
} from '../powrotZeSchematu';
import {
  kanwaSchematuWidoczna,
  kanwaSchematuWidocznaDla,
  powierzchniaRozwinieta,
} from '../widokKanwySchematu';
import { pokazElementNaSchemacie, zaznaczElementModelu } from '../zaznaczElementModelu';

const stanSelekcji = useSelectionStore.getState();
const stanMigawki = useSnapshotStore.getState();

beforeEach(() => {
  window.location.hash = '#wyniki';
  useShellStore.setState({ activeSpace: 'wyniki' });
  usePowrotZeSchematu.setState({ wpis: null, doOdebrania: null });
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] } as never);
  ustawMigawkeZElementami([
    { kolekcja: 'buses', id: 'bus-1', name: 'Szyna 1' },
    { kolekcja: 'buses', id: 'bus-2', name: 'Szyna 2' },
  ]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useSelectionStore.setState(stanSelekcji, true);
  useSnapshotStore.setState(stanMigawki, true);
  usePowrotZeSchematu.setState({ wpis: null, doOdebrania: null });
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] } as never);
  window.location.hash = '';
});

describe('Wpis powrotu — jeden, jawny, z ekranem źródłowym', () => {
  it('etykieta z ekranu zarejestrowanego; bez rejestracji — etykieta przestrzeni', () => {
    pokazElementNaSchemacie('bus-1', 'test');
    expect(usePowrotZeSchematu.getState().wpis?.etykieta).toBe('Wyniki i dowody');

    useShellStore.setState({ activeSpace: 'wyniki' });
    window.location.hash = '#wyniki';
    const { unmount } = renderHook(() => useEkranZrodlowy('Wyniki i dowody — Zwarcia', 'zakladka-wynikow', 'zwarcia'));
    pokazElementNaSchemacie('bus-1', 'test');
    expect(usePowrotZeSchematu.getState().wpis).toMatchObject({
      etykieta: 'Wyniki i dowody — Zwarcia',
      przestrzen: 'wyniki',
      hash: '#wyniki',
    });
    unmount();
  });

  it('jeden wpis, nie stos: drugie wejście nadpisuje pierwsze', () => {
    pokazElementNaSchemacie('bus-1', 'test');
    useShellStore.setState({ activeSpace: 'gotowosc' });
    pokazElementNaSchemacie('bus-2', 'test');
    expect(usePowrotZeSchematu.getState().wpis?.przestrzen).toBe('gotowosc');
    wrocDoEkranu();
    expect(useShellStore.getState().activeSpace).toBe('gotowosc');
    // Drugie „Wróć do" niczego nie robi — nie ma ekranu sprzed dwóch kroków.
    wrocDoEkranu();
    expect(useShellStore.getState().activeSpace).toBe('gotowosc');
  });

  it('wyjście ze schematu inną drogą kasuje wpis; powrót nigdy nie wykonuje się samoczynnie', () => {
    pokazElementNaSchemacie('bus-1', 'test');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
    expect(usePowrotZeSchematu.getState().wpis).not.toBeNull();
    // Kolejne wskazania na schemacie (przeglądanie) nie zabierają projektanta ze schematu.
    zaznaczElementModelu('bus-2', 'drzewo');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
    useShellStore.setState({ activeSpace: 'model' });
    expect(usePowrotZeSchematu.getState().wpis).toBeNull();
  });

  it('wejście z rozwiniętej powierzchni: kanwa jako kolejna powierzchnia stosu, bez wpisu „Wróć do"', () => {
    useShellStore.setState({ activeSpace: 'model' });
    useNetworkBuildStore.getState().openRouteSurface('E-27', { openMode: 'expand_workspace' });
    expect(useNetworkBuildStore.getState().activeSurface?.openMode).toBe('expand_workspace');
    pokazElementNaSchemacie('bus-1', 'konfigurator-stacji');
    expect(usePowrotZeSchematu.getState().wpis).toBeNull();
    expect(useNetworkBuildStore.getState().activeSurface).toMatchObject({ screenCode: 'E-01', entityRef: 'bus-1' });
    // Powrót niesie stos powierzchni: powierzchnia wołająca leży pod kanwą, a
    // zwinięcie stosu do niej (okruszek) wraca do niej bez utraty.
    const stos = useNetworkBuildStore.getState().surfaceStack;
    expect(stos.map((p) => p.screenCode)).toEqual(['E-27', 'E-01']);
    useNetworkBuildStore.getState().collapseSurfaceStackTo(stos[0].surfaceId);
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-27');
    expect(useSelectionStore.getState().sldWskazanie).toMatchObject({ ref: 'bus-1', tryb: 'kadruj' });
  });
});

describe('Stan lokalny ekranu źródłowego i przewinięcie', () => {
  function Ekran({ onStan }: { onStan: (s: string | null) => void }) {
    useEkranZrodlowy('Wyniki i dowody — Rozpływ', 'zakladka-wynikow', 'rozplyw');
    onStan(useStanPowrotu('zakladka-wynikow'));
    return (
      <div data-testid="main-content">
        <div data-testid="przewijany" />
      </div>
    );
  }

  it('po „Wróć do" ponownie montowany ekran odbiera swój stan, a drugi montaż już nie', () => {
    const stany: (string | null)[] = [];
    const pierwszy = render(<Ekran onStan={(s) => stany.push(s)} />);
    pokazElementNaSchemacie('bus-1', 'test');
    pierwszy.unmount();
    wrocDoEkranu();
    const drugi = render(<Ekran onStan={(s) => stany.push(s)} />);
    expect(stany[stany.length - 1]).toBe('rozplyw');
    drugi.unmount();
    stany.length = 0;
    render(<Ekran onStan={(s) => stany.push(s)} />);
    expect(stany.every((s) => s === null)).toBe(true);
  });

  it('przewinięcie warsztatu wraca na swoje miejsce, gdy ekran dociągnie treść', () => {
    vi.useFakeTimers();
    const { getByTestId, unmount } = render(<Ekran onStan={() => undefined} />);
    const korzen = getByTestId('main-content');
    Object.defineProperty(korzen, 'scrollTop', { value: 420, writable: true, configurable: true });
    pokazElementNaSchemacie('bus-1', 'test');
    expect(usePowrotZeSchematu.getState().wpis?.przewiniecia).toEqual([
      { korzen: '[data-testid="main-content"]', sciezka: [], top: 420, left: 0 },
    ]);
    unmount();
    wrocDoEkranu();
    const ponownie = render(<Ekran onStan={() => undefined} />);
    const nowy = ponownie.getByTestId('main-content');
    Object.defineProperty(nowy, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(nowy, 'clientHeight', { value: 500, configurable: true });
    act(() => {
      vi.advanceTimersByTime(OKNO_PRZEWINIECIA_MS);
    });
    expect(nowy.scrollTop).toBe(420);
  });
});

describe('Stan wielu ekranów naraz: zakładka warsztatu × wybrany wiersz ekranu', () => {
  let ustawWybor: (w: string | null) => void = () => undefined;
  function EkranWynikow() {
    const [wybor, setWybor] = useWyborPowrotu('wybor:test-ekran');
    ustawWybor = setWybor;
    return <span data-testid="wybor">{wybor ?? 'brak'}</span>;
  }
  function Warsztat() {
    const zakladka = useStanPowrotu('test-warsztat') ?? 'ocena';
    useEkranZrodlowy(`Wyniki — ${zakladka}`, 'test-warsztat', 'zwarcia');
    return <EkranWynikow />;
  }

  it('„Wróć do" oddaje oba stany; etykieta z warsztatu (ekran bez etykiety jej nie nadpisuje)', () => {
    const pierwszy = render(<Warsztat />);
    act(() => ustawWybor('wiersz-2'));
    pokazElementNaSchemacie('bus-1', 'test');
    expect(usePowrotZeSchematu.getState().wpis).toMatchObject({
      etykieta: 'Wyniki — ocena',
      stany: { 'test-warsztat': 'zwarcia', 'wybor:test-ekran': 'wiersz-2' },
    });
    pierwszy.unmount();
    wrocDoEkranu();
    const drugi = render(<Warsztat />);
    expect(drugi.getByTestId('wybor')).toHaveTextContent('wiersz-2');
    // Oba stany odebrane — trzeci montaż startuje od zera.
    expect(usePowrotZeSchematu.getState().doOdebrania).toBeNull();
  });
});

describe('Rejestr kanwy i predykaty widoku', () => {
  it('rejestr liczy montaże: dwie kanwy, odmontowanie jednej — nadal widoczna', () => {
    expect(kanwaSchematuWidoczna()).toBe(false);
    const a = zamontujKanweSchematu();
    const b = zamontujKanweSchematu();
    a();
    expect(kanwaSchematuWidoczna()).toBe(true);
    b();
    expect(kanwaSchematuWidoczna()).toBe(false);
  });

  it('przeglądanie bez kanwy: zaznaczenie bez wskazania; z kanwą: „kotwicz" bez zmiany przestrzeni', () => {
    zaznaczElementModelu('bus-1', 'drzewo');
    expect(useSelectionStore.getState().selectedElement?.id).toBe('bus-1');
    expect(useSelectionStore.getState().sldWskazanie).toBeNull();
    const odmontuj = zamontujKanweSchematu();
    zaznaczElementModelu('bus-2', 'drzewo');
    odmontuj();
    expect(useSelectionStore.getState().sldWskazanie).toMatchObject({ ref: 'bus-2', tryb: 'kotwicz' });
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(usePowrotZeSchematu.getState().wpis).toBeNull();
  });

  it.each([
    ['', 'schemat', false, true],
    ['#sld', 'schemat', false, true],
    ['#sld', 'schemat', true, false],
    ['#analysis', 'schemat', false, false],
    ['', 'wyniki', false, false],
  ] as const)('warsztat: trasa %j × przestrzeń %s × powierzchnia rozwinięta %s → kanwa %s', (trasa, przestrzen, rozw, wynik) => {
    expect(kanwaSchematuWidocznaDla(trasa, przestrzen, rozw)).toBe(wynik);
  });

  it.each([
    ['expand_workspace', 'model', true],
    ['expand_workspace', 'wyniki', false],
    ['expand_workspace', 'dokumentacja', false],
    ['modal', 'model', false],
    [null, 'model', false],
  ] as const)('powierzchnia %s w przestrzeni %s → rozwinięta %s', (tryb, przestrzen, wynik) => {
    expect(powierzchniaRozwinieta(tryb, przestrzen)).toBe(wynik);
  });
});
