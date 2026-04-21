export function canonicalRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'LINIA_IN':
      return 'Pole liniowe wejsciowe';
    case 'LINIA_OUT':
      return 'Pole liniowe wyjsciowe';
    case 'TRANSFORMATOROWE':
      return 'Pole transformatorowe';
    case 'LINIA_ODG':
      return 'Pole odgalezne';
    case 'SPRZEGLO':
      return 'Pole sprzegla';
    case 'POMIAROWE':
      return 'Pole pomiarowe';
    case 'PV_SN':
      return 'Pole zrodlowe PV';
    case 'BESS_SN':
      return 'Pole zrodlowe BESS';
    case 'FW_SN':
      return 'Pole zrodlowe FW';
    default:
      return 'Brak danych';
  }
}

export function integrityStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'kompletny':
      return 'Kompletny';
    case 'po_migracji':
      return 'Po migracji';
    case 'wymaga_uzupelnienia':
      return 'Wymaga uzupelnienia';
    default:
      return 'Brak danych';
  }
}

export function deviceKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'CB':
      return 'Wylacznik';
    case 'LOAD_SWITCH':
      return 'Rozlacznik';
    case 'DS':
      return 'Odlacznik';
    case 'ES':
      return 'Uziemnik';
    case 'CT':
      return 'Przekladnik pradowy';
    case 'VT':
      return 'Przekladnik napieciowy';
    case 'CABLE_HEAD':
      return 'Glowica kablowa';
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
      return kind ?? 'Brak danych';
  }
}

export function switchStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'zamkniety':
      return 'zamkniety';
    case 'otwarty':
      return 'otwarty';
    case 'zamkniety_naped_rozbrojony':
      return 'zamkniety, naped rozbrojony';
    case 'otwarty_naped_rozbrojony':
      return 'otwarty, naped rozbrojony';
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
      return 'Lacznosc poprawna';
    case 'degraded':
      return 'Lacznosc ograniczona';
    case 'offline':
      return 'Brak lacznosci';
    default:
      return 'Brak danych';
  }
}

export function availabilityLabel(status: string | null | undefined): string {
  switch (status) {
    case 'dostepne':
      return 'Dostepne';
    case 'czesciowo_dostepne':
      return 'Czesciowo dostepne';
    case 'czesciowe':
      return 'Czesciowe';
    case 'niedostepne':
      return 'Niedostepne';
    default:
      return 'Brak danych';
  }
}

export function sourceKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'PV':
      return 'Zrodlo PV';
    case 'BESS':
      return 'Zrodlo BESS';
    case 'FW':
      return 'Zrodlo FW';
    default:
      return 'Brak danych';
  }
}

export function commandExecutionStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'oczekuje':
      return 'Oczekuje';
    case 'przyjete':
      return 'Przyjete';
    case 'odrzucone':
      return 'Odrzucone';
    case 'wykonane':
      return 'Wykonane';
    case 'przeterminowane':
      return 'Przeterminowane';
    default:
      return 'Brak danych';
  }
}

export function resultStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'pelny':
      return 'Pelny';
    case 'czesciowy':
      return 'Czesciowy';
    case 'bledny':
      return 'Bledny';
    default:
      return 'Brak danych';
  }
}
