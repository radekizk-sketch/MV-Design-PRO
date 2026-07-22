/*
 * EkranOdbioru — okno „Zgodność powykonawcza" (karta U4 P45 / scalenie #20).
 * Domyka pętlę projekt → budowa → odbiór: wybiera zakończony przebieg rozpływu
 * (wzorzec selektora z `EkranJakosci`), przyjmuje pomiary z obiektu (wklejony CSV
 * albo edytor wierszy — wzorzec edytora zapadów z `SekcjaSekwencjiZapadow`),
 * jawne tolerancje (przecinek PL) i buduje raport rozbieżności przez
 * `POST /api/quality/as-built-compliance`:
 *   1. chipy podsumowania (liczby wg werdyktów + największa odchyłka),
 *   2. tabela wierszy na wspólnym wzorcu (`EkranAnalizy`/`TabelaWynikow`),
 *   3. sekcja ZAŁOŻEŃ zawsze widoczna (m.in. Q po |wartości| — V12K-040),
 *   4. ślad WHITE BOX per wiersz w trybie zaawansowanym.
 *
 * Zero fizyki, zero ocen lokalnych — werdykty, odchyłki i tolerancje pochodzą
 * WYŁĄCZNIE z backendu. Bez przebiegu rozpływu → uczciwa instrukcja (bez API).
 */

import { useEffect, useMemo, useState } from 'react';
import './odbior.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { EkranAnalizy, usePoprawWModelu } from '../wzorzec';
import { przebiegRozplywu } from '../jakosc';
import {
  postZgodnoscPowykonawcza,
  type WidokZgodnosci,
  type WielkoscPomiaru,
  type WierszZgodnosci,
  type ZgodnoscZadanie,
} from './api';
import {
  KLUCZ_WIERSZA_ZGODNOSCI,
  KOLUMNY_ZGODNOSCI,
  WIERSZ_EDYTORA_DOMYSLNY,
  kluczWierszaZgodnosci,
  naWierszeZgodnosci,
  naZalozeniaZgodnosci,
  zbudujZadanie,
  type TrybWejscia,
  type WierszEdytora,
} from './odbiorModel';
import {
  JEDNOSTKA_WIELKOSCI,
  ODBIOR_STRINGS,
  fmtProcent,
  fmtWartosc,
  istotnoscWerdyktu,
  wielkoscPL,
  type IstotnoscWerdyktu,
} from './strings';

const WIELKOSCI: readonly WielkoscPomiaru[] = ['U', 'P', 'Q'];

type StanZasobu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokZgodnosci };

// ---------------------------------------------------------------------------
// Elementy wspólne (tag werdyktu, chip, panel stanu)
// ---------------------------------------------------------------------------

function TagWerdyktu({ tekst, istotnosc }: { tekst: string; istotnosc: IstotnoscWerdyktu }) {
  return (
    <span className={`mvd-odbior-tag mvd-odbior-tag--${istotnosc}`} data-testid="mvd-odbior-tag">
      {tekst}
    </span>
  );
}

function Chip({
  etykieta,
  wartosc,
  istotnosc,
}: {
  etykieta: string;
  wartosc: number;
  istotnosc: IstotnoscWerdyktu;
}) {
  return (
    <div className={`mvd-odbior-chip mvd-odbior-chip--${istotnosc}`} data-testid="mvd-odbior-chip">
      <span className="mvd-odbior-chip-liczba mvd-num">{wartosc}</span>
      <span className="mvd-odbior-chip-etykieta">{etykieta}</span>
    </div>
  );
}

function StanPanel({
  komunikat,
  opis,
  wariant,
  testid,
}: {
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-odbior-stan mvd-odbior-stan--blad' : 'mvd-odbior-stan'}
      data-testid={testid}
    >
      <p className="mvd-odbior-stan-title">{komunikat}</p>
      {opis && <p className="mvd-odbior-stan-desc">{opis}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Szczegół wiersza — werdykt (kolor) + wartości + ślad WHITE BOX (ekspert)
// ---------------------------------------------------------------------------

function wartoscZJedn(v: number | null, jednostka: string, format: (n: number) => string): string {
  return v === null ? ODBIOR_STRINGS.kreska : `${format(v)} ${jednostka}`;
}

function SzczegolWiersza({
  wiersz,
  trybZaawansowania,
}: {
  wiersz: WierszZgodnosci | null;
  trybZaawansowania: AdvancementMode;
}) {
  const [sladWidoczny, setSladWidoczny] = useState(false);
  if (!wiersz) {
    return (
      <section
        className="mvd-odbior-szczegol mvd-odbior-szczegol--pusty"
        data-testid="mvd-odbior-szczegol-pusty"
      >
        <p className="mvd-odbior-szczegol-brak">{ODBIOR_STRINGS.szczegolBrakWyboru}</p>
      </section>
    );
  }
  const trybEkspercki = trybZaawansowania === 'expert';
  const odchylkaPct =
    wiersz.odchylka_pct === null
      ? ODBIOR_STRINGS.kreska
      : `${fmtProcent(wiersz.odchylka_pct)} ${ODBIOR_STRINGS.jednProcent}`;
  const tolerancja =
    wiersz.tolerancja_pct === null
      ? ODBIOR_STRINGS.kreska
      : `${fmtProcent(wiersz.tolerancja_pct)} ${ODBIOR_STRINGS.jednProcent}`;
  return (
    <section className="mvd-odbior-szczegol" data-testid="mvd-odbior-szczegol">
      <header className="mvd-odbior-szczegol-head">
        <h3 className="mvd-odbior-szczegol-tytul">
          {wiersz.element_ref} · {wielkoscPL(wiersz.wielkosc)}
        </h3>
        <TagWerdyktu tekst={wiersz.werdykt} istotnosc={istotnoscWerdyktu(wiersz.werdykt)} />
      </header>
      <dl className="mvd-odbior-szczegol-dane">
        <div className="mvd-odbior-szczegol-para">
          <dt>{ODBIOR_STRINGS.szczegolTytulPomiar}</dt>
          <dd className="mvd-num">
            {wartoscZJedn(wiersz.wartosc_pomiar, wiersz.jednostka, fmtWartosc)}
          </dd>
        </div>
        <div className="mvd-odbior-szczegol-para">
          <dt>{ODBIOR_STRINGS.szczegolTytulModel}</dt>
          <dd className="mvd-num">
            {wartoscZJedn(wiersz.wartosc_model, wiersz.jednostka, fmtWartosc)}
          </dd>
        </div>
        <div className="mvd-odbior-szczegol-para">
          <dt>{ODBIOR_STRINGS.szczegolTytulOdchylka}</dt>
          <dd className="mvd-num">
            {wartoscZJedn(wiersz.odchylka_bezwzgledna, wiersz.jednostka, fmtWartosc)} ({odchylkaPct})
          </dd>
        </div>
        <div className="mvd-odbior-szczegol-para">
          <dt>{ODBIOR_STRINGS.szczegolTytulTolerancja}</dt>
          <dd className="mvd-num">{tolerancja}</dd>
        </div>
      </dl>

      {trybEkspercki && wiersz.slad_pl.length > 0 && (
        <div className="mvd-odbior-slad-blok">
          <button
            type="button"
            className="mvd-odbior-slad-btn"
            aria-expanded={sladWidoczny}
            onClick={() => setSladWidoczny((s) => !s)}
            data-testid="mvd-odbior-slad-otworz"
          >
            {sladWidoczny ? ODBIOR_STRINGS.sladUkryj : ODBIOR_STRINGS.sladPokaz}
          </button>
          {sladWidoczny && (
            <div data-testid="mvd-odbior-slad">
              <span className="mvd-odbior-slad-tytul">{ODBIOR_STRINGS.sladTytul}</span>
              <ol className="mvd-odbior-slad">
                {wiersz.slad_pl.map((linia, i) => (
                  <li key={i} className="mvd-odbior-slad-krok mvd-num">
                    {linia}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Prezentacja raportu — chipy + tabela + założenia + szczegół
// ---------------------------------------------------------------------------

function WynikZgodnosci({
  dane,
  runId,
  trybZaawansowania,
}: {
  dane: WidokZgodnosci;
  runId: string;
  trybZaawansowania: AdvancementMode;
}) {
  const [wybrany, setWybrany] = useState<string | null>(null);
  const poprawWModelu = usePoprawWModelu();
  const wierszeSelektora = useMemo(
    () =>
      new Map<string, WierszZgodnosci>(
        dane.wiersze.map((w) => [kluczWierszaZgodnosci(w), w]),
      ),
    [dane.wiersze],
  );
  const wybranyWiersz = wybrany ? wierszeSelektora.get(wybrany) ?? null : null;

  const p = dane.podsumowanie;
  const najwieksza =
    p.najwieksza_odchylka_pct === null
      ? ODBIOR_STRINGS.kreska
      : `${fmtProcent(p.najwieksza_odchylka_pct)} ${ODBIOR_STRINGS.jednProcent}`
        + (p.najwieksza_odchylka_element_ref
          ? ` (${p.najwieksza_odchylka_element_ref}`
            + (p.najwieksza_odchylka_wielkosc ? ` · ${wielkoscPL(p.najwieksza_odchylka_wielkosc)}` : '')
            + ')'
          : '');

  return (
    <div data-testid="mvd-odbior-wynik">
      <EkranAnalizy
        naglowek={{ analizaPL: ODBIOR_STRINGS.tytul, runId }}
        zalozenia={naZalozeniaZgodnosci(dane)}
        kolumny={KOLUMNY_ZGODNOSCI}
        wiersze={naWierszeZgodnosci(dane.wiersze)}
        onOtworzDowod={() => undefined}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_WIERSZA_ZGODNOSCI}
        onWybierzWiersz={setWybrany}
        wybranyWiersz={wybrany}
        onPoprawWModelu={(klucz) => {
          const w = wierszeSelektora.get(klucz);
          // Tylko napięcie (U) mapuje jednoznacznie na węzeł (Bus). Pomiar P/Q
          // nie niesie jednoznacznego typu elementu w kontrakcie → nie zgadujemy.
          // K1 / F-E6.3: pomiar U = przekroczenie rodzaju 'napiecie'.
          if (w && w.wielkosc === 'U') poprawWModelu(w.element_ref, 'Bus', w.element_ref, 'napiecie');
        }}
        wierszDecyzyjny={(klucz) => wierszeSelektora.get(klucz)?.wielkosc === 'U'}
      />

      <div className="mvd-odbior-podsumowanie" data-testid="mvd-odbior-podsumowanie">
        <Chip etykieta={ODBIOR_STRINGS.podsumZgodne} wartosc={p.w_tolerancji} istotnosc="ok" />
        <Chip etykieta={ODBIOR_STRINGS.podsumPoza} wartosc={p.poza_tolerancja} istotnosc="err" />
        <Chip
          etykieta={ODBIOR_STRINGS.podsumBrakOdpowiednika}
          wartosc={p.brak_odpowiednika}
          istotnosc="neutral"
        />
        <Chip
          etykieta={ODBIOR_STRINGS.podsumBrakWyniku}
          wartosc={p.brak_wyniku}
          istotnosc="warn"
        />
      </div>
      <p className="mvd-odbior-najwieksza" data-testid="mvd-odbior-najwieksza">
        <span className="mvd-odbior-najwieksza-etyk">{ODBIOR_STRINGS.podsumNajwieksza}:</span>{' '}
        <span className="mvd-num">{najwieksza}</span>
      </p>

      <SzczegolWiersza wiersz={wybranyWiersz} trybZaawansowania={trybZaawansowania} />

      {trybZaawansowania === 'expert' && (
        <dl className="mvd-odbior-eksp" data-testid="mvd-odbior-eksp">
          <div className="mvd-odbior-eksp-para">
            <dt>{ODBIOR_STRINGS.ekspHash}</dt>
            <dd className="mvd-num">{dane.input_hash}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formularz wejścia — tryb (CSV / wiersze) + tolerancje
// ---------------------------------------------------------------------------

interface FormularzProps {
  tryb: TrybWejscia;
  onTryb: (t: TrybWejscia) => void;
  csv: string;
  onCsv: (v: string) => void;
  wiersze: WierszEdytora[];
  onWiersze: (aktualizacja: (poprz: WierszEdytora[]) => WierszEdytora[]) => void;
  tolNapiecie: string;
  onTolNapiecie: (v: string) => void;
  tolMoc: string;
  onTolMoc: (v: string) => void;
}

function Formularz({
  tryb,
  onTryb,
  csv,
  onCsv,
  wiersze,
  onWiersze,
  tolNapiecie,
  onTolNapiecie,
  tolMoc,
  onTolMoc,
}: FormularzProps) {
  return (
    <div className="mvd-odbior-formularz">
      <section className="mvd-odbior-sekcja">
        <h3 className="mvd-odbior-sekcja-tytul">{ODBIOR_STRINGS.trybTytul}</h3>
        <div className="mvd-odbior-tryb" role="group" aria-label={ODBIOR_STRINGS.trybTytul}>
          <button
            type="button"
            className={tryb === 'wiersze' ? 'mvd-odbior-tryb-btn mvd-on' : 'mvd-odbior-tryb-btn'}
            aria-pressed={tryb === 'wiersze'}
            onClick={() => onTryb('wiersze')}
            data-testid="mvd-odbior-tryb-wiersze"
          >
            {ODBIOR_STRINGS.trybWiersze}
          </button>
          <button
            type="button"
            className={tryb === 'csv' ? 'mvd-odbior-tryb-btn mvd-on' : 'mvd-odbior-tryb-btn'}
            aria-pressed={tryb === 'csv'}
            onClick={() => onTryb('csv')}
            data-testid="mvd-odbior-tryb-csv"
          >
            {ODBIOR_STRINGS.trybCsv}
          </button>
        </div>

        {tryb === 'csv' ? (
          <div className="mvd-odbior-csv-blok">
            <label className="mvd-odbior-pole-label" htmlFor="mvd-odbior-csv">
              {ODBIOR_STRINGS.csvEtykieta}
            </label>
            <p className="mvd-odbior-pole-opis">{ODBIOR_STRINGS.csvOpis}</p>
            <textarea
              id="mvd-odbior-csv"
              className="mvd-odbior-csv"
              rows={6}
              value={csv}
              placeholder={ODBIOR_STRINGS.csvPlaceholder}
              onChange={(e) => onCsv(e.target.value)}
              data-testid="mvd-odbior-csv"
            />
          </div>
        ) : (
          <div className="mvd-odbior-edytor" data-testid="mvd-odbior-edytor">
            <span className="mvd-odbior-edytor-tytul">{ODBIOR_STRINGS.edytorTytul}</span>
            {wiersze.map((w, i) => (
              <div key={i} className="mvd-odbior-wiersz" data-testid="mvd-odbior-wiersz">
                <div className="mvd-odbior-pole">
                  <label htmlFor={`mvd-odbior-element-${i}`}>{ODBIOR_STRINGS.edytorElement}</label>
                  <input
                    id={`mvd-odbior-element-${i}`}
                    type="text"
                    value={w.element_ref}
                    onChange={(e) =>
                      onWiersze((poprz) =>
                        poprz.map((x, j) => (j === i ? { ...x, element_ref: e.target.value } : x)),
                      )
                    }
                    data-testid={`mvd-odbior-element-${i}`}
                  />
                </div>
                <div className="mvd-odbior-pole">
                  <label htmlFor={`mvd-odbior-wielkosc-${i}`}>{ODBIOR_STRINGS.edytorWielkosc}</label>
                  <select
                    id={`mvd-odbior-wielkosc-${i}`}
                    value={w.wielkosc}
                    onChange={(e) =>
                      onWiersze((poprz) =>
                        poprz.map((x, j) =>
                          j === i ? { ...x, wielkosc: e.target.value as WielkoscPomiaru } : x,
                        ),
                      )
                    }
                    data-testid={`mvd-odbior-wielkosc-${i}`}
                  >
                    {WIELKOSCI.map((kod) => (
                      <option key={kod} value={kod}>
                        {wielkoscPL(kod)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mvd-odbior-pole">
                  <label htmlFor={`mvd-odbior-wartosc-${i}`}>{ODBIOR_STRINGS.edytorWartosc}</label>
                  <input
                    id={`mvd-odbior-wartosc-${i}`}
                    type="text"
                    inputMode="decimal"
                    value={w.wartosc}
                    onChange={(e) =>
                      onWiersze((poprz) =>
                        poprz.map((x, j) => (j === i ? { ...x, wartosc: e.target.value } : x)),
                      )
                    }
                    data-testid={`mvd-odbior-wartosc-${i}`}
                  />
                </div>
                <div className="mvd-odbior-pole mvd-odbior-pole--jednostka">
                  <span className="mvd-odbior-jednostka-label">{ODBIOR_STRINGS.edytorJednostka}</span>
                  <span className="mvd-odbior-jednostka mvd-num" data-testid={`mvd-odbior-jednostka-${i}`}>
                    {JEDNOSTKA_WIELKOSCI[w.wielkosc]}
                  </span>
                </div>
                <button
                  type="button"
                  className="mvd-odbior-usun"
                  onClick={() =>
                    onWiersze((poprz) =>
                      poprz.length <= 1 ? poprz : poprz.filter((_, j) => j !== i),
                    )
                  }
                  disabled={wiersze.length <= 1}
                  aria-label={ODBIOR_STRINGS.edytorUsunAria}
                  data-testid={`mvd-odbior-usun-${i}`}
                >
                  {ODBIOR_STRINGS.edytorUsun}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="mvd-odbior-dodaj"
              onClick={() => onWiersze((poprz) => [...poprz, WIERSZ_EDYTORA_DOMYSLNY])}
              data-testid="mvd-odbior-dodaj"
            >
              {ODBIOR_STRINGS.edytorDodaj}
            </button>
          </div>
        )}
      </section>

      <section className="mvd-odbior-sekcja">
        <h3 className="mvd-odbior-sekcja-tytul">{ODBIOR_STRINGS.tolerancjeTytul}</h3>
        <p className="mvd-odbior-pole-opis">{ODBIOR_STRINGS.tolerancjeOpis}</p>
        <div className="mvd-odbior-tolerancje">
          <div className="mvd-odbior-pole">
            <label htmlFor="mvd-odbior-tol-napiecie">
              {ODBIOR_STRINGS.tolNapiecie} ({ODBIOR_STRINGS.jednProcent})
            </label>
            <input
              id="mvd-odbior-tol-napiecie"
              type="text"
              inputMode="decimal"
              value={tolNapiecie}
              onChange={(e) => onTolNapiecie(e.target.value)}
              data-testid="mvd-odbior-tol-napiecie"
            />
          </div>
          <div className="mvd-odbior-pole">
            <label htmlFor="mvd-odbior-tol-moc">
              {ODBIOR_STRINGS.tolMoc} ({ODBIOR_STRINGS.jednProcent})
            </label>
            <input
              id="mvd-odbior-tol-moc"
              type="text"
              inputMode="decimal"
              value={tolMoc}
              onChange={(e) => onTolMoc(e.target.value)}
              data-testid="mvd-odbior-tol-moc"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Okno „Zgodność powykonawcza"
// ---------------------------------------------------------------------------

export interface EkranOdbioruProps {
  trybZaawansowania: AdvancementMode;
}

export function EkranOdbioru({ trybZaawansowania }: EkranOdbioruProps) {
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  const przebieg = useMemo(() => przebiegRozplywu(runs, activeRunId), [runs, activeRunId]);

  const [tryb, setTryb] = useState<TrybWejscia>('wiersze');
  const [csv, setCsv] = useState('');
  const [wiersze, setWiersze] = useState<WierszEdytora[]>([WIERSZ_EDYTORA_DOMYSLNY]);
  const [tolNapiecie, setTolNapiecie] = useState('');
  const [tolMoc, setTolMoc] = useState('');
  const [bledy, setBledy] = useState<readonly string[]>([]);

  const [zapytanie, setZapytanie] = useState<ZgodnoscZadanie | null>(null);
  const [stan, setStan] = useState<StanZasobu>({ rodzaj: 'idle' });

  const runId = przebieg?.id ?? null;

  // Zmiana przebiegu unieważnia poprzedni raport (stale-result guard).
  useEffect(() => {
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
    setBledy([]);
  }, [runId]);

  // Jawny bieg raportu (POST).
  useEffect(() => {
    if (zapytanie === null) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    postZgodnoscPowykonawcza(zapytanie)
      .then((dane) => {
        if (!anulowane) setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((err: unknown) => {
        if (anulowane) return;
        const komunikat = err instanceof Error ? err.message : 'Nieznany błąd pobierania';
        setStan({ rodzaj: 'blad', komunikat });
      });
    return () => {
      anulowane = true;
    };
  }, [zapytanie]);

  const unewaznij = () => {
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
  };

  const uruchom = () => {
    if (runId === null) return;
    const wynik = zbudujZadanie({ runId, tryb, csv, wiersze, tolNapiecie, tolMoc });
    if (!wynik.ok) {
      setBledy(wynik.bledy);
      unewaznij();
      return;
    }
    setBledy([]);
    setZapytanie(wynik.zadanie);
  };

  if (!przebieg) {
    return (
      <div className="mvd-odbior" data-testid="mvd-odbior-ekran">
        <header className="mvd-odbior-naglowek">
          <h2 className="mvd-odbior-tytul">{ODBIOR_STRINGS.tytul}</h2>
          <p className="mvd-odbior-opis">{ODBIOR_STRINGS.opisWstep}</p>
        </header>
        <StanPanel
          komunikat={ODBIOR_STRINGS.brakPrzebiegu}
          opis={ODBIOR_STRINGS.brakPrzebieguOpis}
          wariant="info"
          testid="mvd-odbior-brak-przebiegu"
        />
      </div>
    );
  }

  const trybEkspercki = trybZaawansowania === 'expert';

  return (
    <div className="mvd-odbior" data-testid="mvd-odbior-ekran">
      <header className="mvd-odbior-naglowek">
        <h2 className="mvd-odbior-tytul">{ODBIOR_STRINGS.tytul}</h2>
        <p className="mvd-odbior-opis">{ODBIOR_STRINGS.opisWstep}</p>
        {trybEkspercki && (
          <span className="mvd-odbior-run mvd-num" aria-label={ODBIOR_STRINGS.przebiegRunId}>
            {przebieg.id}
          </span>
        )}
      </header>

      <Formularz
        tryb={tryb}
        onTryb={(t) => {
          setTryb(t);
          unewaznij();
        }}
        csv={csv}
        onCsv={(v) => {
          setCsv(v);
          unewaznij();
        }}
        wiersze={wiersze}
        onWiersze={(aktualizacja) => {
          setWiersze(aktualizacja);
          unewaznij();
        }}
        tolNapiecie={tolNapiecie}
        onTolNapiecie={(v) => {
          setTolNapiecie(v);
          unewaznij();
        }}
        tolMoc={tolMoc}
        onTolMoc={(v) => {
          setTolMoc(v);
          unewaznij();
        }}
      />

      <div className="mvd-odbior-akcje">
        <button
          type="button"
          className="mvd-odbior-oblicz"
          onClick={uruchom}
          data-testid="mvd-odbior-oblicz"
        >
          {zapytanie === null ? ODBIOR_STRINGS.oblicz : ODBIOR_STRINGS.przelicz}
        </button>
      </div>

      {bledy.length > 0 && (
        <div className="mvd-odbior-bledy" data-testid="mvd-odbior-bledy">
          <p className="mvd-odbior-bledy-tytul">{ODBIOR_STRINGS.bledyTytul}</p>
          <ul className="mvd-odbior-bledy-lista">
            {bledy.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {stan.rodzaj === 'ladowanie' && (
        <StanPanel komunikat={ODBIOR_STRINGS.ladowanie} wariant="info" testid="mvd-odbior-ladowanie" />
      )}
      {stan.rodzaj === 'blad' && (
        <StanPanel
          komunikat={ODBIOR_STRINGS.blad}
          opis={stan.komunikat}
          wariant="blad"
          testid="mvd-odbior-blad"
        />
      )}
      {stan.rodzaj === 'gotowe' && (
        <WynikZgodnosci dane={stan.dane} runId={przebieg.id} trybZaawansowania={trybZaawansowania} />
      )}
    </div>
  );
}
