/**
 * TOŻSAMOŚĆ APARATU POLA NA KANWIE v3 — jeden identyfikator, jeden rozbiór, jeden słownik.
 *
 * Aparat pola SN nie jest osobnym rekordem modelu sieci: scena v3 rysuje go jako symbol
 * (`SymbolId`) w stosie pola, a meta symbolu niesie ref POLA (`ownerRef = bayRef`).
 * Operacja projektanta na aparacie (np. „Wyprowadź ciąg główny z głowicy") potrzebuje więc
 * pary ⟨pole, rodzaj aparatu⟩. Ta para ma JEDNĄ postać tekstową — `${bayRef}#${SymbolId}` —
 * budowaną i rozbieraną WYŁĄCZNIE tutaj. Czytają ją: menu kontekstowe kanwy i pasek działań
 * inspektora (`akcjeElementu.ts`), wykonawca akcji (`sldActionExecutor.ts`), rejestr menu
 * (`SldCommandService.ts`), stan łącznika (`ui/shared/stanLacznika.ts`) i karta aparatu
 * inspektora inżynierskiego (`InspectorEngineeringView.tsx`).
 *
 * Słownik rodzajów aparatu to `SymbolId` kanwy v3 — ten sam, którym scena rysuje symbol.
 * Nazwa rodzaju pochodzi z biblioteki symboli (`SYMBOL_DEFS[id].labelPl`, ta sama nazwa
 * co w legendzie arkusza), rola techniczna — z zamkniętej tabeli niżej. Dawne słowniki
 * snake_case (`disconnect_bus`, `cable_head`, `transformer_symbol`) należały do skasowanej
 * nakładki aparatury kanwy v2 i do skasowanego widoku wewnętrznego stacji — nic na kanwie
 * v3 ich nie emitowało, więc gałęzie, które na nie czekały, były martwe.
 */
import { SYMBOL_DEFS, type SymbolId } from '../v3/symbols/defs';

/** Rola techniczna elementu przedstawianego symbolem — tabela ZAMKNIĘTA (`Record<SymbolId>`):
 *  nowy symbol bez roli nie skompiluje się. */
export const ROLA_SYMBOLU_PL: Readonly<Record<SymbolId, string>> = {
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
};

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

export function rolaAparatuPl(symbolId: SymbolId): string {
  return ROLA_SYMBOLU_PL[symbolId];
}

/** Głowica kablowa — jedyny aparat, z którego wyprowadza się ciąg główny SN. */
export function jestGlowicaKablowa(symbolId: SymbolId | null | undefined): boolean {
  return symbolId === 'cableHead';
}
