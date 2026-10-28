/*
 * EkranZwarc — druga konkretyzacja wspólnego wzorca ekranu analizy (karta E8.2):
 * okno „Wyniki zwarciowe" (W-604). Mapuje REALNY kształt `ShortCircuitResults`
 * (adapter `zwarciaModel`) → propsy wzorca `EkranAnalizy`: nagłówek → ZAŁOŻENIA
 * (metoda IEC 60909, współczynnik c, czas cieplny) → TABELA punktów zwarciowych
 * (Ik", ip, Ith, Sk" zawsze razem) → WYKRES słupkowy z przełącznikiem wielkości
 * (Ik"/ip/Ith/Sk"/I²t — karta W-A F2). Pod ekranem — wybór punktu zwarcia
 * i sekcja WKŁADÓW dla wybranego punktu.
 *
 * Zero fizyki, zero mutacji; store czytany wyłącznie do odczytu
 * (`useWynikZwarciowy`). Wybór punktu zwarcia: NATYWNY wybór wiersza tabeli
 * (delta API wzorca, scalenie U3 #4); wiersz wybrany steruje sekcją wkładów.
 */

import { useMemo, useState } from 'react';
import './zwarcia.css';
import { EkranAnalizy, PrzyciskAkcjiStanu, useAkcjaUruchomObliczenie, useNazwaObiektu } from '../wzorzec';
import { parametryWkladowZKonfiguracji, useRozplywZwarciowy, useWkladyZwarciowe } from './api';
import { useOtworzKonfiguracjeStacji, useZmienWartoscAparatu, WeryfikacjaAparatury } from './aparatura';
import { BilansIEC } from './BilansIEC';
import { PasmoMinMax } from './PasmoMinMax';
import { usePokazZwarcieNaSchemacie } from './pokazNaSchemacie';
import { RozplywZwarciowy } from './RozplywZwarciowy';
import { SladPodzialuPradu } from './SladPodzialuPradu';
import { SladZrodelSieciowych } from './SladZrodelSieciowych';
import { WkladyZwarciowe } from './WkladyZwarciowe';
import { WykresZwarc } from './WykresZwarc';
import { ZWARCIA_STRINGS } from './strings';
import { useZmienTolerancjeNn } from './zmianaTolerancjiNn';
import { useSwiezoscNaglowka } from '../../freshness';
import { otworzEdycjeCzasuTb } from '../../spaces/obliczenia/scenariusze/zadanieCzasuTb';
import {
  KLUCZ_PUNKT,
  KOLUMNY_ZWARC,
  nazwaPunktuZwarcia,
  naWierszeZwarc,
  naZalozeniaZwarc,
  useWynikZwarciowy,
  type WkladZwarciowy,
} from './zwarciaModel';

export interface EkranZwarcProps {
  szczegolyAudytowe: boolean;
  onOtworzDowod: (ref: string) => void;
  onEksport?: () => void;
  /**
   * Wkłady źródeł per punkt zwarcia (klucz = target_id) — nadpisanie TESTOWE,
   * pierwszeństwo przed realnym dostawcą (`useWkladyZwarciowe`, endpoint
   * `POST /api/proof/sc3f/contributions`). Produkcyjnie ekran pobiera wkłady
   * sam; prop istnieje wyłącznie dla fixture'ów testów.
   */
  wklady?: Record<string, WkladZwarciowy[]>;
}

export function EkranZwarc({
  szczegolyAudytowe,
  onOtworzDowod,
  onEksport,
  wklady,
}: EkranZwarcProps) {
  const { wynik, runId } = useWynikZwarciowy();
  const nazwaObiektu = useNazwaObiektu();
  // V12K-264/265: znacznik swiezosci + panel przyczyn z JEDNEJ, wspolnej derywacji.
  const swiezosc = useSwiezoscNaglowka(runId);
  const rows = wynik?.rows ?? [];
  const [wybranyPunkt, setWybranyPunkt] = useState<string | null>(null);
  // Karta W-C pkt 6: selekcja + centrowanie + nawigacja + overlay rozpływu
  // (reużycie wzorca V12K-073 — wspólny store selekcji, produkcyjny store overlay).
  const pokazNaSchemacie = usePokazZwarcieNaSchemacie();
  // KD-4 (dług V12K-287): ogniwo „wynik zwarciowy → wytrzymałość aparatury".
  const otworzKonfiguracjeStacji = useOtworzKonfiguracjeStacji();
  // Zasada nr 4 (V12K-351): wartość robocza aparatu → kreator edycji parametrów aparatu.
  const zmienWartoscAparatu = useZmienWartoscAparatu();
  // Zasada nr 4: sieć nN liczona na wartości roboczej tolerancji → kreator edycji pola
  // deklaracji elementu zasilającego (karta TOLERANCJA-NN-WARTOSC-ROBOCZA).
  const zmienTolerancjeNn = useZmienTolerancjeNn();
  // K6 / H-5: uczciwy stan zerowy Z AKCJĄ — brak wyniku zwarciowego prowadzi
  // WPROST do uruchomienia przebiegu zwarciowego (ten sam tor co „Oblicz").
  const akcjaBiegu = useAkcjaUruchomObliczenie('SC_3F');

  // Domyślnie wybrany pierwszy punkt (deterministycznie, kolejność źródłowa).
  const aktywnyPunkt = useMemo(() => {
    if (rows.length === 0) return null;
    if (wybranyPunkt && rows.some((r) => r.target_id === wybranyPunkt)) return wybranyPunkt;
    return rows[0].target_id;
  }, [rows, wybranyPunkt]);

  // R3-B (K3-G3): realny dostawca wkładów — rozbicie maszynowe z backendu
  // (endpoint SC3F contributions). Props `wklady` (test/nadpisanie) ma
  // pierwszeństwo — wtedy hook nie pobiera (punkt=null).
  // Karta OD-14: wkłady biegu przez impedancję przejścia liczą tę samą pętlę (Z_f z
  // konfiguracji ZAPISANEJ na biegu), inaczej sekcja wkładów pokazałaby prądy metaliczne
  // obok tabeli biegu przez Z_f.
  // Karta WSPÓŁCZYNNIK-C: wkłady liczone ze scenariuszem i nadpisaniem c TEGO biegu
  // (końcówka dobiera c z tabeli 1 dla pasma węzła; bez scenariusza odmawia 422).
  const stanWkladow = useWkladyZwarciowe(
    wklady ? null : aktywnyPunkt,
    parametryWkladowZKonfiguracji(wynik?.konfiguracja_biegu),
  );
  const wkladyPobrane = stanWkladow.odczyt === 'gotowe' ? stanWkladow.dane : null;
  // Wkłady z props (testy/nadpisanie) są gotowe z definicji; od dostawcy —
  // `wczytywanie`/`blad` przechodzą do sekcji jako stan odczytu (≠ brak danych).
  const odczytWkladow =
    wklady || stanWkladow.odczyt === 'niezlecony' ? 'gotowe' : stanWkladow.odczyt;

  // V12K-281 (K13): rozpływ gałęziowy wybranego punktu NA ŻĄDANIE — wiersze
  // zbiorcze nie niosą już rozpływu (odpowiedź 730 MB dla 50 stacji); dane
  // z pola wiersza (mock/starszy pełny zapis) mają pierwszeństwo, inaczej
  // dostawca pobiera rozpływ punktu z endpointu (cache per punkt).
  const wierszDlaRozplywu = rows.find((r) => r.target_id === aktywnyPunkt) ?? rows[0] ?? null;
  const rozplyw = useRozplywZwarciowy(runId, wierszDlaRozplywu);

  if (!wynik || rows.length === 0) {
    return (
      <div className="mvd-wyn" data-testid="mvd-zwarcia-ekran-pusty">
        <div className="mvd-zwarcia-pusty">
          <p className="mvd-zwarcia-pusty-title">{ZWARCIA_STRINGS.brakWyniku}</p>
          <p className="mvd-zwarcia-pusty-desc">{ZWARCIA_STRINGS.brakWynikuOpis}</p>
          <PrzyciskAkcjiStanu akcja={akcjaBiegu} testid="mvd-zwarcia-pusty" />
        </div>
      </div>
    );
  }

  const wierszAktywny = rows.find((r) => r.target_id === aktywnyPunkt) ?? rows[0];
  const nazwaAktywnego = nazwaPunktuZwarcia(wierszAktywny, nazwaObiektu);
  const wkladyAktywne =
    aktywnyPunkt && wklady ? wklady[aktywnyPunkt] ?? null : wkladyPobrane?.wklady ?? null;
  // Wywod {tekst, latex} z backendu (zasada KaTeX) — tylko od realnego dostawcy;
  // przy wkladach z props (testy/nadpisanie) wywodu brak (zero fabrykacji).
  const wywodWkladow = wklady ? [] : wkladyPobrane?.wywod ?? [];
  // ZWARCIA-PRO F3: wywod sekcyjny + checklista walidacji IEC (addytywne pola
  // odpowiedzi contributions) — takze wylacznie od realnego dostawcy.
  const wywodSekcjeWkladow = wklady ? [] : wkladyPobrane?.wywodSekcje ?? [];
  const walidacjaIecWkladow = wklady ? [] : wkladyPobrane?.walidacjaIec ?? [];
  // Partia 2 (zasada nr 4): dane przyjęte wkładów — wyłącznie od realnego dostawcy, jak wywód.
  const danePrzyjeteWkladow = wklady ? null : wkladyPobrane?.danePrzyjete ?? null;

  return (
    <div data-testid="mvd-zwarcia-ekran">
      <EkranAnalizy
        naglowek={{ analizaPL: ZWARCIA_STRINGS.analiza, runId: runId ?? undefined, ...swiezosc }}
        zalozenia={naZalozeniaZwarc(
          wynik.konfiguracja_biegu,
          wynik.zalozenia,
          (ref) => nazwaObiektu(ref),
          zmienTolerancjeNn,
        )}
        kolumny={KOLUMNY_ZWARC}
        wiersze={naWierszeZwarc(rows, nazwaObiektu)}
        wykres={<WykresZwarc rows={rows} />}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        szczegolyAudytowe={szczegolyAudytowe}
        kluczWiersza={KLUCZ_PUNKT}
        onWybierzWiersz={setWybranyPunkt}
        wybranyWiersz={aktywnyPunkt}
        // Karta UI2 p.6: punkty zwarciowe toru kanonicznego SĄ węzłami
        // sieci — ten sam typ, którego już używa siostrzana akcja „Pokaż na
        // schemacie" tego ekranu (`pokazNaSchemacie.ts`: `type: 'Bus'`).
        typElementuWiersza={() => 'Bus'}
        // Poprawka KLASA NIE INSTANCJA: klucz wiersza (`KLUCZ_PUNKT`) niesie
        // `target_id` (techniczny), a widoczna kolumna „Punkt" pokazuje nazwę z
        // mostu nazw wyników — inspektor dostaje tę samą nazwę (karta #145).
        nazwaElementuWiersza={(punktId) => {
          const wiersz = rows.find((r) => r.target_id === punktId);
          return wiersz ? nazwaPunktuZwarcia(wiersz, nazwaObiektu) : undefined;
        }}
      />

      <div className="mvd-zwarcia-akcje" data-testid="mvd-zwarcia-akcje">
        <button
          type="button"
          className="mvd-zwarcia-wykres-btn"
          data-testid="mvd-zwarcia-pokaz-sld"
          onClick={() => pokazNaSchemacie(wierszAktywny, runId, rozplyw.flows)}
        >
          {ZWARCIA_STRINGS.pokazNaSchemacie}
        </button>
      </div>

      {/* Ślad Z_Q (CV-4.3 K6/K7) — właściwość CAŁEGO biegu (nie wybranego punktu):
          renderuje się wyżej, obok tabeli głównej, przed sekcjami per-punkt. */}
      <SladZrodelSieciowych
        zrodlaSieciowe={wynik.zrodla_sieciowe}
        szczegolyAudytowe={szczegolyAudytowe}
        onOtworzDowod={onOtworzDowod}
      />

      {/* Karta W3-G3 (aneks D7): pasmo MIN/MAX — właściwość CAŁEGO biegu (jak
          ślad Z_Q wyżej), oba scenariusze c_max/c_min JEDNEGO przypadku obok
          siebie, z proweniencją każdej strony. */}
      <PasmoMinMax runId={runId} szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={onOtworzDowod} />

      {/* Karta TB-WARTOSC-ROBOCZA: „Zmień wartość" t_b roboczego → edycja t_b scenariusza
          zwarciowego TEGO biegu (albo nowy scenariusz z polem t_b dla biegu przypadku). */}
      <BilansIEC
        row={wierszAktywny}
        punktNazwa={nazwaAktywnego}
        onZmienCzasTb={() => otworzEdycjeCzasuTb(wynik.konfiguracja_biegu?.scenariusz_zwarciowy_id ?? null)}
      />

      {/* Ogniwo łańcucha: stacja TEGO punktu + zapisany bieg → werdykty wytrzymałości
          aparatury wszystkich pól stacji, każde przy prądzie swojego punktu zabudowy. */}
      <WeryfikacjaAparatury
        wiersz={wierszAktywny}
        runId={runId}
        punktNazwa={nazwaAktywnego}
        onOtworzKonfiguracjeStacji={otworzKonfiguracjeStacji}
        onZmienWartosc={zmienWartoscAparatu}
      />

      <RozplywZwarciowy
        punktNazwa={nazwaAktywnego}
        flows={rozplyw.flows}
        pominiete={rozplyw.pominiete}
        progA={rozplyw.progA}
        odczyt={rozplyw.odczyt}
        danePrzyjete={rozplyw.danePrzyjete}
        szczegolyAudytowe={szczegolyAudytowe}
        onOtworzDowod={onOtworzDowod}
      />

      {/* Karta WB-ROZPLYW: ślad WHITE BOX podziału prądu zwarciowego (TH-1) —
          ta sama odpowiedź co tabela rozpływu wyżej (jedno wywołanie), pod nią. */}
      <SladPodzialuPradu
        punktNazwa={nazwaAktywnego}
        trace={rozplyw.trace}
        odczyt={rozplyw.odczyt}
        szczegolyAudytowe={szczegolyAudytowe}
      />

      <WkladyZwarciowe
        punktNazwa={nazwaAktywnego}
        wklady={wkladyAktywne}
        odczyt={odczytWkladow}
        wywod={wywodWkladow}
        wywodSekcje={wywodSekcjeWkladow}
        walidacjaIec={walidacjaIecWkladow}
        danePrzyjete={danePrzyjeteWkladow}
        szczegolyAudytowe={szczegolyAudytowe}
        onOtworzDowod={onOtworzDowod}
      />
    </div>
  );
}
