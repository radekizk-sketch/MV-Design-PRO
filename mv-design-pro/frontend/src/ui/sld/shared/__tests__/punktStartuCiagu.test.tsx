/**
 * KARTA S95-START — PUNKT STARTU CIĄGU SN: pozycja menu ↔ kontekst operacji ↔ kreator.
 *
 * Defekt (spec e2e `s95-budowa-z-kanwy.spec.ts`, ogniwo 4, drzewa integracji partii 2
 * i 3): prawy klik w stację SN/nN bez wolnego pola liniowego wyjściowego pokazywał
 * „Kontynuuj ciąg główny" jako AKTYWNĄ pozycję, a kreator magistrali otwierał się z
 * „Brak miejsca startu ciągu" i trwale zablokowanym zapisem. Karta S9-5 sparowała
 * pozycję z kontekstem WYŁĄCZNIE dla GPZ i szyny sekcji; dla stacji bramki w menu nie
 * było wcale, a wykonawca zawsze budował operację.
 *
 * Wyrocznia (jedna dla całego iloczynu): pozycja dostępna ⇔ kontekst operacji ma punkt
 * startu ⇔ kreator magistrali osiąga `data-status="gotowy"` po wyborze typu i wpisaniu
 * długości. Brak startu ⇔ pozycja zablokowana z polskim powodem bez identyfikatorów ⇔
 * wykonawca NIE otwiera kreatora, tylko melduje ten sam powód.
 *
 * Iloczyn cech:
 *  - rodzaj elementu: GPZ (symbol źródła), GPZ rysowany symbolem stacji (widok
 *    przeglądowy), szyna sekcji GPZ, stacja SN/nN na odcinku,
 *    odcinek (koniec ciągu), pole SN, aparat pola (głowica / inny aparat), ZK SN i słup
 *    rozgałęźny (bez pozycji kontynuacji — nie ma czego bramkować);
 *  - stan pól liniowych: wolne jedno / wolne kilka / zajęte wszystkie / brak pól;
 *  - droga wejścia: menu kanwy (natywny prawy klik i rejestr menu), szuflada (ta sama
 *    funkcja dostępności co menu, `SldCanvasV3Workspace.detailDrawerActions`),
 *    wykonawca akcji (klik w pozycję), konfigurator stacji (przycisk „Kontynuuj ciąg SN
 *    ze stacji"), karta techniczna inspektora (przyciski „Kontynuuj ciąg SN ze stacji" /
 *    „Wyprowadź magistralę SN"). Panel kontekstowy schematu podaje zacisk startowy jawnie
 *    (`SchematContextPanel`: pole GPZ albo otwarty zacisk z widoków logicznych), więc nie
 *    ma w nim stanu „pozycja bez startu".
 *
 * Karta POLE-ZAJĘTE: modele i ich widoki logiczne pochodzą z generatora backendu
 * (`backend/scripts/eksport_fixtur_harnessu.py`, fikstury `punkt_startu_*` zbudowane
 * operacjami domenowymi przez `tests/reference_networks/sceny_zajetosci_pol.py`). Zajętość
 * pól front czyta z `logical_views.line_fields` — test nie wyprowadza jej sam.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel, LogicalViewsV1 } from '../../../../types/enm';
import { useAppStateStore } from '../../../app-state';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { useNotificationStore } from '../../../notifications/store';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { InspectorEngineeringView } from '../../../network-build/InspectorEngineeringView';
import { StationConfiguratorSurface } from '../../../workspace/surfaces/StationConfiguratorSurface';
import type { WorkspaceSurfaceDescriptor } from '../../../workspace/types';
import { at } from '../../../../test/arrayAt';
import { renderWithQueryClient } from '../../../../test/queryClientTestUtils';
import { KreatorMagistralaSn } from '../../../../ui2/kreatory/magistrala/KreatorMagistralaSn';
import { maStartOperacjiCiagu } from '../../../../ui2/kreatory/magistrala/magistralaModel';
import {
  SLD_MENU_REGISTRY,
  getMenuActions,
  powodBrakuStartuCiagu,
  type SldElementKindForMenu,
} from '../../v2/command/SldCommandService';
import { HIT_ATTR } from '../../v3/canvas/hitAreas';
import { SldCanvasV3Workspace } from '../../v3/canvas/SldCanvasV3Workspace';
import {
  buildSldOperationContext,
  isTrunkContinuationAction,
  resolveTrunkStartAvailability,
  useSldActionExecutor,
} from '../sldActionExecutor';

const { fetchCableTypesMock, fetchLineTypesMock } = vi.hoisted(() => ({
  fetchCableTypesMock: vi.fn(() =>
    Promise.resolve([
      {
        id: 'kab-120',
        name: 'XRUHAKXS 1x120',
        r_ohm_per_km: 0.253,
        x_ohm_per_km: 0.118,
        rated_current_a: 255,
        voltage_rating_kv: 15,
        cross_section_mm2: 120,
      },
    ]),
  ),
  fetchLineTypesMock: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../../catalog/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../catalog/api')>()),
  fetchCableTypes: () => fetchCableTypesMock(),
  fetchLineTypes: () => fetchLineTypesMock(),
}));

// Ocena doboru przekroju to osobny kontrakt backendu (karta MAGISTRALA-OCENA) — tu
// bez znaczenia dla punktu startu; odpowiedź pusta, żeby kreator nie wołał sieci.
vi.mock('../../../../ui2/kreatory/magistrala/ocenaDoboruApi', () => ({
  fetchOcenaDoboruMagistrali: () => new Promise(() => undefined),
}));

const here = dirname(fileURLToPath(import.meta.url));
const GENERATED = resolve(here, '..', '..', '..', '..', 'harness-fixtures', 'generated');

// ---------------------------------------------------------------------------
// Sceny z generatora backendu (karta POLE-ZAJĘTE): migawka + widoki logiczne
// ---------------------------------------------------------------------------

/**
 * Każda scena powstała operacjami domenowymi (`tests/reference_networks/
 * sceny_zajetosci_pol.py`, ten sam budowniczy co testy backendu) i niesie `logical_views`
 * z `line_fields` — zajętość pól liczy WYŁĄCZNIE backend (`enm/zajetosc_pol.py`), front ją
 * czyta. Stany pól: wolne kilka, wolne jedno (pozostałe zajęte operacją), zajęte wszystkie,
 * brak pól liniowych.
 */
interface Scena {
  readonly pola_liniowe_elementu: string[];
  readonly snapshot: EnergyNetworkModel;
  readonly logical_views: LogicalViewsV1;
}

type StanPol = 'wolne_jedno' | 'wolne_kilka' | 'zajete_wszystkie' | 'brak_pol';
const STANY: readonly StanPol[] = ['wolne_jedno', 'wolne_kilka', 'zajete_wszystkie', 'brak_pol'];

function scena(rodzaj: 'stacja_na_odcinku' | 'gpz_z_zaciskami', stan: StanPol): Scena {
  return JSON.parse(
    readFileSync(resolve(GENERATED, `punkt_startu_${rodzaj}_${stan}.json`), 'utf8'),
  ) as Scena;
}

function stacjaSnNn(snapshot: EnergyNetworkModel) {
  return (snapshot.substations ?? []).find((st) => String(st.station_type).toLowerCase() !== 'gpz')!;
}
function gpz(snapshot: EnergyNetworkModel) {
  return (snapshot.substations ?? []).find((st) => String(st.station_type).toLowerCase() === 'gpz')!;
}

interface Przypadek {
  readonly nazwa: string;
  readonly kind: SldElementKindForMenu;
  readonly actionId: string;
  readonly elementId: string;
  readonly enm: EnergyNetworkModel;
  readonly widoki: LogicalViewsV1 | null;
  readonly oczekiwanaDostepnosc: boolean;
}

const OCZEKIWANA: Record<StanPol, boolean> = {
  wolne_jedno: true,
  wolne_kilka: true,
  zajete_wszystkie: false,
  brak_pol: false,
};

const BAZA = scena('stacja_na_odcinku', 'wolne_kilka');
const STACJA_REF = stacjaSnNn(BAZA.snapshot).ref_id;
const POLE_GPZ = (BAZA.logical_views.line_fields ?? []).find((w) => w.station_ref.startsWith('gpz/'))!.field_ref;
const ODCINEK_KONCOWY = (() => {
  const korytarz = (BAZA.snapshot.corridors ?? []).find((c) => (c.ordered_segment_refs ?? []).length > 0)!;
  return korytarz.ordered_segment_refs[korytarz.ordered_segment_refs.length - 1];
})();

const PRZYPADKI: readonly Przypadek[] = [
  ...STANY.flatMap((stan): Przypadek[] => {
    const stacja = scena('stacja_na_odcinku', stan);
    const siecGpz = scena('gpz_z_zaciskami', stan);
    const szynaSekcji = (siecGpz.snapshot.buses ?? []).find(
      (bus) => bus.voltage_kv > 1 && bus.voltage_kv < 110 && bus.ref_id.includes('/section/'),
    )!.ref_id;
    return [
      {
        nazwa: `stacja SN/nN × ${stan}`,
        kind: 'station',
        actionId: 'continue-trunk',
        elementId: stacjaSnNn(stacja.snapshot).ref_id,
        enm: stacja.snapshot,
        widoki: stacja.logical_views,
        oczekiwanaDostepnosc: OCZEKIWANA[stan],
      },
      {
        nazwa: `symbol GPZ × ${stan}`,
        kind: 'gpz',
        actionId: 'continue-trunk',
        elementId: (siecGpz.snapshot.sources ?? [])[0]!.ref_id,
        enm: siecGpz.snapshot,
        widoki: siecGpz.logical_views,
        oczekiwanaDostepnosc: OCZEKIWANA[stan],
      },
      {
        // Widok przeglądowy (LOD 0) rysuje całą rozdzielnię GPZ symbolem stacji —
        // menu ma wtedy kategorię `station`, a punkt startu to wolne pole liniowe GPZ.
        nazwa: `GPZ rysowany jako stacja × ${stan}`,
        kind: 'station',
        actionId: 'continue-trunk',
        elementId: gpz(siecGpz.snapshot).ref_id,
        enm: siecGpz.snapshot,
        widoki: siecGpz.logical_views,
        oczekiwanaDostepnosc: OCZEKIWANA[stan],
      },
      {
        nazwa: `szyna sekcji GPZ × ${stan}`,
        kind: 'section',
        actionId: 'continue-trunk',
        elementId: szynaSekcji,
        enm: siecGpz.snapshot,
        widoki: siecGpz.logical_views,
        oczekiwanaDostepnosc: OCZEKIWANA[stan],
      },
    ];
  }),
  // Model odczytu nieobecny (odpowiedź bez `line_fields`): zajętość NIEZNANA, nigdy „wolne".
  {
    nazwa: 'stacja SN/nN × brak modelu odczytu',
    kind: 'station',
    actionId: 'continue-trunk',
    elementId: STACJA_REF,
    enm: BAZA.snapshot,
    widoki: null,
    oczekiwanaDostepnosc: false,
  },
  // Koniec ciągu: punktem startu jest wolny koniec korytarza (stan pól stacji nie gra roli).
  {
    nazwa: 'odcinek kablowy (koniec ciągu)',
    kind: 'cable_segment_sn',
    actionId: 'continue-trunk-from-endpoint',
    elementId: ODCINEK_KONCOWY,
    enm: BAZA.snapshot,
    widoki: BAZA.logical_views,
    oczekiwanaDostepnosc: true,
  },
  // Pole SN: punktem startu jest samo pole (kreator bierze je jako `field_ref`).
  {
    nazwa: 'pole SN (zakończ ciąg w stacji)',
    kind: 'bay',
    actionId: 'append-station-on-endpoint',
    elementId: POLE_GPZ,
    enm: BAZA.snapshot,
    widoki: BAZA.logical_views,
    oczekiwanaDostepnosc: true,
  },
  {
    nazwa: 'aparat pola: głowica kablowa',
    kind: 'apparatus',
    actionId: 'extend-trunk',
    elementId: `${POLE_GPZ}#cable_head`,
    enm: BAZA.snapshot,
    widoki: BAZA.logical_views,
    oczekiwanaDostepnosc: true,
  },
  {
    nazwa: 'aparat pola: wyłącznik (nie głowica)',
    kind: 'apparatus',
    actionId: 'extend-trunk',
    elementId: `${POLE_GPZ}#breaker`,
    enm: BAZA.snapshot,
    widoki: BAZA.logical_views,
    oczekiwanaDostepnosc: false,
  },
];

// ---------------------------------------------------------------------------
// Uprząż: wykonawca akcji wołany natywnym klikiem (kontrakt menu i szuflady)
// ---------------------------------------------------------------------------

function Wykonawca({ p }: { p: Przypadek }) {
  const handleAction = useSldActionExecutor({ readOnly: false });
  return (
    <button type="button" onClick={() => handleAction(p.actionId, p.kind, p.elementId)}>
      wykonaj pozycję menu
    </button>
  );
}

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useNetworkBuildStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useNotificationStore.getState().clearAll();
  useAppStateStore.setState({ activeCaseId: 'case-1' });
});

afterEach(() => {
  cleanup();
});

describe('S95-START — jedno rozstrzygnięcie punktu startu ciągu (iloczyn rodzaj × stan pól × droga)', () => {
  it('rejestr menu: pozycje kontynuacji ciągu to dokładnie te, które mają operację continue_trunk_segment_sn', () => {
    const kontynuacje = Object.fromEntries(
      (Object.keys(SLD_MENU_REGISTRY) as SldElementKindForMenu[]).map((kind) => [
        kind,
        SLD_MENU_REGISTRY[kind].filter((a) => isTrunkContinuationAction(a.id)).map((a) => a.id),
      ]),
    );
    // Inwentarz rodzajów: ZK SN i słup rozgałęźny NIE mają pozycji kontynuacji ciągu
    // (ciąg z nich prowadzi karta obiektu z jawnym zaciskiem MAIN_OUT), DER i tło też.
    expect(kontynuacje).toEqual({
      background: [],
      gpz: ['continue-trunk'],
      section: ['continue-trunk'],
      bay: ['append-station-on-endpoint'],
      apparatus: ['extend-trunk'],
      cable_segment_sn: ['continue-trunk-from-endpoint'],
      overhead_line_sn: ['continue-trunk-from-endpoint'],
      station: ['continue-trunk'],
      zksn: [],
      branch_pole: [],
      der_pv: [],
      der_bess: [],
      der_fw: [],
      der: [],
    });
    expect(resolveTrunkStartAvailability(BAZA.snapshot, BAZA.logical_views, 'zksn', 'zk/test')).toEqual({});
  });

  it.each(PRZYPADKI)(
    '$nazwa: menu ⇔ kontekst operacji (jedno rozstrzygnięcie)',
    ({ kind, actionId, elementId, enm, widoki, oczekiwanaDostepnosc }) => {
      const dostepnosc = resolveTrunkStartAvailability(enm, widoki, kind, elementId);
      expect(dostepnosc?.[actionId]).toBe(oczekiwanaDostepnosc);

      const operacja = buildSldOperationContext(actionId, kind, elementId, enm, widoki);
      expect(operacja !== null).toBe(oczekiwanaDostepnosc);
      if (operacja) {
        expect(operacja.op).toBe('continue_trunk_segment_sn');
        expect(maStartOperacjiCiagu(operacja.context)).toBe(true);
      }

      const pozycja = getMenuActions(kind, {
        trunkStartAvailable: dostepnosc,
        apparatusKind: elementId.includes('#') ? elementId.slice(elementId.lastIndexOf('#') + 1) : undefined,
      }).find((a) => a.id === actionId)!;
      expect(pozycja, `pozycja ${actionId} w menu ${kind}`).toBeTruthy();
      expect(pozycja.disabled ?? false).toBe(!oczekiwanaDostepnosc);
      if (!oczekiwanaDostepnosc) {
        expect(pozycja.disabledReasonPl, 'uczciwy powód').toBeTruthy();
        // Powód po polsku, bez identyfikatorów modelu i kodów akcji.
        expect(pozycja.disabledReasonPl).not.toMatch(/[a-z]+\/|continue|trunk|_/i);
      }
    },
  );

  it('stacja: pole wybrane deterministycznie — wolne kilka ⇒ pierwsze wolne w porządku pól, wolne jedno ⇒ to jedno', () => {
    const sKilka = scena('stacja_na_odcinku', 'wolne_kilka');
    const sJedno = scena('stacja_na_odcinku', 'wolne_jedno');
    const kilka = buildSldOperationContext('continue-trunk', 'station', STACJA_REF, sKilka.snapshot, sKilka.logical_views);
    const jedno = buildSldOperationContext('continue-trunk', 'station', STACJA_REF, sJedno.snapshot, sJedno.logical_views);
    // Wolne kilka: pierwsze wolne pole w porządku pól; wolne jedno: to jedno, które zostało.
    // Zajętość czytana z modelu odczytu backendu (`line_fields`), nie z listy pól: od karty
    // POLA-W-TORZE pole wyjściowe stacji wstawionej w odcinek niesie dalszą połówkę odcinka
    // (zajęte od chwili powstania stacji), więc „pierwsze pole" to nie „pierwsze wolne".
    const wolne = (s: Scena): string[] =>
      s.pola_liniowe_elementu
        .filter(
          (ref) => !(s.logical_views.line_fields ?? []).find((w) => w.field_ref === ref)?.occupied,
        )
        .sort((a, b) => a.localeCompare(b));
    expect(wolne(sKilka).length).toBeGreaterThan(1);
    expect(kilka?.context.field_ref).toBe(wolne(sKilka)[0]);
    expect(wolne(sJedno)).toHaveLength(1);
    expect(jedno?.context.field_ref).toBe(wolne(sJedno)[0]);
    // Drugi bieg na tym samym wejściu = ten sam kontekst (determinizm).
    expect(buildSldOperationContext('continue-trunk', 'station', STACJA_REF, sKilka.snapshot, sKilka.logical_views))
      .toEqual(kilka);
  });

  it.each(PRZYPADKI)(
    '$nazwa: klik w pozycję → kreator gotowy do zapisu albo uczciwy powód bez kreatora',
    async (p) => {
      useSnapshotStore.setState({ snapshot: p.enm, logicalViews: p.widoki });
      const user = userEvent.setup();
      render(<Wykonawca p={p} />);
      await user.click(screen.getByRole('button', { name: 'wykonaj pozycję menu' }));

      const aktywny = useNetworkBuildStore.getState().activeSurface;
      const operacja = aktywny?.routeState.payload?.operation;
      if (!p.oczekiwanaDostepnosc) {
        expect(operacja, 'kreator NIE jest otwierany bez punktu startu').toBeUndefined();
        const ostatni = at(useNotificationStore.getState().notifications, -1);
        expect(ostatni?.message).toBe(powodBrakuStartuCiagu(p.kind));
        expect(ostatni?.type).toBe('warning');
        return;
      }
      expect(operacja).toBe('continue_trunk_segment_sn');

      cleanup();
      render(<KreatorMagistralaSn />);
      await waitFor(() => {
        expect(
          within(screen.getByTestId('mvd-kreator-magistrala-katalog')).getAllByRole('option').length,
        ).toBeGreaterThan(1);
      });
      await user.selectOptions(screen.getByTestId('mvd-kreator-magistrala-katalog'), 'kab-120');
      await user.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
      const dlugosc = screen.getByTestId('mvd-kreator-magistrala-dlugosc');
      await user.clear(dlugosc);
      await user.type(dlugosc, '300');
      expect(screen.getByTestId('mvd-kreator-magistrala')).toHaveAttribute('data-status', 'gotowy');
      expect(screen.getByTestId('mvd-kreator-magistrala-zapisz')).toBeEnabled();
    },
    30000,
  );
});

describe('S95-START — konfigurator stacji czyta TEN SAM predykat startu', () => {
  const powierzchnia: WorkspaceSurfaceDescriptor = {
    surfaceId: 'surface-test',
    screenCode: 'E-13',
    surfaceKind: 'pomocniczy',
    titlePl: 'Stacja',
    entityRef: STACJA_REF,
    entityType: null,
    parentSurfaceId: null,
    tabId: null,
    routeState: { route: 'unknown', payload: {} },
    breadcrumbs: [],
    supportsMiniSld: false,
    sizeClass: 'C',
    stackLevel: 0,
    openMode: 'expand_workspace',
    subjectKind: 'helper_context',
    subjectRef: null,
  };

  it.each(STANY)('stan pól %s: przycisk konfiguratora ⇔ pozycja menu kanwy', (stan) => {
    const { snapshot: enm, logical_views: widoki } = scena('stacja_na_odcinku', stan);
    useSnapshotStore.setState({ snapshot: enm, logicalViews: widoki });
    renderWithQueryClient(<StationConfiguratorSurface surface={powierzchnia} />);
    const przycisk = screen.getByTestId('station-continue-trunk') as HTMLButtonElement;
    const menu = resolveTrunkStartAvailability(enm, widoki, 'station', STACJA_REF);
    expect(przycisk.disabled).toBe(!OCZEKIWANA[stan]);
    expect(menu?.['continue-trunk']).toBe(!przycisk.disabled);
  });
});

describe('S95-START — natywny prawy klik w etykietę stacji na kanwie', () => {
  it.each(STANY)('stan pól %s: pozycja „Kontynuuj ciąg główny" aktywna ⇔ wolne pole liniowe', async (stan) => {
    const { snapshot, logical_views: widoki } = scena('stacja_na_odcinku', stan);
    useSnapshotStore.setState({ snapshot, logicalViews: widoki });
    const { container } = render(<SldCanvasV3Workspace width={1322} height={696} lodOverride={2} />);
    const etykieta = container.querySelector(
      `[${HIT_ATTR.role}="obrys"][${HIT_ATTR.ownerRef}^="${CSS.escape(STACJA_REF)}#name-row"]`,
    );
    expect(etykieta, 'etykieta nazwy stacji ma uchwyt trafienia').toBeTruthy();
    await userEvent.pointer({ keys: '[MouseRight]', target: etykieta! });
    const menu = screen.getByRole('menu');
    const pozycja = within(menu).getByTestId('sld-menu-continue-trunk') as HTMLButtonElement;
    expect(pozycja.disabled).toBe(!OCZEKIWANA[stan]);
    if (!OCZEKIWANA[stan]) {
      // Powód blokady menu pokazuje jako podpowiedź pozycji (`ContextMenu`: `title`).
      expect(pozycja.getAttribute('title')).toBe(powodBrakuStartuCiagu('station'));
    }
  });
});

describe('S95-START — karta techniczna inspektora czyta TO SAMO rozstrzygnięcie startu', () => {
  const KARTY: ReadonlyArray<{
    nazwa: string;
    rodzaj: 'stacja_na_odcinku' | 'gpz_z_zaciskami';
    ref: string;
    etykieta: string;
  }> = [
    { nazwa: 'stacja SN/nN', rodzaj: 'stacja_na_odcinku', ref: STACJA_REF, etykieta: 'Kontynuuj ciąg SN ze stacji' },
    {
      nazwa: 'GPZ',
      rodzaj: 'gpz_z_zaciskami',
      ref: gpz(scena('gpz_z_zaciskami', 'wolne_kilka').snapshot).ref_id,
      etykieta: 'Wyprowadź magistralę SN',
    },
  ];

  it.each(KARTY.flatMap((karta) => STANY.map((stan) => ({ ...karta, stan }))))(
    '$nazwa × $stan: przycisk karty ⇔ pozycja menu kanwy ⇔ kreator',
    async ({ rodzaj, ref, etykieta, stan }) => {
      const { snapshot: enm, logical_views: widoki } = scena(rodzaj, stan);
      useSnapshotStore.setState({ snapshot: enm, logicalViews: widoki });
      useSelectionStore.getState().selectElement({ id: ref, type: 'Station', name: 'Stacja' });
      renderWithQueryClient(<InspectorEngineeringView />);
      const host = await screen.findByTestId('tech-card-host');
      const przycisk = within(host).getByRole('button', { name: etykieta }) as HTMLButtonElement;
      expect(przycisk.disabled).toBe(!OCZEKIWANA[stan]);
      expect(resolveTrunkStartAvailability(enm, widoki, 'station', ref)?.['continue-trunk']).toBe(!przycisk.disabled);
      if (przycisk.disabled) {
        expect(przycisk.getAttribute('title')).toBe(powodBrakuStartuCiagu('station'));
        return;
      }
      await userEvent.click(przycisk);
      const kontekst = useNetworkBuildStore.getState().activeSurface?.routeState.payload?.context as
        | Record<string, unknown>
        | undefined;
      expect(maStartOperacjiCiagu(kontekst)).toBe(true);
    },
    30000,
  );
});
