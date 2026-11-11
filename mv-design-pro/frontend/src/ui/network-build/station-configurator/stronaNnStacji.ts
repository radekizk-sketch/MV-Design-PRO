/**
 * Strona nN stacji — wiersze karty „Strona nN” konfiguratora stacji (rozdzielnice nN i odbiory),
 * z ATOMOWEJ projekcji domeny nN backendu (`GET …/enm/lv-domain/{station_ref}/projection/v1`,
 * `projection.graph`). Topologię nN (sekcje rozdzielnic, role aparatów, rodzaj odpływu z
 * zawartości poddrzewa) rozstrzyga backend (`application/analyses/lv_domain/graph_view.py`);
 * ta warstwa jej NIE odtwarza z surowego ENM — ta sama zasada co portal domeny nN
 * (`scripts/lv_domain_projection_guard.py` R4).
 *
 * Dawniej karta dostawała wyłącznie puste listy bazowe („Rozdzielnice nN (0)”, „Odbiory (0)”)
 * niezależnie od modelu, a wiersz rozdzielnicy deklarował pola bez źródła (status konfiguracji,
 * bilans P/Q per rozdzielnica). Kolejność deterministyczna: rozdzielnica główna przed
 * podrozdzielnicami, w obrębie rodzaju po `order` backendu; odbiory po `ref_id`.
 */
import type { LvDomainGraphView, LvFeederKind } from '../../sld/v3/lv-domain/types';
import type { LoadRow } from './cards/StationConfigLoadsCard';
import type { NnSwitchgearRow } from './cards/StationConfigNnSwitchgearCard';

/** Stan pobrania projekcji nN — karta pokazuje go wprost, nie udaje pustej rozdzielnicy. */
export type StanDanychNn =
  | { readonly stan: 'brak_przypadku' }
  | { readonly stan: 'ladowanie' }
  | { readonly stan: 'blad'; readonly komunikatPl: string }
  | { readonly stan: 'brak_domeny'; readonly komunikatPl: string }
  | { readonly stan: 'gotowe' };

function liczOdplywy(
  graf: LvDomainGraphView,
  busRef: string,
  rodzaje: readonly LvFeederKind[] | null,
): number {
  return graf.devices.filter(
    (d) =>
      d.device_role === 'feeder'
      && d.board_bus_ref === busRef
      && (rodzaje === null || (d.feeder_kind !== null && rodzaje.includes(d.feeder_kind))),
  ).length;
}

export function rozdzielniceNnZGrafu(graf: LvDomainGraphView): readonly NnSwitchgearRow[] {
  if (graf.status !== 'OK') return [];
  const szyny = new Map(graf.buses.map((b) => [b.ref_id, b] as const));
  // Rozdzielnica główna przed podrozdzielnicami, w obrębie rodzaju po `order` backendu.
  return [...graf.sections]
    .sort((a, b) => (a.tier === b.tier ? a.order - b.order : a.tier === 'main' ? -1 : 1))
    .map((sekcja): NnSwitchgearRow => {
      const szyna = szyny.get(sekcja.bus_ref);
      return {
        sectionId: sekcja.section_id,
        designation: szyna?.name ?? sekcja.bus_ref,
        nnVoltageKv: szyna?.voltage_kv ?? null,
        tier: sekcja.tier,
        incomersCount: sekcja.incomer_refs.length,
        couplersCount: sekcja.coupler_refs.length,
        feedersCount: liczOdplywy(graf, sekcja.bus_ref, null),
        loadFeedersCount: liczOdplywy(graf, sekcja.bus_ref, ['load', 'mixed']),
        derFeedersCount: liczOdplywy(graf, sekcja.bus_ref, ['der', 'mixed']),
        subBoardFeedersCount: liczOdplywy(graf, sekcja.bus_ref, ['sub_board']),
      };
    });
}

export function odbioryNnZGrafu(graf: LvDomainGraphView): readonly LoadRow[] {
  if (graf.status !== 'OK') return [];
  const szyny = new Map(graf.buses.map((b) => [b.ref_id, b] as const));
  return [...graf.loads]
    .sort((a, b) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0))
    .map((odbior): LoadRow => ({
      loadId: odbior.ref_id,
      name: odbior.name,
      attachmentPointPl: szyny.get(odbior.bus_ref)?.name ?? odbior.bus_ref,
      pMw: odbior.p_mw,
      qMvar: odbior.q_mvar,
    }));
}
