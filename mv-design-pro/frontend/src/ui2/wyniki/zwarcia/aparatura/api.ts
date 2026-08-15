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
 */

/** Znamiona wytrzymałości pozycji katalogowej — każda liczba z pochodzeniem. */
export interface ZnamionaWytrzymalosci {
  readonly i_dyn_ka: number | null;
  readonly i_dyn_pochodzenie: string | null;
  readonly i_th_ka: number | null;
  readonly i_th_duration_s: number | null;
  readonly i_th_pochodzenie: string | null;
}

/** Czas wyłączenia użyty w kryterium cieplnym + jego rozbicie (WHITE BOX). */
export interface CzasWylaczeniaPola {
  readonly t_clearing_s: number | null;
  readonly zrodlo: string | null;
  readonly powod_pl: string;
  readonly czlon_nastawczy_s: number | null;
  readonly czas_wlasny_wylacznika_s: number | null;
  readonly zalozenia_pl: readonly string[];
  readonly kody_gotowosci: readonly string[];
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
  readonly czas_wylaczenia: CzasWylaczeniaPola;
  readonly werdykt: WerdyktWytrzymalosci | null;
  readonly komunikat_pl: string;
  readonly kody_gotowosci: readonly string[];
}

export interface WidokWytrzymalosciAparatury {
  readonly stacja_ref: string;
  readonly stacja_nazwa: string | null;
  readonly status: string;
  readonly pola: readonly PoleWytrzymalosci[];
  readonly kody_gotowosci: readonly string[];
}

export interface ZapytanieWytrzymalosci {
  readonly station_ref: string;
  readonly i_peak_ka: number | null;
  readonly i_thermal_ka: number | null;
  /** Prąd początkowy — potrzebny do czasu z charakterystyki zabezpieczenia. */
  readonly ik_ka: number | null;
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
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as WidokWytrzymalosciAparatury;
}

/**
 * Znacznik maszynowy werdyktu: `true` / `false` / `nieustalone`.
 *
 * „Nieustalone" to NIE jest ocena negatywna — dostaje je wiersz bez werdyktu
 * (aparat spoza katalogu) oraz taki, w którym choć jedno kryterium zostało
 * nierozstrzygnięte (brak znamion albo brak czasu wyłączenia).
 */
export function znacznikWerdyktu(pole: PoleWytrzymalosci): string {
  const werdykt = pole.werdykt;
  if (werdykt === null) return 'nieustalone';
  if (werdykt.i_dyn_ok === null || werdykt.i_th_ok === null) return 'nieustalone';
  return String(werdykt.ok);
}
