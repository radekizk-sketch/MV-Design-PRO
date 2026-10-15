/**
 * Model porównania A/B zabezpieczeń — wejście to PRAWDZIWE odpowiedzi backendu dla sieci
 * złotej G08 (wariant A i wariant B z wydłużoną magistralą, urządzenia i nastawy z modelu),
 * wygenerowane przez `backend/scripts/eksport_fixtur_harnessu.py`. Warianty brzegowe
 * (brak wartości, utrata zadziałania, wynik niewiarygodny) budowane jako zmiana JEDNEGO pola
 * realnego wiersza — nigdy ręcznie wpisany kształt (karta BIEG-ZABEZPIECZEN-Z-MODELU).
 */

import { describe, expect, it } from 'vitest';

import {
  KOLUMNY_RANKINGU_ZABEZPIECZEN,
  KOLUMNY_STANOW_ZABEZPIECZEN,
  etykietaPrzebieguZabezpieczen,
  mapaWagWierszyZabezpieczen,
  naLinieProweniencji,
  naWierszeRankinguZabezpieczen,
  naWierszeStanowZabezpieczen,
  naZalozeniaPorownaniaZabezpieczen,
  tylkoZmianyStanowZabezpieczen,
} from '../porownanieModel';
import {
  fmtCzasZadzialania,
  fmtDeltaPradZwarciowy,
  fmtMarginesProcent,
  rodzajProblemuZabezpieczenPL,
  wagaPL,
} from '../strings';
import {
  WIARYGODNOSC_PL,
  type ProtectionComparisonResult,
  type ProtectionComparisonRow,
  type ProtectionRunItem,
} from '../../../../ui/protection-comparison/types';
import wynikSceny from '../../../../harness-fixtures/generated/porownanie_scena_wynik_zabezpieczen.json';
import biegiSceny from '../../../../harness-fixtures/generated/porownanie_scena_biegi_zabezpieczen.json';

const WYNIK = wynikSceny as unknown as ProtectionComparisonResult;
const BIEGI = (biegiSceny as unknown as { runs: ProtectionRunItem[] }).runs;
const [WIERSZ] = WYNIK.rows as [ProtectionComparisonRow];

/** Most nazw w testach (karta #145): prefiks odróżnia nazwę od identyfikatora. */
const NAZWA = (ref: string, nazwaZWyniku?: string | null): string =>
  nazwaZWyniku ?? `nazwa ${ref}`;

function wiersz(zmiana: Partial<ProtectionComparisonRow>): ProtectionComparisonRow {
  return { ...WIERSZ, ...zmiana };
}

describe('wynik sieci złotej G08 — kontrakt wiersza', () => {
  it('każdy wiersz niesie nazwę urządzenia i punktu z modelu oraz wiarygodność obu biegów', () => {
    expect(WYNIK.rows.length).toBeGreaterThan(0);
    for (const r of WYNIK.rows) {
      expect(r.nazwa_urzadzenia_pl).not.toBe('');
      expect(r.nazwa_punktu_pl).not.toBe('');
      expect(Object.keys(WIARYGODNOSC_PL)).toContain(r.wiarygodnosc_a);
      expect(Object.keys(WIARYGODNOSC_PL)).toContain(r.wiarygodnosc_b);
    }
  });

  it('ślad porównania nie niesie odcisków biblioteki (nastawy są w modelu)', () => {
    expect(JSON.stringify(WYNIK)).not.toContain('library_fingerprint');
  });
});

describe('mapaWagWierszyZabezpieczen — klucz PARY (element, punkt zwarcia)', () => {
  it('ranking realnego porównania: jedna waga na parę, maksimum przy wielu problemach', () => {
    const mapa = mapaWagWierszyZabezpieczen(WYNIK.ranking);
    for (const issue of WYNIK.ranking) {
      const klucz = `${issue.element_ref}::${issue.fault_target_id}`;
      const maks = Math.max(
        ...WYNIK.ranking
          .filter((i) => i.element_ref === issue.element_ref && i.fault_target_id === issue.fault_target_id)
          .map((i) => i.severity),
      );
      expect(mapa.get(klucz)).toBe(maks);
    }
    const [pierwszy] = WYNIK.ranking;
    const zwiekszony = mapaWagWierszyZabezpieczen([...WYNIK.ranking, { ...pierwszy, severity: 5 }]);
    expect(zwiekszony.get(`${pierwszy.element_ref}::${pierwszy.fault_target_id}`)).toBe(5);
  });

  it('ten sam element w dwóch punktach zwarcia → dwie niezależne wagi', () => {
    const [pierwszy] = WYNIK.ranking;
    const mapa = mapaWagWierszyZabezpieczen([
      { ...pierwszy, fault_target_id: 'punkt-1', severity: 5 },
      { ...pierwszy, fault_target_id: 'punkt-2', severity: 2 },
    ]);
    expect(mapa.get(`${pierwszy.element_ref}::punkt-1`)).toBe(5);
    expect(mapa.get(`${pierwszy.element_ref}::punkt-2`)).toBe(2);
  });
});

describe('naWierszeStanowZabezpieczen — komórki A/B/różnica, nullowalne pola, dowód', () => {
  it('urządzenie i punkt z nazw backendu; identyfikator urządzenia nie jest komórką (karta #145)', () => {
    const [w] = naWierszeStanowZabezpieczen([WIERSZ], new Map());
    expect(w.element.wartosc).toBe(WIERSZ.nazwa_urzadzenia_pl);
    expect(w.punkt.wartosc).toBe(WIERSZ.nazwa_punktu_pl);
    expect(Object.values(w).map((k) => k.wartosc)).not.toContain(WIERSZ.device_id_a);
    expect(KOLUMNY_STANOW_ZABEZPIECZEN.map((k) => k.klucz)).not.toContain('urzadzenieA');
  });

  it('wartość obecna dostaje dowodRef strony; wartość null → kreska bez dowodu', () => {
    const [w] = naWierszeStanowZabezpieczen([wiersz({ t_trip_s_b: null })], new Map());
    expect(w.czasA.wartosc).toBe(fmtCzasZadzialania(WIERSZ.t_trip_s_a!));
    expect(w.czasA.dowodRef).toBe(`A:${WIERSZ.protected_element_ref}::${WIERSZ.fault_target_id}`);
    expect(w.czasB.wartosc).toBe('—');
    expect(w.czasB.dowodRef).toBeUndefined();
  });

  it('różnicę oznacza tagiem ostrzeżenia WYŁĄCZNIE wg wagi z rankingu backendu; różnica bez dowodu', () => {
    const klucz = `${WIERSZ.protected_element_ref}::${WIERSZ.fault_target_id}`;
    const [zWaga] = naWierszeStanowZabezpieczen([WIERSZ], new Map([[klucz, 5]]));
    expect(zWaga.pradD.wartosc).toBe(fmtDeltaPradZwarciowy(WIERSZ.delta_i_fault_a!));
    expect(zWaga.pradD.ostrzezenie).toBe(true);
    expect(zWaga.pradD.dowodRef).toBeUndefined();
    const [bezWagi] = naWierszeStanowZabezpieczen([WIERSZ], new Map());
    expect(bezWagi.pradD.ostrzezenie).toBe(false);
  });

  it('utrata zadziałania: stan po polsku, różnica czasu niewyznaczona → kreska', () => {
    const [w] = naWierszeStanowZabezpieczen(
      [wiersz({ trip_state_b: 'NO_TRIP', t_trip_s_b: null, delta_t_s: null, state_change: 'TRIP_TO_NO_TRIP' })],
      new Map(),
    );
    expect(w.stanA.wartosc).toBe('Zadziałanie');
    expect(w.stanB.wartosc).toBe('Brak zadziałania');
    expect(w.czasD.wartosc).toBe('—');
    expect(w.zmiana.wartosc).toBe('Utrata zadziałania');
  });

  it('zapas czułości A/B osobno, BEZ kolumny różnicy; wiarygodność obu biegów po polsku', () => {
    const [w] = naWierszeStanowZabezpieczen(
      [wiersz({ wiarygodnosc_b: 'NIEWIARYGODNY' })],
      new Map(),
    );
    expect(w.marginesA.wartosc).toBe(fmtMarginesProcent(WIERSZ.margin_percent_a!));
    expect(w.marginesD).toBeUndefined();
    expect(w.wiarygodnoscA.wartosc).toBe(WIARYGODNOSC_PL.WIARYGODNY);
    expect(w.wiarygodnoscB.wartosc).toBe(WIARYGODNOSC_PL.NIEWIARYGODNY);
    expect(KOLUMNY_STANOW_ZABEZPIECZEN.map((k) => k.etykieta).join(' ')).not.toContain('Margines');
  });

  it('brak oceny w jednym biegu (pusty stan wiarygodności) → kreska, nie „wiarygodny"', () => {
    const [w] = naWierszeStanowZabezpieczen(
      [wiersz({ wiarygodnosc_b: '', trip_state_b: 'MISSING', t_trip_s_b: null })],
      new Map(),
    );
    expect(w.wiarygodnoscB.wartosc).toBe('—');
  });

  it('klucz React wiersza jest indeksem źródłowym — unikalny także przy tym samym urządzeniu', () => {
    const wiersze = naWierszeStanowZabezpieczen(WYNIK.rows, new Map());
    expect(wiersze.map((w) => w.klucz.wartosc)).toEqual(WYNIK.rows.map((_r, i) => String(i)));
  });
});

describe('tylkoZmianyStanowZabezpieczen — filtr „pokaż tylko zmiany"', () => {
  it('realne porównanie bez zmian stanu → pusta lista; wiersz ze zmianą zostaje', () => {
    expect(WYNIK.rows.every((r) => r.state_change === 'NO_CHANGE')).toBe(true);
    expect(tylkoZmianyStanowZabezpieczen(WYNIK.rows)).toHaveLength(0);
    const zeZmiana = wiersz({ state_change: 'TRIP_TO_NO_TRIP' });
    expect(tylkoZmianyStanowZabezpieczen([...WYNIK.rows, zeZmiana])).toEqual([zeZmiana]);
  });
});

describe('naWierszeRankinguZabezpieczen — waga PL, rodzaj PL, punkt zwarcia', () => {
  it('mapuje realny ranking na polskie etykiety i opis z backendu', () => {
    const wiersze = naWierszeRankinguZabezpieczen(WYNIK.ranking, NAZWA);
    expect(wiersze).toHaveLength(WYNIK.ranking.length);
    WYNIK.ranking.forEach((issue, i) => {
      expect(wiersze[i].waga.wartosc).toBe(wagaPL(issue.severity));
      expect(wiersze[i].rodzaj.wartosc).toBe(rodzajProblemuZabezpieczenPL(issue.issue_code));
      expect(wiersze[i].opis.wartosc).toBe(issue.description_pl);
      expect(wiersze[i].rodzaj.wartosc).not.toBe(issue.issue_code);
    });
    expect(KOLUMNY_RANKINGU_ZABEZPIECZEN.map((k) => k.klucz)).not.toContain('kodTechniczny');
  });

  it.each(['TRIP_LOST', 'TRIP_GAINED', 'DELAY_INCREASED', 'DELAY_DECREASED', 'INVALID_STATE', 'MARGIN_DECREASED', 'MARGIN_INCREASED', 'UNRELIABLE_RESULT'] as const)(
    'kod %s ma polską nazwę (słownik = IssueCode backendu)',
    (kod) => {
      expect(rodzajProblemuZabezpieczenPL(kod)).not.toBe(kod);
    },
  );
});

describe('naZalozeniaPorownaniaZabezpieczen — podsumowanie jako ZAŁOŻENIA wzorca', () => {
  it('liczba porównań i zmiany stanu z pól backendu', () => {
    const zal = naZalozeniaPorownaniaZabezpieczen(WYNIK.summary);
    expect(zal.find((w) => w.etykieta === 'Porównań łącznie')?.wartosc).toBe(WYNIK.summary.total_rows);
    const s = WYNIK.summary;
    expect(zal.find((w) => w.etykieta.startsWith('Zmiany stanu'))?.wartosc).toBe(
      `${s.trip_to_no_trip_count} · ${s.no_trip_to_trip_count} · ${s.invalid_change_count} · ${s.no_change_count}`,
    );
  });
});

describe('etykietaPrzebieguZabezpieczen — bez identyfikatorów i odcisków (karta #145)', () => {
  it('realny bieg: rodzaj + rewizja + data, bez identyfikatora biegu i odcisku migawki', () => {
    for (const bieg of BIEGI) {
      const etykieta = etykietaPrzebieguZabezpieczen(bieg);
      expect(etykieta).toContain('Ocena zabezpieczeń');
      expect(etykieta).toContain(`rew. ${bieg.model_revision}`);
      expect(etykieta).not.toContain(bieg.id);
      expect(etykieta).not.toContain(bieg.snapshot_hash.slice(0, 8));
    }
  });

  it('scenariusz koperty ma pierwszeństwo przed rewizją modelu', () => {
    const etykieta = etykietaPrzebieguZabezpieczen({ ...BIEGI[0], scenario_ref: ['sc-1', 3] });
    expect(etykieta).toContain('scenariusz sc-1 rew. 3');
  });

  it('nazwa przypadku dołącza się, gdy podana; brak → etykieta bez niej', () => {
    expect(etykietaPrzebieguZabezpieczen(BIEGI[0], 'Wariant letni')).toContain('Wariant letni');
    expect(etykietaPrzebieguZabezpieczen(BIEGI[0], null)).not.toContain('Wariant letni');
  });
});

describe('naLinieProweniencji — ten sam adapter proweniencji co rozpływ', () => {
  it('przyjmuje proweniencję biegu oceny zabezpieczeń bez rzutowania', () => {
    const linie = naLinieProweniencji(WYNIK.provenance_a);
    expect(linie.find((l) => l.etykieta === 'Rodzaj analizy')?.wartosc).toBe('protection_sn');
    expect(linie.find((l) => l.etykieta === 'Status')?.wartosc).toBe('FINISHED');
    expect(WYNIK.provenance_a.snapshot_hash).not.toBe(WYNIK.provenance_b.snapshot_hash);
  });
});
