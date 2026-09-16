/**
 * Status certyfikatu PTPiREE wytwórcy — JEDYNE ŹRÓDŁO PRAWDY warstwy prezentacji
 * (karta CERTYFIKAT-Z-KATALOGU, zero fabrykacji).
 *
 * DLACZEGO TEN MODUŁ ISTNIEJE. Dwa ekrany (macierz zgodności NC RfG
 * `ui2/oze/macierz/macierzModel.ts` i starsza zakładka
 * `ui/workspace/surfaces/NcRfgTestsTab.tsx`) ZGADYWAŁY status certyfikatu
 * z NAZWY referencji katalogowej (`device_catalog_ref?.includes('ptpiree')`).
 * To była fabrykacja: rekord katalogu nazwany z „ptpiree" bez adnotacji
 * backendu dawał fałszywy `ptpiree_verified`, a rekord certyfikowany bez
 * tego słowa w nazwie — fałszywy `unknown`. Wartość wpływa nie tylko na
 * wyświetlaną etykietę, ale na SAM WYNIK biegu solvera: `POST /api/ncrfg-tests/run`
 * (wołanie macierzy) ufa `certificate_status` przysłanemu w żądaniu
 * (kontrakt solvera B-01 — `NcRfgPtpireeModuleInput.certificate_status`,
 * nietknięty), więc zgadywanie po stronie frontu fałszowało klasyfikację
 * testów T12/T13 (wymagane dla modułów A/B bez potwierdzonego certyfikatu).
 *
 * JEDNO ŹRÓDŁO, DWIE PROJEKCJE. Backend ma DWA słowniki tego samego faktu:
 *   - `network_model/catalog/mv_ptpiree_catalog.py::annotate_with_ptpiree_status`
 *     stempluje rekord katalogu `ptpiree_status: 'POWIAZANY' | 'NIEPOWIAZANY'`
 *     (dopasowanie do wykazu PTPiREE) — trafia do `materialized_params` wytwórcy
 *     (`enm/domain_operations_v2.py::_certyfikat_ptpiree_z_katalogu`), skąd czyta
 *     je `station-der/zModelu.ts` (`DerCatalogSelections.ptpiree_status`).
 *   - `application/ncrfg_compliance/model_bridge.py::certificate_status_z_tabliczki`
 *     (trasa kanoniczna `GET .../compliance`, S-3) tłumaczy TĘ SAMĄ tabliczkę na
 *     kontrakt solvera `NcRfgCertificateStatus` ('ptpiree_verified' | 'unknown'
 *     — 'expired'/'none' nie mają dziś dostawcy w tabliczce, więc backend też
 *     ich nie wyprowadza).
 * Ta funkcja jest TYM SAMYM predykatem co `certificate_status_z_tabliczki` —
 * nie osobną implementacją: `ptpiree_status === 'POWIAZANY'` LUB niepusta
 * `ptpiree_certificate_ref` → `'ptpiree_verified'`; każdy inny stan (w tym
 * `'NIEPOWIAZANY'`, brak tabliczki) → `'unknown'` (stan PESYMISTYCZNY, zgodny
 * z solverem: `unknown` traktowany jak brak certyfikatu).
 */

import type { NcRfgCertificateStatus } from '../../ncrfg-tests/api';
import type { StationDerConnection } from './types';

export function statusCertyfikatuPtpiree(der: StationDerConnection): NcRfgCertificateStatus {
  const { ptpiree_status, ptpiree_certificate_ref } = der.catalogs;
  if (ptpiree_status === 'POWIAZANY' || Boolean(ptpiree_certificate_ref?.trim())) {
    return 'ptpiree_verified';
  }
  return 'unknown';
}
