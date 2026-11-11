/**
 * Karta GPZ-PARYTET cz. 2 (pkt 2): stan łączników pola rysowany na schemacie WYŁĄCZNIE
 * z modelu sieci — jedna funkcja dla wszystkich adapterów kanwy (stacje SN/nN, GPZ,
 * pola źródeł).
 *
 * ŹRÓDŁO STANU. Stan normalny łącznika w ENM to `status` gałęzi łączeniowej
 * (`Branch.type ∈ {breaker, disconnector, switch, bus_coupler}`, `status ∈ {open, closed}`)
 * — ta sama semantyka „w ruchu", której używa backend (`enm/topology.py podziel_krawedzie`,
 * zasilenie K6a `application/topologia_zasilenia.py`). Gałąź należy do pola przez
 * `Bay.equipment_refs` albo przez `BayPrimaryDevice.linked_ref`. Rekord aparatu
 * (`BayPrimaryDevice.switch_state`), gdy jest, rozstrzyga tak jak w K6a: stan „nieznany"/
 * „awaria" albo stan sprzeczny ze `status` gałęzi = łącznik NIEUSTALONY (`unknown`).
 * Uziemnik nie jest gałęzią — jego stan bierze się wyłącznie z rekordu aparatu `ES`.
 *
 * BRAK DANEJ = `unknown`, rysowany jawnie (glif kreskowany/półprzezroczysty), nigdy
 * zamknięty z domysłu. Dwie gałęzie tej samej roli o różnych stanach = `unknown`
 * (model nie mówi, który aparat rysuje symbol pola).
 *
 * Martwe źródła, które ta funkcja zastąpiła: `Bay.runtime_state` (pole bez zapisującego
 * w produkcie; lustro typu zostaje w `types/enm.ts`, bo wymusza je strażnik parytetu
 * kontraktu ENM, ale schemat go nie czyta) i zaszyte stałe `closed/closed/open`
 * w adapterze pól źródeł.
 */
import type { Bay, BayDeviceState, BayPrimaryDevice, Branch } from '../../../../types/enm';

/** Stan łącznika rysowany przez glif (`v3/symbols/glyphs.tsx` `SwitchState`). */
export type StanLacznikaRysunku = 'closed' | 'open' | 'unknown';

export interface StanyAparatowPola {
  /** Wyłącznik (symbol `breaker`). */
  readonly cbState: StanLacznikaRysunku;
  /** Odłącznik albo rozłącznik (symbole `disconnector`/`loadBreakSwitch`). */
  readonly dsState: StanLacznikaRysunku;
  /** Uziemnik (symbol `earthSwitch`). */
  readonly esState: StanLacznikaRysunku;
  /** Łącznik główny pola (sprzęgło sekcji): wyłącznik, gdy pole ma gałąź wyłącznika,
   *  inaczej odłącznik/rozłącznik — ten aparat rozstrzyga, czy pole łączy. */
  readonly glownyLacznik: StanLacznikaRysunku;
}

type RolaLacznika = 'cb' | 'ds';

/** Rola symbolu pola dla typu gałęzi łączeniowej ENM (bezpiecznik nie ma stanu w symbolu). */
const ROLA_TYPU_GALEZI: Readonly<Record<string, RolaLacznika>> = {
  breaker: 'cb',
  disconnector: 'ds',
  switch: 'ds',
  bus_coupler: 'ds',
};

function stanRekordu(stan: BayDeviceState | undefined): StanLacznikaRysunku {
  if (stan === 'zamkniety' || stan === 'zamkniety_naped_rozbrojony') return 'closed';
  if (stan === 'otwarty' || stan === 'otwarty_naped_rozbrojony') return 'open';
  return 'unknown';
}

function zgodny(stany: readonly StanLacznikaRysunku[]): StanLacznikaRysunku {
  if (stany.length === 0) return 'unknown';
  return stany.every((s) => s === stany[0]) ? stany[0] : 'unknown';
}

/** Stan rysunku ze `status` gałęzi łączeniowej; brak albo inna wartość = `unknown`. */
export function stanStatusuGalezi(status: string | null | undefined): StanLacznikaRysunku {
  return status === 'closed' ? 'closed' : status === 'open' ? 'open' : 'unknown';
}

/**
 * Typy gałęzi rysowanych jako łącznik NA TORZE ciągu SN (poza polem stacji,
 * `v3/scene/elementyToru.ts`). Ten sam zbiór wybiera symbol toru i stan łącznika toru
 * w inspektorze (`stanLacznikaToruZModelu`).
 */
export const TYPY_GALEZI_LACZNIKA_TORU: ReadonlySet<string> = new Set(['switch', 'breaker']);

/**
 * Stan łącznika TORU o refie `ref` (gałąź łączeniowa ciągu, bez pola stacji) — ten sam
 * rachunek co glif toru: `status` gałęzi. Ref innej gałęzi albo nieznany ⇒ `undefined`.
 */
export function stanLacznikaToruZModelu(
  ref: string,
  galezieWgRef: ReadonlyMap<string, Branch>,
): StanLacznikaRysunku | undefined {
  const galaz = galezieWgRef.get(ref);
  return galaz && TYPY_GALEZI_LACZNIKA_TORU.has(galaz.type) ? stanStatusuGalezi(galaz.status) : undefined;
}

/** Stan gałęzi łączeniowej po rozstrzygnięciu rekordami aparatów z nią powiązanych. */
function stanGalezi(galaz: Branch, aparaty: readonly BayPrimaryDevice[]): StanLacznikaRysunku {
  const zModelu = stanStatusuGalezi(galaz.status);
  for (const aparat of aparaty) {
    if (aparat.linked_ref !== galaz.ref_id || !aparat.switch_state) continue;
    if (stanRekordu(aparat.switch_state.actual_state) !== zModelu) return 'unknown';
  }
  return zModelu;
}

/**
 * Stan gałęzi łączeniowej rozstrzygnięty rekordami aparatów jej pola (`status` gałęzi; rekord
 * aparatu powiązany `linked_ref`, sprzeczny ze statusem ⇒ `unknown`, jak K6a). Wejście
 * sprzęgła sekcji (`sprzeglaSekcji.ts`) — ta sama reguła co łącznik pola, bez drugiej.
 */
export function stanGaleziPola(galaz: Branch, aparatyPola: readonly BayPrimaryDevice[]): StanLacznikaRysunku {
  return stanGalezi(galaz, aparatyPola);
}

/**
 * Stan JEDNEGO aparatu pierwotnego pola z modelu: aparat powiązany (`linked_ref`) z gałęzią
 * łączeniową migawki → `status` tej gałęzi rozstrzygnięty rekordami aparatów (jak wyżej);
 * aparat bez gałęzi łączeniowej (uziemnik, aparat bez powiązania) → jego rekord
 * `switch_state`; bez rekordu → `undefined` (glif rysuje `unknown`, nie stan z domysłu).
 */
export function stanAparatuZModelu(
  aparat: BayPrimaryDevice,
  aparatyPola: readonly BayPrimaryDevice[],
  galezieWgRef: ReadonlyMap<string, Branch>,
): StanLacznikaRysunku | undefined {
  const galaz = aparat.linked_ref ? galezieWgRef.get(aparat.linked_ref) : undefined;
  if (galaz && ROLA_TYPU_GALEZI[galaz.type]) return stanGalezi(galaz, aparatyPola);
  return aparat.switch_state ? stanRekordu(aparat.switch_state.actual_state) : undefined;
}

/**
 * Stan łącznika o refie `ref` w polu `bay` z modelu — wejście inspektora obiektu kanwy
 * (`sld/shared/daneElementuKanwy.ts`), TEN SAM rachunek co glif kanwy, bez drugiej reguły:
 * aparat pierwotny pola → `stanAparatuZModelu`; gałąź łączeniowa pola wskazana w
 * `equipment_refs` (bez rekordu aparatu) → jej `status` rozstrzygnięty rekordami aparatów
 * pola; inny ref (przekładnik, ref samego pola) → `undefined` (model nie niesie stanu).
 */
export function stanLacznikaPolaZModelu(
  ref: string,
  bay: Pick<Bay, 'equipment_refs' | 'primary_devices'>,
  galezieWgRef: ReadonlyMap<string, Branch>,
): StanLacznikaRysunku | undefined {
  const aparaty = bay.primary_devices ?? [];
  const aparat = aparaty.find((a) => a.device_ref === ref);
  if (aparat) return stanAparatuZModelu(aparat, aparaty, galezieWgRef);
  const galaz = (bay.equipment_refs ?? []).includes(ref) ? galezieWgRef.get(ref) : undefined;
  return galaz && ROLA_TYPU_GALEZI[galaz.type] ? stanGalezi(galaz, aparaty) : undefined;
}

/**
 * Stany łączników pola z modelu (`galezieWgRef` — gałęzie migawki wg `ref_id`).
 * Czysta funkcja: ta sama migawka → te same stany.
 */
export function stanyAparatowPolaZModelu(
  bay: Pick<Bay, 'equipment_refs' | 'primary_devices'>,
  galezieWgRef: ReadonlyMap<string, Branch>,
): StanyAparatowPola {
  const aparaty = bay.primary_devices ?? [];
  const refy = new Set<string>([
    ...(bay.equipment_refs ?? []),
    ...aparaty.map((a) => a.linked_ref).filter((r): r is string => typeof r === 'string' && r !== ''),
  ]);
  const stanyRoli: Record<RolaLacznika, StanLacznikaRysunku[]> = { cb: [], ds: [] };
  [...refy].sort().forEach((ref) => {
    const galaz = galezieWgRef.get(ref);
    const rola = galaz ? ROLA_TYPU_GALEZI[galaz.type] : undefined;
    if (!galaz || !rola) return;
    stanyRoli[rola].push(stanGalezi(galaz, aparaty));
  });
  const uziemniki = aparaty.filter((a) => a.kind === 'ES');
  const esState =
    uziemniki.length > 0 && uziemniki.every((a) => a.switch_state)
      ? zgodny(uziemniki.map((a) => stanRekordu(a.switch_state?.actual_state)))
      : 'unknown';
  const cbState = zgodny(stanyRoli.cb);
  const dsState = zgodny(stanyRoli.ds);
  return { cbState, dsState, esState, glownyLacznik: stanyRoli.cb.length > 0 ? cbState : dsState };
}
