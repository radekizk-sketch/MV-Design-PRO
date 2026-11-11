/**
 * TOŻSAMOŚĆ APARATU POLA NA KANWIE v3 — jeden identyfikator, jeden rozbiór, jeden słownik.
 *
 * Aparat pola SN nie jest osobnym rekordem modelu sieci: scena v3 rysuje go jako symbol
 * (`SymbolId`) w stosie pola, a meta symbolu niesie ref POLA (`ownerRef = bayRef`).
 * Operacja projektanta na aparacie (np. „Wyprowadź ciąg główny z głowicy") potrzebuje więc
 * pary ⟨pole, rodzaj aparatu⟩. Ta para ma JEDNĄ postać tekstową — `${bayRef}#${SymbolId}` —
 * budowaną i rozbieraną WYŁĄCZNIE tutaj. Czytają ją: menu kontekstowe kanwy i pasek działań
 * inspektora (`akcjeElementu.ts`), wykonawca akcji (`sldActionExecutor.ts`), rejestr menu
 * (`SldCommandService.ts`), stan łącznika (`ui/shared/stanLacznika.ts`) i nagłówek aparatu
 * inspektora inżynierskiego (`InspectorEngineeringView.tsx`). Rolę techniczną rekordu aparatu
 * w karcie technicznej (`kartaTechnicznaElementu.ts`) daje ta sama tabela `ROLA_SYMBOLU_PL`
 * przez symbol, którym scena rysuje rekord.
 *
 * Słownik rodzajów aparatu to `SymbolId` kanwy v3 — ten sam, którym scena rysuje symbol.
 * Nazwa rodzaju pochodzi z biblioteki symboli (`SYMBOL_DEFS[id].labelPl`, ta sama nazwa
 * co w legendzie arkusza), rola techniczna — z zamkniętej tabeli niżej. Dawne słowniki
 * snake_case (`disconnect_bus`, `cable_head`, `transformer_symbol`) należały do skasowanej
 * nakładki aparatury kanwy v2 i do skasowanego widoku wewnętrznego stacji — nic na kanwie
 * v3 ich nie emitowało, więc gałęzie, które na nie czekały, były martwe.
 */
import type { EnergyNetworkModel } from '../../../types/enm';
import { pole } from '../../shared/polaStacji';
import type { QetSymbolPolaSnId } from '../v3/cad/qet/qetPoleSn';
import { rodzajSymbolu, SYMBOL_DEFS, type SymbolId } from '../v3/symbols/defs';

/** Rodzaje semantyczne symboli rysunku pola SN (QET) bez odpowiednika w bibliotece kanonicznej
 *  (`defs.ts::RODZAJ_SEMANTYCZNY_QET` — rodzaj równy własnemu identyfikatorowi). */
type RodzajWlasnyQet = 'qetThreePositionSwitch' | 'qetCoreBalanceCt' | 'bayReserve';

/** Rola techniczna RODZAJU aparatu — tabela ZAMKNIĘTA: każdy rodzaj semantyczny symbolu
 *  (symbol kanoniczny albo rodzaj własny rysunku QET) ma rolę; nowy rodzaj bez roli nie
 *  skompiluje się. */
const ROLA_RODZAJU_PL: Readonly<Record<Exclude<SymbolId, QetSymbolPolaSnId> | RodzajWlasnyQet, string>> = {
  breaker: 'Łączenie robocze i wyłączanie prądów zwarciowych pola',
  recloser: 'Wyłączanie zwarć z samoczynnym ponownym załączeniem (SPZ)',
  disconnector: 'Widoczna przerwa izolacyjna — odłączenie pola od szyny zbiorczej',
  loadBreakSwitch: 'Łączenie robocze prądów obciążenia pola',
  earthSwitch: 'Uziemienie odpływu po odłączeniu pola',
  fuseSwitch: 'Łączenie robocze i zabezpieczenie zwarciowe wkładkami bezpiecznikowymi',
  fuse: 'Zabezpieczenie zwarciowe wkładkami bezpiecznikowymi',
  voltageIndicator: 'Sygnalizacja obecności napięcia w polu',
  transformer2W: 'Transformacja napięcia w torze transformatora',
  cableHead: 'Zakończenie kabla odpływu — jawny punkt wyprowadzenia ciągu głównego SN',
  jointSleeve: 'Połączenie odcinków kabla (mufa)',
  noPoint: 'Punkt normalnie otwarty — podział sieci w stanie normalnym',
  lineSwitch: 'Łącznik sekcyjny ciągu — podział toru',
  lineBreaker: 'Wyłącznik sekcyjny ciągu — wyłączanie zwarć na torze',
  junction: 'Węzeł połączenia przewodów toru',
  branchJunction: 'Węzeł rozgałęzienia ciągu',
  branchCabinet: 'Punkt odgałęźny na odcinku kablowym (złącze kablowe SN)',
  branchPole: 'Punkt odgałęźny na odcinku napowietrznym (słup rozgałęźny)',
  currentTransformer: 'Pomiar prądu i tor zabezpieczeń',
  voltageTransformer: 'Pomiar napięcia i automatyka napięciowa',
  surgeArrester: 'Ograniczanie przepięć',
  neutralEarthing: 'Uziemienie punktu neutralnego sieci',
  derPv: 'Wytwarzanie energii — źródło fotowoltaiczne',
  derBess: 'Magazynowanie energii',
  derGenerator: 'Wytwarzanie energii — generator',
  derWind: 'Wytwarzanie energii — farma wiatrowa',
  derUnknown: 'Wytwarzanie energii — rodzaj źródła nieustalony w modelu',
  bayNoEquipment: 'Pole bez danych wyposażenia — aparatura do uzupełnienia',
  bayReserve: 'Zakończenie pola rezerwowego (bez odejścia)',
  gridSource: 'Zasilanie z sieci zewnętrznej',
  stationCollapsed: 'Stacja SN/nN w widoku zbiorczym',
  gpzCollapsed: 'Rozdzielnia zasilająca w widoku zbiorczym',
  protectionRelay: 'Zabezpieczenie pola (przekaźnik)',
  meter: 'Pomiar wielkości elektrycznych pola',
  loadArrow: 'Odbiór energii',
  capacitorBank: 'Kompensacja mocy biernej',
  nnBreaker: 'Łączenie i zabezpieczenie zwarciowe obwodu nN',
  nnFuseSwitch: 'Łączenie i zabezpieczenie bezpiecznikowe obwodu nN',
  lvPortal: 'Przejście do schematu nN stacji',
  qetThreePositionSwitch:
    'Łączenie robocze, odłączenie od szyny i uziemienie odpływu jednym łącznikiem trójpołożeniowym',
  qetCoreBalanceCt: 'Pomiar prądu zerowego dla zabezpieczeń ziemnozwarciowych (przekładnik Ferrantiego)',
};

function rolaRodzajuPl(id: SymbolId): string {
  const rola = (ROLA_RODZAJU_PL as Readonly<Partial<Record<SymbolId, string>>>)[rodzajSymbolu(id)];
  if (rola === undefined) throw new Error(`Rodzaj symbolu bez roli technicznej: ${rodzajSymbolu(id)}`);
  return rola;
}

/** Rola techniczna elementu przedstawianego symbolem — dla KAŻDEGO symbolu biblioteki; wariant
 *  rysunku pola SN (QET: z napędem, wysuwny, drugi i trzeci rysunek przekładnika) ma rolę swojego
 *  rodzaju semantycznego (`rodzajSymbolu`) — jedna rola na rodzaj aparatu. */
export const ROLA_SYMBOLU_PL: Readonly<Record<SymbolId, string>> = Object.fromEntries(
  (Object.keys(SYMBOL_DEFS) as SymbolId[]).map((id) => [id, rolaRodzajuPl(id)]),
) as Record<SymbolId, string>;

/** Para ⟨pole, rodzaj aparatu⟩ rozebrana z identyfikatora. */
export interface IdentyfikatorAparatu {
  readonly bayRef: string;
  readonly symbolId: SymbolId;
}

const SEPARATOR = '#';

/** Czy łańcuch jest identyfikatorem symbolu biblioteki kanwy v3. */
export function jestSymbolem(wartosc: string): wartosc is SymbolId {
  return Object.prototype.hasOwnProperty.call(SYMBOL_DEFS, wartosc);
}

/** Identyfikator aparatu `${bayRef}#${SymbolId}` — jedyny konstruktor. */
export function identyfikatorAparatu(bayRef: string, symbolId: SymbolId): string {
  return `${bayRef}${SEPARATOR}${symbolId}`;
}

/**
 * Rozbiór identyfikatora aparatu — jedyny parser. Ostatni `#` oddziela rodzaj aparatu;
 * rodzaj spoza biblioteki symboli (np. kompozyt rysunku `${stacja}#sn-bus` albo dawny
 * kod `cable_head`) NIE jest aparatem — wynik `null`, nigdy surowy kod podany dalej.
 */
export function rozbierzIdentyfikatorAparatu(
  id: string | null | undefined,
): IdentyfikatorAparatu | null {
  if (!id) return null;
  const znacznik = id.lastIndexOf(SEPARATOR);
  if (znacznik <= 0 || znacznik === id.length - 1) return null;
  const rodzaj = id.slice(znacznik + 1);
  if (!jestSymbolem(rodzaj)) return null;
  return { bayRef: id.slice(0, znacznik), symbolId: rodzaj };
}

/** Nazwa rodzaju aparatu — ta sama co w legendzie arkusza (`SYMBOL_DEFS.labelPl`). */
export function nazwaAparatuPl(symbolId: SymbolId): string {
  return SYMBOL_DEFS[symbolId].labelPl;
}

/** Rekord pola niesie głowicę kablową (`primary_devices` z rodzajem `CABLE_HEAD`). */
export function poleMaGlowiceKablowa(snapshot: EnergyNetworkModel | null, bayRef: string): boolean {
  return (pole(snapshot, bayRef)?.primary_devices ?? []).some((u) => u.kind === 'CABLE_HEAD');
}

/**
 * Punkt wyprowadzenia ciągu głównego SN na kanwie — JEDEN predykat rodzaju aparatu dla menu
 * kanwy, paska działań inspektora (`akcjeElementu.kontekstDostepnosciAkcji` →
 * `SldCommandService.getMenuActions`) i wykonawcy (`sldActionExecutor.buildSldOperationContext`).
 * Ciąg wychodzi z głowicy kablowej pola. Kanon rysunku pola wolnego/rezerwowego
 * (`v3/compose/apparatusSequence.ts::rekordyToruPola`, korekta po odrzuceniu B-02 karty
 * UX-04/POLE-LINIOWE-WZORZEC) rysuje każdy rekord aparatu — także głowicę — i kończy pole
 * symbolem `bayReserve`; punktem wyprowadzenia jest i głowica, i to zakończenie, o ile rekord
 * pola ma głowicę kablową. Zakończenie pola bez rekordu głowicy nie jest punktem (brak głowicy
 * = brak odejścia kablowego). Zajętość pola
 * (`zajetoscPol.poleLinioweWolne`) rozstrzyga wykonawca osobno, tym samym warunkiem dla głowicy
 * pola zajętego i zakończenia pola wolnego.
 */
export function jestPunktemWyprowadzeniaCiagu(
  snapshot: EnergyNetworkModel | null,
  aparat: IdentyfikatorAparatu | null,
): boolean {
  if (!aparat) return false;
  if (aparat.symbolId === 'cableHead') return true;
  return aparat.symbolId === 'bayReserve' && poleMaGlowiceKablowa(snapshot, aparat.bayRef);
}
