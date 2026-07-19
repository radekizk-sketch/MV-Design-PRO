/** Teksty PL kreatora „Dodaj transformator SN/nN" (G-TRF). Język inżynierski. */

export const TRANSFORMATOR_STRINGS = {
  eyebrow: 'MODEL SIECI · TRANSFORMATOR SN/nN',
  cel:
    'Dodaj transformator między szyną SN a szyną nN stacji. Typ (moc, napięcia, uk) '
    + 'bierzesz z katalogu; prądy strony górnej i dolnej liczy backend. '
    + 'Możesz skonfigurować regulację zaczepów (DETC bez obciążenia lub OLTC pod obciążeniem).',
  odznaka: 'Nowy transformator',

  krokSzyny: 'Szyny i typ',
  krokRegulacja: 'Regulacja zaczepów',
  krokZapis: 'Podsumowanie i zapis',

  hvBus: 'Szyna SN (górne napięcie)',
  lvBus: 'Szyna nN (dolne napięcie)',
  busPlaceholder: '— wybierz szynę —',
  typKatalog: 'Typ transformatora z katalogu',
  typKatalogPlaceholder: '— wybierz typ transformatora —',
  typBlad: 'Nie udało się pobrać katalogu transformatorów SN/nN.',
  typPomoc: 'Typ wnosi moc [MVA], napięcia [kV], uk% i zakres zaczepów — z katalogu, nie z ręki.',
  nazwa: 'Nazwa transformatora',
  nazwaPlaceholder: 'np. TR1 stacji ST-3',

  // Parametry katalogu (odczyt).
  paramMoc: 'Moc znamionowa',
  paramNapiecia: 'Napięcia HV/LV',
  paramUk: 'Napięcie zwarcia uk',
  paramZaczepy: 'Zakres zaczepów',

  // Regulacja.
  regTyp: 'Rodzaj regulacji',
  regTypOpcje: [
    { id: 'NONE', etykieta: 'Bez regulacji' },
    { id: 'DETC', etykieta: 'DETC (bez obciążenia)' },
    { id: 'OLTC', etykieta: 'OLTC (pod obciążeniem)' },
  ],
  regUzwojenie: 'Regulowane uzwojenie',
  regUzwojenieOpcje: [
    { id: 'HV', etykieta: 'Górne (SN)' },
    { id: 'LV', etykieta: 'Dolne (nN)' },
  ],
  tapNeutral: 'Zaczep neutralny',
  tapCurrent: 'Zaczep bieżący',
  tapMin: 'Zaczep min.',
  tapMax: 'Zaczep maks.',
  tapStep: 'Krok zaczepu',
  controlMode: 'Tryb sterowania OLTC',
  controlModeOpcje: [
    { id: 'MANUAL', etykieta: 'Ręczny' },
    { id: 'AUTO', etykieta: 'Automatyczny (AVR)' },
  ],
  setpoint: 'Napięcie zadane',
  deadband: 'Pasmo nieczułości',
  regBezPomoc: 'Bez regulacji transformator ma stałą przekładnię znamionową.',
  regAvrPomoc: 'Automatyka (AVR) reguluje zaczep do napięcia zadanego — wynik policzy rozpływ mocy.',

  // Podgląd (R2).
  podgladTytul: 'Podgląd prądów (backend)',
  podgladI1: 'Prąd strony górnej I₁',
  podgladI2: 'Prąd strony dolnej I₂',
  podgladZrodlo: 'Źródło wyniku',
  podgladZrodloWartosc: 'Obliczenie prądów po stronie serwera (R2)',
  podgladBrak: 'Wybierz typ transformatora, aby zobaczyć prądy I₁/I₂.',
  podgladBlad: 'Nie udało się wyznaczyć podglądu prądów.',

  // Downstream.
  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozpływ mocy (z pętlą OLTC, jeśli włączona) i zwarcia (Ik) uwzględnią transformator; '
    + 'badania regulacji OLTC, straty i raporty policzą jego wpływ.',

  // Kontrola.
  kontrolaTytul: 'Kontrola transformatora',
  wierszSzyny: 'Para szyn',
  wierszTyp: 'Typ z katalogu',
  wierszMoc: 'Moc',
  wierszRegulacja: 'Regulacja',

  // Stan zerowy.
  brakKontekstuTytul: 'Brak pary szyn SN/nN',
  brakKontekstuOpis:
    'Wskaż stację SN/nN z kompletną parą szyn (SN i nN), aby dodać transformator.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz transformator',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem transformatora.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać transformator.',
} as const;
