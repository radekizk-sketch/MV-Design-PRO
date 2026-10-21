/**
 * Współczynnik napięciowy c scenariusza zwarciowego — model formularza (bez fizyki).
 *
 * Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK (decyzja O-59): scenariusz zwarciowy jest JEDYNYM
 * nośnikiem c. Inżynier wybiera scenariusz MAX albo MIN (kolumna tabeli 1 IEC 60909-0);
 * liczbę c dobiera backend PER WĘZEŁ z pasma napięcia węzła. Ręczne nadpisanie jest
 * dopuszczalne wyłącznie z uzasadnieniem — tę samą odmowę podnosi backend
 * (`fault.c_nadpisanie_bez_uzasadnienia`), formularz blokuje ją wcześniej, żeby
 * inżynier nie dostał 422 za brak tekstu.
 *
 * Ten moduł NICZEGO nie liczy: składa pola formularza w kontrakt
 * `ShortCircuitConfig` i tłumaczy kody odmów backendu na zdanie po polsku.
 */

import type { NadpisanieC, ScenariuszC, ShortCircuitConfig } from './types';

/** Pola formularza sekcji „Współczynnik napięciowy c" (wartości tekstowe z kontrolek). */
export interface PolaWspolczynnikaC {
  scenariusz: ScenariuszC;
  nadpisz: boolean;
  wartoscC: string;
  uzasadnienie: string;
}

export const DOMYSLNE_POLA_C: PolaWspolczynnikaC = {
  scenariusz: 'MAX',
  nadpisz: false,
  wartoscC: '',
  uzasadnienie: '',
};

/** Kody odmów backendu (`network_model/core/voltage_factor.py`, rejestr gotowości). */
export const KOD_NADPISANIE_BEZ_UZASADNIENIA = 'fault.c_nadpisanie_bez_uzasadnienia';
export const KOD_NADPISANIE_WARTOSC_NIEPOPRAWNA = 'fault.c_nadpisanie_wartosc_niepoprawna';

/** Zdanie PL dla kodu odmowy — to samo brzmienie, które formularz pokazuje przed wysłaniem. */
export const KOMUNIKAT_KODU_C: Readonly<Record<string, string>> = {
  [KOD_NADPISANIE_BEZ_UZASADNIENIA]:
    'Nadpisanie współczynnika napięciowego c wymaga uzasadnienia — IEC 60909-0 dopuszcza wartość spoza tabeli 1 tylko z konkretnego powodu (np. uzgodnienie z operatorem, ograniczenie c·Un ≤ Um).',
  [KOD_NADPISANIE_WARTOSC_NIEPOPRAWNA]:
    'Wartość nadpisania współczynnika napięciowego c musi być skończoną liczbą dodatnią.',
};

export type WynikNadpisaniaC =
  | { ok: true; nadpisanie_c: NadpisanieC | null }
  | { ok: false; kod: string; blad: string };

/**
 * Nadpisanie c z pól formularza. Brak zaznaczenia = `null` (c z tabeli 1 per węzeł).
 * Zaznaczone nadpisanie bez uzasadnienia albo z wartością niebędącą dodatnią liczbą
 * skończoną = odmowa z tym samym kodem, którym odmówiłby backend.
 */
export function nadpisanieCZPol(pola: PolaWspolczynnikaC): WynikNadpisaniaC {
  if (!pola.nadpisz) return { ok: true, nadpisanie_c: null };
  const tekst = pola.wartoscC.trim().replace(',', '.');
  const wartosc = tekst === '' ? Number.NaN : Number(tekst);
  if (!Number.isFinite(wartosc) || wartosc <= 0) {
    return {
      ok: false,
      kod: KOD_NADPISANIE_WARTOSC_NIEPOPRAWNA,
      blad: KOMUNIKAT_KODU_C[KOD_NADPISANIE_WARTOSC_NIEPOPRAWNA],
    };
  }
  const uzasadnienie = pola.uzasadnienie.trim();
  if (!uzasadnienie) {
    return {
      ok: false,
      kod: KOD_NADPISANIE_BEZ_UZASADNIENIA,
      blad: KOMUNIKAT_KODU_C[KOD_NADPISANIE_BEZ_UZASADNIENIA],
    };
  }
  return { ok: true, nadpisanie_c: { wartosc, uzasadnienie } };
}

/** Kod odmowy backendu dla niepoprawnego t_b (`network_model.core.czas_wylaczenia`). */
export const KOD_CZAS_TB_NIEPOPRAWNY = 'fault.czas_tb_niepoprawny';
export const KOMUNIKAT_CZAS_TB_NIEPOPRAWNY =
  'Czas wyłączenia t_b musi być liczbą dodatnią w sekundach (najkrótszy czas zadziałania zabezpieczenia + czas własny wyłącznika) — albo zostaw pole puste.';

export type WynikCzasuWylaczenia =
  | { ok: true; wartosc: number | null }
  | { ok: false; kod: string; blad: string };

/**
 * Czas wyłączenia t_b z pola formularza (karta SC-IB-ITH-ZRODLA) — ta sama reguła danych co
 * backend (`czas_tb_z_danych`): puste pole = brak danej (`null`, bieg z założeniem
 * `fault.czas_tb_brak`), liczba skończona dodatnia = t_b, cokolwiek innego = odmowa.
 */
export function czasWylaczeniaZPola(tekst: string): WynikCzasuWylaczenia {
  const surowy = tekst.trim();
  if (surowy === '') return { ok: true, wartosc: null };
  const wartosc = Number(surowy.replace(',', '.'));
  if (!Number.isFinite(wartosc) || wartosc <= 0) {
    return { ok: false, kod: KOD_CZAS_TB_NIEPOPRAWNY, blad: KOMUNIKAT_CZAS_TB_NIEPOPRAWNY };
  }
  return { ok: true, wartosc };
}

export type WynikKonfiguracjiZwarcia =
  | { ok: true; config: ShortCircuitConfig }
  | { ok: false; kod: string; blad: string };

/** Pełna konfiguracja scenariusza (kontrakt `ShortCircuitConfigRequest`, extra=forbid). */
export function konfiguracjaZwarciaZPol(
  pola: PolaWspolczynnikaC,
  thermalTimeSeconds: number,
  includeBranchContributions: boolean,
  czasWylaczenia: string,
): WynikKonfiguracjiZwarcia {
  const nadpisanie = nadpisanieCZPol(pola);
  if (!nadpisanie.ok) return nadpisanie;
  const tb = czasWylaczeniaZPola(czasWylaczenia);
  if (!tb.ok) return tb;
  return {
    ok: true,
    config: {
      scenariusz: pola.scenariusz,
      nadpisanie_c: nadpisanie.nadpisanie_c,
      thermal_time_seconds: thermalTimeSeconds,
      // Pole addytywne: wysyłane wyłącznie z wartością (backend `exclude_none`).
      ...(tb.wartosc === null ? {} : { breaking_time_seconds: tb.wartosc }),
      include_branch_contributions: includeBranchContributions,
    },
  };
}

/** Tekst pola t_b z zapisanej konfiguracji (edycja scenariusza): brak danej = pole puste. */
export function poleCzasuWylaczenia(config: ShortCircuitConfig | null | undefined): string {
  const tb = config?.breaking_time_seconds;
  return tb === null || tb === undefined ? '' : String(tb);
}

/** Opis t_b scenariusza na liście — wartość albo jawny brak z drogą naprawy. */
export function opisCzasuWylaczenia(config: ShortCircuitConfig | null | undefined): string {
  const tb = config?.breaking_time_seconds;
  if (tb === null || tb === undefined) return 'nie podano (Ib przy maszynach i iDC nieobliczone)';
  return `${String(tb).replace('.', ',')} s`;
}

/** Pola formularza z zapisanej konfiguracji (edycja istniejącego scenariusza). */
export function polaCZKonfiguracji(config: ShortCircuitConfig | null | undefined): PolaWspolczynnikaC {
  if (!config) return { ...DOMYSLNE_POLA_C };
  return {
    scenariusz: config.scenariusz,
    nadpisz: config.nadpisanie_c != null,
    wartoscC: config.nadpisanie_c != null ? String(config.nadpisanie_c.wartosc) : '',
    uzasadnienie: config.nadpisanie_c?.uzasadnienie ?? '',
  };
}

/** Opis c scenariusza na liście (bez liczby c — ta zależy od węzła). */
export function opisCScenariusza(config: ShortCircuitConfig | null | undefined): string {
  if (!config) return '—';
  if (config.nadpisanie_c) {
    return `nadpisanie c = ${String(config.nadpisanie_c.wartosc).replace('.', ',')} — ${config.nadpisanie_c.uzasadnienie}`;
  }
  return `${config.scenariusz} — IEC 60909-0 tab. 1 per węzeł`;
}

/**
 * Komunikat błędu odpowiedzi backendu po polsku z CIAŁA odpowiedzi. Postać odmowy:
 *  - odmowa nazwana (partia integracji 10, `api/odmowa_http.pola_odmowy`): `detail` to
 *    zdanie PL bez kodu maszynowego, `kod` stoi w osobnym polu ciała — znany kod c →
 *    brzmienie z `KOMUNIKAT_KODU_C` (to samo, które formularz pokazuje przed wysłaniem),
 *    inny kod → zdanie z `detail`;
 *  - lista błędów walidacji schematu (pydantic, 422: `detail: [{loc, msg, type}]`);
 *  - zwykły napis PL w `detail`.
 */
export function komunikatBleduApi(cialo: unknown, zapasowy: string): string {
  const { detail, kod } = (cialo && typeof cialo === 'object' ? cialo : {}) as {
    detail?: unknown;
    kod?: unknown;
  };
  if (typeof kod === 'string' && KOMUNIKAT_KODU_C[kod]) return KOMUNIKAT_KODU_C[kod];
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const opisy = detail.map((wpis) => {
      if (wpis && typeof wpis === 'object') {
        const { loc, msg } = wpis as { loc?: unknown; msg?: unknown };
        const pole = Array.isArray(loc) ? loc.filter((x) => x !== 'body').join('.') : '';
        const tresc = typeof msg === 'string' ? msg : JSON.stringify(wpis);
        return pole ? `${pole}: ${tresc}` : tresc;
      }
      return String(wpis);
    });
    return `Backend odrzucił dane — ${opisy.join('; ')}`;
  }
  return zapasowy;
}
