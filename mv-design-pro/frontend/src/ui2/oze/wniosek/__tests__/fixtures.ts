/*
 * Fixtury okna „Wniosek OSD" na kontrakcie V2 (karta AB-1a Pakiet D2 §5). Odpowiedzi backendu
 * (widok 200 modelu magazynu, 422 modelu sceny `macierz`), ciała żądań i wpisy rejestru
 * przebiegów pochodzą z `harness-fixtures/generated/*` — policzone TYMI SAMYMI funkcjami co
 * trasa (`build_wniosek_osd_view`, `WniosekOsdBrakiError.detail()`, `to_execution_dict`).
 * Moduły scen wyprowadza produkcyjne `deryZModelu`. `przebiegFixture` zostaje wyłącznie dla
 * przypadków brzegowych filtrów rejestru (rodzaj × status).
 */

import magazynScenyMigawka from '../../../../harness-fixtures/generated/magazyn_scena_migawka.json';
import macierzScenyMigawka from '../../../../harness-fixtures/generated/macierz_scena_migawka.json';
import wniosekMacierzBraki from '../../../../harness-fixtures/generated/wniosek_scena_macierz_braki.json';
import wniosekMacierzPrzebiegi from '../../../../harness-fixtures/generated/wniosek_scena_macierz_przebiegi.json';
import wniosekMacierzZadanie from '../../../../harness-fixtures/generated/wniosek_scena_macierz_zadanie.json';
import wniosekMagazyn from '../../../../harness-fixtures/generated/wniosek_scena_magazyn.json';
import wniosekMagazynPrzebiegi from '../../../../harness-fixtures/generated/wniosek_scena_magazyn_przebiegi.json';
import wniosekMagazynZadanie from '../../../../harness-fixtures/generated/wniosek_scena_magazyn_zadanie.json';
import { deryZModelu, type StationDerConnection } from '../../../../ui/network-build/station-der';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import type { EnergyNetworkModel } from '../../../../types/enm';
import type { BrakiWniosku, WidokWniosku, ZadanieWniosku } from '../../ncrfg/typy';

/** Przebieg wykonawczy o zadanym rodzaju/statusie (przypadki brzegowe filtrów rejestru). */
export function przebiegFixture(
  id: string,
  analysisType: ExecutionRun['analysis_type'],
  status: ExecutionRun['status'] = 'DONE',
): ExecutionRun {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type: analysisType,
    solver_input_hash: 'hash',
    status,
    started_at: null,
    finished_at: null,
    error_message: null,
  };
}

export function deryMagazynu(): readonly StationDerConnection[] {
  return deryZModelu(magazynScenyMigawka as unknown as EnergyNetworkModel, 'proj-demo');
}

export function deryMacierzy(): readonly StationDerConnection[] {
  return deryZModelu(macierzScenyMigawka as unknown as EnergyNetworkModel, 'proj-demo');
}

export function przebiegiMagazynu(): ExecutionRun[] {
  return wniosekMagazynPrzebiegi as unknown as ExecutionRun[];
}

export function przebiegiMacierzy(): ExecutionRun[] {
  return wniosekMacierzPrzebiegi as unknown as ExecutionRun[];
}

export function zadanieMagazynu(): ZadanieWniosku {
  return wniosekMagazynZadanie as unknown as ZadanieWniosku;
}

export function zadanieMacierzy(): ZadanieWniosku {
  return wniosekMacierzZadanie as unknown as ZadanieWniosku;
}

export function widokWnioskuFixture(): WidokWniosku {
  return wniosekMagazyn as unknown as WidokWniosku;
}

export function brakiWnioskuFixture(): BrakiWniosku {
  return wniosekMacierzBraki as unknown as BrakiWniosku;
}
