import { describe, expect, it } from 'vitest';

import {
  etykietaPrzebieguZabezpieczen,
  mapaWagWierszyZabezpieczen,
  naLinieProweniencji,
  naWierszeRankinguZabezpieczen,
  naWierszeStanowZabezpieczen,
  naZalozeniaPorownaniaZabezpieczen,
  tylkoZmianyStanowZabezpieczen,
} from '../porownanieModel';
import {
  podsumowanieZabezpieczenFixture,
  porownanieZabezpieczenFixture,
  przebiegZabezpieczenFixture,
  provenanceZabezpieczenFixture,
  rankingZabezpieczenFixture,
  wierszZabezpieczenFixture,
} from './zabezpieczeniaFixtures';

describe('porownanieModel — wariant zabezpieczeń (karta CV-3.3-B2)', () => {
  describe('mapaWagWierszyZabezpieczen — klucz PARY (element, punkt zwarcia)', () => {
    it('klucz wagi jest per (element, punkt), nie sam element', () => {
      const mapa = mapaWagWierszyZabezpieczen([
        {
          issue_code: 'TRIP_LOST',
          severity: 5,
          element_ref: 'BRK-F01',
          fault_target_id: 'BUS-A',
          description_pl: 'x',
          evidence_refs: [],
        },
        {
          issue_code: 'MARGIN_DECREASED',
          severity: 2,
          element_ref: 'BRK-F01',
          fault_target_id: 'BUS-B',
          description_pl: 'y',
          evidence_refs: [],
        },
      ]);
      // Ten sam element (BRK-F01), DWA różne punkty zwarcia -> DWIE różne wagi
      // w mapie (dowód, że klucz nie jest tylko `element_ref` jak w rozpływie).
      expect(mapa.get('BRK-F01::BUS-A')).toBe(5);
      expect(mapa.get('BRK-F01::BUS-B')).toBe(2);
      expect(mapa.size).toBe(2);
    });

    it('bierze WAGĘ MAKSYMALNĄ, gdy ta sama para ma wiele problemów', () => {
      const mapa = mapaWagWierszyZabezpieczen([
        {
          issue_code: 'DELAY_INCREASED',
          severity: 2,
          element_ref: 'BRK-F01',
          fault_target_id: 'BUS-A',
          description_pl: 'x',
          evidence_refs: [],
        },
        {
          issue_code: 'TRIP_LOST',
          severity: 5,
          element_ref: 'BRK-F01',
          fault_target_id: 'BUS-A',
          description_pl: 'y',
          evidence_refs: [],
        },
      ]);
      expect(mapa.get('BRK-F01::BUS-A')).toBe(5);
    });
  });

  describe('naWierszeStanowZabezpieczen — komórki A/B/Δ, nullowalne pola, dowód', () => {
    it('wartość obecna dostaje dowodRef strony; wartość null → kreska bez dowodu', () => {
      const wagi = new Map<string, number>();
      const [wiersz] = naWierszeStanowZabezpieczen(
        [wierszZabezpieczenFixture({ t_trip_s_b: null })],
        wagi,
      );
      expect(wiersz.czasA.wartosc).toBe('0,350');
      expect(wiersz.czasA.dowodRef).toBe('A:BRK-F01::BUS-GPZ');
      expect(wiersz.czasB.wartosc).toBe('—');
      expect(wiersz.czasB.dowodRef).toBeUndefined();
    });

    it('deltę Δt/ΔI oznacza tagiem ostrzeżenia WYŁĄCZNIE wg wagi z rankingu backendu', () => {
      const wagi = mapaWagWierszyZabezpieczen(rankingZabezpieczenFixture());
      const [wiersz] = naWierszeStanowZabezpieczen(
        [wierszZabezpieczenFixture()], // BRK-F01 / BUS-GPZ ma severity 5 w fixturze rankingu
        wagi,
      );
      expect(wiersz.czasD.ostrzezenie).toBeUndefined(); // delta_t_s jest null -> kreska, bez ostrzezenia
      expect(wiersz.pradD.wartosc).toBe('-270,2');
      expect(wiersz.pradD.ostrzezenie).toBe(true);
      expect(wiersz.pradD.dowodRef).toBeUndefined(); // Δ nigdy nie ma dowodu (R3-C)
    });

    it('stan zadziałania po polsku (TRIPS/NO_TRIP) oraz zmiana klasyfikacji z STATE_CHANGE_LABELS', () => {
      const [wiersz] = naWierszeStanowZabezpieczen(
        [wierszZabezpieczenFixture()],
        new Map(),
      );
      expect(wiersz.stanA.wartosc).toBe('Zadziałanie');
      expect(wiersz.stanB.wartosc).toBe('Brak zadziałania');
      expect(wiersz.zmiana.wartosc).toBe('Utrata zadziałania');
    });

    it('kolumny urządzenia (device_id_a/b) niosą dowodRef strony (identyfikator techniczny)', () => {
      const [wiersz] = naWierszeStanowZabezpieczen(
        [wierszZabezpieczenFixture()],
        new Map(),
      );
      expect(wiersz.urzadzenieA.wartosc).toBe('REL-OC-001');
      expect(wiersz.urzadzenieA.dowodRef).toBe('A:BRK-F01::BUS-GPZ');
    });

    it('margines A/B pokazuje się osobno, BEZ kolumny Δ (backend nie publikuje delty marginesu)', () => {
      const [wiersz] = naWierszeStanowZabezpieczen(
        [wierszZabezpieczenFixture()],
        new Map(),
      );
      expect(wiersz.marginesA.wartosc).toBe('12,50');
      expect(wiersz.marginesB.wartosc).toBe('8,10');
      expect(wiersz.marginesD).toBeUndefined();
    });

    it('klucz React wiersza (`klucz`) jest indeksem źródłowym — stabilny, unikalny nawet przy powtórzonym elemencie', () => {
      const wiersze = naWierszeStanowZabezpieczen(
        [
          wierszZabezpieczenFixture({ fault_target_id: 'BUS-A' }),
          wierszZabezpieczenFixture({ fault_target_id: 'BUS-B' }), // ten sam element, inny punkt
        ],
        new Map(),
      );
      expect(wiersze[0].klucz.wartosc).toBe('0');
      expect(wiersze[1].klucz.wartosc).toBe('1');
    });
  });

  describe('tylkoZmianyStanowZabezpieczen — filtr „pokaż tylko zmiany"', () => {
    it('odfiltrowuje wiersze ze state_change = NO_CHANGE, zostawia resztę', () => {
      const rows = [
        wierszZabezpieczenFixture({ state_change: 'NO_CHANGE' }),
        wierszZabezpieczenFixture({ state_change: 'TRIP_TO_NO_TRIP' }),
      ];
      const wynik = tylkoZmianyStanowZabezpieczen(rows);
      expect(wynik).toHaveLength(1);
      expect(wynik[0].state_change).toBe('TRIP_TO_NO_TRIP');
    });
  });

  describe('naWierszeRankinguZabezpieczen — waga PL, rodzaj PL, punkt zwarcia (rozszerzenie vs rozpływ)', () => {
    it('mapuje wagę i rodzaj problemu na polskie etykiety, dokłada punkt zwarcia', () => {
      const [wiersz] = naWierszeRankinguZabezpieczen(rankingZabezpieczenFixture());
      expect(wiersz.waga.wartosc).toBe('Krytyczny');
      expect(wiersz.rodzaj.wartosc).toBe('Utrata zadziałania');
      expect(wiersz.element.wartosc).toBe('BRK-F01');
      expect(wiersz.punkt.wartosc).toBe('BUS-GPZ');
      expect(wiersz.kodTechniczny.wartosc).toBe('TRIP_LOST');
    });
  });

  describe('naZalozeniaPorownaniaZabezpieczen — podsumowanie jako ZAŁOŻENIA wzorca', () => {
    it('pokazuje porównań łącznie oraz zmiany stanu z pól backendu', () => {
      const zal = naZalozeniaPorownaniaZabezpieczen(podsumowanieZabezpieczenFixture());
      const porownan = zal.find((w) => w.etykieta === 'Porównań łącznie');
      expect(porownan?.wartosc).toBe(2);
      const zmiany = zal.find((w) => w.etykieta.startsWith('Zmiany stanu'));
      expect(zmiany?.wartosc).toBe('1 · 0 · 0 · 0');
    });
  });

  describe('etykietaPrzebieguZabezpieczen — BEZ segmentu zbieżności (ProtectionRunItem go nie ma)', () => {
    it('tryb podstawowy: analiza + rewizja + odcisk + data, bez identyfikatorów', () => {
      const etykieta = etykietaPrzebieguZabezpieczen(przebiegZabezpieczenFixture(), false);
      expect(etykieta).toBe('Ocena zabezpieczeń · rew. 1 · snap-zab · 2026-07-10 08:15');
      expect(etykieta).not.toContain('run-zab-a');
    });

    it('tryb ekspercki dokłada study_case_id i id biegu', () => {
      const etykieta = etykietaPrzebieguZabezpieczen(przebiegZabezpieczenFixture(), true);
      expect(etykieta).toContain('case-1');
      expect(etykieta).toContain('run-zab-a');
    });

    it('scenariusz koperty ma pierwszeństwo przed rewizją modelu', () => {
      const etykieta = etykietaPrzebieguZabezpieczen(
        przebiegZabezpieczenFixture({ scenario_ref: ['sc-1', 3] }),
        false,
      );
      expect(etykieta).toContain('scenariusz sc-1 rew. 3');
    });

    it('nazwa przypadku ze store\'u dołącza się, gdy podana; brak -> etykieta bez niej', () => {
      const zNazwa = etykietaPrzebieguZabezpieczen(przebiegZabezpieczenFixture(), false, 'Wariant letni');
      expect(zNazwa).toContain('Wariant letni');
      const bezNazwy = etykietaPrzebieguZabezpieczen(przebiegZabezpieczenFixture(), false, null);
      expect(bezNazwy).not.toContain('Wariant letni');
    });
  });

  describe('naLinieProweniencji — TEN SAM adapter proweniencji co rozpływ (D1/D2: zero duplikacji)', () => {
    it('przyjmuje RunProvenance biegu zabezpieczeń (protection_sn) bez rzutowania', () => {
      const linie = naLinieProweniencji(provenanceZabezpieczenFixture());
      const rodzaj = linie.find((l) => l.etykieta === 'Rodzaj analizy');
      expect(rodzaj?.wartosc).toBe('protection_sn');
      const status = linie.find((l) => l.etykieta === 'Status');
      expect(status?.wartosc).toBe('FINISHED');
    });
  });

  describe('porownanieZabezpieczenFixture — kształt 1:1 z ProtectionComparisonResult', () => {
    it('niesie provenance_a/b WYMAGANE (B1, karta CV-3.3-B)', () => {
      const wynik = porownanieZabezpieczenFixture();
      expect(wynik.provenance_a.run_id).toBe('run-zab-a');
      expect(wynik.provenance_b.run_id).toBe('run-zab-b');
      expect(wynik.provenance_a.snapshot_hash).not.toBe(wynik.provenance_b.snapshot_hash);
    });
  });
});
