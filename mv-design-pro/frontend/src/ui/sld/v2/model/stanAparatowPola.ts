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
 * (`BayPrimaryDevice.switch_state`), gdy jest, rozstrzyga tak jak w K6a: stan „nieznany"
 * albo stan sprzeczny ze `status` gałęzi = łącznik NIEUSTALONY (`unknown`); rekord „awaria"
 * = położenie NIEWIAROGODNE (`bad`, rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC —
 * odpowiednik „bad-state" podwójnego wskazania położenia IEC 61850-7-4, własny kafel).
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
import type { Bay, BayDeviceState, BayPrimaryDevice, BayPrimaryDeviceKind, Branch } from '../../../../types/enm';

/** Rodzaj aparatu, którego położeniem może być „uziemiony" (lustro walidatora backendu). */
const RODZAJ_TROJPOLOZENIOWY: BayPrimaryDeviceKind = 'THREE_POSITION_SWITCH';

/** Stan łącznika rysowany przez glif (`v3/symbols/glyphs.tsx` `SwitchState`). `'earthed'`
 *  — WYŁĄCZNIE łącznik trójpołożeniowy w położeniu „uziemiony" (karta
 *  UX-04/POLE-LINIOWE-WZORZEC); tor pola jest wtedy otwarty. */
export type StanLacznikaRysunku = 'closed' | 'open' | 'unknown' | 'earthed' | 'bad';

/** Opis położenia łącznika po polsku — dymek kafla stanu (`v3/symbols/glyphs.tsx`), inspektor
 *  obiektu kanwy i karta techniczna elementu. JEDNA mapa (rozszerzenie 5 karty
 *  UX-04/POLE-LINIOWE-WZORZEC); dawne kopie w `kartaTechnicznaElementu.ts`
 *  i `PanelElementuKanwy.tsx` skasowane. */
export const OPIS_POLOZENIA_PL: Readonly<Record<StanLacznikaRysunku, string>> = {
  closed: 'zamknięty',
  open: 'otwarty',
  earthed: 'uziemiony',
  unknown: 'nieustalony (model niejednoznaczny)',
  bad: 'awaria aparatu (położenie niewiarygodne)',
};

/** Stan łącznika dwupołożeniowego (wyłącznik, odłącznik, rozłącznik, uziemnik, gałąź
 *  łączeniowa) — położenie „uziemiony" go nie dotyczy. */
export type StanLacznikaDwupolozeniowego = 'closed' | 'open' | 'unknown' | 'bad';

export interface StanyAparatowPola {
  /** Wyłącznik (symbol `breaker`). */
  readonly cbState: StanLacznikaDwupolozeniowego;
  /** Odłącznik albo rozłącznik (symbole `disconnector`/`loadBreakSwitch`). */
  readonly dsState: StanLacznikaDwupolozeniowego;
  /** Uziemnik (symbol `earthSwitch`). */
  readonly esState: StanLacznikaDwupolozeniowego;
  /** Łącznik główny pola (sprzęgło sekcji): wyłącznik, gdy pole ma gałąź wyłącznika,
   *  inaczej odłącznik/rozłącznik — ten aparat rozstrzyga, czy pole łączy. */
  readonly glownyLacznik: StanLacznikaDwupolozeniowego;
}

type RolaLacznika = 'cb' | 'ds';

/** Rola symbolu pola dla typu gałęzi łączeniowej ENM w ZBIORCZYCH stanach pola
 *  (`stanyAparatowPolaZModelu`: wyłącznik / odłącznik-rozłącznik / łącznik główny sylwetki).
 *  Bezpiecznik nie tworzy tych ról (rozłącznik bezpiecznikowy nie jest ani wyłącznikiem,
 *  ani odłącznikiem sylwetki stacji), ale ma własne położenie — patrz `czyGalazZPolozeniem`. */
const ROLA_TYPU_GALEZI: Readonly<Record<string, RolaLacznika>> = {
  breaker: 'cb',
  disconnector: 'ds',
  switch: 'ds',
  bus_coupler: 'ds',
};

/** Gałąź łączeniowa z POŁOŻENIEM rysowanym na symbolu aparatu: role wyżej + bezpiecznik
 *  (`FuseBranch.status`, operacje `open_switch`/`close_switch` — `TYPY_LACZNIKOW_ENM`).
 *  Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC: dawniej aparat powiązany z bezpiecznikiem
 *  nie dostawał stanu gałęzi, choć adapter stacji go rysował (dwie reguły jednego stanu). */
function czyGalazZPolozeniem(galaz: Branch): boolean {
  return ROLA_TYPU_GALEZI[galaz.type] !== undefined || galaz.type === 'fuse';
}

function stanRekordu(stan: BayDeviceState | undefined): StanLacznikaRysunku {
  if (stan === 'zamkniety' || stan === 'zamkniety_naped_rozbrojony') return 'closed';
  if (stan === 'otwarty' || stan === 'otwarty_naped_rozbrojony') return 'open';
  // Karta UX-04/POLE-LINIOWE-WZORZEC: położenie łącznika trójpołożeniowego (walidacja
  // backendu `BayPrimaryDevice` dopuszcza je wyłącznie dla tego rodzaju).
  if (stan === 'uziemiony') return 'earthed';
  // Rozszerzenie 5: awaria aparatu — położenie niewiarygodne (własny kafel), nie „nieznany".
  if (stan === 'awaria') return 'bad';
  return 'unknown';
}

/** Stan rekordu łącznika dwupołożeniowego: „uziemiony" nie jest jego położeniem (rekord
 *  sprzeczny z rodzajem aparatu) — rysowany jako nieustalony, nie jako otwarty z domysłu. */
function stanRekorduDwupolozeniowego(stan: BayDeviceState | undefined): StanLacznikaDwupolozeniowego {
  const wynik = stanRekordu(stan);
  return wynik === 'earthed' ? 'unknown' : wynik;
}

function zgodny(stany: readonly StanLacznikaDwupolozeniowego[]): StanLacznikaDwupolozeniowego {
  if (stany.length === 0) return 'unknown';
  return stany.every((s) => s === stany[0]) ? stany[0] : 'unknown';
}

/** Stan rysunku ze `status` gałęzi łączeniowej; brak albo inna wartość = `unknown`. */
export function stanStatusuGalezi(status: string | null | undefined): StanLacznikaDwupolozeniowego {
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
): StanLacznikaDwupolozeniowego | undefined {
  const galaz = galezieWgRef.get(ref);
  return galaz && TYPY_GALEZI_LACZNIKA_TORU.has(galaz.type) ? stanStatusuGalezi(galaz.status) : undefined;
}

/** Stan gałęzi łączeniowej po rozstrzygnięciu rekordami aparatów z nią powiązanych. */
function stanGalezi(galaz: Branch, aparaty: readonly BayPrimaryDevice[]): StanLacznikaDwupolozeniowego {
  const zModelu = stanStatusuGalezi(galaz.status);
  for (const aparat of aparaty) {
    if (aparat.linked_ref !== galaz.ref_id || !aparat.switch_state) continue;
    const zRekordu = stanRekordu(aparat.switch_state.actual_state);
    // Awaria zgłoszona rekordem aparatu ma pierwszeństwo przed `status` gałęzi: położenie
    // jest niewiarygodne niezależnie od pozycji zapisanej w modelu.
    if (zRekordu === 'bad') return 'bad';
    if (zRekordu !== zModelu) return 'unknown';
  }
  return zModelu;
}

/**
 * Stan gałęzi łączeniowej rozstrzygnięty rekordami aparatów jej pola (`status` gałęzi; rekord
 * aparatu powiązany `linked_ref`, sprzeczny ze statusem ⇒ `unknown`, jak K6a). Wejście
 * sprzęgła sekcji (`sprzeglaSekcji.ts`) — ta sama reguła co łącznik pola, bez drugiej.
 */
export function stanGaleziPola(galaz: Branch, aparatyPola: readonly BayPrimaryDevice[]): StanLacznikaDwupolozeniowego {
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
  if (galaz && czyGalazZPolozeniem(galaz)) return stanGalezi(galaz, aparatyPola);
  if (!aparat.switch_state) return undefined;
  // „Uziemiony" jest położeniem WYŁĄCZNIE łącznika trójpołożeniowego (walidator backendu
  // `BayPrimaryDevice`); rekord innego łącznika w tym położeniu jest sprzeczny z rodzajem
  // aparatu — rysowany jako nieustalony, nie jako uziemiony (ta sama reguła co
  // `stanRekorduDwupolozeniowego`).
  return aparat.kind === RODZAJ_TROJPOLOZENIOWY
    ? stanRekordu(aparat.switch_state.actual_state)
    : stanRekorduDwupolozeniowego(aparat.switch_state.actual_state);
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
  return galaz && czyGalazZPolozeniem(galaz) ? stanGalezi(galaz, aparaty) : undefined;
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
  const stanyRoli: Record<RolaLacznika, StanLacznikaDwupolozeniowego[]> = { cb: [], ds: [] };
  [...refy].sort().forEach((ref) => {
    const galaz = galezieWgRef.get(ref);
    const rola = galaz ? ROLA_TYPU_GALEZI[galaz.type] : undefined;
    if (!galaz || !rola) return;
    stanyRoli[rola].push(stanGalezi(galaz, aparaty));
  });
  const uziemniki = aparaty.filter((a) => a.kind === 'ES');
  const esState =
    uziemniki.length > 0 && uziemniki.every((a) => a.switch_state)
      ? zgodny(uziemniki.map((a) => stanRekorduDwupolozeniowego(a.switch_state?.actual_state)))
      : 'unknown';
  const cbState = zgodny(stanyRoli.cb);
  const dsState = zgodny(stanyRoli.ds);
  return { cbState, dsState, esState, glownyLacznik: stanyRoli.cb.length > 0 ? cbState : dsState };
}
