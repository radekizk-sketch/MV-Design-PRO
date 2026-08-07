/*
 * EkranAnalizAkademickich — okno „Analizy akademickie" (ui2/wyniki/akademickie).
 *
 * Domyka wiersz „Pakiet akademicki V12.6" inwentarza (◐): CZTERNAŚCIE rodzajów analiz
 * kontraktu `V126AnalysisType` miało jedną powierzchnię zastaną `V126AcademicSurface`
 * (334 wiersze, ZERO testów) osiągalną tylko przez ekrany E-40…E-50, a dwa rodzaje
 * (`neutral_earthing_design`, `earth_fault_detection`) nie miały żadnego wejścia.
 *
 * Okno jest PARAMETRYZOWANE RODZAJEM, a nie powielone czternaście razy — decyzja
 * z pomiaru kontraktu: wszystkie rodzaje dzielą identyczne koperty odpowiedzi
 * (`AcademicAnalysisResultV1`, `AcademicWhiteBoxTraceV1`, `AcademicProofPackV1`,
 * `AcademicReportV1`), a różnią się wyłącznie zawartością słownika `result` i
 * zestawem parametrów wejściowych. Jedyny rodzaj z DODATKOWYM kontraktem —
 * `ssci_impedance` (`…/stability`, werdykt Nyquista) — zachowuje własne okno
 * „Stabilność SSCI"; to okno kieruje do niego zamiast duplikować werdykt.
 *
 * Naprawy wobec powierzchni zastanej (klasa, nie instancja):
 *  - ślad, dowód i raport BEZ zaszytych limitów (`slice(0,8)` / `slice(0,3)`);
 *  - wynik spłaszczany W CAŁOŚCI (`slice(0,18)/(0,8)/(0,6)` gubiło do 11 pól);
 *  - lista rodzajów Z KATALOGU backendu, nie z kopii kontraktu w kodzie ekranu;
 *  - ZERO zaszytych danych wejściowych (koniec fabrykowanego silnika 630 kW);
 *  - kolory wyłącznie przez tokeny `--mvd-*`;
 *  - świeżość z JEDNEGO źródła (`useSwiezoscWynikow` — wspólny kontrakt E15.2).
 *
 * Zero fizyki w UI: wszystkie wielkości pochodzą z solvera; okno je porządkuje.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import './akademickie.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useAppStateStore } from '../../../ui/app-state';
import { useShellStore } from '../../shell/useShellStore';
import { opisSwiezosci, useSwiezoscWynikow } from '../../freshness';
import { PrzyciskAkcjiStanu, useAkcjaPrzejdzDoPrzypadkow } from '../wzorzec';
import type { AkcjaStanuZerowego } from '../wzorzec';
import {
  pobierzDowod,
  pobierzKatalog,
  pobierzRaport,
  pobierzRodzajeAnaliz,
  pobierzSlad,
  pobierzWynik,
  utworzPrzebieg,
  type OdpowiedzWyniku,
  type OdpowiedzSladu,
  type PakietDowodu,
  type PrzebiegAkademicki,
  type RaportAnalizy,
  type RodzajAnalizy,
} from './api';
import { katalogRodzaju } from './katalog';
import {
  krokiDowoduDoWidoku,
  krokiSladuDoWidoku,
  licznikMetrykRaportu,
  pogrupujWynik,
  sekcjeRaportuDoWidoku,
  splaszczWynik,
} from './model';
import { maParametry, zbudujParametry, type StanPol, type WierszListy } from './parametry';
import { FormularzParametrow } from './FormularzParametrow';
import { AKADEMICKIE_STRINGS as S, etykietaRodzaju, fmtWartosc, opisRodzaju } from './strings';

// ---------------------------------------------------------------------------
// Panele stanu
// ---------------------------------------------------------------------------

function StanPanel({
  komunikat,
  opis,
  wariant,
  testid,
  akcja,
}: {
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
  akcja?: AkcjaStanuZerowego;
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-akad-stan mvd-akad-stan--blad' : 'mvd-akad-stan'}
      data-testid={testid}
    >
      <p className="mvd-akad-stan-title">{komunikat}</p>
      {opis && <p className="mvd-akad-stan-desc">{opis}</p>}
      <PrzyciskAkcjiStanu akcja={akcja} testid={testid} />
    </div>
  );
}

function Zwijana({
  tytul,
  licznik,
  opis,
  testid,
  pokaz,
  ukryj,
  domyslnieOtwarte,
  children,
}: {
  tytul: string;
  licznik: string;
  opis?: string;
  testid: string;
  pokaz: string;
  ukryj: string;
  domyslnieOtwarte?: boolean;
  children: React.ReactNode;
}) {
  const [otwarte, setOtwarte] = useState(domyslnieOtwarte === true);
  return (
    <section className="mvd-akad-sekcja" data-testid={testid}>
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{tytul}</h3>
        <span className="mvd-akad-licznik mvd-num" data-testid={`${testid}-licznik`}>
          {licznik}
        </span>
        <button
          type="button"
          className="mvd-akad-btn-wtorny"
          aria-expanded={otwarte}
          data-testid={`${testid}-przelacz`}
          onClick={() => setOtwarte((stan) => !stan)}
        >
          {otwarte ? ukryj : pokaz}
        </button>
      </div>
      {opis && <p className="mvd-akad-opis">{opis}</p>}
      {otwarte && children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Wynik — PEŁNE spłaszczenie
// ---------------------------------------------------------------------------

function PanelWyniku({ wynik }: { wynik: OdpowiedzWyniku }) {
  const wiersze = useMemo(() => splaszczWynik(wynik.result.result), [wynik]);
  const grupy = useMemo(() => pogrupujWynik(wiersze), [wiersze]);

  if (wiersze.length === 0) {
    return (
      <section className="mvd-akad-sekcja" data-testid="mvd-akad-wynik">
        <h3 className="mvd-akad-sekcja-tytul">{S.wynikTytul}</h3>
        <p className="mvd-akad-opis">{S.wynikPusty}</p>
      </section>
    );
  }

  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-wynik">
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{S.wynikTytul}</h3>
        <span className="mvd-akad-licznik mvd-num" data-testid="mvd-akad-wynik-licznik">
          {S.wynikLiczbaPol(wiersze.length)}
        </span>
      </div>
      <p className="mvd-akad-opis">{S.wynikOpis}</p>
      {grupy.map((grupa) => (
        <div className="mvd-akad-grupa" key={grupa.klucz} data-testid={`mvd-akad-grupa-${grupa.klucz}`}>
          <h4 className="mvd-akad-grupa-tytul">{grupa.klucz}</h4>
          <div className="mvd-akad-wiersze">
            {grupa.wiersze.map((wiersz) => (
              <div className="mvd-akad-wiersz" key={wiersz.sciezka}>
                <span className="mvd-akad-wiersz-etyk">{wiersz.sciezka}</span>
                <span className="mvd-akad-wiersz-wartosc mvd-num">{fmtWartosc(wiersz.wartosc)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ślad WHITE BOX — komplet kroków
// ---------------------------------------------------------------------------

function PanelSladu({ slad }: { slad: OdpowiedzSladu }) {
  const kroki = krokiSladuDoWidoku(slad.steps);
  return (
    <Zwijana
      tytul={S.sladTytul}
      opis={S.sladOpis}
      licznik={S.sladKrokow(kroki.length)}
      testid="mvd-akad-slad"
      pokaz={S.sladPokaz}
      ukryj={S.sladUkryj}
    >
      {kroki.length === 0 ? (
        <p className="mvd-akad-opis">{S.sladPusty}</p>
      ) : (
        <div className="mvd-akad-tabela-otoczka">
          <table className="mvd-akad-tabela">
            <thead>
              <tr>
                <th>{S.sladKolKrok}</th>
                <th>{S.sladKolWzor}</th>
                <th>{S.sladKolPodstawienie}</th>
                <th>{S.sladKolWynik}</th>
                <th>{S.sladKolJednostka}</th>
              </tr>
            </thead>
            <tbody>
              {kroki.map((krok) => (
                <tr key={krok.proof_ref} data-testid={`mvd-akad-slad-krok-${krok.step}`}>
                  <td className="mvd-num">{krok.step}</td>
                  <td className="mvd-num">{krok.formula}</td>
                  <td>{krok.substitution}</td>
                  <td className="mvd-num">{fmtWartosc(krok.result)}</td>
                  <td>{krok.unit_check}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Zwijana>
  );
}

// ---------------------------------------------------------------------------
// Dowód — komplet kroków pakietu
// ---------------------------------------------------------------------------

function PanelDowodu({ dowod }: { dowod: PakietDowodu }) {
  const kroki = krokiDowoduDoWidoku(dowod.steps);
  return (
    <Zwijana
      tytul={S.dowodTytul}
      opis={S.dowodOpis}
      licznik={S.sladKrokow(kroki.length)}
      testid="mvd-akad-dowod"
      pokaz={S.dowodPokaz}
      ukryj={S.dowodUkryj}
    >
      <div className="mvd-akad-wiersze">
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.dowodId}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{dowod.proof_id}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.dowodOdcisk}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{dowod.proof_hash}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.dowodKrokow}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{dowod.trace_step_count}</span>
        </div>
      </div>
      {kroki.length === 0 ? (
        <p className="mvd-akad-opis">{S.dowodPusty}</p>
      ) : (
        <div className="mvd-akad-tabela-otoczka">
          <table className="mvd-akad-tabela">
            <thead>
              <tr>
                <th>{S.sladKolKrok}</th>
                <th>{S.sladKolWzor}</th>
                <th>{S.sladKolPodstawienie}</th>
                <th>{S.sladKolWynik}</th>
                <th>{S.sladKolJednostka}</th>
              </tr>
            </thead>
            <tbody>
              {kroki.map((krok) => (
                <tr key={krok.proof_ref} data-testid={`mvd-akad-dowod-krok-${krok.ordinal}`}>
                  <td className="mvd-num">{krok.ordinal}</td>
                  <td className="mvd-num">{krok.formula ?? S.kreska}</td>
                  <td>{krok.substitution ?? S.kreska}</td>
                  <td className="mvd-num">{fmtWartosc(krok.result)}</td>
                  <td>{krok.unit_check ?? S.kreska}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Zwijana>
  );
}

// ---------------------------------------------------------------------------
// Raport — komplet sekcji i metryk
// ---------------------------------------------------------------------------

function PanelRaportu({ raport }: { raport: RaportAnalizy }) {
  const sekcje = sekcjeRaportuDoWidoku(raport);
  return (
    <Zwijana
      tytul={S.raportTytul}
      opis={S.raportOpis}
      licznik={`${S.raportSekcji(sekcje.length)} · ${S.raportMetryk(licznikMetrykRaportu(raport))}`}
      testid="mvd-akad-raport"
      pokaz={S.dowodPokaz}
      ukryj={S.dowodUkryj}
    >
      <div className="mvd-akad-wiersze">
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.raportId}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{raport.report_id}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.raportOdcisk}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{raport.report_hash}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.raportPolityka}</span>
          <span className="mvd-akad-wiersz-wartosc">{raport.export_policy}</span>
        </div>
      </div>
      {sekcje.length === 0 ? (
        <p className="mvd-akad-opis">{S.raportPusty}</p>
      ) : (
        sekcje.map((sekcja) => (
          <div className="mvd-akad-grupa" key={sekcja.section_id} data-testid={`mvd-akad-raport-sekcja-${sekcja.section_id}`}>
            <h4 className="mvd-akad-grupa-tytul">{sekcja.title}</h4>
            <div className="mvd-akad-wiersze">
              {sekcja.metrics.map((metryka) => (
                <div className="mvd-akad-wiersz" key={`${sekcja.section_id}:${metryka.label}`}>
                  <span className="mvd-akad-wiersz-etyk">{metryka.label}</span>
                  <span className="mvd-akad-wiersz-wartosc mvd-num">{fmtWartosc(metryka.value)}</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </Zwijana>
  );
}

// ---------------------------------------------------------------------------
// Dane odniesienia (katalog V12.6)
// ---------------------------------------------------------------------------

type StanKatalogu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly pozycje: readonly { sciezka: string; wartosc: unknown }[] };

function PanelKatalogu({ namespace }: { namespace: string }) {
  const [stan, setStan] = useState<StanKatalogu>({ rodzaj: 'idle' });
  const [otwarte, setOtwarte] = useState(false);

  const wczytaj = useCallback(() => {
    setStan({ rodzaj: 'ladowanie' });
    pobierzKatalog(namespace)
      .then((odpowiedz) => {
        const pozycje = splaszczWynik(odpowiedz.items).map((wiersz) => ({
          sciezka: wiersz.sciezka,
          wartosc: wiersz.wartosc,
        }));
        setStan({ rodzaj: 'gotowe', pozycje });
      })
      .catch((err: unknown) => {
        setStan({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : S.katalogBlad });
      });
  }, [namespace]);

  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-katalog">
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{S.katalogTytul}</h3>
        <button
          type="button"
          className="mvd-akad-btn-wtorny"
          aria-expanded={otwarte}
          data-testid="mvd-akad-katalog-przelacz"
          onClick={() => {
            const nastepny = !otwarte;
            setOtwarte(nastepny);
            if (nastepny && stan.rodzaj === 'idle') wczytaj();
          }}
        >
          {otwarte ? S.katalogUkryj : S.katalogPokaz}
        </button>
      </div>
      {otwarte && (
        <>
          <p className="mvd-akad-opis">{S.katalogOpis}</p>
          {stan.rodzaj === 'ladowanie' && <p className="mvd-akad-opis">{S.katalogLadowanie}</p>}
          {stan.rodzaj === 'blad' && (
            <StanPanel
              komunikat={S.katalogBlad}
              opis={stan.komunikat}
              wariant="blad"
              testid="mvd-akad-katalog-blad"
            />
          )}
          {stan.rodzaj === 'gotowe' && (
            <div className="mvd-akad-wiersze">
              {stan.pozycje.map((pozycja) => (
                <div className="mvd-akad-wiersz" key={pozycja.sciezka}>
                  <span className="mvd-akad-wiersz-etyk">{pozycja.sciezka}</span>
                  <span className="mvd-akad-wiersz-wartosc mvd-num">{fmtWartosc(pozycja.wartosc)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stany zasobów
// ---------------------------------------------------------------------------

interface KompletArtefaktow {
  readonly przebieg: PrzebiegAkademicki;
  readonly wynik: OdpowiedzWyniku;
  readonly slad: OdpowiedzSladu;
  readonly dowod: PakietDowodu;
  readonly raport: RaportAnalizy;
}

type StanBiegu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: KompletArtefaktow };

type StanRodzajow =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly kody: readonly string[] };

// ---------------------------------------------------------------------------
// Okno
// ---------------------------------------------------------------------------

export interface EkranAnalizAkademickichProps {
  readonly trybZaawansowania: AdvancementMode;
  /** Rodzaj wybrany z góry (wejście z ekranu trasowego) — użytkownik może go zmienić. */
  readonly rodzajPoczatkowy?: RodzajAnalizy;
}

export function EkranAnalizAkademickich({
  trybZaawansowania,
  rodzajPoczatkowy,
}: EkranAnalizAkademickichProps) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const akcjaPrzypadki = useAkcjaPrzejdzDoPrzypadkow();
  const trybEkspercki = trybZaawansowania === 'expert';
  const swiezosc = useSwiezoscWynikow();

  const [rodzaje, setRodzaje] = useState<StanRodzajow>({ rodzaj: 'ladowanie' });
  const [wybrany, setWybrany] = useState<string>(rodzajPoczatkowy ?? '');
  const [stan, setStan] = useState<StanBiegu>({ rodzaj: 'idle' });

  const [pola, setPola] = useState<StanPol>({});
  const [uziom, setUziom] = useState<StanPol>({});
  const [metody, setMetody] = useState<readonly string[]>([]);
  const [wiersze, setWiersze] = useState<readonly WierszListy[]>([]);
  const [parametryOtwarte, setParametryOtwarte] = useState(false);

  const wczytajRodzaje = useCallback(() => {
    setRodzaje({ rodzaj: 'ladowanie' });
    pobierzRodzajeAnaliz()
      .then((kody) => {
        setRodzaje({ rodzaj: 'gotowe', kody });
        setWybrany((biezacy) => {
          if (biezacy !== '' && kody.includes(biezacy)) return biezacy;
          return kody[0] ?? '';
        });
      })
      .catch((err: unknown) => {
        setRodzaje({
          rodzaj: 'blad',
          komunikat: err instanceof Error ? err.message : S.rodzajeBlad,
        });
      });
  }, []);

  // Bez aktywnego przypadku okno nie ma czego uruchomić, więc NIE pyta backendu
  // o katalog rodzajów — stan zerowy jest w pełni lokalny (wzór `EkranSsci`).
  useEffect(() => {
    if (activeCaseId === null) return;
    wczytajRodzaje();
  }, [activeCaseId, wczytajRodzaje]);

  // Zmiana rodzaju zeruje wynik i formularz — parametry jednego rodzaju nie mogą
  // wyciec do żądania innego (klucze są rozłączne wg kontraktu solvera).
  const zmienRodzaj = (kod: string) => {
    setWybrany(kod);
    setStan({ rodzaj: 'idle' });
    setPola({});
    setUziom({});
    setMetody([]);
    setWiersze([]);
  };

  const uruchom = () => {
    if (activeCaseId === null || wybrany === '') return;
    const rodzajBiegu = wybrany as RodzajAnalizy;
    const parametry = zbudujParametry({ rodzaj: wybrany, pola, uziom, metody, wiersze });
    setStan({ rodzaj: 'ladowanie' });
    utworzPrzebieg(activeCaseId, rodzajBiegu, parametry)
      .then(async (przebieg) => {
        const [wynik, slad, dowod, raport] = await Promise.all([
          pobierzWynik(przebieg.run_id, rodzajBiegu),
          pobierzSlad(przebieg.run_id, rodzajBiegu),
          pobierzDowod(przebieg.run_id, rodzajBiegu),
          pobierzRaport(przebieg.run_id, rodzajBiegu),
        ]);
        setStan({ rodzaj: 'gotowe', dane: { przebieg, wynik, slad, dowod, raport } });
      })
      .catch((err: unknown) => {
        setStan({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : S.blad });
      });
  };

  // Bez aktywnego przypadku — uczciwa instrukcja z akcją (bez wołań API).
  if (activeCaseId === null) {
    return (
      <div className="mvd-akad" data-testid="mvd-akad-ekran">
        <header className="mvd-akad-naglowek">
          <h2 className="mvd-akad-tytul">{S.tytul}</h2>
          <p className="mvd-akad-opis">{S.opisWstep}</p>
        </header>
        <StanPanel
          komunikat={S.brakPrzypadku}
          opis={S.brakPrzypadkuOpis}
          wariant="info"
          testid="mvd-akad-brak-przypadku"
          akcja={akcjaPrzypadki}
        />
      </div>
    );
  }

  const namespaceKatalogu = wybrany === '' ? null : katalogRodzaju(wybrany);
  const rodzajMaParametry = wybrany !== '' && maParametry(wybrany);

  return (
    <div className="mvd-akad" data-testid="mvd-akad-ekran">
      <header className="mvd-akad-naglowek">
        <h2 className="mvd-akad-tytul">{S.tytul}</h2>
        <p className="mvd-akad-opis">{S.opisWstep}</p>
        <p className="mvd-akad-swiezosc" data-testid="mvd-akad-swiezosc">
          {S.swiezoscEtykieta}: <span className="mvd-num">{opisSwiezosci(swiezosc)}</span>
        </p>
      </header>

      <section className="mvd-akad-sekcja" data-testid="mvd-akad-wybor">
        <h3 className="mvd-akad-sekcja-tytul">{S.wyborTytul}</h3>
        <p className="mvd-akad-opis">{S.wyborOpis}</p>
        {rodzaje.rodzaj === 'ladowanie' && <p className="mvd-akad-opis">{S.rodzajeLadowanie}</p>}
        {rodzaje.rodzaj === 'blad' && (
          <StanPanel
            komunikat={S.rodzajeBlad}
            opis={rodzaje.komunikat}
            wariant="blad"
            testid="mvd-akad-rodzaje-blad"
            akcja={{ etykieta: S.rodzajePonow, onKlik: wczytajRodzaje }}
          />
        )}
        {rodzaje.rodzaj === 'gotowe' && rodzaje.kody.length === 0 && (
          <StanPanel
            komunikat={S.rodzajeBrak}
            opis={S.rodzajeBrakOpis}
            wariant="info"
            testid="mvd-akad-rodzaje-brak"
            akcja={{ etykieta: S.rodzajePonow, onKlik: wczytajRodzaje }}
          />
        )}
        {rodzaje.rodzaj === 'gotowe' && rodzaje.kody.length > 0 && (
          <label className="mvd-akad-pole" htmlFor="mvd-akad-rodzaj">
            <span className="mvd-akad-pole-etyk">{S.wyborEtykieta}</span>
            <select
              id="mvd-akad-rodzaj"
              className="mvd-akad-pole-kontrolka"
              value={wybrany}
              data-testid="mvd-akad-rodzaj"
              onChange={(zdarzenie) => zmienRodzaj(zdarzenie.target.value)}
            >
              {rodzaje.kody.map((kod) => (
                <option key={kod} value={kod}>
                  {etykietaRodzaju(kod)}
                </option>
              ))}
            </select>
          </label>
        )}
        {wybrany !== '' && <p className="mvd-akad-opis">{opisRodzaju(wybrany)}</p>}
        {wybrany === 'ssci_impedance' && (
          <div className="mvd-akad-odeslanie" data-testid="mvd-akad-odeslanie-ssci">
            <p className="mvd-akad-opis">{S.odeslanieSsci}</p>
            <button
              type="button"
              className="mvd-akad-btn-wtorny"
              data-testid="mvd-akad-przejdz-ssci"
              onClick={() => setWynikiTab('ssci')}
            >
              {etykietaRodzaju('ssci_impedance')}
            </button>
          </div>
        )}
      </section>

      {wybrany !== '' && (
        <section className="mvd-akad-sekcja" data-testid="mvd-akad-uruchomienie">
          <div className="mvd-akad-sekcja-naglowek">
            <h3 className="mvd-akad-sekcja-tytul">{S.parametryTytul}</h3>
            {rodzajMaParametry && (
              <button
                type="button"
                className="mvd-akad-btn-wtorny"
                aria-expanded={parametryOtwarte}
                data-testid="mvd-akad-parametry-przelacz"
                onClick={() => setParametryOtwarte((otwarte) => !otwarte)}
              >
                {parametryOtwarte ? S.parametryUkryj : S.parametryPokaz}
              </button>
            )}
          </div>
          {!rodzajMaParametry && <p className="mvd-akad-opis">{S.parametryBrak}</p>}
          {rodzajMaParametry && parametryOtwarte && (
            <FormularzParametrow
              rodzaj={wybrany}
              pola={pola}
              uziom={uziom}
              metody={metody}
              wiersze={wiersze}
              onPole={(klucz, wartosc) => setPola((stanPol) => ({ ...stanPol, [klucz]: wartosc }))}
              onUziom={(klucz, wartosc) => setUziom((stanPol) => ({ ...stanPol, [klucz]: wartosc }))}
              onMetoda={(metoda, wlaczona) =>
                setMetody((lista) =>
                  wlaczona ? [...lista, metoda] : lista.filter((pozycja) => pozycja !== metoda),
                )
              }
              onWiersz={(indeks, klucz, wartosc) =>
                setWiersze((lista) =>
                  lista.map((wiersz, i) => (i === indeks ? { ...wiersz, [klucz]: wartosc } : wiersz)),
                )
              }
              onDodajWiersz={() => setWiersze((lista) => [...lista, {}])}
              onUsunWiersz={(indeks) =>
                setWiersze((lista) => lista.filter((_, i) => i !== indeks))
              }
            />
          )}
          <p className="mvd-akad-opis">{S.uruchomOpis}</p>
          <button
            type="button"
            className="mvd-akad-btn"
            onClick={uruchom}
            disabled={stan.rodzaj === 'ladowanie'}
            data-testid="mvd-akad-uruchom"
          >
            {stan.rodzaj === 'gotowe' || stan.rodzaj === 'blad' ? S.uruchomPonownie : S.uruchom}
          </button>
        </section>
      )}

      {stan.rodzaj === 'ladowanie' && (
        <StanPanel komunikat={S.ladowanie} wariant="info" testid="mvd-akad-ladowanie" />
      )}
      {stan.rodzaj === 'blad' && (
        <StanPanel komunikat={S.blad} opis={stan.komunikat} wariant="blad" testid="mvd-akad-blad" />
      )}

      {stan.rodzaj === 'gotowe' && (
        <div data-testid="mvd-akad-wyniki">
          <section className="mvd-akad-sekcja" data-testid="mvd-akad-przebieg">
            <div className="mvd-akad-wiersze">
              <div className="mvd-akad-wiersz">
                <span className="mvd-akad-wiersz-etyk">{S.statusPrzebiegu}</span>
                <span className="mvd-akad-wiersz-wartosc">{stan.dane.przebieg.status}</span>
              </div>
              <div className="mvd-akad-wiersz">
                <span className="mvd-akad-wiersz-etyk">{S.odcisk}</span>
                <span className="mvd-akad-wiersz-wartosc mvd-num">
                  {stan.dane.przebieg.deterministic_hash}
                </span>
              </div>
              {trybEkspercki && (
                <>
                  <div className="mvd-akad-wiersz">
                    <span className="mvd-akad-wiersz-etyk">{S.runId}</span>
                    <span className="mvd-akad-wiersz-wartosc mvd-num">{stan.dane.przebieg.run_id}</span>
                  </div>
                  <div className="mvd-akad-wiersz">
                    <span className="mvd-akad-wiersz-etyk">{S.wersjaSolwera}</span>
                    <span className="mvd-akad-wiersz-wartosc mvd-num">
                      {stan.dane.wynik.result.solver_version}
                    </span>
                  </div>
                  <div className="mvd-akad-wiersz">
                    <span className="mvd-akad-wiersz-etyk">{S.odciskWejscia}</span>
                    <span className="mvd-akad-wiersz-wartosc mvd-num">
                      {stan.dane.wynik.result.input_hash}
                    </span>
                  </div>
                  <div className="mvd-akad-wiersz">
                    <span className="mvd-akad-wiersz-etyk">{S.utworzono}</span>
                    <span className="mvd-akad-wiersz-wartosc mvd-num">{stan.dane.wynik.created_at}</span>
                  </div>
                </>
              )}
            </div>
          </section>

          <PanelWyniku wynik={stan.dane.wynik} />
          <PanelSladu slad={stan.dane.slad} />
          <PanelDowodu dowod={stan.dane.dowod} />
          <PanelRaportu raport={stan.dane.raport} />
        </div>
      )}

      {namespaceKatalogu !== null && <PanelKatalogu namespace={namespaceKatalogu} />}
    </div>
  );
}
