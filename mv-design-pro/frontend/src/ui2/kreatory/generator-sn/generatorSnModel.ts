/**
 * Model kreatora „Dodaj generator synchroniczny SN" — operacja domenowa `add_generator_sn`.
 *
 * Generator synchroniczny dołączony WPROST do szyny SN (bez przekształtnika i bez
 * transformatora blokowego). Tabliczka znamionowa (Sn, Un, granice mocy biernej) pochodzi
 * z typu katalogu GENERATOR_SN albo — gdy katalog nie ma maszyny projektanta — z tabliczki
 * podanej ręcznie (`manual_params`, tryb EKSPERCKI_RECZNY, ZASADA NR 4). Tryb rozstrzyga
 * OBECNOŚĆ referencji katalogowej — ten sam predykat co backend: w trybie katalogowym
 * ładunek nie niesie `manual_params`, w ręcznym nie niesie `catalog_ref`.
 *
 * Moc czynna P jest NASTAWĄ STUDIUM (nie polem katalogu). Tryb pracy: stała moc bierna
 * (`q_mvar`, opcjonalnie) albo regulacja napięcia (`control_mode: REGULACJA_NAPIECIA`,
 * `u_set_pu`, granice Q z formularza albo z tabliczki). ZERO fizyki w UI.
 */

export type TrybTabliczki = 'katalog' | 'reczna';
export type TrybPracyGeneratora = 'stala_moc_bierna' | 'regulacja_napiecia';

export interface GeneratorSnFormData {
  tryb_tabliczki: TrybTabliczki;
  catalog_ref: string | null;
  rated_mva: number | null;
  rated_kv: number | null;
  tabliczka_q_min_mvar: number | null;
  tabliczka_q_max_mvar: number | null;
  p_mw: number | null;
  tryb_pracy: TrybPracyGeneratora;
  q_mvar: number | null;
  u_set_pu: number | null;
  q_min_mvar: number | null;
  q_max_mvar: number | null;
  nazwa: string;
}

export const DANE_DOMYSLNE: GeneratorSnFormData = {
  tryb_tabliczki: 'katalog',
  catalog_ref: null,
  rated_mva: null,
  rated_kv: null,
  tabliczka_q_min_mvar: null,
  tabliczka_q_max_mvar: null,
  p_mw: null,
  tryb_pracy: 'stala_moc_bierna',
  q_mvar: null,
  u_set_pu: 1.0,
  q_min_mvar: null,
  q_max_mvar: null,
  nazwa: '',
};

export interface KontekstGeneratora {
  bus_ref?: string;
  bus_name?: string;
  bus_voltage_kv?: number;
}

export interface BladPola {
  field: string;
  message: string;
}

export function maSzyne(kontekst: KontekstGeneratora): boolean {
  return Boolean(kontekst.bus_ref?.trim());
}

function dodatnia(v: number | null): v is number {
  return v !== null && Number.isFinite(v) && v > 0;
}

/** Granice Q do regulacji napięcia: formularz ma pierwszeństwo, potem tabliczka ręczna
 *  (tabliczkę katalogu dokłada backend — nie jest tu znana, więc nie blokuje zapisu). */
function graniceQ(data: GeneratorSnFormData): [number | null, number | null] {
  return [
    data.q_min_mvar ?? (data.tryb_tabliczki === 'reczna' ? data.tabliczka_q_min_mvar : null),
    data.q_max_mvar ?? (data.tryb_tabliczki === 'reczna' ? data.tabliczka_q_max_mvar : null),
  ];
}

export function walidujFormularz(data: GeneratorSnFormData): BladPola[] {
  const bledy: BladPola[] = [];
  if (data.tryb_tabliczki === 'katalog') {
    if (!data.catalog_ref?.trim()) {
      bledy.push({ field: 'catalog_ref', message: 'Wybierz typ generatora z katalogu albo podaj tabliczkę ręcznie.' });
    }
  } else if (!dodatnia(data.rated_mva)) {
    bledy.push({ field: 'rated_mva', message: 'Podaj dodatnią moc pozorną znamionową $S_{n}$.' });
  }
  if (!dodatnia(data.p_mw)) {
    bledy.push({ field: 'p_mw', message: 'Podaj dodatnią moc czynną P generatora (nastawa studium).' });
  }
  if (data.tryb_pracy === 'regulacja_napiecia') {
    if (!dodatnia(data.u_set_pu)) {
      bledy.push({ field: 'u_set_pu', message: 'Regulacja napięcia wymaga dodatniej nastawy U [p.u.].' });
    }
    const [qMin, qMax] = graniceQ(data);
    if (data.tryb_tabliczki === 'reczna' && (qMin === null || qMax === null)) {
      bledy.push({
        field: 'q_min_mvar',
        message: 'Regulacja napięcia wymaga granic mocy biernej Q min i Q max (z formularza albo z tabliczki).',
      });
    } else if (qMin !== null && qMax !== null && qMin >= qMax) {
      bledy.push({ field: 'q_min_mvar', message: 'Q min musi być mniejsze od Q max.' });
    }
  }
  return bledy;
}

/** Ładunek operacji `add_generator_sn` — wyłącznie pola, które operacja czyta. */
export function zbudujPayload(
  data: GeneratorSnFormData,
  kontekst: KontekstGeneratora,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    bus_ref: kontekst.bus_ref,
    p_mw: data.p_mw,
  };
  if (data.nazwa.trim()) payload.name = data.nazwa.trim();
  if (data.tryb_tabliczki === 'katalog') {
    payload.catalog_ref = data.catalog_ref;
  } else {
    const reczne: Record<string, number> = { rated_mva: data.rated_mva as number };
    if (dodatnia(data.rated_kv)) reczne.rated_kv = data.rated_kv;
    if (data.tabliczka_q_min_mvar !== null) reczne.q_min_mvar = data.tabliczka_q_min_mvar;
    if (data.tabliczka_q_max_mvar !== null) reczne.q_max_mvar = data.tabliczka_q_max_mvar;
    payload.manual_params = reczne;
  }
  if (data.tryb_pracy === 'regulacja_napiecia') {
    payload.control_mode = 'REGULACJA_NAPIECIA';
    payload.u_set_pu = data.u_set_pu;
    if (data.q_min_mvar !== null) payload.q_min_mvar = data.q_min_mvar;
    if (data.q_max_mvar !== null) payload.q_max_mvar = data.q_max_mvar;
  } else if (data.q_mvar !== null) {
    payload.q_mvar = data.q_mvar;
  }
  return payload;
}
