/**
 * Adapter inspektora (karta E1.4 — integracja): snapshot ENM → ObiektInspektora.
 *
 * Źródło (WYŁĄCZNIE odczyt): ui/topology/snapshotStore.ts — useSnapshotStore.snapshot
 * (EnergyNetworkModel). Adapter buduje projekcję obiektu dla inspektora powłoki:
 * sekcja „Podstawowe" + sekcja „Właściwości katalogowe" (pełne mapowanie WŁASNYCH
 * pól katalogowych/nastawczych każdego typu elementu ENM — KARTA-UI2 §1 p. 11) +
 * szczegóły techniczne (tryb Ekspercki).
 *
 * Zakładki „Wyniki"/„Dowody" (integracja adapter-wyników × adapter-inspektora):
 * czysta funkcja `mapowanieObiektuInspektora` pozostaje funkcją MODELU (wejście:
 * `snapshot`+`id`), a kontekst AKTYWNEGO PRZEBIEGU dokłada hook `useObiektInspektora`
 * z tych samych store'ów, które zasila warstwa integracyjna warsztatu wyników
 * (`ui2/spaces/wyniki/useWpiecieWynikow`): rozpływ z `ui/power-flow-results/store`,
 * zwarcia z `ui/results-inspector/store`. Element dostaje wiersz wyniku i pozycję
 * dowodu WYŁĄCZNIE wtedy, gdy WYSTĘPUJE w wyniku aktywnego przebiegu — czyli
 * dokładnie wtedy, gdy ma ślad WHITE BOX, do którego prowadzi „Pokaż dowód"
 * (`otworzDowodInspektora`). Brak elementu w wyniku = uczciwy stan pusty, nigdy
 * fabrykowany wiersz. Wszystkie liczby pochodzą WPROST z kontraktu wyniku
 * (formatowanie, zero fizyki w prezentacji).
 *
 * Zagnieżdżone stany RUNTIME pola SN (`Bay.runtime_state`/`primary_devices`/
 * SCADA telemetry — `types/enm.ts:605-919`, ~30 interfejsów) są ŚWIADOMIE POZA
 * sekcją katalogową: to telemetria pracy, nie parametr katalogowy/nastawczy, i ma
 * własną prezentację (SLD, panel stanu pola) — dublowanie jej tutaj byłoby drugim
 * źródłem prawdy dla tego samego stanu.
 */
import { useMemo } from 'react';

import type {
  Bay,
  BranchPointSN,
  Bus,
  Cable,
  ConnectionNode,
  Corridor,
  ENMElement,
  EnergyNetworkModel,
  FuseBranch,
  Generator,
  Junction,
  Load,
  LineRunV1,
  Measurement,
  OverheadLine,
  ProtectionAssignment,
  ShuntCapacitor,
  Source,
  Substation,
  SwitchBranch,
  Transformer,
} from '../../types/enm';
import { useAppStateStore } from '../../ui/app-state';
import { usePowerFlowResultsStore } from '../../ui/power-flow-results/store';
import { useResultsInspectorStore } from '../../ui/results-inspector/store';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { fieldRoleLabelPl } from '../../ui/sld/v2/station-rozdzielnia/contract';
import { emituj } from '../events';
import type { ObiektInspektora } from '../inspector';
import type {
  PozycjaDowodu,
  SekcjaWlasciwosci,
  WierszWlasciwosci,
} from '../inspector/inspectorModel';
import { przejdzDoPrzestrzeni } from '../shell/przejsciaPrzestrzeni';
import { useSwiezoscNaglowka } from '../freshness/useSwiezoscNaglowka';
import { useShellStore } from '../shell/useShellStore';

/** Kolekcje modelu przeszukiwane przez adapter + polskie etykiety typów. */
const KOLEKCJE: ReadonlyArray<{
  klucz: keyof EnergyNetworkModel;
  typ: string;
  typEtykieta: string;
}> = [
  { klucz: 'buses', typ: 'szyna', typEtykieta: 'Szyna' },
  { klucz: 'branches', typ: 'odcinek', typEtykieta: 'Odcinek' },
  { klucz: 'transformers', typ: 'transformator', typEtykieta: 'Transformator' },
  { klucz: 'sources', typ: 'zrodlo', typEtykieta: 'Źródło' },
  { klucz: 'loads', typ: 'odbior', typEtykieta: 'Odbiór' },
  { klucz: 'generators', typ: 'generator', typEtykieta: 'Generator' },
  { klucz: 'shunt_capacitors', typ: 'bateria_kondensatorow', typEtykieta: 'Bateria kondensatorów' },
  { klucz: 'substations', typ: 'stacja', typEtykieta: 'Stacja' },
  { klucz: 'bays', typ: 'pole', typEtykieta: 'Pole' },
  { klucz: 'junctions', typ: 'wezel', typEtykieta: 'Węzeł' },
  { klucz: 'branch_points', typ: 'punkt_rozgalezienia', typEtykieta: 'Punkt rozgałęzienia' },
  { klucz: 'corridors', typ: 'magistrala', typEtykieta: 'Magistrala' },
  { klucz: 'measurements', typ: 'pomiar', typEtykieta: 'Pomiar' },
  { klucz: 'protection_assignments', typ: 'zabezpieczenie', typEtykieta: 'Zabezpieczenie' },
  { klucz: 'line_runs', typ: 'ciag_liniowy', typEtykieta: 'Ciąg liniowy' },
  { klucz: 'connection_nodes', typ: 'wezel_przylaczenia', typEtykieta: 'Węzeł przyłączenia' },
];

/**
 * Inwentarz KLASY „typ elementu ENM" (reguła KLASA NIE INSTANCJA pkt 1) —
 * WSZYSTKIE kolekcje `EnergyNetworkModel` niosące elementy (pomijając
 * `header`/`katalog_projektu`, które nie są elementami). Test parytetu
 * (`__tests__/inspectorAdapter.test.ts`) porównuje ten zbiór z kluczami
 * `EnergyNetworkModel` w runtime (fixture ze WSZYSTKIMI polami) — nowa
 * kolekcja dodana do ENM bez wpisu tutaj jest czerwona.
 */
export const KOLEKCJE_ELEMENTOW: readonly (keyof EnergyNetworkModel)[] = KOLEKCJE.map(
  (k) => k.klucz,
);

/** Rodzaje gałęzi (`Branch.type`) — DRUGI poziom dyskryminacji „odcinka" (7 wartości, ZAMKNIĘTA lista). */
export const TYPY_GALEZI = [
  'line_overhead',
  'cable',
  'switch',
  'breaker',
  'bus_coupler',
  'disconnector',
  'fuse',
] as const;
export type TypGalezi = (typeof TYPY_GALEZI)[number];

const ETYKIETA_TYPU_GALEZI: Readonly<Record<TypGalezi, string>> = {
  line_overhead: 'Linia napowietrzna',
  cable: 'Kabel',
  switch: 'Łącznik',
  breaker: 'Wyłącznik',
  bus_coupler: 'Sprzęgło szyn',
  disconnector: 'Odłącznik',
  fuse: 'Bezpiecznik',
};

interface Znaleziony {
  element: ENMElement;
  typ: string;
  typEtykieta: string;
}

function znajdzElement(model: EnergyNetworkModel, id: string): Znaleziony | null {
  for (const kolekcja of KOLEKCJE) {
    const lista = model[kolekcja.klucz];
    if (!Array.isArray(lista)) continue;
    for (const kandydat of lista as unknown[]) {
      const el = kandydat as ENMElement;
      if (el && (el.id === id || el.ref_id === id)) {
        if (kolekcja.klucz === 'branches') {
          const galaz = el as unknown as { type?: string };
          const typGalezi = galaz.type as TypGalezi | undefined;
          const typEtykieta =
            typGalezi && typGalezi in ETYKIETA_TYPU_GALEZI
              ? ETYKIETA_TYPU_GALEZI[typGalezi]
              : kolekcja.typEtykieta;
          return { element: el, typ: typGalezi ?? kolekcja.typ, typEtykieta };
        }
        return { element: el, typ: kolekcja.typ, typEtykieta: kolekcja.typEtykieta };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Właściwości katalogowe per typ (WHITE BOX: tylko pola WŁASNE typu; brak
// wartości opcjonalnej = wiersz pominięty, zero fabrykowania „—" dla każdego
// możliwego pola; pola WYMAGANE renderowane zawsze).
// ---------------------------------------------------------------------------

function w(etykieta: string, wartosc: string | number | null | undefined, jednostka?: string): WierszWlasciwosci | null {
  if (wartosc === null || wartosc === undefined || wartosc === '') return null;
  return { etykieta, wartosc: { wartosc, jednostka } };
}

/** Wymagane pole (zawsze obecne w typie) — nigdy nie pomijane. */
function wr(etykieta: string, wartosc: string | number, jednostka?: string): WierszWlasciwosci {
  return { etykieta, wartosc: { wartosc, jednostka } };
}

const ETYKIETA_STANU_LACZNIKA: Readonly<Record<string, string>> = {
  closed: 'Zamknięty',
  open: 'Otwarty',
};

function bezNulli(wiersze: (WierszWlasciwosci | null)[]): WierszWlasciwosci[] {
  return wiersze.filter((wiersz): wiersz is WierszWlasciwosci => wiersz !== null);
}

function wlasciwosciSzyny(el: Bus): WierszWlasciwosci[] {
  return bezNulli([
    wr('Napięcie znamionowe', el.voltage_kv, 'kV'),
    w('Częstotliwość', el.frequency_hz ?? null, 'Hz'),
    w('Strefa', el.zone ?? null),
  ]);
}

/** Wiersze wspólne WSZYSTKICH podtypów gałęzi (`BranchBase`). */
function wlasciwosciGaleziWspolne(el: { from_bus_ref: string; to_bus_ref: string; status: string }): WierszWlasciwosci[] {
  return bezNulli([
    wr('Szyna początkowa', el.from_bus_ref),
    wr('Szyna końcowa', el.to_bus_ref),
    wr('Stan', ETYKIETA_STANU_LACZNIKA[el.status] ?? el.status),
  ]);
}

function wlasciwosciLiniiNapowietrznej(el: OverheadLine): WierszWlasciwosci[] {
  return [
    ...wlasciwosciGaleziWspolne(el),
    ...bezNulli([
      wr('Długość', el.length_km, 'km'),
      wr('Rezystancja R1', el.r_ohm_per_km, 'Ω/km'),
      wr('Reaktancja X1', el.x_ohm_per_km, 'Ω/km'),
      w('Rezystancja R0', el.r0_ohm_per_km ?? null, 'Ω/km'),
      w('Reaktancja X0', el.x0_ohm_per_km ?? null, 'Ω/km'),
      w('Materiał przewodu', el.conductor_material ?? null),
      w('Przekrój', el.cross_section_mm2 ?? null, 'mm²'),
      w('Prąd cieplny 1s (Ith)', el.ith_1s_a ?? null, 'A'),
    ]),
  ];
}

function wlasciwosciKabla(el: Cable): WierszWlasciwosci[] {
  return [
    ...wlasciwosciGaleziWspolne(el),
    ...bezNulli([
      wr('Długość', el.length_km, 'km'),
      wr('Rezystancja R1', el.r_ohm_per_km, 'Ω/km'),
      wr('Reaktancja X1', el.x_ohm_per_km, 'Ω/km'),
      w('Rezystancja R0', el.r0_ohm_per_km ?? null, 'Ω/km'),
      w('Reaktancja X0', el.x0_ohm_per_km ?? null, 'Ω/km'),
      w('Materiał przewodu', el.conductor_material ?? null),
      w('Przekrój', el.cross_section_mm2 ?? null, 'mm²'),
      w('Izolacja', el.insulation ?? null),
      w('Liczba żył', el.number_of_cores ?? null),
      w('Tory równoległe', el.n_parallel ?? null),
      w('Prąd cieplny 1s (Ith)', el.ith_1s_a ?? null, 'A'),
    ]),
  ];
}

function wlasciwosciLacznika(el: SwitchBranch): WierszWlasciwosci[] {
  return [
    ...wlasciwosciGaleziWspolne(el),
    ...bezNulli([
      w('Rezystancja', el.r_ohm ?? null, 'Ω'),
      w('Reaktancja', el.x_ohm ?? null, 'Ω'),
    ]),
  ];
}

function wlasciwosciBezpiecznika(el: FuseBranch): WierszWlasciwosci[] {
  return [
    ...wlasciwosciGaleziWspolne(el),
    ...bezNulli([
      w('Prąd znamionowy', el.rated_current_a ?? null, 'A'),
      w('Napięcie znamionowe', el.rated_voltage_kv ?? null, 'kV'),
    ]),
  ];
}

/** Rozdzielacz „odcinka" wg `type` (drugi poziom dyskryminacji — reguła KLASA pkt 1). */
function wlasciwosciGaleziWgTypu(el: ENMElement): WierszWlasciwosci[] {
  const typ = (el as unknown as { type?: string }).type;
  switch (typ) {
    case 'line_overhead':
      return wlasciwosciLiniiNapowietrznej(el as unknown as OverheadLine);
    case 'cable':
      return wlasciwosciKabla(el as unknown as Cable);
    case 'switch':
    case 'breaker':
    case 'bus_coupler':
    case 'disconnector':
      return wlasciwosciLacznika(el as unknown as SwitchBranch);
    case 'fuse':
      return wlasciwosciBezpiecznika(el as unknown as FuseBranch);
    default:
      return [];
  }
}

function wlasciwosciTransformatora(el: Transformer): WierszWlasciwosci[] {
  return bezNulli([
    wr('Moc znamionowa', el.sn_mva, 'MVA'),
    wr('Napięcie GN', el.uhv_kv, 'kV'),
    wr('Napięcie DN', el.ulv_kv, 'kV'),
    wr('Napięcie zwarcia uk', el.uk_percent, '%'),
    wr('Straty zwarcia Pk', el.pk_kw, 'kW'),
    w('Straty jałowe P0', el.p0_kw ?? null, 'kW'),
    w('Prąd jałowy I0', el.i0_percent ?? null, '%'),
    w('Grupa połączeń', el.vector_group ?? null),
    w('Jednostki równoległe', el.n_parallel ?? null),
  ]);
}

function wlasciwosciZrodla(el: Source): WierszWlasciwosci[] {
  return bezNulli([
    wr('Model źródła', el.model),
    w('Moc zwarciowa Sk″', el.sk3_mva ?? null, 'MVA'),
    w('Prąd zwarciowy Ik″', el.ik3_ka ?? null, 'kA'),
    w('Stosunek R/X', el.rx_ratio ?? null),
    w('Moc zwarciowa MIN', el.sk3_min_mva ?? null, 'MVA'),
    w('Prąd zwarciowy MIN', el.ik3_min_ka ?? null, 'kA'),
    w('Napięcie zadane', el.u_set_pu ?? null, 'p.u.'),
    w('Napięcie WN', el.voltage_hv_kv ?? null, 'kV'),
    w('Napięcie SN', el.sn_voltage_kv ?? null, 'kV'),
    w('Moc zwarciowa WN', el.sk3_hv_mva ?? null, 'MVA'),
    w('Strona zasilania', el.source_side ?? null),
  ]);
}

function wlasciwosciOdbioru(el: Load): WierszWlasciwosci[] {
  return bezNulli([
    wr('Moc czynna P', el.p_mw, 'MW'),
    wr('Moc bierna Q', el.q_mvar, 'Mvar'),
    wr('Model odbioru', el.model),
    w('Fazy', el.phases ?? null),
  ]);
}

function wlasciwosciGeneratora(el: Generator): WierszWlasciwosci[] {
  return bezNulli([
    wr('Moc czynna P', el.p_mw, 'MW'),
    w('Moc bierna Q', el.q_mvar ?? null, 'Mvar'),
    w('Rodzaj', el.gen_type ?? null),
    w('Wariant przyłączenia', el.connection_variant ?? null),
    w('Moduł NC RfG', el.nc_rfg_module ?? null),
    w('Jednostki równoległe', el.n_parallel ?? null),
  ]);
}

function wlasciwosciBaterii(el: ShuntCapacitor): WierszWlasciwosci[] {
  return bezNulli([
    wr('Moc znamionowa', el.rated_mvar, 'Mvar'),
    wr('Napięcie znamionowe', el.rated_kv, 'kV'),
    w('Stan', el.status ? (ETYKIETA_STANU_LACZNIKA[el.status] ?? el.status) : null),
  ]);
}

const ETYKIETA_RODZAJU_STACJI: Readonly<Record<string, string>> = {
  gpz: 'GPZ',
  mv_lv: 'SN/nN',
  switching: 'Rozdzielcza',
  customer: 'Odbiorcza',
  inline: 'Przelotowa',
  branch: 'Odgałęźna',
  terminal: 'Końcowa',
  sectional: 'Sekcyjna',
  rozdzielnica_nn: 'Rozdzielnica nN',
};

function wlasciwosciStacji(el: Substation): WierszWlasciwosci[] {
  return bezNulli([
    wr('Rodzaj stacji', ETYKIETA_RODZAJU_STACJI[el.station_type] ?? el.station_type),
    w('Konstrukcja', el.construction_type ?? null),
    w('Oznaczenie', el.designation ?? null),
    wr('Liczba szyn', el.bus_refs.length),
    wr('Liczba transformatorów', el.transformer_refs.length),
  ]);
}

function wlasciwosciPola(el: Bay): WierszWlasciwosci[] {
  return bezNulli([
    // Nazwa roli z kanonu słownictwa ról pól (karta #141), nigdy surowy kod roli.
    wr('Rola pola', fieldRoleLabelPl(el.bay_role)),
    wr('Szyna', el.bus_ref),
    w('Numer pola', el.bay_number ?? null),
    w('Nazwa odpływu', el.feeder_short_name ?? null),
    w('Kierunek (stacja docelowa)', el.outgoing_destination_ref ?? null),
    w(
      'Funkcje zabezpieczeniowe',
      el.protection_codes && el.protection_codes.length > 0 ? el.protection_codes.join(', ') : null,
    ),
  ]);
}

const ETYKIETA_TYPU_WEZLA: Readonly<Record<string, string>> = {
  T_node: 'Węzeł T',
  sectionalizer: 'Rozłącznik sekcyjny',
  recloser_point: 'Punkt SPZ',
  NO_point: 'Punkt normalnie otwarty',
};

function wlasciwosciWezla(el: Junction): WierszWlasciwosci[] {
  return bezNulli([
    wr('Rodzaj węzła', ETYKIETA_TYPU_WEZLA[el.junction_type] ?? el.junction_type),
    wr('Liczba dołączonych gałęzi', el.connected_branch_refs.length),
  ]);
}

const ETYKIETA_TYPU_PUNKTU_ROZGALEZIENIA: Readonly<Record<string, string>> = {
  branch_pole: 'Słup rozgałęźny',
  zksn: 'ZKSN',
};

function wlasciwosciPunktuRozgalezienia(el: BranchPointSN): WierszWlasciwosci[] {
  return bezNulli([
    wr(
      'Rodzaj punktu',
      ETYKIETA_TYPU_PUNKTU_ROZGALEZIENIA[el.branch_point_type] ?? el.branch_point_type,
    ),
    wr('Szyna', el.bus_ref),
    w('Stan łącznika', el.switch_state ? (ETYKIETA_STANU_LACZNIKA[el.switch_state] ?? el.switch_state) : null),
    w('Kompletność katalogowa', el.completeness_status ?? null),
  ]);
}

const ETYKIETA_TYPU_MAGISTRALI: Readonly<Record<string, string>> = {
  radial: 'Promieniowa',
  ring: 'Pierścieniowa',
  mixed: 'Mieszana',
};

function wlasciwosciMagistrali(el: Corridor): WierszWlasciwosci[] {
  return bezNulli([
    wr('Rodzaj magistrali', ETYKIETA_TYPU_MAGISTRALI[el.corridor_type] ?? el.corridor_type),
    wr('Liczba segmentów', el.ordered_segment_refs.length),
    w('Liczba stacji na trasie', el.station_refs && el.station_refs.length > 0 ? el.station_refs.length : null),
  ]);
}

const ETYKIETA_PRZEZNACZENIA_POMIARU: Readonly<Record<string, string>> = {
  protection: 'Zabezpieczeniowe',
  metering: 'Rozliczeniowe',
  combined: 'Łączone',
};

function wlasciwosciPomiaru(el: Measurement): WierszWlasciwosci[] {
  return bezNulli([
    wr('Rodzaj przekładnika', el.measurement_type === 'CT' ? 'Prądowy (CT)' : 'Napięciowy (VT)'),
    wr('Szyna', el.bus_ref),
    wr('Układ połączenia', el.connection),
    wr('Przeznaczenie', ETYKIETA_PRZEZNACZENIA_POMIARU[el.purpose] ?? el.purpose),
    w('Układ CT', el.ct_arrangement ?? null),
    w('Liczba rdzeni CT', el.ct_cores ?? null),
    w('Układ VT', el.vt_arrangement ?? null),
    w('Montaż VT', el.vt_mounting ?? null),
  ]);
}

const ETYKIETA_RODZAJU_ZABEZPIECZENIA: Readonly<Record<string, string>> = {
  overcurrent: 'Nadprądowe',
  earth_fault: 'Ziemnozwarciowe',
  directional_overcurrent: 'Nadprądowe kierunkowe',
  distance: 'Odległościowe',
  differential: 'Różnicowe',
  custom: 'Niestandardowe',
};

function wlasciwosciZabezpieczenia(el: ProtectionAssignment): WierszWlasciwosci[] {
  return bezNulli([
    wr('Rodzaj zabezpieczenia', ETYKIETA_RODZAJU_ZABEZPIECZENIA[el.device_type] ?? el.device_type),
    wr('Wyłącznik', el.breaker_ref),
    wr('Aktywne', el.is_enabled ? 'Tak' : 'Nie'),
    wr('Liczba nastaw', el.settings.length),
  ]);
}

const ETYKIETA_RODZAJU_CIAGU: Readonly<Record<string, string>> = {
  main_trunk: 'Tor główny',
  branch: 'Odgałęzienie',
  ring: 'Pierścień',
  loop: 'Pętla',
};

function wlasciwosciCiaguLiniowego(el: LineRunV1): WierszWlasciwosci[] {
  return bezNulli([
    wr('Rodzaj ciągu', ETYKIETA_RODZAJU_CIAGU[el.run_kind] ?? el.run_kind),
    wr('Pole startowe', el.starting_bay_ref),
    wr('Liczba segmentów', el.segments.length),
    wr('Liczba stacji na trasie', el.stations.length),
  ]);
}

const ETYKIETA_LOKALIZACJI_WEZLA: Readonly<Record<string, string>> = {
  bay: 'Pole',
  bus: 'Szyna',
  der_terminal: 'Zacisk DER',
  branch_point: 'Punkt rozgałęzienia',
};

function wlasciwosciWezlaPrzylaczenia(el: ConnectionNode): WierszWlasciwosci[] {
  return bezNulli([
    wr('Lokalizacja', ETYKIETA_LOKALIZACJI_WEZLA[el.location] ?? el.location),
    wr('Napięcie', el.voltage_kv, 'kV'),
    wr('Element nadrzędny', el.parent_ref),
  ]);
}

/**
 * Rozdzielacz WŁAŚCIWOŚCI KATALOGOWYCH wg typu (`typ` z `znajdzElement`) —
 * ZAMKNIĘTA lista (16 kolekcji `EnergyNetworkModel` × 7 podtypów gałęzi dla
 * „odcinka" = pełny inwentarz klasy „typ elementu ENM"). Test parytetu
 * (`__tests__/inspectorAdapter.test.ts`) iloczynem cech {typ} × {element
 * fixture z KOMPLETEM pól} sprawdza, że KAŻDY typ zwraca >= 1 wiersz —
 * brak wpisu (nowy typ w `EnergyNetworkModel`) jest czerwony.
 */
function wlasciwosciKatalogoweWgTypu(typ: string, element: ENMElement): WierszWlasciwosci[] {
  switch (typ) {
    case 'szyna':
      return wlasciwosciSzyny(element as unknown as Bus);
    case 'line_overhead':
    case 'cable':
    case 'switch':
    case 'breaker':
    case 'bus_coupler':
    case 'disconnector':
    case 'fuse':
      return wlasciwosciGaleziWgTypu(element);
    case 'transformator':
      return wlasciwosciTransformatora(element as unknown as Transformer);
    case 'zrodlo':
      return wlasciwosciZrodla(element as unknown as Source);
    case 'odbior':
      return wlasciwosciOdbioru(element as unknown as Load);
    case 'generator':
      return wlasciwosciGeneratora(element as unknown as Generator);
    case 'bateria_kondensatorow':
      return wlasciwosciBaterii(element as unknown as ShuntCapacitor);
    case 'stacja':
      return wlasciwosciStacji(element as unknown as Substation);
    case 'pole':
      return wlasciwosciPola(element as unknown as Bay);
    case 'wezel':
      return wlasciwosciWezla(element as unknown as Junction);
    case 'punkt_rozgalezienia':
      return wlasciwosciPunktuRozgalezienia(element as unknown as BranchPointSN);
    case 'magistrala':
      return wlasciwosciMagistrali(element as unknown as Corridor);
    case 'pomiar':
      return wlasciwosciPomiaru(element as unknown as Measurement);
    case 'zabezpieczenie':
      return wlasciwosciZabezpieczenia(element as unknown as ProtectionAssignment);
    case 'ciag_liniowy':
      return wlasciwosciCiaguLiniowego(element as unknown as LineRunV1);
    case 'wezel_przylaczenia':
      return wlasciwosciWezlaPrzylaczenia(element as unknown as ConnectionNode);
    default:
      return [];
  }
}

function sekcjaWlasciwosciKatalogowych(typ: string, element: ENMElement): SekcjaWlasciwosci | null {
  const wiersze = wlasciwosciKatalogoweWgTypu(typ, element);
  if (wiersze.length === 0) return null;
  return { id: 'katalogowe', tytul: 'Właściwości katalogowe', wiersze };
}

/** Czysta funkcja mapująca (testowalna bez Reacta). */
export function mapowanieObiektuInspektora(
  model: EnergyNetworkModel | null,
  id: string | null,
): ObiektInspektora | null {
  if (!model || !id) return null;
  const znaleziony = znajdzElement(model, id);
  if (!znaleziony) return null;
  const { element, typ, typEtykieta } = znaleziony;
  const sekcjaKatalogowa = sekcjaWlasciwosciKatalogowych(typ, element);
  return {
    id: element.id,
    typ,
    typEtykieta,
    nazwa: element.name || element.ref_id,
    wlasciwosci: [
      {
        id: 'podstawowe',
        tytul: 'Podstawowe',
        wiersze: [
          { etykieta: 'Nazwa', wartosc: { wartosc: element.name || element.ref_id } },
          { etykieta: 'Typ elementu', wartosc: { wartosc: typEtykieta } },
        ],
      },
      ...(sekcjaKatalogowa ? [sekcjaKatalogowa] : []),
    ],
    wyniki: [],
    dowody: [],
    powiazania: { wchodzace: [], wychodzace: [] },
    szczegolyTechniczne: [
      { klucz: 'Identyfikator', wartosc: element.id },
      { klucz: 'Odnośnik', wartosc: element.ref_id },
    ],
  };
}

/** Liczba z kontraktu wyniku w postaci prezentacyjnej (null/undefined = brak danej). */
function liczbaWyniku(wartosc: number | null | undefined, miejsca: number): string | null {
  return typeof wartosc === 'number' && Number.isFinite(wartosc) ? wartosc.toFixed(miejsca) : null;
}

function wiersz(etykieta: string, wartosc: string | null, jednostka?: string): WierszWlasciwosci | null {
  if (wartosc === null) return null;
  return { etykieta, wartosc: { wartosc, jednostka } };
}

/**
 * Wiersze wyniku elementu z AKTYWNEGO przebiegu rozpływu (szyna albo gałąź).
 * Wartości wprost z `PowerFlowResultV1` — bez przeliczania czegokolwiek w UI.
 */
function wynikiRozplywuElementu(
  wynik: ReturnType<typeof usePowerFlowResultsStore.getState>['results'],
  id: string,
): SekcjaWlasciwosci | null {
  if (!wynik) return null;
  const szyna = wynik.bus_results?.find((w) => w.bus_id === id);
  if (szyna) {
    const wiersze = [
      wiersz('Napięcie', liczbaWyniku(szyna.v_pu, 4), 'j.w.'),
      wiersz('Kąt fazowy', liczbaWyniku(szyna.angle_deg, 2), '°'),
      wiersz('Moc czynna wstrzykiwana', liczbaWyniku(szyna.p_injected_mw, 3), 'MW'),
      wiersz('Moc bierna wstrzykiwana', liczbaWyniku(szyna.q_injected_mvar, 3), 'Mvar'),
    ].filter((w): w is WierszWlasciwosci => w !== null);
    return wiersze.length > 0 ? { id: 'wynik-rozplyw', tytul: 'Rozpływ mocy', wiersze } : null;
  }
  const galaz = wynik.branch_results?.find((w) => w.branch_id === id);
  if (galaz) {
    const wiersze = [
      wiersz('Moc czynna (początek)', liczbaWyniku(galaz.p_from_mw, 3), 'MW'),
      wiersz('Moc bierna (początek)', liczbaWyniku(galaz.q_from_mvar, 3), 'Mvar'),
      wiersz('Moc czynna (koniec)', liczbaWyniku(galaz.p_to_mw, 3), 'MW'),
      wiersz('Moc bierna (koniec)', liczbaWyniku(galaz.q_to_mvar, 3), 'Mvar'),
      wiersz('Straty mocy czynnej', liczbaWyniku(galaz.losses_p_mw, 4), 'MW'),
    ].filter((w): w is WierszWlasciwosci => w !== null);
    return wiersze.length > 0 ? { id: 'wynik-rozplyw', tytul: 'Rozpływ mocy', wiersze } : null;
  }
  return null;
}

/**
 * Wiersze wyniku zwarciowego elementu z AKTYWNEGO przebiegu. Wiersz zwarciowy
 * wskazuje element przez `element_id` (kanon) albo `target_id` (miejsce zwarcia).
 */
function wynikiZwarcioweElementu(
  wynik: ReturnType<typeof useResultsInspectorStore.getState>['shortCircuitResults'],
  id: string,
): SekcjaWlasciwosci | null {
  const rzad = wynik?.rows?.find((w) => (w.element_id ?? w.target_id) === id);
  if (!rzad) return null;
  const wiersze = [
    wiersz('Prąd zwarciowy początkowy Ik″', liczbaWyniku(rzad.ikss_ka, 3), 'kA'),
    wiersz('Prąd udarowy ip', liczbaWyniku(rzad.ip_ka, 3), 'kA'),
    wiersz('Prąd cieplny Ith', liczbaWyniku(rzad.ith_ka, 3), 'kA'),
    wiersz('Moc zwarciowa Sk″', liczbaWyniku(rzad.sk_mva, 2), 'MVA'),
  ].filter((w): w is WierszWlasciwosci => w !== null);
  return wiersze.length > 0
    ? { id: 'wynik-zwarcie', tytul: 'Zwarcie', wiersze }
    : null;
}

/**
 * Hook: obiekt inspektora dla bieżącej selekcji — model ze snapshotu, wyniki i
 * dowody z AKTYWNEGO przebiegu (patrz nagłówek pliku). Pozycja dowodu powstaje
 * WYŁĄCZNIE dla elementu obecnego w wyniku biegu; jej `ref` to identyfikator
 * elementu, którym `otworzDowodInspektora` zawęża wywód w przestrzeni Wyników.
 */
export function useObiektInspektora(id: string | null): ObiektInspektora | null {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const wynikRozplywu = usePowerFlowResultsStore((s) => s.results);
  const wynikZwarciowy = useResultsInspectorStore((s) => s.shortCircuitResults);
  // Świeżość dowodu = TA SAMA prawda co nagłówki ekranów wyników (jedno źródło,
  // karta V12K-264): rewizja modelu, przy której policzono AKTYWNY przebieg.
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const { rewizjaDanych } = useSwiezoscNaglowka(activeRunId);
  return useMemo(() => {
    const obiekt = mapowanieObiektuInspektora(snapshot, id);
    if (!obiekt || !id) return obiekt;
    const sekcjaRozplywu = wynikiRozplywuElementu(wynikRozplywu, id);
    const sekcjaZwarciowa = wynikiZwarcioweElementu(wynikZwarciowy, id);
    const sekcje = [sekcjaRozplywu, sekcjaZwarciowa].filter(
      (s): s is SekcjaWlasciwosci => s !== null,
    );
    const dowody: PozycjaDowodu[] = [];
    if (sekcjaRozplywu) {
      dowody.push({ ref: id, etykieta: 'Wywód rozpływu mocy dla elementu', rewizja: rewizjaDanych });
    }
    if (sekcjaZwarciowa) {
      dowody.push({ ref: id, etykieta: 'Wywód zwarciowy dla elementu', rewizja: rewizjaDanych });
    }
    return { ...obiekt, wyniki: sekcje, dowody, rewizjaWynikow: rewizjaDanych };
  }, [snapshot, id, wynikRozplywu, wynikZwarciowy, rewizjaDanych]);
}

/**
 * Hook: bieżąca rewizja modelu (0, gdy brak projektu). S9-11 / W-5: czyta
 * JEDNO źródło `rewizjaBiezacegoModelu` — rewizja wyświetlanej migawki bywa
 * rewizją PODGLĄDU PRZEBIEGU i nie opisuje bieżącego modelu (pasek stanu
 * „Model: rew. n" i znaczniki świeżości inspektora mówiłyby co innego niż chip).
 */
export function useRewizjaModelu(): number {
  return useSnapshotStore((s) => s.rewizjaBiezacegoModelu ?? 0);
}

/**
 * „Otwórz dowód" inspektora (KARTA-UI2 §0.3): dowód WHITE BOX elementu
 * wskazanego 2× klikiem (`InspectorPanel`/`TabDowod`, `ValueRow.dowodRef`) —
 * ZŁOŻONA z trzech istniejących, już przetestowanych elementarzy powłoki
 * (żadnej nowej magistrali/store'u):
 * (1) `emituj('selekcja', ref)` — ten sam wzorzec co `AppRoot.wykonajAkcjeNaprawcza`;
 *     `DowodPrzebiegu` (przestrzeń Wyniki) czyta bieżącą selekcję z `ui/selection`
 *     jako WSKAZANY element wywodu, gdy deep-link nie niesie jawnego
 *     `wskazanyElementRef` (`ui2/spaces/wyniki/DowodPrzebiegu.tsx` — „gdy
 *     wskazania nie było, z bieżącej selekcji na schemacie").
 * (2) `setWynikiTab('dowod', runId)` — deep-link między-przestrzenny R3-C
 *     (`useShellStore`), TEN SAM kontrakt, którym już nawiguje kolumna A/B
 *     porównania; `runId` puste = „dowód aktywnego przebiegu" (zachowanie
 *     warsztatu wyników 1:1, zero nowej semantyki).
 * (3) `przejdzDoPrzestrzeni('wyniki')` — most tras E1.7c (jak `AppRoot.pokazWynikiBiegu`).
 * Element inspektora nie niesie własnego `run_id` (kontrakt `PozycjaDowodu` ma
 * wyłącznie `ref`/`etykieta`/`rewizja` — `ui2/inspector/inspectorModel.ts`),
 * więc kontekst biegu jest AKTYWNYM przebiegiem powłoki — ten sam wybór co
 * przy braku wskazania w warsztacie wyników (bez zgadywania cudzego przebiegu).
 */
export function otworzDowodInspektora(ref: string): void {
  const runId = useAppStateStore.getState().activeRunId;
  emituj({ typ: 'selekcja', obiektId: ref, zrodlo: 'inspektor' });
  useShellStore.getState().setWynikiTab('dowod', runId);
  przejdzDoPrzestrzeni('wyniki');
}
