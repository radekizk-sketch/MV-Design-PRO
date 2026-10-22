/**
 * Testy kreatora „Edycja parametrów elementu" (update_element_parameters) — realna ścieżka, Zero-Debt §5.
 * Weryfikuje naprawę phantoma: payload używa klucza `parameters` (nie `updates`), z konwersją typów.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorEdycjiParametrow } from '../KreatorEdycjiParametrow';
import { ETYKIETA_PL_TOLERANCJI_NN } from '../../../../types/uziemienie';
import { REJESTR_MASZYN } from './rejestrMaszynFixture';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { element_ref: 'tr-1' };
const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: null as {
    generators?: Record<string, unknown>[];
    branches?: Record<string, unknown>[];
  } | null,
};

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/topology/snapshotStore', async (importOriginal) => {
  // Pozostałe eksporty (selektory nazw używane przez most nazw `useNazwaObiektu`) z modułu
  // oryginalnego; podmieniony wyłącznie magazyn.
  const oryginal = await importOriginal<typeof import('../../../../ui/topology/snapshotStore')>();
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return { ...oryginal, useSnapshotStore };
});

vi.mock('../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: { closeOperationForm: typeof closeFormMock }) => unknown) =>
    selector({ closeOperationForm: closeFormMock }),
  useActiveOperationContext: () => context,
}));

vi.mock('../../../../ui/navigation/routes', () => ({ navigateToSld: () => navigateToSldMock() }));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerSldOnElementMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

describe('KreatorEdycjiParametrow — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { element_ref: 'tr-1' };
    snapshotState.error = null;
    snapshotState.snapshot = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('wysyła parametry pod kluczem `parameters` z konwersją liczby (naprawa phantoma updates)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'tr-1' } });
    render(<KreatorEdycjiParametrow />);

    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-klucz-0'), 'tap_position');
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-wartosc-0'), '2');
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-powod'), 'korekta terenowa');
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'update_element_parameters',
        { element_ref: 'tr-1', parameters: { tap_position: 2 }, reason: 'korekta terenowa' },
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('updates');
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('„nie" daje fałsz, a angielskie true/null zostają tekstem (słownik tylko polski)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorEdycjiParametrow />);
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-klucz-0'), 'in_service');
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-wartosc-0'), 'nie');
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-dodaj'));
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-klucz-1'), 'note');
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-wartosc-1'), 'null');
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'update_element_parameters',
        expect.objectContaining({ parameters: { in_service: false, note: 'null' } }),
      );
    });
  });

  it('obsługuje wiele parametrów z konwersją tak-nie/brak', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorEdycjiParametrow />);
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-klucz-0'), 'in_service');
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-wartosc-0'), 'tak');
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-dodaj'));
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-klucz-1'), 'note');
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-wartosc-1'), 'brak');
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'update_element_parameters',
        expect.objectContaining({ parameters: { in_service: true, note: null } }),
      );
    });
  });

  it('uczciwy stan zerowy: bez parametru zapis zablokowany', async () => {
    render(<KreatorEdycjiParametrow />);
    expect(screen.getByTestId('mvd-kreator-edycja-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  // C-12: pole wskazane przez akcję naprawczą gotowości (`context.field`) — klucz
  // pierwszego wiersza i kursor w polu jego wartości. jsdom nie liczy układu, więc
  // widoczność pola (`getClientRects`) podstawiamy jawnie; w przeglądarce ten sam
  // hook czeka, aż panel inspektora się rozwinie (e2e `akcja-naprawcza-jednym-klikiem`).
  describe('fokus pola wskazanego przez akcję naprawczą', () => {
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('kontekst z polem → klucz wypełniony, kursor w polu wartości', async () => {
      context = { element_ref: 'src-1', field: 'sk3_min_mva' };
      render(<KreatorEdycjiParametrow />);
      expect(screen.getByTestId('mvd-kreator-edycja-klucz-0')).toHaveValue('sk3_min_mva');
      await waitFor(() => expect(screen.getByTestId('mvd-kreator-edycja-wartosc-0')).toHaveFocus());
    });

    it('kontekst bez pola → formularz nie przejmuje fokusu', () => {
      context = { element_ref: 'src-1' };
      render(<KreatorEdycjiParametrow />);
      expect(screen.getByTestId('mvd-kreator-edycja-wartosc-0')).not.toHaveFocus();
    });
  });

  // Dane modułu NC RfG generatora (plan AB O-50 pkt 5–6): ten sam formularz co kreator źródła
  // OZE, wypełniony z MODELU; zapis wyłącznie pól zmienionych (niezmienione nie nadpisują).
  describe('dane modułu NC RfG generatora', () => {
    const GENERATOR = {
      ref_id: 'gen-pv-1',
      modul_istniejacy: false,
      data_umowy_przylaczeniowej: '2024-01-15',
      nastawy_zabezpieczen: { f_min_hz: 47.5, f_min_czas_s: 0.5, zrodlo_pl: 'karta nastaw' },
      deklaracje_modulu: { has_scada_communication: true, ramp_rate_pct_per_min: 10, zrodlo_pl: 'karta katalogowa' },
    };
    const T = 'mvd-kreator-edycja-ncrfg';

    beforeEach(() => {
      context = { element_ref: GENERATOR.ref_id };
      snapshotState.snapshot = { generators: [GENERATOR] };
    });

    it('formularz wypełniony z modelu (art. 4, data, nastawy, flagi trójstanowe, liczby)', () => {
      render(<KreatorEdycjiParametrow />);
      expect(screen.getByTestId(`${T}-modul_istniejacy`)).toHaveValue('nie');
      expect(screen.getByTestId(`${T}-data_umowy_przylaczeniowej`)).toHaveValue('2024-01-15');
      expect(screen.getByTestId(`${T}-nastawa-f_min_hz`)).toHaveValue('47.5');
      expect(screen.getByTestId(`${T}-nastawa-zrodlo_pl`)).toHaveValue('karta nastaw');
      expect(screen.getByTestId(`${T}-flaga-has_scada_communication`)).toHaveValue('tak');
      // Brak deklaracji w modelu = „nie zadeklarowano", nigdy „nie".
      expect(screen.getByTestId(`${T}-flaga-has_disturbance_recorder`)).toHaveValue('nieustalone');
      expect(screen.getByTestId(`${T}-liczba-ramp_rate_pct_per_min`)).toHaveValue('10');
      expect(screen.getByTestId('mvd-kreator-edycja-zapisz')).toBeDisabled();
    });

    it('zmiana jednej deklaracji → zapis WYŁĄCZNIE bloku deklaracji (pozostałe pola bez nadpisania)', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      render(<KreatorEdycjiParametrow />);
      await userEvent.selectOptions(screen.getByTestId(`${T}-flaga-has_disturbance_recorder`), 'nie');
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));
      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const payload = executeDomainOperationMock.mock.calls[0][2] as { parameters: Record<string, unknown> };
      expect(Object.keys(payload.parameters)).toEqual(['deklaracje_modulu']);
      expect(payload.parameters.deklaracje_modulu).toMatchObject({
        has_scada_communication: true,
        has_disturbance_recorder: false,
        active_power_control_enabled: null,
        ramp_rate_pct_per_min: 10,
        zrodlo_pl: 'karta katalogowa',
      });
    });

    it('wyczyszczenie daty umowy → `null` (zdjęcie danej), nie pusty napis', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      render(<KreatorEdycjiParametrow />);
      await userEvent.clear(screen.getByTestId(`${T}-data_umowy_przylaczeniowej`));
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));
      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const payload = executeDomainOperationMock.mock.calls[0][2] as { parameters: Record<string, unknown> };
      expect(payload.parameters).toEqual({ data_umowy_przylaczeniowej: null });
    });

    it('deklaracja bez źródła → nazwany błąd pola, zapis zablokowany (backend odrzuciłby 422)', async () => {
      render(<KreatorEdycjiParametrow />);
      await userEvent.clear(screen.getByTestId(`${T}-zrodlo_deklaracji`));
      expect(screen.getByTestId(`${T}-zrodlo_deklaracji-blad`)).toHaveTextContent('źródło deklaracji');
      expect(screen.getByTestId('mvd-kreator-edycja-zapisz')).toBeDisabled();
      expect(executeDomainOperationMock).not.toHaveBeenCalled();
    });

    it('element niebędący generatorem → brak sekcji danych modułu', () => {
      context = { element_ref: 'tr-1' };
      render(<KreatorEdycjiParametrow />);
      expect(screen.queryByTestId('mvd-kreator-edycja-dane-modulu')).toBeNull();
    });
  });

  // Zasada nr 4 (V12K-351): wartości projektanta aparatu SN — nośnik `overrides` gałęzi
  // APARAT_SN. Iloczyn cech: {wartość nowa, wartość niezmieniona, wyczyszczenie} × {kontekst
  // z polem, bez pola} × {gałąź APARAT_SN, inna gałąź}; podpowiedź z katalogu (karta /
  // propozycja / brak) z odpowiedzi `GET /api/catalog/mv-apparatus-types`.
  describe('wartości projektanta aparatu SN', () => {
    const APARAT = {
      ref_id: 'stn/x/sn_field_breaker/000',
      type: 'switch',
      catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
      catalog_namespace: 'APARAT_SN',
      parameter_source: 'OVERRIDE',
      overrides: [{ key: 'i_th_ka', value: 16, reason: 'tabliczka aparatu istniejącego' }],
    };
    const POZYCJA = {
      id: 'sw-cb-abb-vd4-17kv-630a',
      name: 'ABB VD4 17.5 kV 630 A',
      device_kind: 'WYLACZNIK',
      u_n_kv: 17.5,
      i_n_a: 630,
      i_th_ka: 20,
      i_th_duration_s: 1,
      i_dyn_ka: null,
      break_time_s: null,
      wartosci_robocze: [
        {
          parametr: 'break_time_s', nazwa_pl: 'czas własny wyłączania wyłącznika', wartosc: 0.06,
          jednostka: 's', rodzaj_zrodla: 'PROFIL_URZADZENIA', odniesienie: 'profil', uzasadnienie_pl: 'u',
          wplyw_pl: 'w',
        },
        {
          parametr: 'i_dyn_ka', nazwa_pl: 'prąd szczytowy wytrzymywany', wartosc: 50, jednostka: 'kA',
          rodzaj_zrodla: 'NORMA', odniesienie: 'IEC 62271-1:2017 p. 5.7', uzasadnienie_pl: 'u', wplyw_pl: 'w',
        },
      ],
    };
    const A = 'mvd-kreator-edycja-aparat';

    beforeEach(() => {
      context = { element_ref: APARAT.ref_id };
      snapshotState.snapshot = { branches: [APARAT] };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).includes('/api/catalog/mv-apparatus-types')
            ? new Response(JSON.stringify([POZYCJA]), { status: 200, headers: { 'Content-Type': 'application/json' } })
            : new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
        ),
      );
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('sekcja wypełniona z overrides; podpowiedź mówi, co obliczenie przyjmie bez wartości projektanta', async () => {
      render(<KreatorEdycjiParametrow />);
      expect(screen.getByTestId(`${A}-i_th_ka`)).toHaveValue('16');
      expect(screen.getByTestId(`${A}-break_time_s`)).toHaveValue('');
      const sekcja = screen.getByTestId(A);
      await waitFor(() => expect(sekcja).toHaveTextContent('wartość robocza dla danych karty 0,06 s (profil typowy urządzenia)'));
      expect(sekcja).toHaveTextContent('dana karty katalogowej 20 kA');
      expect(sekcja).toHaveTextContent('dana karty katalogowej 1 s');
      expect(sekcja).toHaveTextContent('wartość robocza dla danych karty 50 kA (norma)');
      // Bez zmiany wartości aparatu zapis jest zablokowany (nic do zapisu).
      expect(screen.getByTestId('mvd-kreator-edycja-zapisz')).toBeDisabled();
    });

    it('nowa wartość czasu własnego → lista overrides w kolejności rejestru; niezmieniona zachowuje uzasadnienie', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      render(<KreatorEdycjiParametrow />);
      await userEvent.type(screen.getByTestId(`${A}-break_time_s`), '0,08');
      await userEvent.type(screen.getByTestId('mvd-kreator-edycja-powod'), 'karta producenta rev. C');
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const payload = executeDomainOperationMock.mock.calls[0][2] as { parameters: Record<string, unknown> };
      expect(payload.parameters).toEqual({
        overrides: [
          { key: 'break_time_s', value: 0.08, reason: 'karta producenta rev. C' },
          { key: 'i_th_ka', value: 16, reason: 'tabliczka aparatu istniejącego' },
        ],
      });
    });

    it('wyczyszczenie wszystkich pól → pusta lista (powrót do karty i propozycji)', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      render(<KreatorEdycjiParametrow />);
      await userEvent.clear(screen.getByTestId(`${A}-i_th_ka`));
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const payload = executeDomainOperationMock.mock.calls[0][2] as { parameters: Record<string, unknown> };
      expect(payload.parameters).toEqual({ overrides: [] });
    });

    it('tekst niebędący liczbą → błąd pola, zapis bez wywołania operacji', async () => {
      render(<KreatorEdycjiParametrow />);
      await userEvent.type(screen.getByTestId(`${A}-i_dyn_ka`), 'dużo');
      expect(screen.getByTestId(A)).toHaveTextContent('Wartość musi być liczbą');
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));
      expect(executeDomainOperationMock).not.toHaveBeenCalled();
    });

    it('kontekst „Zmień wartość” (field = parametr aparatu) → kursor w polu aparatu, nie w wierszu klucz → wartość', async () => {
      vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
      context = { element_ref: APARAT.ref_id, element_type: 'Switch', field: 'break_time_s' };
      render(<KreatorEdycjiParametrow />);
      expect(screen.getByTestId('mvd-kreator-edycja-klucz-0')).toHaveValue('');
      await waitFor(() => expect(screen.getByTestId(`${A}-break_time_s`)).toHaveFocus());
    });

    it('akcja naprawcza blokady E011 (field = overrides) → kursor w pierwszym polu aparatu', async () => {
      vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
      context = { element_ref: APARAT.ref_id, element_type: 'Switch', field: 'overrides' };
      render(<KreatorEdycjiParametrow />);
      expect(screen.getByTestId('mvd-kreator-edycja-klucz-0')).toHaveValue('');
      await waitFor(() => expect(screen.getByTestId(`${A}-break_time_s`)).toHaveFocus());
    });

    it.each([
      ['parametr spoza rodziny aparatu', { key: 'cos_phi', value: 0.9, reason: null }],
      ['wartość nieliczbowa parametru aparatu', { key: 'i_dyn_ka', value: '50', reason: null }],
    ])('model sprzed bramy (%s, E011) → zapis bez edycji usuwa wpis', async (_, wpis) => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      snapshotState.snapshot = { branches: [{ ...APARAT, overrides: [...APARAT.overrides, wpis] }] };
      render(<KreatorEdycjiParametrow />);
      const zapisz = screen.getByTestId('mvd-kreator-edycja-zapisz');
      expect(zapisz).toBeEnabled();
      await userEvent.click(zapisz);
      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const payload = executeDomainOperationMock.mock.calls[0][2] as { parameters: Record<string, unknown> };
      expect(payload.parameters).toEqual({ overrides: APARAT.overrides });
    });

    it('gałąź bez wiązania APARAT_SN → brak sekcji (parametry aparatu nie dotyczą odcinka)', () => {
      snapshotState.snapshot = { branches: [{ ...APARAT, catalog_namespace: 'KABEL_SN' }] };
      render(<KreatorEdycjiParametrow />);
      expect(screen.queryByTestId(A)).toBeNull();
    });
  });

  // Karta PODSTAWA-Q (zasada nr 4): wartości projektanta parametrów zwarciowych maszyny
  // wirującej — nośnik `overrides` generatora, rodzina i parametry z rejestru backendu
  // (`GET /api/catalog/maszyny-wirujace/wartosci-robocze`). Iloczyn cech: {synchroniczna,
  // asynchroniczna klatkowa, dwustronnie zasilana, falownik} × {dana tabliczki, propozycja} ×
  // {wartość nowa, niezmieniona, wyczyszczona, nieliczbowa} × {kontekst `overrides` z akcji
  // naprawczej gotowości, bez kontekstu} × {rejestr dostępny, błąd, odpowiedź innego kształtu}.
  describe('wartości projektanta maszyny wirującej', () => {
    const M = 'mvd-kreator-edycja-maszyna';
    let odpowiedzRejestru: () => Response;

    function generator(genType: string, extra: Record<string, unknown> = {}) {
      return { ref_id: 'gen-1', name: 'Agregat', gen_type: genType, ...extra };
    }

    beforeEach(() => {
      context = { element_ref: 'gen-1' };
      odpowiedzRejestru = () =>
        new Response(JSON.stringify(REJESTR_MASZYN), { status: 200, headers: { 'Content-Type': 'application/json' } });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).includes('/api/catalog/maszyny-wirujace/wartosci-robocze')
            ? odpowiedzRejestru()
            : new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
        ),
      );
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it.each([
      ['synchronous', ['sn_mva', 'xd_subtransient_pu', 'cos_phi']],
      ['fw_scig', ['pr_mw', 'pole_pairs', 'i_lr_ratio', 'cos_phi', 'efficiency']],
      ['fw_dfig', ['pr_mw', 'pole_pairs', 'i_lr_ratio', 'cos_phi', 'efficiency']],
    ])('%s → sekcja z polami rodziny w kolejności rejestru', async (genType, klucze) => {
      snapshotState.snapshot = { generators: [generator(genType)] };
      render(<KreatorEdycjiParametrow />);
      const sekcja = await screen.findByTestId(M);
      const pola = Array.from(sekcja.querySelectorAll<HTMLInputElement>(`[data-testid^="${M}-"]`))
        .map((el) => el.dataset.testid?.slice(M.length + 1));
      expect(pola).toEqual(klucze);
    });

    it('falownik (rodzaj spoza rejestru) → brak sekcji maszyny', async () => {
      snapshotState.snapshot = { generators: [generator('pv_inverter')] };
      render(<KreatorEdycjiParametrow />);
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(screen.queryByTestId(M)).toBeNull();
      expect(screen.queryByTestId(`${M}-niedostepna`)).toBeNull();
    });

    it('podpowiedź: dana tabliczki albo propozycja z rodzajem źródła; formularz z overrides', async () => {
      snapshotState.snapshot = {
        generators: [
          generator('fw_scig', {
            materialized_params: { i_lr_ratio: 6 },
            overrides: [{ key: 'pole_pairs', value: 2, reason: 'tabliczka silnika' }],
            parameter_source: 'OVERRIDE',
          }),
        ],
      };
      render(<KreatorEdycjiParametrow />);
      const sekcja = await screen.findByTestId(M);
      expect(screen.getByTestId(`${M}-pole_pairs`)).toHaveValue('2');
      expect(screen.getByTestId(`${M}-i_lr_ratio`)).toHaveValue('');
      expect(sekcja).toHaveTextContent('Puste pole: dana tabliczki elementu 6.');
      expect(sekcja).toHaveTextContent('Puste pole: wartość robocza 0,85 (założenie inżynierskie).');
      expect(sekcja).toHaveTextContent('Puste pole: wartość robocza 1 (założenie inżynierskie).');
      expect(sekcja).toHaveTextContent('Liczba par biegunów p');
      // Moc znamionowa bez tabliczki: reguła propozycji z punktu pracy, bez liczby liczonej w UI.
      expect(sekcja).toHaveTextContent(
        'Puste pole: wartość robocza (założenie inżynierskie): Tabliczka maszyny nie podaje ani mocy '
          + 'znamionowej P_rM',
      );
      expect(sekcja).toHaveTextContent('Moc znamionowa (mechaniczna) jednej maszyny P_rM [MW]');
      // Bez zmiany wartości maszyny nic do zapisu.
      expect(screen.getByTestId('mvd-kreator-edycja-zapisz')).toBeDisabled();
    });

    it('P_rM bez tabliczki przy S_rM tabliczki → podpowiedź wyznaczenia (reguła normy, bez liczby)', async () => {
      snapshotState.snapshot = { generators: [generator('fw_dfig', { materialized_params: { sn_mva: 2.4 } })] };
      render(<KreatorEdycjiParametrow />);
      const sekcja = await screen.findByTestId(M);
      expect(sekcja).toHaveTextContent(
        'Puste pole: dana tabliczki elementu, wyznaczona z mocy pozornej znamionowej S_rM tabliczki '
          + 'elementu: P_rM = S_rM·η_r·cos φ_r, IEC 60909-0:2016 pkt 6.7.',
      );
    });

    it('nowa wartość → lista overrides w kolejności rejestru; niezmieniona zachowuje uzasadnienie', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      snapshotState.snapshot = {
        generators: [
          generator('fw_scig', { overrides: [{ key: 'cos_phi', value: 0.9, reason: 'karta silnika' }] }),
        ],
      };
      render(<KreatorEdycjiParametrow />);
      await userEvent.type(await screen.findByTestId(`${M}-pole_pairs`), '3');
      await userEvent.type(screen.getByTestId('mvd-kreator-edycja-powod'), 'tabliczka znamionowa');
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      expect(executeDomainOperationMock).toHaveBeenCalledWith('case-1', 'update_element_parameters', {
        element_ref: 'gen-1',
        parameters: {
          overrides: [
            { key: 'pole_pairs', value: 3, reason: 'tabliczka znamionowa' },
            { key: 'cos_phi', value: 0.9, reason: 'karta silnika' },
          ],
        },
        reason: 'tabliczka znamionowa',
      });
    });

    it('generator synchroniczny: x″d z przecinkiem → liczba w overrides', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      snapshotState.snapshot = { generators: [generator('synchronous')] };
      render(<KreatorEdycjiParametrow />);
      await userEvent.type(await screen.findByTestId(`${M}-xd_subtransient_pu`), '0,17');
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));
      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const payload = executeDomainOperationMock.mock.calls[0][2] as { parameters: Record<string, unknown> };
      expect(payload.parameters).toEqual({ overrides: [{ key: 'xd_subtransient_pu', value: 0.17, reason: null }] });
    });

    it('wyczyszczenie wszystkich pól → pusta lista (powrót do tabliczki i propozycji)', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      snapshotState.snapshot = {
        generators: [generator('fw_dfig', { overrides: [{ key: 'efficiency', value: 0.97, reason: null }] })],
      };
      render(<KreatorEdycjiParametrow />);
      await userEvent.clear(await screen.findByTestId(`${M}-efficiency`));
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));
      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const payload = executeDomainOperationMock.mock.calls[0][2] as { parameters: Record<string, unknown> };
      expect(payload.parameters).toEqual({ overrides: [] });
    });

    it('tekst niebędący liczbą → błąd pola, zapis bez wywołania operacji', async () => {
      snapshotState.snapshot = { generators: [generator('synchronous')] };
      render(<KreatorEdycjiParametrow />);
      await userEvent.type(await screen.findByTestId(`${M}-cos_phi`), 'wysoki');
      expect(screen.getByTestId(M)).toHaveTextContent('Wartość musi być liczbą');
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));
      expect(executeDomainOperationMock).not.toHaveBeenCalled();
    });

    it('błędne pole maszyny przy innej zmianie do zapisu → komunikat zbiorczy, operacja nie wywołana', async () => {
      snapshotState.snapshot = { generators: [generator('fw_scig')] };
      render(<KreatorEdycjiParametrow />);
      await userEvent.type(await screen.findByTestId(`${M}-i_lr_ratio`), 'sześć');
      await userEvent.type(screen.getByTestId('mvd-kreator-edycja-klucz-0'), 'name');
      await userEvent.type(screen.getByTestId('mvd-kreator-edycja-wartosc-0'), 'Silnik pompy');
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));
      expect(await screen.findByText(/Wartość parametru maszyny nie jest liczbą/)).toBeTruthy();
      expect(executeDomainOperationMock).not.toHaveBeenCalled();
    });

    it('akcja naprawcza gotowości (field = overrides) → kursor w pierwszym polu maszyny, nie w wierszu klucz → wartość', async () => {
      vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
      context = { element_ref: 'gen-1', element_type: 'Generator', field: 'overrides' };
      snapshotState.snapshot = { generators: [generator('fw_scig')] };
      render(<KreatorEdycjiParametrow />);
      expect(screen.getByTestId('mvd-kreator-edycja-klucz-0')).toHaveValue('');
      await waitFor(() => expect(screen.getByTestId(`${M}-pr_mw`)).toHaveFocus());
    });

    it.each([
      ['parametr innej rodziny', { key: 'xd_subtransient_pu', value: 0.2, reason: null }],
      ['klucz spoza rejestru', { key: 'p_mw', value: 1, reason: null }],
      ['wartość nieliczbowa', { key: 'cos_phi', value: '0,9', reason: null }],
    ])('model sprzed bramy (%s, E011) → zapis bez edycji usuwa wpis', async (_, wpis) => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      snapshotState.snapshot = {
        generators: [
          generator('fw_scig', {
            overrides: [{ key: 'pole_pairs', value: 2, reason: 'tabliczka' }, wpis],
            parameter_source: 'OVERRIDE',
          }),
        ],
      };
      context = { element_ref: 'gen-1', element_type: 'Generator', field: 'overrides' };
      render(<KreatorEdycjiParametrow />);
      await screen.findByTestId(M);
      const zapisz = screen.getByTestId('mvd-kreator-edycja-zapisz');
      await waitFor(() => expect(zapisz).toBeEnabled());
      await userEvent.click(zapisz);
      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const payload = executeDomainOperationMock.mock.calls[0][2] as { parameters: Record<string, unknown> };
      expect(payload.parameters).toEqual({ overrides: [{ key: 'pole_pairs', value: 2, reason: 'tabliczka' }] });
    });

    it('kontekst bez pola → sekcja maszyny nie przejmuje fokusu', async () => {
      vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
      snapshotState.snapshot = { generators: [generator('fw_scig')] };
      render(<KreatorEdycjiParametrow />);
      expect(await screen.findByTestId(`${M}-pole_pairs`)).not.toHaveFocus();
    });

    it.each([
      ['błąd serwera', () => new Response('błąd', { status: 500 })],
      ['odpowiedź innego kształtu', () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })],
    ])('rejestr niedostępny (%s) → jawna informacja, bez pól maszyny', async (_, odpowiedz) => {
      odpowiedzRejestru = odpowiedz;
      snapshotState.snapshot = { generators: [generator('synchronous')] };
      render(<KreatorEdycjiParametrow />);
      expect(await screen.findByTestId(`${M}-niedostepna`)).toHaveTextContent('chwilowo niedostępny');
      expect(screen.queryByTestId(M)).toBeNull();
    });
  });

  // Karta TOLERANCJA-NN-WARTOSC-ROBOCZA (zasada nr 4, V12K-351): brak deklaracji tolerancji
  // sieci nN nie blokuje zwarć — bieg liczy na wartości roboczej, a akcja „Zmień wartość”
  // założenia `fault.c_tolerancja_nn_robocza` otwiera ten formularz W POLU deklaracji.
  // Iloczyn cech: {transformator, źródło na szynie nN} × {+6 %, +10 %}; kontekst formularza
  // to DOKŁADNIE ten, który buduje `useZmienTolerancjeNn` (`zmianaTolerancjiNn.ts`, kontrakt
  // przypięty w `zwarcia/__tests__/zmianaTolerancjiNn.test.tsx`), wybór wartości natywnym
  // `selectOptions`, zapis natywnym klikiem.
  describe.each([
    ['transformator', 'tr-nn-1', 'TransformerBranch'],
    ['źródło na szynie nN', 'src-nn-1', 'Source'],
  ] as const)('tolerancja napięcia sieci nN — %s', (_, ref, typ) => {
    it.each(['PLUS_6', 'PLUS_10'] as const)(
      '„Zmień wartość” otwiera pole lv_voltage_tolerance; wybór %s trafia do parameters',
      async (tolerancja) => {
        context = { element_ref: ref, element_type: typ, field: 'lv_voltage_tolerance' };
        executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: ref } });
        render(<KreatorEdycjiParametrow />);

        expect(screen.getByTestId('mvd-kreator-edycja-klucz-0')).toHaveValue('lv_voltage_tolerance');
        const pole = screen.getByTestId('mvd-kreator-edycja-wartosc-0');
        expect(pole.tagName).toBe('SELECT');
        expect(screen.getByRole('option', { name: ETYKIETA_PL_TOLERANCJI_NN[tolerancja] })).toBeTruthy();
        await userEvent.selectOptions(pole, tolerancja);
        await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

        await waitFor(() => {
          expect(executeDomainOperationMock).toHaveBeenCalledWith('case-1', 'update_element_parameters', {
            element_ref: ref,
            parameters: { lv_voltage_tolerance: tolerancja },
          });
        });
      },
    );
  });

  it('`required` będący opisem wymogu (nie kluczem słownika) nie staje się kluczem parametru', () => {
    context = { element_ref: 'tr-1', required: 'continuous_path_to_source' };
    render(<KreatorEdycjiParametrow />);
    expect(screen.getByTestId('mvd-kreator-edycja-klucz-0')).toHaveValue('');
  });

  it('akcja naprawcza układu sieci nN (ten sam wzorzec) też prowadzi do pola', () => {
    context = { element_ref: 'tr-1', required: 'lv_earthing_system' };
    render(<KreatorEdycjiParametrow />);
    expect(screen.getByTestId('mvd-kreator-edycja-klucz-0')).toHaveValue('lv_earthing_system');
    expect(screen.getByTestId('mvd-kreator-edycja-wartosc-0').tagName).toBe('SELECT');
  });
});
