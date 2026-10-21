/*
 * Dostawca WERDYKTÓW WYTRZYMAŁOŚCI APARATURY pól stacji (karta KD-6, poz. 2).
 *
 * DLACZEGO NOWY DOSTAWCA. Ogniwo pytało dotąd o trzy rzeczy osobno: zapisaną
 * konfigurację stacji, katalog wytrzymałości i końcówkę walidacji per pole —
 * czyli montowało werdykt w przeglądarce z kawałków. Skutkiem było twarde
 * uzależnienie od RĘCZNEJ konfiguracji: pole, którego inżynier nie skonfigurował,
 * nie istniało dla oceny, choć model wie, jaki aparat w nim stoi.
 *
 * Teraz jest JEDNA końcówka: `POST /api/cases/{caseId}/enm/wytrzymalosc-aparatury`.
 * Backend czyta pola stacji i pozycje katalogu APARAT_SN z modelu, nakłada
 * zapisaną konfigurację tam, gdzie istnieje, i zwraca gotowe werdykty ze
 * ŹRÓDŁEM każdego wiersza. Prezentacja nic nie porównuje i nic nie skaluje.
 *
 * PRĄDY PER POLE (karta WYTRZYMALOSC-PRAD-POLA): zapytanie niesie stację i ZAPISANY bieg
 * zwarciowy, nie liczby. Prąd każdego pola backend bierze z wiersza tego biegu dla punktu
 * zabudowy pola — dawniej jedna liczba z wybranego punktu szła do wszystkich pól stacji,
 * więc pole innej sekcji dostawało cudzy prąd i cudzy czas wyłączenia. Każdy wiersz
 * niesie dwa rekordy werdyktu wyjaśnialnego (dynamiczny i cieplny).
 */

import type { PropozycjaWartosciRoboczej } from '../../../../ui/catalog/types';
import type { OcenaKryterium } from '../../wzorzec/werdykt';

/** Pochodzenie wartości parametru aparatu — pierwszeństwo rozstrzyga backend (V12K-351). */
export type PochodzenieWartosci = 'KATALOG' | 'PROJEKTANT' | 'PROPOZYCJA';

/**
 * Rozstrzygnięty parametr aparatu (`WartoscRozstrzygnieta.to_dict()` rejestru wartości
 * roboczych): wartość, pochodzenie, propozycja i opis źródła z wpływem na ocenę.
 * `wartosc_robocza` = propozycja albo wartość projektanta (dana przyjęta, nie dana karty).
 */
export interface WartoscParametruAparatu {
  readonly parametr: string;
  readonly nazwa_pl: string;
  readonly wartosc: number | null;
  readonly jednostka: string;
  readonly pochodzenie: PochodzenieWartosci | null;
  readonly pochodzenie_karty: string | null;
  readonly wartosc_robocza: boolean;
  readonly propozycja: PropozycjaWartosciRoboczej | null;
  readonly powod_projektanta_pl: string | null;
  readonly powod_braku_pl: string | null;
  readonly opis_zrodla_pl: string;
}

/** Znamiona wytrzymałości aparatu — każda liczba z pochodzeniem. */
export interface ZnamionaWytrzymalosci {
  readonly i_dyn_ka: number | null;
  readonly i_dyn_pochodzenie: string | null;
  readonly i_th_ka: number | null;
  readonly i_th_duration_s: number | null;
  readonly i_th_pochodzenie: string | null;
  /**
   * Znamionowa zdolność wyłączania zwarciowa I_cu z katalogu (karta SC-IB-ITH-ZRODLA);
   * `null` = katalog jej nie niesie albo aparat jej nie ma (`i_cu_nie_dotyczy`).
   */
  readonly i_cu_ka: number | null;
  readonly i_cu_pochodzenie: string | null;
  /** Rozłącznik, odłącznik, uziemnik, tor szynowy — kryterium wyłączania nie dotyczy. */
  readonly i_cu_nie_dotyczy: boolean;
  /** Bezpiecznik — zdolność wyłączania wobec spodziewanego I″k (nie I_b). */
  readonly bezpiecznik: boolean;
  readonly i_th_duration_pochodzenie: string | null;
  /** Rozstrzygnięcie I_k, t_k i I_p aparatu z modelu (puste dla wskazania z konfiguracji). */
  readonly wartosci: Readonly<Record<string, WartoscParametruAparatu>>;
}

/** Czas wyłączenia użyty w kryterium cieplnym + jego rozbicie (WHITE BOX). */
export interface CzasWylaczeniaPola {
  readonly t_clearing_s: number | null;
  readonly zrodlo: string | null;
  readonly powod_pl: string;
  readonly czlon_nastawczy_s: number | null;
  readonly czas_wlasny_wylacznika_s: number | null;
  /** Rozstrzygnięty czas własny wyłącznika (z pochodzeniem); `null` = czasu nie składano. */
  readonly czas_wlasny: WartoscParametruAparatu | null;
  readonly zalozenia_pl: readonly string[];
  readonly kody_gotowosci: readonly string[];
}

/** Prądy zwarcia w punkcie zabudowy pola — wiersz zapisanego biegu (`null` = brak, z powodem). */
export interface PradyPola {
  readonly punkt_ref: string | null;
  readonly punkt_nazwa: string | null;
  readonly ik_ka: number | null;
  readonly ip_ka: number | null;
  readonly ith_ka: number | null;
  /**
   * Wielkości kryterium wyłączania z TEGO SAMEGO wiersza biegu (karta SC-IB-ITH-ZRODLA):
   * symetryczny prąd wyłączeniowy Ib (`null` = bieg z maszynami bez tb), składowa
   * nieokresowa iDC(tb) (informacyjnie), czas tb biegu i napięcie znamionowe punktu.
   */
  readonly ib_ka: number | null;
  readonly i_dc_ka: number | null;
  readonly tb_s: number | null;
  readonly un_kv: number | null;
  readonly kody_gotowosci: readonly string[];
  readonly powod_pl: string | null;
}

/** Werdykt jądra K7-B. `null` w kryterium = brak podstawy, NIE ocena negatywna. */
export interface WerdyktWytrzymalosci {
  readonly ok: boolean;
  readonly i_dyn_ok: boolean | null;
  readonly i_th_ok: boolean | null;
  readonly message_pl: string;
  readonly utilization_dyn_percent: number | null;
  readonly utilization_th_percent: number | null;
  readonly i_th_effective_ka: number | null;
}

/** Jeden wiersz werdyktu: pole stacji + aparat + skąd ten aparat pochodzi. */
export interface PoleWytrzymalosci {
  readonly pole: string;
  readonly pole_ref: string | null;
  readonly rola: string | null;
  readonly rola_pl: string | null;
  /** `model` = aparat z pozycji katalogu pola; `konfiguracja` = wskazanie ręczne. */
  readonly zrodlo: 'model' | 'konfiguracja';
  readonly aparat_ref: string | null;
  readonly aparat_nazwa: string | null;
  readonly aparat_catalog_ref: string;
  readonly aparat_etykieta: string | null;
  readonly znamiona: ZnamionaWytrzymalosci | null;
  readonly prady_pola: PradyPola;
  readonly czas_wylaczenia: CzasWylaczeniaPola;
  readonly werdykt: WerdyktWytrzymalosci | null;
  /**
   * Rekordy K: kryterium dynamiczne, cieplne i zdolności wyłączania (puste dla aparatu spoza
   * katalogu). Rekord wyłączania nazywa porównaną wielkość (Ib albo I″k) i jej normę.
   */
  readonly oceny: readonly OcenaKryterium[];
  readonly komunikat_pl: string;
  readonly kody_gotowosci: readonly string[];
}

export interface WidokWytrzymalosciAparatury {
  readonly stacja_ref: string;
  readonly stacja_nazwa: string | null;
  readonly status: string;
  readonly bieg_zwarciowy_ref: string;
  readonly pola: readonly PoleWytrzymalosci[];
  readonly kody_gotowosci: readonly string[];
}

export interface ZapytanieWytrzymalosci {
  readonly station_ref: string;
  /** Zapisany bieg zwarciowy (scenariusz MAX) — źródło prądów KAŻDEGO pola. */
  readonly short_circuit_run_id: string;
}

export async function pobierzWytrzymaloscAparatury(
  caseId: string,
  zapytanie: ZapytanieWytrzymalosci,
): Promise<WidokWytrzymalosciAparatury> {
  const response = await fetch(
    `/api/cases/${encodeURIComponent(caseId)}/enm/wytrzymalosc-aparatury`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(zapytanie),
    },
  );
  if (!response.ok) {
    // Odmowa backendu niesie powód po polsku (np. bieg scenariusza MIN) — pokazujemy go.
    const tresc = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new Error(
      typeof tresc?.detail === 'string' ? tresc.detail : `HTTP ${response.status}`,
    );
  }
  return (await response.json()) as WidokWytrzymalosciAparatury;
}

/**
 * Znacznik maszynowy werdyktu: `true` / `false` / `nieustalone`.
 *
 * „Nieustalone" to NIE jest ocena negatywna — dostaje je wiersz bez werdyktu
 * (aparat spoza katalogu) oraz taki, w którym choć jedno kryterium zostało
 * nierozstrzygnięte (brak znamion albo brak czasu wyłączenia).
 *
 * Znacznik dotyczy WYTRZYMAŁOŚCI (I_dyn, I_th — werdykt jądra backendu). Zdolność wyłączania
 * (karta SC-IB-ITH-ZRODLA) jest osobnym rekordem K pokazanym kartą werdyktu: prezentacja nie
 * składa agregatu ze statusów maszynowych (kontrakt werdyktu wyjaśnialnego — agregat nie
 * zastępuje kryteriów składowych, a status nie steruje prezentacją).
 */
export function znacznikWerdyktu(pole: PoleWytrzymalosci): string {
  const werdykt = pole.werdykt;
  if (werdykt === null) return 'nieustalone';
  if (werdykt.i_dyn_ok === null || werdykt.i_th_ok === null) return 'nieustalone';
  return String(werdykt.ok);
}
