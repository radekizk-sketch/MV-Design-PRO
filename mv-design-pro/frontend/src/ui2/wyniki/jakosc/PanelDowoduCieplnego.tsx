/**
 * Panel dowodu obliczeniowego kryterium cieplnego (karta F-K1 faza 6,
 * Calculation Evidence — uwagi właściciela 1, 2, 4, 5, 6, 7, 9, 11, 13, 14, 15).
 *
 * DLACZEGO ISTNIEJE: raport OSD nie może być prezentacją wyniku. Musi pozwolić
 * niezależnie zweryfikować KAŻDĄ liczbę i KAŻDĄ decyzję algorytmu — dlatego panel
 * pokazuje bilans, kryteria cząstkowe z osobnym werdyktem, podstawę współczynnika k,
 * wrażliwość wyniku i działania naprawcze z progiem liczbowym.
 *
 * ZERO fizyki w UI: wszystkie wielkości, progi i zalecenia przychodzą gotowe z
 * backendu (`application/analyses/wytrzymalosc_cieplna_przewodow.py` →
 * `network_model/solvers/conductor_thermal_withstand.py`). Ten plik wyłącznie
 * porządkuje je na ekranie i formatuje.
 */

import type { AdvancementMode } from '../../shell/modeModel';
import { PrzegladDowodu } from '../dowod';
import type {
  DowodCieplnyResponse,
  NormaCieplna,
  PozycjaCieplna,
  StatusWarunku,
} from './api';
import { ikonaWarunku, ocenaWarunkuPL } from './jakoscModel';
import { JAKOSC_STRINGS, fmtLiczba, fmtWartosc } from './strings';

export interface PanelDowoduCieplnegoProps {
  pozycja: PozycjaCieplna;
  dowod: DowodCieplnyResponse | null;
  normy: readonly NormaCieplna[];
  trybZaawansowania: AdvancementMode;
  ladowanie: boolean;
  /** Prowadzi do gałęzi na schemacie (pętla decyzji wynik → model). */
  onPokazNaSchemacie: () => void;
}

function Werdykt({ status }: { status: StatusWarunku }) {
  // Ikona + tekst: sam kolor nie może nieść werdyktu (uwaga 9).
  return (
    <span className={`mvd-cieplny-werdykt mvd-cieplny-werdykt--${status.toLowerCase()}`}>
      <span aria-hidden="true">{ikonaWarunku(status)}</span> {ocenaWarunkuPL(status)}
    </span>
  );
}

/** Energia zwarcia ma rząd 10⁷ A²·s — skala „mln" zamiast piętnastu cyfr. */
function fmtEnergiaPelna(wartosc: number | null): string {
  if (wartosc === null) return JAKOSC_STRINGS.kreska;
  if (Math.abs(wartosc) >= 1_000_000) return `${fmtLiczba(wartosc / 1_000_000, 3)} mln A²·s`;
  return `${fmtWartosc(wartosc)} A²·s`;
}

export function PanelDowoduCieplnego({
  pozycja,
  dowod,
  normy,
  trybZaawansowania,
  ladowanie,
  onPokazNaSchemacie,
}: PanelDowoduCieplnegoProps) {
  const czas = pozycja.czas_wylaczenia;
  const k = pozycja.uzasadnienie_k;

  return (
    <section className="mvd-cieplny-dowod" data-testid="mvd-jakosc-cieplna-dowod">
      <header className="mvd-cieplny-dowod-head">
        <h3 className="mvd-cieplny-dowod-tytul">
          {JAKOSC_STRINGS.dowodTytul} — {pozycja.branch_name || pozycja.branch_id}
        </h3>
        <Werdykt status={pozycja.status} />
        <button
          type="button"
          className="mvd-cieplny-akcja"
          onClick={onPokazNaSchemacie}
          data-testid="mvd-jakosc-cieplna-pokaz-schemat"
        >
          {JAKOSC_STRINGS.pokazNaSchemacie}
        </button>
      </header>

      {/* --- Pełny bilans (uwaga 2) --- */}
      <dl className="mvd-cieplny-bilans" data-testid="mvd-jakosc-cieplna-bilans">
        <div>
          <dt>Prąd zwarciowy I_th</dt>
          <dd className="mvd-num">
            {pozycja.i_fault_a === null ? JAKOSC_STRINGS.kreska : `${fmtWartosc(pozycja.i_fault_a)} A`}
          </dd>
        </div>
        <div>
          <dt>Czas wyłączenia t</dt>
          <dd className="mvd-num">
            {czas?.tk_s == null ? JAKOSC_STRINGS.kreska : `${fmtLiczba(czas.tk_s, 3)} s`}
          </dd>
        </div>
        <div>
          <dt>Energia zwarcia I²·t</dt>
          <dd className="mvd-num">{fmtEnergiaPelna(pozycja.i2t_a2s)}</dd>
        </div>
        <div>
          <dt>Dopuszczalna energia k²·S²</dt>
          <dd className="mvd-num">{fmtEnergiaPelna(pozycja.i2t_dopuszczalne_a2s)}</dd>
        </div>
        <div>
          <dt>Wykorzystanie wytrzymałości</dt>
          <dd className="mvd-num">
            {pozycja.utilization === null
              ? JAKOSC_STRINGS.kreska
              : `${fmtWartosc(pozycja.utilization * 100)} %`}
          </dd>
        </div>
        <div>
          <dt>Margines bezpieczeństwa</dt>
          <dd className="mvd-num">
            {pozycja.margines_procent === null
              ? JAKOSC_STRINGS.kreska
              : `${fmtWartosc(pozycja.margines_procent)} %`}
          </dd>
        </div>
      </dl>

      {/* --- Kryteria cząstkowe (uwaga 1) --- */}
      {pozycja.kryteria.length > 0 && (
        <section className="mvd-cieplny-sekcja" data-testid="mvd-jakosc-cieplna-kryteria">
          <h4>{JAKOSC_STRINGS.sekcjaKryteria}</h4>
          <p className="mvd-cieplny-opis">{JAKOSC_STRINGS.sekcjaKryteriaOpis}</p>
          <table className="mvd-cieplny-tabela">
            <thead>
              <tr>
                <th>Kryterium</th>
                <th>Warunek</th>
                <th>Wartość</th>
                <th>Granica</th>
                <th>Werdykt</th>
              </tr>
            </thead>
            <tbody>
              {pozycja.kryteria.map((kryterium) => (
                <tr key={kryterium.kod}>
                  <td>{kryterium.nazwa_pl}</td>
                  <td className="mvd-mono">{kryterium.warunek_pl}</td>
                  <td className="mvd-num">
                    {kryterium.wartosc === null
                      ? JAKOSC_STRINGS.kreska
                      : `${fmtWartosc(kryterium.wartosc)} ${kryterium.jednostka}`}
                  </td>
                  <td className="mvd-num">
                    {kryterium.granica === null
                      ? JAKOSC_STRINGS.kreska
                      : `${fmtWartosc(kryterium.granica)} ${kryterium.jednostka}`}
                  </td>
                  <td>
                    <Werdykt status={kryterium.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* --- Działania naprawcze z progiem (uwagi 4 i 15) --- */}
      {pozycja.zalecenia.length > 0 && (
        <section className="mvd-cieplny-sekcja" data-testid="mvd-jakosc-cieplna-zalecenia">
          <h4>{JAKOSC_STRINGS.sekcjaZalecenia}</h4>
          <p className="mvd-cieplny-opis">{JAKOSC_STRINGS.sekcjaZaleceniaOpis}</p>
          <table className="mvd-cieplny-tabela">
            <thead>
              <tr>
                <th>{JAKOSC_STRINGS.kolumnaDzialanie}</th>
                <th>Wzór</th>
                <th>{JAKOSC_STRINGS.kolumnaObecnie}</th>
                <th>{JAKOSC_STRINGS.kolumnaDocelowo}</th>
                <th>{JAKOSC_STRINGS.kolumnaSkutek}</th>
              </tr>
            </thead>
            <tbody>
              {pozycja.zalecenia.map((zalecenie) => (
                <tr key={zalecenie.kod}>
                  <td>{zalecenie.dzialanie_pl}</td>
                  <td className="mvd-mono">{zalecenie.wzor}</td>
                  <td className="mvd-num">
                    {zalecenie.wartosc_obecna === null
                      ? JAKOSC_STRINGS.kreska
                      : `${fmtWartosc(zalecenie.wartosc_obecna)} ${zalecenie.jednostka}`}
                  </td>
                  <td className="mvd-num">
                    {fmtWartosc(zalecenie.wartosc_docelowa)} {zalecenie.jednostka}
                  </td>
                  <td>{zalecenie.skutek_pl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* --- Wrażliwość (uwaga 13) --- */}
      {pozycja.wrazliwosc.length > 0 && (
        <section className="mvd-cieplny-sekcja" data-testid="mvd-jakosc-cieplna-wrazliwosc">
          <h4>{JAKOSC_STRINGS.sekcjaWrazliwosc}</h4>
          <p className="mvd-cieplny-opis">{JAKOSC_STRINGS.sekcjaWrazliwoscOpis}</p>
          <table className="mvd-cieplny-tabela">
            <thead>
              <tr>
                <th>{JAKOSC_STRINGS.kolumnaParametr}</th>
                <th>{JAKOSC_STRINGS.kolumnaWartosc}</th>
                <th>{JAKOSC_STRINGS.kolumnaWykorzystanie}</th>
                <th>Werdykt przy tej wartości</th>
              </tr>
            </thead>
            <tbody>
              {pozycja.wrazliwosc.map((punkt) => (
                <tr key={`${punkt.parametr}-${punkt.mnoznik}`}>
                  <td>{punkt.nazwa_pl}</td>
                  <td className="mvd-num">
                    {fmtWartosc(punkt.wartosc)} {punkt.jednostka}
                  </td>
                  <td className="mvd-num">{fmtWartosc(punkt.wykorzystanie * 100)} %</td>
                  <td>
                    <Werdykt status={punkt.wykorzystanie <= 1 ? 'PASS' : 'FAIL'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* --- Podstawa k i parametry materiałowe (uwagi 6 i 7) --- */}
      {k && (
        <section className="mvd-cieplny-sekcja" data-testid="mvd-jakosc-cieplna-material">
          <h4>{JAKOSC_STRINGS.sekcjaMaterial}</h4>
          <dl className="mvd-cieplny-bilans">
            <div>
              <dt>Współczynnik k</dt>
              <dd className="mvd-num">
                {k.k_a_s05_per_mm2 === null
                  ? JAKOSC_STRINGS.kreska
                  : `${fmtWartosc(k.k_a_s05_per_mm2)} A·√s/mm²`}
              </dd>
            </div>
            <div>
              <dt>{JAKOSC_STRINGS.polRodzajPrzewodu}</dt>
              <dd data-testid="mvd-jakosc-cieplna-rodzaj">
                {k.rodzaj_przewodu_pl ?? JAKOSC_STRINGS.kreska}
              </dd>
            </div>
            <div>
              <dt>Materiał żyły</dt>
              <dd>{k.material_zyly ?? JAKOSC_STRINGS.kreska}</dd>
            </div>
            <div>
              <dt>Izolacja</dt>
              <dd>{k.izolacja ?? JAKOSC_STRINGS.kreska}</dd>
            </div>
            <div>
              <dt>Temperatura początkowa</dt>
              <dd className="mvd-num">
                {k.temp_poczatkowa_c === null
                  ? JAKOSC_STRINGS.kreska
                  : `${fmtWartosc(k.temp_poczatkowa_c)} °C`}
              </dd>
            </div>
            <div>
              <dt>Temperatura końcowa</dt>
              <dd className="mvd-num">
                {k.temp_koncowa_c === null
                  ? JAKOSC_STRINGS.kreska
                  : `${fmtWartosc(k.temp_koncowa_c)} °C`}
              </dd>
            </div>
            <div>
              <dt>{JAKOSC_STRINGS.polZrodloMaterialowe}</dt>
              <dd>{k.zrodlo_pl ?? JAKOSC_STRINGS.kreska}</dd>
            </div>
            {/*
              V12K-224: POCHODZENIE k jest osobnym faktem niz zrodlo danych
              materialowych. Bez tego wiersza projektant nie odrozni wartosci
              producenta od policzonej ze wzoru normy — a to rozstrzyga, czy liczbe
              wolno wstawic do dokumentacji bez karty katalogowej.
            */}
            <div>
              <dt>{JAKOSC_STRINGS.polPochodzenieK}</dt>
              <dd data-testid="mvd-jakosc-cieplna-pochodzenie-k">
                {k.zrodlo_k_pl ?? JAKOSC_STRINGS.kreska}
              </dd>
            </div>
          </dl>
          <p className="mvd-cieplny-opis">{k.tozsamosc_pl}</p>
          {k.zrodlo_k === 'WYPROWADZONE_IEC60949' && (
            <p className="mvd-cieplny-brak" data-testid="mvd-jakosc-cieplna-k-wyprowadzone">
              {JAKOSC_STRINGS.ostrzezenieKWyprowadzone}
            </p>
          )}
          {k.granica_temperatury_pl && (
            <p className="mvd-cieplny-opis" data-testid="mvd-jakosc-cieplna-granica-temp">
              {k.granica_temperatury_pl}
            </p>
          )}
          {!k.kompletne && (
            <p className="mvd-cieplny-brak" data-testid="mvd-jakosc-cieplna-brak-k">
              {JAKOSC_STRINGS.brakUzasadnieniaK}
              {k.braki_pl.join(', ')}.
            </p>
          )}
        </section>
      )}

      {/* --- Podstawa normowa z punktem (uwaga 14) --- */}
      {normy.length > 0 && (
        <section className="mvd-cieplny-sekcja" data-testid="mvd-jakosc-cieplna-normy">
          <h4>{JAKOSC_STRINGS.sekcjaNormy}</h4>
          <ul className="mvd-cieplny-normy">
            {normy.map((norma) => (
              <li key={`${norma.norma}-${norma.punkt}`}>
                <b>
                  {norma.norma} {norma.punkt}
                </b>{' '}
                — {norma.tresc_pl}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Ścieżka obliczeniowa: wzór → dane → podstawienie → wynik (uwaga 8) --- */}
      <PrzegladDowodu
        analizaPL={JAKOSC_STRINGS.sciezkaObliczeniowa}
        kroki={dowod ? [...dowod.kroki] : []}
        trybZaawansowania={trybZaawansowania}
        ladowanie={ladowanie}
      />
    </section>
  );
}
