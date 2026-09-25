/*
 * Sekcja „Pasmo MIN/MAX" (karta W3-G3, aneks D7, mapa domknięcia 3 #12) —
 * oba scenariusze c_max/c_min JEDNEGO przypadku obok siebie: Ik″ max/min per
 * szyna, ip, Ith, Sk″ i pełny bilans IEC 60909, z proweniencją KAŻDEJ strony
 * (identyfikator biegu, rewizja modelu, c, S″kQ — reużywa `SladZrodelSieciowych`
 * per strona). Dostawca danych: `usePasmoZwarcia` (`GET …/results/short-circuit/pasmo`,
 * `dobierz_pasmo_min_max_zwarcia` w backendzie — dwa biegi kanoniczne z
 * ISTNIEJĄCYCH wejść wykonania, zero nowej fizyki).
 *
 * Uczciwe stany (zero fabrykacji, zero cichego zestawienia):
 * - strona pasma niedostępna → komunikat NAZWANY (`powod_niedostepnosci_pl`)
 *   + akcja „Uruchom bieg {MAX|MIN}" (TEN SAM tor co przycisk „Oblicz");
 * - obie strony dostępne, ale z RÓŻNYCH rewizji modelu → ostrzeżenie świeżości
 *   (`FreshnessBadge`, JEDYNY współdzielony znacznik — `ui2/inspector`/
 *   `ui2/freshness`), nie ciche zestawienie liczb z różnych migawek;
 * - błąd pobrania (sieć/backend) → komunikat błędu, nie cisza.
 *
 * Zero fizyki, zero mutacji: parowanie wierszy i porównanie dwóch liczb
 * rewizji (`pasmoModel.ts`) to prezentacja, nie obliczenie.
 */

import type { AdvancementMode } from '../../shell/modeModel';
import { FreshnessBadge } from '../../inspector';
import { useUruchomObliczenie } from '../../spaces/obliczenia/uruchomObliczenie';
import {
  AKCJE_STANU_ZEROWEGO_STRINGS,
  InformacjeAudytowe,
  PrzyciskAkcjiStanu,
  TabelaWynikow,
  useNazwaObiektu,
  type AkcjaStanuZerowego,
} from '../wzorzec';
import { type PasmoZwarciaOdpowiedz, type StronaPasmaOdpowiedz, usePasmoZwarcia } from './api';
import {
  KLUCZ_PASMO,
  KOLUMNY_PASMO,
  naWierszePasma,
  sparujWierszePasma,
  swiezoscParyPasma,
  typZwarciaNaAnalysisType,
} from './pasmoModel';
import { SladZrodelSieciowych } from './SladZrodelSieciowych';
import { ZWARCIA_STRINGS } from './strings';

export interface PasmoMinMaxProps {
  /** Identyfikator biegu KOTWICY (dowolny scenariusz) — `null` = sekcja się nie montuje. */
  runId: string | null;
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
}

/** Jeden blok strony pasma (MAX albo MIN): proweniencja + akcja „Uruchom", gdy brak. */
function BlokStronyPasma({
  scenariusz,
  strona,
  brakujacyScenariusz,
  powodNiedostepnosciPl,
  akcjaUruchom,
  trybZaawansowania,
  onOtworzDowod,
}: {
  scenariusz: 'MAX' | 'MIN';
  /** `undefined` traktowany jak `null` (kontrakt honorowany defensywnie —
   * odpowiedź spoza kontraktu nie wywraca całego ekranu zwarć). */
  strona: StronaPasmaOdpowiedz | null | undefined;
  brakujacyScenariusz: 'MAX' | 'MIN' | null;
  powodNiedostepnosciPl: string | null;
  akcjaUruchom: AkcjaStanuZerowego | undefined;
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
}) {
  const etykietaScenariusza = scenariusz === 'MAX' ? 'MAX (c_max)' : 'MIN (c_min)';
  if (!strona) {
    return (
      <div
        className="mvd-zwarcia-pasmo-strona mvd-zwarcia-pasmo-strona--brak"
        data-testid={`mvd-zwarcia-pasmo-brak-${scenariusz.toLowerCase()}`}
      >
        <h4 className="mvd-zwarcia-pasmo-strona-tytul">{etykietaScenariusza}</h4>
        <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.pasmoBrakScenariusz(scenariusz)}</p>
        {powodNiedostepnosciPl && (
          <p className="mvd-zwarcia-wklady-brak-desc">{powodNiedostepnosciPl}</p>
        )}
        {brakujacyScenariusz === scenariusz && (
          <PrzyciskAkcjiStanu
            akcja={akcjaUruchom}
            testid={`mvd-zwarcia-pasmo-${scenariusz.toLowerCase()}`}
          />
        )}
      </div>
    );
  }
  const rewizja = strona.analysis_case_context.rewizja_modelu ?? null;
  return (
    <div className="mvd-zwarcia-pasmo-strona" data-testid={`mvd-zwarcia-pasmo-${scenariusz.toLowerCase()}`}>
      <h4 className="mvd-zwarcia-pasmo-strona-tytul">{etykietaScenariusza}</h4>
      <p className="mvd-zwarcia-pasmo-prowenencja">
        {strona.zrodlo === 'biegu_zapisanego'
          ? ZWARCIA_STRINGS.pasmoProwenencjaZapisany
          : ZWARCIA_STRINGS.pasmoProwenencjaObliczony}
        {' · '}
        {ZWARCIA_STRINGS.pasmoRewizja(rewizja)}
      </p>
      {/* Karta #145: identyfikatory biegów wyłącznie w „Informacjach audytowych". */}
      <InformacjeAudytowe
        trybEkspercki={trybZaawansowania === 'expert'}
        testid={`mvd-zwarcia-pasmo-${scenariusz.toLowerCase()}-informacje-audytowe`}
        wiersze={
          strona.zrodlo === 'biegu_zapisanego'
            ? [
                {
                  etykieta: ZWARCIA_STRINGS.pasmoIdentyfikatorBiegu,
                  wartosc: strona.run_id ?? strona.bieg_bazowy_id,
                },
              ]
            : [
                {
                  etykieta: ZWARCIA_STRINGS.pasmoIdentyfikatorKotwicy,
                  wartosc: strona.bieg_bazowy_id,
                },
              ]
        }
      />
      <SladZrodelSieciowych
        zrodlaSieciowe={strona.wynik.zrodla_sieciowe}
        trybZaawansowania={trybZaawansowania}
        onOtworzDowod={onOtworzDowod}
      />
    </div>
  );
}

function TrescGotowa({
  dane,
  trybZaawansowania,
  onOtworzDowod,
}: {
  dane: PasmoZwarciaOdpowiedz;
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
}) {
  const { uruchom, wToku } = useUruchomObliczenie();
  const nazwaObiektu = useNazwaObiektu();
  const brakujacy = dane.brakujacy_scenariusz;
  const akcjaUruchomBrakujacy: AkcjaStanuZerowego | undefined = brakujacy
    ? {
        etykieta: wToku
          ? AKCJE_STANU_ZEROWEGO_STRINGS.wToku
          : ZWARCIA_STRINGS.pasmoUruchomScenariusz(brakujacy),
        opis: ZWARCIA_STRINGS.pasmoUruchomScenariuszOpis(brakujacy),
        onKlik: () =>
          uruchom(typZwarciaNaAnalysisType(dane.typ_zwarcia_kotwicy), {
            scenario: brakujacy.toLowerCase(),
          }),
        wToku,
      }
    : undefined;

  const pary = sparujWierszePasma(dane.max?.wynik.rows, dane.min?.wynik.rows, nazwaObiektu);
  const swiezosc = swiezoscParyPasma(
    dane.max?.analysis_case_context.rewizja_modelu,
    dane.min?.analysis_case_context.rewizja_modelu,
  );

  return (
    <>
      <p className="mvd-zwarcia-wklad-szczegol-opis">{ZWARCIA_STRINGS.pasmoOpis}</p>

      {swiezosc && !swiezosc.zgodne && (
        <div className="mvd-zwarcia-pasmo-swiezosc" data-testid="mvd-zwarcia-pasmo-swiezosc">
          <FreshnessBadge
            rewizjaDanej={swiezosc.starsza}
            rewizjaModelu={swiezosc.nowsza}
            pokazAktualne={false}
            testId="mvd-zwarcia-pasmo-swiezosc-znacznik"
          />
          <p className="mvd-zwarcia-pasmo-swiezosc-opis">{ZWARCIA_STRINGS.pasmoRozbieznoscRewizji}</p>
        </div>
      )}

      {pary.length > 0 && (
        <TabelaWynikow
          kolumny={KOLUMNY_PASMO}
          wiersze={naWierszePasma(pary)}
          onOtworzDowod={onOtworzDowod}
          trybZaawansowania={trybZaawansowania}
          kluczWiersza={KLUCZ_PASMO}
        />
      )}

      <div className="mvd-zwarcia-pasmo-strony" data-testid="mvd-zwarcia-pasmo-strony">
        <BlokStronyPasma
          scenariusz="MAX"
          strona={dane.max}
          brakujacyScenariusz={brakujacy}
          powodNiedostepnosciPl={dane.powod_niedostepnosci_pl}
          akcjaUruchom={akcjaUruchomBrakujacy}
          trybZaawansowania={trybZaawansowania}
          onOtworzDowod={onOtworzDowod}
        />
        <BlokStronyPasma
          scenariusz="MIN"
          strona={dane.min}
          brakujacyScenariusz={brakujacy}
          powodNiedostepnosciPl={dane.powod_niedostepnosci_pl}
          akcjaUruchom={akcjaUruchomBrakujacy}
          trybZaawansowania={trybZaawansowania}
          onOtworzDowod={onOtworzDowod}
        />
      </div>
    </>
  );
}

export function PasmoMinMax({ runId, trybZaawansowania, onOtworzDowod }: PasmoMinMaxProps) {
  const stan = usePasmoZwarcia(runId);
  if (stan.rodzaj === 'brak-biegu') return null;

  return (
    <section
      className="mvd-zwarcia-pasmo"
      data-testid="mvd-zwarcia-pasmo"
      aria-label={ZWARCIA_STRINGS.pasmoTytul}
    >
      <h3 className="mvd-zwarcia-wklady-tytul">{ZWARCIA_STRINGS.pasmoTytul}</h3>

      {stan.rodzaj === 'wczytywanie' && (
        <p className="mvd-zwarcia-wklad-szczegol-opis" data-testid="mvd-zwarcia-pasmo-wczytywanie">
          {ZWARCIA_STRINGS.pasmoWczytywanie}
        </p>
      )}

      {stan.rodzaj === 'blad' && (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-pasmo-blad">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.pasmoBladPobrania}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.pasmoBladPobraniaOpis}</p>
        </div>
      )}

      {stan.rodzaj === 'gotowe' && (
        <TrescGotowa dane={stan.dane} trybZaawansowania={trybZaawansowania} onOtworzDowod={onOtworzDowod} />
      )}
    </section>
  );
}
