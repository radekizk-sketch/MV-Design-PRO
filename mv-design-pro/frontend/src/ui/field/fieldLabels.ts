export function integrityStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'kompletny':
      return 'Kompletny';
    case 'po_migracji':
      return 'Po migracji';
    case 'wymaga_uzupelnienia':
      return 'Wymaga uzupełnienia';
    default:
      return 'Zakres do konfiguracji';
  }
}

export function deviceKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'CB':
      return 'Wyłącznik';
    case 'LOAD_SWITCH':
      return 'Rozłącznik';
    case 'DS':
      return 'Odłącznik';
    case 'ES':
      return 'Uziemnik';
    case 'CT':
      return 'Przekładnik prądowy';
    case 'VT':
      return 'Przekładnik napięciowy';
    case 'CABLE_HEAD':
      return 'Głowica kablowa';
    case 'TRANSFORMER_DEVICE':
      return 'Transformator';
    case 'FUSE':
      return 'Bezpiecznik';
    case 'GENERATOR_PV':
      return 'Generator PV';
    case 'GENERATOR_BESS':
      return 'Generator BESS';
    case 'GENERATOR_FW':
      return 'Generator FW';
    case 'PCS':
      return 'PCS';
    case 'BATTERY':
      return 'Bateria';
    default:
      return kind ?? 'Aparat do wyboru';
  }
}

export function switchStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'zamkniety':
      return 'zamknięty';
    case 'otwarty':
      return 'otwarty';
    case 'zamkniety_naped_rozbrojony':
      return 'zamknięty, napęd rozbrojony';
    case 'otwarty_naped_rozbrojony':
      return 'otwarty, napęd rozbrojony';
    case 'nieznany':
      return 'stan nieznany';
    case 'awaria':
      return 'awaria';
    default:
      return 'bez stanu';
  }
}

/**
 * Jedyna etykieta braku źródła runtime stanu ruchowego pola i aparatu (karta #135).
 * Narzędzie projektowe nie ma telemetrii: bez rekordu źródła (`Bay.runtime_state`, rekord
 * `switch_state` aparatu) interfejs pokazuje TĘ etykietę — nigdy wartości domyślnej
 * („Komunikacja: OK", „tryb zdalny", „nieaktywne").
 */
export const BRAK_TELEMETRII = 'brak telemetrii';

export function communicationStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'ok':
      return 'Łączność poprawna';
    case 'degraded':
      return 'Łączność ograniczona';
    case 'offline':
      return 'Brak łączności';
    default:
      return BRAK_TELEMETRII;
  }
}

/** Tryb sterowania aparatu (`BaySwitchState.control_mode`) — `null` = brak telemetrii. */
export function controlModeLabel(mode: string | null | undefined): string {
  switch (mode) {
    case 'miejscowe':
      return 'miejscowe';
    case 'zdalne':
      return 'zdalne';
    case 'lokalne_zablokowane':
      return 'lokalne, zablokowane';
    case 'odstawione':
      return 'odstawione';
    default:
      return BRAK_TELEMETRII;
  }
}

/** Komunikacja z aparatem (`BaySwitchState.communication_ok`) — `null` = brak telemetrii. */
export function communicationOkLabel(ok: boolean | null | undefined): string {
  if (ok === true) return 'OK';
  if (ok === false) return 'BŁĄD';
  return BRAK_TELEMETRII;
}

/**
 * Blokada zamknięcia z reguły modelu (`BaySwitchState.interlock_blocked`) — `null` = reguła
 * nie rozstrzyga (stan aparatu przeciwnego nieznany); to nie jest telemetria.
 */
export function interlockBlockedLabel(blocked: boolean | null | undefined): string {
  if (blocked === true) return 'aktywne';
  if (blocked === false) return 'nieaktywne';
  return 'nieustalone';
}

export function availabilityLabel(status: string | null | undefined): string {
  switch (status) {
    case 'dostepne':
      return 'Dostępne';
    case 'czesciowo_dostepne':
      return 'Częściowo dostępne';
    case 'czesciowe':
      return 'Częściowe';
    case 'niedostepne':
      return 'Niedostępne';
    default:
      return BRAK_TELEMETRII;
  }
}

export function sourceKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'PV':
      return 'Źródło PV';
    case 'BESS':
      return 'Źródło BESS';
    case 'FW':
      return 'Źródło FW';
    default:
      return 'Typ źródła do wyboru';
  }
}

export function commandExecutionStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'oczekuje':
      return 'Oczekuje';
    case 'przyjete':
      return 'Przyjęte';
    case 'odrzucone':
      return 'Odrzucone';
    case 'wykonane':
      return 'Wykonane';
    case 'przeterminowane':
      return 'Przeterminowane';
    default:
      return 'Stan polecenia do sprawdzenia';
  }
}

export function resultStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'pelny':
      return 'Pełny';
    case 'czesciowy':
      return 'Częściowy';
    case 'bledny':
      return 'Błędny';
    default:
      return 'Wynik do wyliczenia';
  }
}
