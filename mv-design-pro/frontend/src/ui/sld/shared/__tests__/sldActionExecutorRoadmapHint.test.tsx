/**
 * Karta W2-B (klasa ACTION_ROADMAP_HINT_PL — mapa domknięcia aneks 3a.C, C8,
 * INSTANCJA: hint martwy `'set-switch-state'` obok działającej ścieżki):
 * `ACTION_ROADMAP_HINT_PL` USUNIĘTA W CAŁOŚCI z `sldActionExecutor.ts`.
 * Inwentarz pełny (24 klucze) w komentarzu przy `DELETE_ACTION_OBJECT_LABEL_PL`
 * w module testowanym. Ten plik pinuje KLASĘ, nie instancję:
 *
 *  - test klasy: symbol `ACTION_ROADMAP_HINT_PL` nie jest już eksportowany —
 *    gdyby ktoś kiedyś przywrócił tabelę hintów, ten test złapie to natychmiast,
 *    zanim jakikolwiek klucz zdąży w niej wylądować (KLASA NIE INSTANCJA §4:
 *    deklaracja "tabela nie wraca" bez testu byłaby fałszywą pewnością);
 *  - 19 kluczy miało realnego dostawcę WCZEŚNIEJ w kolejności gałęzi —
 *    zamiast duplikować pełne testy integracyjne, które już to sprawdzają
 *    (`SldCommandService.test.ts`, `network-build/__tests__/designerFlowContract.test.ts`,
 *    `sld/v3/canvas/__tests__/menuBudowyNaKanwie.test.tsx`,
 *    `sld/v3/canvas/__tests__/actionExecutor.test.tsx`), ten plik dowodzi
 *    (iloczyn cech: KAŻDY z 19 kluczy × jego mechanizm pokrycia) że mechanizm,
 *    który czyni hint nieosiągalnym, faktycznie zwraca pokrycie z eksportowanego
 *    API (`buildSldOperationContext`/`isSldDeleteAction`/`ACTION_TO_SCREEN`);
 *  - 5 kluczy było hintami-przekierowaniami — zamienione na nawigację
 *    (fix_navigation), testowane tu end-to-end przez `useSldActionExecutor`.
 *
 * Uzasadnienie harnessa (Zero-Debt pkt 5): kliknięcia są NATYWNE (userEvent) w
 * przycisk harnessa wołający `useSldActionExecutor` z ustalonym
 * (actionId, kind, elementId) — dokładnie kontrakt konsumowany przez realne
 * menu kontekstowe SLD (`SldContextMenuController.onAction`) i drawer; TEN SAM
 * wzorzec co `sldActionExecutorShowResults.test.tsx`/`sldActionExecutorNcRfg.test.tsx`.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { useAppStateStore } from '../../../app-state';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { SldElementKindForMenu } from '../../v2/command/SldCommandService';
import * as sldActionExecutorModule from '../sldActionExecutor';
import {
  ACTION_TO_SCREEN,
  buildSldOperationContext,
  isSldDeleteAction,
  resolveGpzSourceRefForSectionBus,
  useSldActionExecutor,
} from '../sldActionExecutor';

function Harness({
  actionId,
  kind,
  elementId,
}: {
  actionId: string;
  kind: SldElementKindForMenu;
  elementId: string | null;
}) {
  const handleAction = useSldActionExecutor({ readOnly: false });
  return (
    <button type="button" onClick={() => handleAction(actionId, kind, elementId)}>
      wykonaj akcję
    </button>
  );
}

/** GPZ z dwiema sekcjami SN — `Source.substation_ref` wskazuje na rozdzielnię
 *  (`Substation`), której `bus_refs` niesie obie szyny sekcyjne. Ten sam FK,
 *  którego czyta `resolveGpzSourceRefForSectionBus`. */
function snapshotZSekcjaGpz(): EnergyNetworkModel {
  return {
    header: { name: 'Sieć testowa', revision: 1, hash_sha256: 'deadbeef' },
    buses: [],
    branches: [],
    substations: [
      {
        id: 'gpz/GPZ-1/station',
        ref_id: 'gpz/GPZ-1/station',
        name: 'GPZ-1',
        station_type: 'gpz',
        bus_refs: ['bus/SEC-1', 'bus/SEC-2'],
        transformer_refs: [],
      },
    ],
    sources: [
      {
        id: 'gpz/GPZ-1',
        ref_id: 'gpz/GPZ-1',
        name: 'GPZ-1',
        bus_ref: 'bus/SEC-1',
        substation_ref: 'gpz/GPZ-1/station',
        model: 'external_grid',
      },
    ],
    loads: [],
    generators: [],
  } as unknown as EnergyNetworkModel;
}

beforeEach(() => {
  useAppStateStore.getState().reset();
  useSnapshotStore.getState().reset();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
});

afterEach(() => {
  cleanup();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
});

describe('sldActionExecutor — klasa ACTION_ROADMAP_HINT_PL usunięta (Karta W2-B)', () => {
  it('ACTION_ROADMAP_HINT_PL nie jest już eksportowana z modułu (pin klasy)', () => {
    expect('ACTION_ROADMAP_HINT_PL' in sldActionExecutorModule).toBe(false);
  });

  describe('show-sc-source (menu gpz) → E-10, karta "hv-side"', () => {
    it('nawiguje do E-10 z payload.defaultCard="hv-side" i refem Source (nie toastem)', async () => {
      const user = userEvent.setup();
      useSnapshotStore.setState({ snapshot: snapshotZSekcjaGpz() });
      render(<Harness actionId="show-sc-source" kind="gpz" elementId="gpz/GPZ-1" />);

      await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

      const surface = useNetworkBuildStore.getState().activeSurface;
      expect(surface?.screenCode).toBe('E-10');
      expect(surface?.entityRef).toBe('gpz/GPZ-1');
      expect(surface?.routeState.payload).toEqual({ defaultCard: 'hv-side' });
    });
  });

  describe('show-sc-data (menu section) → E-10, rozwiązanie refu Source przez Source.substation_ref', () => {
    it('szyna sekcji rozwiązuje się do Source rozdzielni-właścicielki (nie zostaje refem szyny)', async () => {
      const user = userEvent.setup();
      useSnapshotStore.setState({ snapshot: snapshotZSekcjaGpz() });
      render(<Harness actionId="show-sc-data" kind="section" elementId="bus/SEC-2" />);

      await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

      const surface = useNetworkBuildStore.getState().activeSurface;
      expect(surface?.screenCode).toBe('E-10');
      expect(surface?.entityRef).toBe('gpz/GPZ-1');
      expect(surface?.routeState.payload).toEqual({ defaultCard: 'hv-side' });
    });

    it('brak Source dla rozdzielni: uczciwa degradacja — ref sekcji zostaje nietknięty (zero fabrykacji)', async () => {
      const user = userEvent.setup();
      useSnapshotStore.setState({
        snapshot: { ...snapshotZSekcjaGpz(), sources: [] } as unknown as EnergyNetworkModel,
      });
      render(<Harness actionId="show-sc-data" kind="section" elementId="bus/SEC-2" />);

      await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

      const surface = useNetworkBuildStore.getState().activeSurface;
      expect(surface?.screenCode).toBe('E-10');
      expect(surface?.entityRef).toBe('bus/SEC-2');
    });
  });

  describe('resolveGpzSourceRefForSectionBus (jednostkowo)', () => {
    it('elementId już jest refem Source: zwraca go bez zmian (gałąź directSource)', () => {
      const snapshot = snapshotZSekcjaGpz();
      expect(resolveGpzSourceRefForSectionBus(snapshot, 'gpz/GPZ-1')).toBe('gpz/GPZ-1');
    });

    it('elementId to szyna sekcji: rozwiązuje przez Substation.bus_refs → Source.substation_ref', () => {
      const snapshot = snapshotZSekcjaGpz();
      expect(resolveGpzSourceRefForSectionBus(snapshot, 'bus/SEC-2')).toBe('gpz/GPZ-1');
      expect(resolveGpzSourceRefForSectionBus(snapshot, 'bus/SEC-1')).toBe('gpz/GPZ-1');
    });

    it('nierozwiązywalne (szyna spoza żadnej rozdzielni): null, zero fabrykacji', () => {
      const snapshot = snapshotZSekcjaGpz();
      expect(resolveGpzSourceRefForSectionBus(snapshot, 'bus/nieznana')).toBeNull();
    });

    it('snapshot null albo elementId pusty: null', () => {
      expect(resolveGpzSourceRefForSectionBus(null, 'bus/SEC-2')).toBeNull();
      expect(resolveGpzSourceRefForSectionBus(snapshotZSekcjaGpz(), '')).toBeNull();
    });
  });

  describe('change-family-to-overhead/cable (menu odcinka) → E-12, bez defaultCard', () => {
    // Karta domyślna E-12 ("Identyfikacja") już niesie pole "Rodzina"
    // (SnSegmentSurface.tsx) — nie trzeba osobnego deep-linku karty.
    it('change-family-to-overhead nawiguje do E-12 (odcinek kablowy)', async () => {
      const user = userEvent.setup();
      render(<Harness actionId="change-family-to-overhead" kind="cable_segment_sn" elementId="line/L-1" />);

      await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

      const surface = useNetworkBuildStore.getState().activeSurface;
      expect(surface?.screenCode).toBe('E-12');
      expect(surface?.entityRef).toBe('line/L-1');
      expect(surface?.routeState.payload).toBeUndefined();
    });

    it('change-family-to-cable nawiguje do E-12 (odcinek napowietrzny)', async () => {
      const user = userEvent.setup();
      render(<Harness actionId="change-family-to-cable" kind="overhead_line_sn" elementId="line/L-2" />);

      await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

      expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-12');
    });
  });

  describe('show-measurements (menu pola) → panel inspektora field_measurements (E-11)', () => {
    it('otwiera panel field_measurements z refem pola — ta sama zdolność co przycisk "Pomiary pola" w BayCard.tsx', async () => {
      const user = userEvent.setup();
      render(<Harness actionId="show-measurements" kind="bay" elementId="bay/B-3" />);

      await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

      const surface = useNetworkBuildStore.getState().activeSurface;
      expect(surface?.screenCode).toBe('E-11');
      expect(surface?.entityRef).toBe('bay/B-3');
      expect(surface?.titlePl).toBe('Pomiary pola');
    });

    it('brak elementId: nie otwiera panelu (spada do uczciwego fallbacku technicznego, nie toastu roadmapy)', async () => {
      const user = userEvent.setup();
      render(<Harness actionId="show-measurements" kind="bay" elementId={null} />);

      await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

      expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
    });
  });

  describe('19 kluczy z realnym dostawcą WCZEŚNIEJ w przepływie — mechanizm pokrycia (iloczyn cech)', () => {
    const OPERACJE_DOMENOWE: Array<{
      actionId: string;
      kind: SldElementKindForMenu;
      elementId: string;
      oczekiwanyOp: string;
    }> = [
      { actionId: 'add-bay', kind: 'section', elementId: 'bus/SEC-1', oczekiwanyOp: 'add_sn_bay' },
      { actionId: 'extend-trunk', kind: 'apparatus', elementId: 'bay/B-1#cable_head', oczekiwanyOp: 'continue_trunk_segment_sn' },
      { actionId: 'start-branch', kind: 'section', elementId: 'bus/SEC-1', oczekiwanyOp: 'start_branch_segment_sn' },
      { actionId: 'insert-station', kind: 'cable_segment_sn', elementId: 'line/L-1', oczekiwanyOp: 'insert_station_on_segment_sn' },
      { actionId: 'insert-zksn', kind: 'cable_segment_sn', elementId: 'line/L-1', oczekiwanyOp: 'insert_zksn_on_segment_sn' },
      { actionId: 'insert-sectional', kind: 'cable_segment_sn', elementId: 'line/L-1', oczekiwanyOp: 'insert_section_switch_sn' },
      { actionId: 'insert-pole', kind: 'overhead_line_sn', elementId: 'line/L-2', oczekiwanyOp: 'insert_branch_pole_on_segment_sn' },
      { actionId: 'add-load', kind: 'station', elementId: 'stn/ST-1/station', oczekiwanyOp: 'add_nn_load' },
      { actionId: 'set-switch-state', kind: 'bay', elementId: 'bay/B-1', oczekiwanyOp: 'set_normal_open_point' },
      // continue-trunk z kind='station': predykat trunkStartFieldAvailable/fieldRef
      // dotyczy WYŁĄCZNIE kind gpz/section (S9-5) — dla stacji ścieżka jest
      // generyczna i zawsze zwraca operację.
      { actionId: 'continue-trunk', kind: 'station', elementId: 'stn/ST-1/station', oczekiwanyOp: 'continue_trunk_segment_sn' },
    ];

    it.each(OPERACJE_DOMENOWE)(
      '$actionId: buildSldOperationContext zwraca operację domenową "$oczekiwanyOp" (hint nieosiągalny)',
      ({ actionId, kind, elementId, oczekiwanyOp }) => {
        const context = buildSldOperationContext(actionId, kind, elementId, null, null);
        expect(context).not.toBeNull();
        expect(context?.op).toBe(oczekiwanyOp);
      },
    );

    it('insert-gpz: buildSldOperationContext zwraca operację BEZ wymogu elementId (gałąź bezwarunkowa)', () => {
      const context = buildSldOperationContext('insert-gpz', 'background', null, null, null);
      expect(context?.op).toBe('add_grid_source_sn');
    });

    it.each(['delete-bay', 'delete-segment', 'delete-station', 'delete-pv', 'delete-bess', 'delete-fw'])(
      '%s: isSldDeleteAction=true (obsłużone PRZED gałęzią, w której mieszkał hint)',
      (actionId) => {
        expect(isSldDeleteAction(actionId)).toBe(true);
      },
    );

    it("add-section: ma wpis w ACTION_TO_SCREEN (nawigacja PRZED gałęzią, w której mieszkał hint)", () => {
      expect(ACTION_TO_SCREEN['add-section']).toBe('E-10');
    });

    it('add-source (kind=station): obsłużone przez dedykowaną gałąź 1b, nie dociera do miejsca po hintach', async () => {
      const user = userEvent.setup();
      render(<Harness actionId="add-source" kind="station" elementId="stn/ST-1/station" />);

      await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

      const surface = useNetworkBuildStore.getState().activeSurface;
      expect(surface?.screenCode).toBe('E-13');
      expect(surface?.routeState.payload).toEqual({ defaultCard: 'der-sources' });
    });
  });
});
