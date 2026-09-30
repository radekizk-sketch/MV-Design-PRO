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
 * Modele pochodzą z REALNEGO backendu (fikstury `b2Droga-*` i `s95GpzSwiezy` z
 * `sld/v3/canvas/__tests__/fixtures`); stany pól są na nich wyprowadzane jawnie
 * (dodanie odcinka terenowego z zacisku pola = zajęcie pola; usunięcie specyfikacji pól
 * liniowych = stacja bez pól, jak stacja odgałęźna z jednym polem wejściowym).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
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
const FIXTURES = resolve(here, '..', '..', 'v3', 'canvas', '__tests__', 'fixtures');

function wczytaj(plik: string): EnergyNetworkModel {
  const surowe = JSON.parse(readFileSync(resolve(FIXTURES, plik), 'utf8')) as
    | EnergyNetworkModel
    | { enm: EnergyNetworkModel };
  return ('enm' in surowe ? surowe.enm : surowe) as EnergyNetworkModel;
}

function kopia<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------
// Modele: realny backend + jawnie wyprowadzone stany pól liniowych
// ---------------------------------------------------------------------------

type StanPol = 'wolne_jedno' | 'wolne_kilka' | 'zajete_wszystkie' | 'brak_pol';
const STANY: readonly StanPol[] = ['wolne_jedno', 'wolne_kilka', 'zajete_wszystkie', 'brak_pol'];

/** Stacja wstawiona na odcinku przez `insert_station_on_segment_sn` (realny backend):
 *  pola IN 000, OUT 001, FEEDER 002 — dwa pola, z których może wyjść ciąg. */
const STACJA_BAZA = wczytaj('b2Droga-insert_station_on_segment_sn.enm.json');
const STACJA_REF = (STACJA_BAZA.substations ?? []).find(
  (s) => String(s.station_type).toLowerCase() !== 'gpz',
)!.ref_id;

type Spec = { field_ref: string; bay_role?: string; meta?: { terminal_bus_ref?: string } };
function specyStacji(enm: EnergyNetworkModel): Spec[] {
  const stacja = (enm.substations ?? []).find((s) => s.ref_id === STACJA_REF)!;
  return (stacja.meta as { field_specs: Spec[] }).field_specs;
}

/** Zajęcie pola = odcinek terenowy wyprowadzony z zacisku pola (dokładnie to, co zostawia
 *  `continue_trunk_segment_sn` z tego pola). */
function zajmijPole(enm: EnergyNetworkModel, spec: Spec, n: number): void {
  const zacisk = spec.meta!.terminal_bus_ref!;
  (enm.branches as unknown as Array<Record<string, unknown>>).push({
    id: `seg/test-zajete-${n}/segment`,
    ref_id: `seg/test-zajete-${n}/segment`,
    name: `Odcinek zajmujący ${n}`,
    type: 'cable',
    from_bus_ref: zacisk,
    to_bus_ref: `bus/test-zajete-${n}/downstream`,
    tags: [],
    meta: {},
  });
}

function stacjaWStanie(stan: StanPol): EnergyNetworkModel {
  const enm = kopia(STACJA_BAZA);
  const specy = specyStacji(enm);
  const liniowe = specy.filter((s) => ['OUT', 'FEEDER'].includes(String(s.bay_role).toUpperCase()));
  expect(liniowe.length, 'stacja z backendu ma dwa pola liniowe (OUT i FEEDER)').toBe(2);
  if (stan === 'wolne_jedno') zajmijPole(enm, liniowe.find((s) => s.bay_role === 'FEEDER')!, 1);
  if (stan === 'zajete_wszystkie') liniowe.forEach((s, i) => zajmijPole(enm, s, i + 1));
  if (stan === 'brak_pol') {
    const stacja = (enm.substations ?? []).find((s) => s.ref_id === STACJA_REF)!;
    (stacja.meta as { field_specs: Spec[] }).field_specs = specy.filter(
      (s) => String(s.bay_role).toUpperCase() === 'IN',
    );
  }
  return enm;
}

/** GPZ po samym `add_grid_source_sn` (realny backend): jedno pole liniowe GPZ. */
const GPZ_BAZA = wczytaj('s95GpzSwiezy.enm.json');
const GPZ_ZRODLO = (GPZ_BAZA.sources ?? [])[0]!.ref_id;
const GPZ_STACJA = (GPZ_BAZA.substations ?? [])[0]!.ref_id;
const GPZ_SZYNA = (GPZ_BAZA.buses ?? []).find((b) => b.voltage_kv > 1 && b.voltage_kv < 110)!.ref_id;

function gpzWStanie(stan: StanPol): EnergyNetworkModel {
  const enm = kopia(GPZ_BAZA);
  const stacja = (enm.substations ?? [])[0]!;
  const specy = (stacja.meta as { field_specs: Array<Record<string, unknown>> }).field_specs;
  expect(specy.length, 'świeży GPZ z backendu ma jedno pole liniowe').toBe(1);
  if (stan === 'wolne_kilka') {
    specy.push({
      ...kopia(specy[0]),
      field_ref: `${String(specy[0].field_ref).replace(/\/001$/, '')}/002`,
      meta: { gpz_line_field_index: 1 },
    });
  }
  if (stan === 'wolne_jedno' || stan === 'wolne_kilka') return enm;
  if (stan === 'brak_pol') {
    (stacja.meta as { field_specs: unknown[] }).field_specs = [];
    return enm;
  }
  specy.forEach((spec, i) => {
    (enm.branches as unknown as Array<Record<string, unknown>>).push({
      id: `seg/test-gpz-${i}/segment`,
      ref_id: `seg/test-gpz-${i}/segment`,
      type: 'cable',
      from_bus_ref: GPZ_SZYNA,
      to_bus_ref: `bus/test-gpz-${i}/downstream`,
      meta: { origin_bay_ref: spec.field_ref },
    });
  });
  return enm;
}

interface Przypadek {
  readonly nazwa: string;
  readonly kind: SldElementKindForMenu;
  readonly actionId: string;
  readonly elementId: string;
  readonly enm: EnergyNetworkModel;
  readonly oczekiwanaDostepnosc: boolean;
}

const OCZEKIWANA: Record<StanPol, boolean> = {
  wolne_jedno: true,
  wolne_kilka: true,
  zajete_wszystkie: false,
  brak_pol: false,
};

const ODCINEK_KONCOWY = 'seg/f302cb3a0057c6512af6cb0993f7085a/segment';
const POLE_GPZ = 'gpz/860003b4514aa388b39561d5005ce584/bay/001/001';

const PRZYPADKI: readonly Przypadek[] = [
  ...STANY.flatMap((stan): Przypadek[] => [
    {
      nazwa: `stacja SN/nN × ${stan}`,
      kind: 'station',
      actionId: 'continue-trunk',
      elementId: STACJA_REF,
      enm: stacjaWStanie(stan),
      oczekiwanaDostepnosc: OCZEKIWANA[stan],
    },
    {
      nazwa: `symbol GPZ × ${stan}`,
      kind: 'gpz',
      actionId: 'continue-trunk',
      elementId: GPZ_ZRODLO,
      enm: gpzWStanie(stan),
      oczekiwanaDostepnosc: OCZEKIWANA[stan],
    },
    {
      // Widok przeglądowy (LOD 0) rysuje całą rozdzielnię GPZ symbolem stacji —
      // menu ma wtedy kategorię `station`, a punkt startu to wolne pole liniowe GPZ.
      nazwa: `GPZ rysowany jako stacja × ${stan}`,
      kind: 'station',
      actionId: 'continue-trunk',
      elementId: GPZ_STACJA,
      enm: gpzWStanie(stan),
      oczekiwanaDostepnosc: OCZEKIWANA[stan],
    },
    {
      nazwa: `szyna sekcji GPZ × ${stan}`,
      kind: 'section',
      actionId: 'continue-trunk',
      elementId: GPZ_SZYNA,
      enm: gpzWStanie(stan),
      oczekiwanaDostepnosc: OCZEKIWANA[stan],
    },
  ]),
  // Koniec ciągu: punktem startu jest wolny koniec korytarza (stan pól stacji nie gra roli).
  {
    nazwa: 'odcinek kablowy (koniec ciągu)',
    kind: 'cable_segment_sn',
    actionId: 'continue-trunk-from-endpoint',
    elementId: ODCINEK_KONCOWY,
    enm: STACJA_BAZA,
    oczekiwanaDostepnosc: true,
  },
  // Pole SN: punktem startu jest samo pole (kreator bierze je jako `field_ref`).
  {
    nazwa: 'pole SN (zakończ ciąg w stacji)',
    kind: 'bay',
    actionId: 'append-station-on-endpoint',
    elementId: POLE_GPZ,
    enm: STACJA_BAZA,
    oczekiwanaDostepnosc: true,
  },
  {
    nazwa: 'aparat pola: głowica kablowa',
    kind: 'apparatus',
    actionId: 'extend-trunk',
    elementId: `${POLE_GPZ}#cable_head`,
    enm: STACJA_BAZA,
    oczekiwanaDostepnosc: true,
  },
  {
    nazwa: 'aparat pola: wyłącznik (nie głowica)',
    kind: 'apparatus',
    actionId: 'extend-trunk',
    elementId: `${POLE_GPZ}#breaker`,
    enm: STACJA_BAZA,
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
    expect(resolveTrunkStartAvailability(STACJA_BAZA, null, 'zksn', 'zk/test')).toEqual({});
  });

  it.each(PRZYPADKI)(
    '$nazwa: menu ⇔ kontekst operacji (jedno rozstrzygnięcie)',
    ({ kind, actionId, elementId, enm, oczekiwanaDostepnosc }) => {
      const dostepnosc = resolveTrunkStartAvailability(enm, null, kind, elementId);
      expect(dostepnosc?.[actionId]).toBe(oczekiwanaDostepnosc);

      const operacja = buildSldOperationContext(actionId, kind, elementId, enm, null);
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
    const kilka = buildSldOperationContext('continue-trunk', 'station', STACJA_REF, stacjaWStanie('wolne_kilka'), null);
    const jedno = buildSldOperationContext('continue-trunk', 'station', STACJA_REF, stacjaWStanie('wolne_jedno'), null);
    expect(kilka?.context.field_ref).toBe(`${STACJA_REF.replace(/\/station$/, '')}/sn_field/001`);
    expect(jedno?.context.field_ref).toBe(`${STACJA_REF.replace(/\/station$/, '')}/sn_field/001`);
    // Drugi bieg na tym samym wejściu = ten sam kontekst (determinizm).
    expect(buildSldOperationContext('continue-trunk', 'station', STACJA_REF, stacjaWStanie('wolne_kilka'), null))
      .toEqual(kilka);
  });

  it.each(PRZYPADKI)(
    '$nazwa: klik w pozycję → kreator gotowy do zapisu albo uczciwy powód bez kreatora',
    async (p) => {
      useSnapshotStore.setState({ snapshot: p.enm, logicalViews: null });
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
    const enm = stacjaWStanie(stan);
    useSnapshotStore.setState({ snapshot: enm, logicalViews: null });
    renderWithQueryClient(<StationConfiguratorSurface surface={powierzchnia} />);
    const przycisk = screen.getByTestId('station-continue-trunk') as HTMLButtonElement;
    const menu = resolveTrunkStartAvailability(enm, null, 'station', STACJA_REF);
    expect(przycisk.disabled).toBe(!OCZEKIWANA[stan]);
    expect(menu?.['continue-trunk']).toBe(!przycisk.disabled);
  });
});

describe('S95-START — natywny prawy klik w etykietę stacji na kanwie', () => {
  it.each(STANY)('stan pól %s: pozycja „Kontynuuj ciąg główny" aktywna ⇔ wolne pole liniowe', async (stan) => {
    useSnapshotStore.setState({ snapshot: stacjaWStanie(stan), logicalViews: null });
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
    enm: (stan: StanPol) => EnergyNetworkModel;
    ref: string;
    etykieta: string;
  }> = [
    { nazwa: 'stacja SN/nN', enm: stacjaWStanie, ref: STACJA_REF, etykieta: 'Kontynuuj ciąg SN ze stacji' },
    { nazwa: 'GPZ', enm: gpzWStanie, ref: GPZ_STACJA, etykieta: 'Wyprowadź magistralę SN' },
  ];

  it.each(KARTY.flatMap((karta) => STANY.map((stan) => ({ ...karta, stan }))))(
    '$nazwa × $stan: przycisk karty ⇔ pozycja menu kanwy ⇔ kreator',
    async ({ enm: model, ref, etykieta, stan }) => {
      const enm = model(stan);
      useSnapshotStore.setState({ snapshot: enm, logicalViews: null });
      useSelectionStore.getState().selectElement({ id: ref, type: 'Station', name: 'Stacja' });
      renderWithQueryClient(<InspectorEngineeringView />);
      const host = await screen.findByTestId('tech-card-host');
      const przycisk = within(host).getByRole('button', { name: etykieta }) as HTMLButtonElement;
      expect(przycisk.disabled).toBe(!OCZEKIWANA[stan]);
      expect(resolveTrunkStartAvailability(enm, null, 'station', ref)?.['continue-trunk']).toBe(!przycisk.disabled);
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
