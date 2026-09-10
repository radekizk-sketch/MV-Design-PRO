/*
 * PINY KARTY V126-WYGASZENIE (i W3-E) — wycofania z toru projektanta i ich granice,
 * po przebudowie B-02 (katalog KART z backendu zamiast listy rozwijanej).
 *
 * DECYZJE WŁAŚCICIELA: z ekranu znikają (1) walidacja na sieciach odniesienia — bada
 * NARZĘDZIE, nie projekt użytkownika (2026-08-07), (2) stabilność napięciowa — solver
 * nie wyznacza już żadnej jej wielkości z realnego modelu (QU-FABRYKACJA), (3) zdolność
 * przyłączeniowa i optymalizacja strat — duplikaty kanonu liczonego gdzie indziej,
 * 410 na uruchomienie (W3-E). Po B-02 wycofanie jest widoczne w DWÓCH źródłach, które
 * muszą się zgadzać: rejestr frontu (`nieprezentowane.ts`) i pole `prezentowany`
 * karty katalogu backendu — rozjazd = czerwień.
 *
 * TESTY SĄ ILOCZYNEM CECH, nie przykładem z karty. Osie, na których defekt mógłby się
 * schować:
 *   {rodzaj prezentowany · rodzaj wycofany · rodzaj NIEZNANY frontowi}
 *     × {katalog kart · wejście trasowe}
 *   {rejestr frontu} × {pole `prezentowany` karty backendu}
 * Trzecia wartość pierwszej osi jest najważniejsza: filtr odsiewający „wszystko, czego
 * front nie zna" byłby cichym wykluczeniem nowego rodzaju backendu.
 *
 * GRANICA UCZCIWOŚCI: sprawdzamy część ekranu WIDOCZNĄ DLA PROJEKTANTA. Te testy NIE
 * dowodzą, że pole zniknęło z odpowiedzi backendu (kontrakty FROZEN); dowodzą, że
 * zniknęło z oferty ekranu.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { EkranAnalizAkademickich } from '../EkranAnalizAkademickich';
import { POWODY_NIEPREZENTOWANIA, rodzajPrezentowany, tylkoPrezentowane } from '../nieprezentowane';
import { PREZENTACJA } from '../prezentacja';
import { ETYKIETY_RODZAJOW } from '../strings';
import { SCREEN_CANON_REGISTRY } from '../../../../ui/workspace/screenCanonRegistry';
import type { KartaKatalogu } from '../api';
import { CASE_ID, KATALOG, ODPOWIEDZI, migawkaSieciZlotej, ustawFetchV126 } from './atrapyV126';

/** Komplet rodzajów kontraktu — tak jak go wystawia katalog backendu. */
const KATALOG_BACKENDU = KATALOG.map((karta) => karta.kod);

/** Kody wycofane decyzją właściciela — źródłem jest rejestr, nie druga lista. */
const WYCOFANE = Object.keys(POWODY_NIEPREZENTOWANIA);

/** Karta rodzaju NIEZNANEGO frontowi (nowy rodzaj dopisany w backendzie). */
function kartaNieznana(): KartaKatalogu {
  return {
    ...KATALOG.find((k) => k.kod === 'uncertainty_sensitivity')!,
    kod: 'rodzaj_dodany_w_backendzie',
    nazwa_pl: 'Rodzaj dodany w backendzie',
  };
}

beforeEach(() => {
  useAppStateStore.setState({ activeCaseId: CASE_ID, activeCaseResultStatus: 'NONE' });
  useSnapshotStore.setState({ snapshot: migawkaSieciZlotej() as never });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useSnapshotStore.getState().reset();
});

// ---------------------------------------------------------------------------
// REJESTR WYCOFAŃ — deklaracje mają piny; dwa źródła prawdy się zgadzają
// ---------------------------------------------------------------------------

describe('rejestr rodzajów nieprezentowanych', () => {
  it('rejestr NIE jest pusty — karta faktycznie coś wycofała', () => {
    expect(WYCOFANE.length).toBeGreaterThan(0);
    expect(WYCOFANE).toContain('benchmark_validation');
  });

  it('każdy wpis niesie powód merytoryczny, nie odsyłacz do zakresu karty', () => {
    for (const [kod, powod] of Object.entries(POWODY_NIEPREZENTOWANIA)) {
      expect(powod.trim().length, `${kod}: powód pusty`).toBeGreaterThan(40);
      expect(powod, `${kod}: powód nie jest zdaniem`).toMatch(/\.$/);
      expect(powod.toLowerCase(), `${kod}: „poza zakresem" nie jest powodem`).not.toContain('poza zakresem');
    }
  });

  it('zbiory prezentowanych i wycofanych są rozłączne', () => {
    for (const kod of WYCOFANE) {
      expect(Object.keys(PREZENTACJA), `${kod} ma projekt ekranu mimo wycofania`).not.toContain(kod);
      expect(rodzajPrezentowany(kod)).toBe(false);
    }
  });

  it('suma prezentowanych i wycofanych pokrywa komplet katalogu backendu', () => {
    const suma = [...Object.keys(PREZENTACJA), ...WYCOFANE].sort();
    expect(suma).toEqual([...KATALOG_BACKENDU].sort());
  });

  /*
   * B-02: wycofanie żyje w DWÓCH miejscach — rejestr frontu i pole `prezentowany`
   * karty backendu (grupa „wycofane z powierzchni" z powodem). Predykaty parami:
   * karta nieprezentowana ⇔ kod w rejestrze frontu. Rozjazd w którąkolwiek stronę
   * = jeden ekran mówiłby „jest", drugi „nie ma".
   */
  it('pole `prezentowany` karty backendu i rejestr frontu wskazują TEN SAM zbiór wycofań', () => {
    const wycofaneBackendu = KATALOG.filter((k) => !k.prezentowany).map((k) => k.kod).sort();
    expect(wycofaneBackendu).toEqual([...WYCOFANE].sort());
    for (const karta of KATALOG.filter((k) => !k.prezentowany)) {
      expect(karta.powod_wycofania_pl, `${karta.kod}: karta wycofana bez powodu`).toBeTruthy();
      expect(karta.grupa.kod).toBe('wycofane_z_powierzchni');
    }
  });

  it('etykieta PL frontu jest lustrem nazwy karty backendu — także dla rodzajów wycofanych', () => {
    for (const karta of KATALOG) {
      expect(ETYKIETY_RODZAJOW[karta.kod as keyof typeof ETYKIETY_RODZAJOW], karta.kod).toBe(karta.nazwa_pl);
    }
  });
});

// ---------------------------------------------------------------------------
// FILTR — iloczyn {prezentowany · wycofany · nieznany}
// ---------------------------------------------------------------------------

describe('tylkoPrezentowane — co filtr odsiewa, a czego NIE wolno mu ruszyć', () => {
  it('odsiewa wyłącznie rodzaje z rejestru, zachowując kolejność katalogu', () => {
    expect(tylkoPrezentowane(KATALOG_BACKENDU)).toEqual(KATALOG_BACKENDU.filter((kod) => !WYCOFANE.includes(kod)));
  });

  it('przepuszcza rodzaj nieznany frontowi (nowy w kontrakcie backendu)', () => {
    expect(tylkoPrezentowane(['rodzaj_dodany_w_backendzie'])).toEqual(['rodzaj_dodany_w_backendzie']);
    expect(rodzajPrezentowany('rodzaj_dodany_w_backendzie')).toBe(true);
  });
});

describe('katalog kart — wejście projektanta', () => {
  it('katalog z kompletem rodzajów → karty bez rodzajów wycofanych', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    const karty = Array.from(document.querySelectorAll('[data-testid^="mvd-akad-karta-otworz-"]')).map((el) =>
      (el.getAttribute('data-testid') ?? '').replace('mvd-akad-karta-otworz-', ''),
    );
    for (const kod of WYCOFANE) expect(karty, `${kod} wciąż w katalogu kart`).not.toContain(kod);
    // Kontrola dodatnia: pozostałe rodzaje NIE zniknęły przy okazji, kolejność kontraktu.
    expect(karty).toEqual(KATALOG_BACKENDU.filter((kod) => !WYCOFANE.includes(kod)));
    expect(karty).toContain('power_quality_harmonics');
    expect(karty).toContain('neutral_earthing_design');
  });

  it('rodzaj nowy w katalogu backendu dostaje kartę bez zmiany kodu okna', async () => {
    ustawFetchV126({ katalog: [...KATALOG, kartaNieznana()] });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    const karta = await screen.findByTestId('mvd-akad-karta-rodzaj_dodany_w_backendzie');
    expect(karta).toHaveTextContent('Rodzaj dodany w backendzie');
  });

  it('katalog zwracający WYŁĄCZNIE rodzaje wycofane → uczciwy stan zerowy, nie pusta siatka', async () => {
    ustawFetchV126({ katalog: KATALOG.filter((k) => WYCOFANE.includes(k.kod)) });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    expect(await screen.findByTestId('mvd-akad-katalog-pusty')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-testid^="mvd-akad-karta-otworz-"]')).toHaveLength(0);
  });

  it('karta oznaczona przez backend jako nieprezentowana nie renderuje się nawet bez wpisu w rejestrze frontu', async () => {
    // Oś „backend wycofał, front jeszcze nie wie": pole `prezentowany` samo wystarcza,
    // żeby karta zeszła z ekranu — bez czekania na wpis w rejestrze.
    ustawFetchV126({ katalog: [...KATALOG, { ...kartaNieznana(), prezentowany: false, powod_wycofania_pl: 'Wycofana decyzją backendu.' }] });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    expect(screen.queryByTestId('mvd-akad-karta-rodzaj_dodany_w_backendzie')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// STABILNOŚĆ NAPIĘCIOWA — CAŁY RODZAJ WYCOFANY (karta QU-FABRYKACJA)
// ---------------------------------------------------------------------------

describe('stabilność napięciowa — rodzaj wycofany w całości', () => {
  it('nie ma projektu ekranu — wpis zniknął z PREZENTACJA', () => {
    expect(Object.keys(PREZENTACJA)).not.toContain('voltage_stability');
  });

  it('jest w rejestrze wycofań z powodem merytorycznym nazywającym POMIAR', () => {
    const powod = POWODY_NIEPREZENTOWANIA.voltage_stability;
    expect(powod.length).toBeGreaterThan(40);
    expect(powod.toLowerCase()).not.toContain('poza zakresem');
    expect(powod).toContain('zwarciowej');
  });

  it('filtr go odsiewa; karta backendu mówi to samo (prezentowany = false, z powodem)', () => {
    expect(rodzajPrezentowany('voltage_stability')).toBe(false);
    expect(tylkoPrezentowane(KATALOG_BACKENDU)).not.toContain('voltage_stability');
    const karta = KATALOG.find((k) => k.kod === 'voltage_stability')!;
    expect(karta.prezentowany).toBe(false);
    expect((karta.powod_wycofania_pl ?? '').length).toBeGreaterThan(40);
    // Etykieta PL ZOSTAJE — wynik wczytany z zapisanego przebiegu ma być nazwany
    // po polsku, a nie kodem kontraktu.
    expect(ETYKIETY_RODZAJOW.voltage_stability).toBe(karta.nazwa_pl);
  });

  it('znika z katalogu kart okna, a sąsiedzi zostają', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    expect(screen.queryByTestId('mvd-akad-karta-voltage_stability')).toBeNull();
    expect(screen.getByTestId('mvd-akad-karta-reliability_contingency')).toBeInTheDocument();
  });

  /*
   * FAŁSZYWY RODOWÓD NIE WRACA INNĄ DROGĄ. Skan obejmuje CAŁY zbiór tekstów prezentacji
   * ORAZ katalog backendu — poprzednim razem obietnica wróciła na ekran obok pinu
   * postawionego punktowo.
   */
  it('żaden projekt ekranu ani karta katalogu nie obiecuje krzywej Q–U ani P–U', () => {
    const wszystkie = JSON.stringify(PREZENTACJA) + JSON.stringify(KATALOG.filter((k) => k.prezentowany));
    for (const falszywy of ['krzywa Q–U', 'krzywej Q–U', 'krzywa P–U', 'krzywej P–U']) {
      expect(wszystkie, `prezentacja obiecuje „${falszywy}"`).not.toContain(falszywy);
    }
    expect(wszystkie.length).toBeGreaterThan(2000);
  });

  it('ekran trasowy E-41 zniknął z nawigacji, ale został w kanonie', () => {
    const ekran = SCREEN_CANON_REGISTRY['E-41'];
    expect(ekran, 'E-41 wypadł z kanonu — złamana ciągłość numeracji').toBeDefined();
    expect(ekran.visibleInNavigation).toBe(false);
    expect(SCREEN_CANON_REGISTRY['E-42'].visibleInNavigation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HOSTING_CAPACITY / OPF_LOSS_LCC — schodzą z powierzchni (karta W3-E)
// ---------------------------------------------------------------------------

describe('hosting_capacity / opf_loss_lcc — duplikat kanonu schodzi z powierzchni (karta W3-E)', () => {
  it('oba rodzaje są w rejestrze wycofań z powodem merytorycznym i w grupie wycofanych katalogu', () => {
    for (const kod of ['hosting_capacity', 'opf_loss_lcc'] as const) {
      const powod = POWODY_NIEPREZENTOWANIA[kod];
      expect(powod.length, `${kod}: powód pusty`).toBeGreaterThan(40);
      expect(powod.toLowerCase(), `${kod}: „poza zakresem" nie jest powodem`).not.toContain('poza zakresem');
      expect(KATALOG.find((k) => k.kod === kod)!.prezentowany).toBe(false);
    }
  });

  it('znikają z katalogu kart okna, sąsiedzi z tego samego obszaru zostają', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    expect(screen.queryByTestId('mvd-akad-karta-hosting_capacity')).toBeNull();
    expect(screen.queryByTestId('mvd-akad-karta-opf_loss_lcc')).toBeNull();
    expect(screen.getByTestId('mvd-akad-karta-earthing_safety')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-karta-reliability_contingency')).toBeInTheDocument();
  });

  it('ekrany trasowe E-47 i E-48 znikają z nawigacji, ale zostają w kanonie', () => {
    for (const kod of ['E-47', 'E-48'] as const) {
      const ekran = SCREEN_CANON_REGISTRY[kod];
      expect(ekran, `${kod} wypadł z kanonu — złamana ciągłość numeracji`).toBeDefined();
      expect(ekran.visibleInNavigation, `${kod}: powinien zniknąć z nawigacji`).toBe(false);
      expect(ekran.implemented, `${kod}: zdolność solvera ma zostać implemented`).toBe(true);
    }
    expect(SCREEN_CANON_REGISTRY['E-46'].visibleInNavigation).toBe(true);
    expect(SCREEN_CANON_REGISTRY['E-50'].visibleInNavigation).toBe(true);
  });

  /*
   * PIN LICZBY — zmierzony, nie przepisany z prozy karty. Katalog kontraktu ma 14
   * rodzajów (fixtury 1:1 z `V126AnalysisType`). V126-WYGASZENIE zdjęła 2, W3-E kolejne
   * 2 → katalog kart pokazuje 10. Test wyżej dowodzi SETU; ten dowodzi LICZBY, żeby
   * regresja o poprawnym składzie, ale złej liczności miała osobny pin.
   */
  it('katalog kart ma dokładnie 10 pozycji (14 kontraktu − 4 wycofane: 2 z V126-WYGASZENIE + 2 z W3-E)', async () => {
    expect(KATALOG_BACKENDU).toHaveLength(14);
    expect(Object.keys(ODPOWIEDZI).sort()).toEqual([...KATALOG_BACKENDU].sort());
    expect(WYCOFANE).toEqual(
      expect.arrayContaining(['benchmark_validation', 'voltage_stability', 'hosting_capacity', 'opf_loss_lcc']),
    );
    expect(WYCOFANE).toHaveLength(4);
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    expect(document.querySelectorAll('[data-testid^="mvd-akad-karta-otworz-"]')).toHaveLength(10);
  });
});
