export function canonicalRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'LINIA_IN':
      return 'Pole liniowe wejściowe';
    case 'LINIA_OUT':
      return 'Pole liniowe wyjściowe';
    case 'TRANSFORMATOROWE':
      return 'Pole transformatorowe';
    case 'LINIA_ODG':
      return 'Pole odgałęźne';
    case 'SPRZEGLO':
      return 'Pole sprzęgła';
    case 'POMIAROWE':
      return 'Pole pomiarowe';
    case 'PV_SN':
      return 'Pole źródłowe PV';
    case 'BESS_SN':
      return 'Pole źródłowe BESS';
    case 'FW_SN':
      return 'Pole źródłowe FW';
    default:
      return 'Rola pola do wyboru';
  }
}

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

export function communicationStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'ok':
      return 'Łączność poprawna';
    case 'degraded':
      return 'Łączność ograniczona';
    case 'offline':
      return 'Brak łączności';
    default:
      return 'Łączność do sprawdzenia';
  }
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
      return 'Dostępność do sprawdzenia';
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
