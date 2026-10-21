/**
 * UI-02b JEDEN-INSPEKTOR — JEDNO źródło działań elementu dla menu kontekstowego kanwy
 * i paska działań prawego inspektora.
 *
 * Obie powierzchnie dostają listę z TEGO SAMEGO rejestru (`SLD_MENU_REGISTRY` przez
 * `getMenuActions`) i z TEGO SAMEGO kontekstu dostępności, policzonego tu jedną funkcją
 * z tematu obiektu (`CanvasMenuSubject` — kategoria menu i ref modelu). Dawniej menu
 * kanwy i szuflada liczyły kontekst osobno i rozjechały się: szuflada bramkowała
 * „Pokaż wyniki" stanem wyników, menu nie; menu bramkowało agregat/UPS szyną nN, szuflada
 * nie (reguła KLASA pkt 3 — predykaty parami z jednego źródła). Wykonuje je jeden
 * wykonawca `useSldActionExecutor`.
 */
import type { SldMenuContext } from '../../context-menu/SldContextMenuController';
import type { ResultStatus } from '../../types';
import type { EnergyNetworkModel, LogicalViewsV1 } from '../../../types/enm';
import { wPasmieNn } from '../../../ui2/model/pasmaNapieciowe';
import { getMenuActions, type SldMenuAction } from '../v2/command/SldCommandService';
import type { CanvasMenuSubject } from '../v3/canvas/canvasMenuSubject';
import {
  parseGpzApparatusSelectionId,
  resolveBranchStartAvailability,
  resolveTrunkStartAvailability,
} from './sldActionExecutor';

/**
 * Kontekst dostępności działań obiektu:
 *  - punkt startu ciągu SN i odgałęzienia — TE SAME resolvery, które zbudują kontekst
 *    kreatora (`resolveTrunkStartAvailability` / `resolveBranchStartAvailability`);
 *  - „Pokaż wyniki" — aktywny przypadek ma wynik (świeży albo nieaktualny); bez wyniku
 *    pozycja jest nieaktywna z przyczyną;
 *  - agregat/UPS stacji — stacja ma szynę nN (FK `substation.bus_refs`, pasmo nN);
 *  - rodzaj aparatu z kompozytu `⟨pole⟩#⟨rodzaj⟩`, gdy ref go niesie.
 */
export function kontekstDostepnosciAkcji(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  temat: CanvasMenuSubject,
  activeCaseResultStatus: ResultStatus,
): SldMenuContext {
  const trunkStartAvailable = resolveTrunkStartAvailability(
    snapshot,
    logicalViews,
    temat.menuKind,
    temat.modelRef,
  );
  const branchStartAvailable = resolveBranchStartAvailability(
    snapshot,
    logicalViews,
    temat.menuKind,
    temat.modelRef,
  );
  const hasResults = activeCaseResultStatus !== 'NONE';
  const apparatusKind = parseGpzApparatusSelectionId(temat.modelRef)?.apparatusKind;
  const wspolne: SldMenuContext = {
    trunkStartAvailable,
    branchStartAvailable,
    hasResults,
    ...(apparatusKind === undefined ? {} : { apparatusKind }),
  };
  if (temat.kotwica !== 'stacja') return wspolne;
  const station = (snapshot?.substations ?? []).find(
    (candidate) => candidate.ref_id === temat.modelRef || candidate.id === temat.modelRef,
  );
  if (!station) return wspolne;
  const stationHasNnBus = (station.bus_refs ?? []).some((busRef) => {
    const bus = (snapshot?.buses ?? []).find(
      (candidate) => candidate.ref_id === busRef || candidate.id === busRef,
    );
    return bus != null && wPasmieNn(bus.voltage_kv);
  });
  return { ...wspolne, stationHasNnBus };
}

/** Działania obiektu — ta sama lista dla menu kanwy i paska inspektora. */
export function akcjeElementu(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  temat: CanvasMenuSubject,
  activeCaseResultStatus: ResultStatus,
): SldMenuAction[] {
  return getMenuActions(
    temat.menuKind,
    kontekstDostepnosciAkcji(snapshot, logicalViews, temat, activeCaseResultStatus),
  );
}
