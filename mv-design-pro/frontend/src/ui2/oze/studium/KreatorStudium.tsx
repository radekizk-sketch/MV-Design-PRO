/*
 * KreatorStudium — kreator studium przyłączenia źródła OZE (karta P35, faza U4).
 * Cztery kroki: (1) warianty punktu przyłączenia (multi-wybór węzłów ze snapshotu),
 * (2) parametry źródła (rodzaj + typ z katalogu konwerterów + operator OSD, wstępnie
 * wypełnione), (3) sekwencja analiz studium przez ISTNIEJĄCE końcówki `../api`
 * (hosting-capacity → pq-area → pq-coverage) z uczciwym postępem odpornym na błąd,
 * (4) przegląd zbiorczy na wzorcu `TabelaWynikow` + szczegóły wariantu (reużyte
 * komponenty wykresu obszaru i śladu).
 *
 * Zero fizyki, zero ocen lokalnych, zero nowych końcówek — wszystkie wartości
 * pochodzą z backendu. Identyfikatory (bus_ref) wyłącznie w trybie eksperckim.
 */

import { useEffect, useMemo, useState } from 'react';
import './studium.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useAppStateStore } from '../../../ui/app-state';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore, selectBusOptions } from '../../../ui/topology/snapshotStore';
import { TabelaWynikow } from '../../wyniki/wzorzec';
import {
  DokumentStudiumBrakiError,
  pobierzDokumentStudium,
  pobierzDokumentStudiumDocx,
  pobierzDokumentStudiumPdf,
  pobierzKatalogKlasNcRfg,
  pobierzKonwertery,
  pobierzObszarPQ,
  pobierzPokryciePQ,
  pobierzZdolnoscPrzylaczeniowa,
  type OdpowiedzKatalogNcRfg,
  type RekordKonwertera,
  type WidokDokumentuStudium,
  type ZadanieDokumentuStudium,
} from '../api';
import { wybierzPrzebiegRozplywu } from '../zdolnosc/zdolnoscModel';
import { klasyOperatora } from '../ranking/rankingModel';
import { WykresObszaruChart } from '../obszar/WykresObszaruChart';
import { punktyObszaru, krokiSladuObszar } from '../obszar/obszarModel';
import { WykresZdolnosciChart } from '../zdolnosc/WykresZdolnosciChart';
import { slupkiZdolnosci } from '../zdolnosc/zdolnoscModel';
import { SladAnalizy } from '../pulpit';
import { fmtMocMW } from '../ranking/strings';
import {
  FAZY_STUDIUM,
  KLUCZ_WIERSZA_STUDIUM,
  domyslnyKonwerter,
  konwerteryRodzaju,
  kolumnyStudium,
  przeprowadzStudium,
  stanPoczatkowyStudium,
  opcjeRodzajuStudium,
  wariantWToku,
  wierszeStudium,
  zastosujZdarzenieStudium,
  type FazaStudium,
  type KontekstWierszaStudium,
  type RodzajZrodlaStudium,
  type StanStudium,
  type StatusFazyStudium,
  type WynikWariantuStudium,
} from './studiumModel';
import { STUDIUM_STRINGS, nazwaPlikuDokumentuStudium } from './strings';

const LICZBA_KROKOW = 4;

/** Braki twarde dokumentu studium (bramka 422 — uczciwa lista po polsku). */
interface BrakiDokumentu {
  readonly komunikat: string;
  readonly braki: readonly string[];
}

/** Parametry zakończonego biegu — źródło żądania dokumentu 1:1 (nie stan formularza). */
interface ParametryZakonczonegoBiegu {
  readonly runId: string;
  readonly catalogItemId: string;
  readonly operatorId: string;
  readonly warianty: readonly string[];
}

/** Zapisz blob jako plik do pobrania (mechanika przeglądarkowa, wzorzec P39c). */
function zapiszBlob(blob: Blob, nazwa: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nazwa;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Pasek kroków (roving tabindex — jeden aktywny przycisk w Tab)
// ---------------------------------------------------------------------------

function PasekKrokow({ krok, ustawKrok }: { krok: number; ustawKrok: (k: number) => void }) {
  const tytuly = [
    STUDIUM_STRINGS.krok1Tytul,
    STUDIUM_STRINGS.krok2Tytul,
    STUDIUM_STRINGS.krok3Tytul,
    STUDIUM_STRINGS.krok4Tytul,
  ];
  return (
    <ol className="mvd-studium-kroki" data-testid="mvd-studium-kroki">
      {tytuly.map((tytul, i) => {
        const numer = i + 1;
        const aktywny = numer === krok;
        return (
          <li key={numer} className="mvd-studium-krok-poz">
            <button
              type="button"
              className={aktywny ? 'mvd-studium-krok mvd-on' : 'mvd-studium-krok'}
              aria-current={aktywny ? 'step' : undefined}
              tabIndex={aktywny ? 0 : -1}
              onClick={() => ustawKrok(numer)}
              data-testid={`mvd-studium-krok-${numer}`}
            >
              <span className="mvd-studium-krok-numer mvd-num">{numer}</span>
              <span className="mvd-studium-krok-tytul">{tytul}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Panel stanu (instrukcja / błąd)
// ---------------------------------------------------------------------------

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
      className={
        wariant === 'blad' ? 'mvd-studium-stan mvd-studium-stan--blad' : 'mvd-studium-stan'
      }
      data-testid={testid}
    >
      <p className="mvd-studium-stan-title">{komunikat}</p>
      {opis && <p className="mvd-studium-stan-desc">{opis}</p>}
    </div>
  );
}

function statusFazyPL(status: StatusFazyStudium): string {
  switch (status) {
    case 'w-toku':
      return STUDIUM_STRINGS.statusWToku;
    case 'gotowe':
      return STUDIUM_STRINGS.statusGotowe;
    case 'blad':
      return STUDIUM_STRINGS.statusBlad;
    default:
      return STUDIUM_STRINGS.statusOczekuje;
  }
}

function fazaPL(faza: FazaStudium): string {
  switch (faza) {
    case 'zdolnosc':
      return STUDIUM_STRINGS.fazaZdolnosc;
    case 'obszar':
      return STUDIUM_STRINGS.fazaObszar;
    default:
      return STUDIUM_STRINGS.fazaPokrycie;
  }
}

// ---------------------------------------------------------------------------
// Krok 3 — postęp per wariant/faza
// ---------------------------------------------------------------------------

function PostepWariantu({
  wariant,
  nazwaWezla,
  trybEkspercki,
}: {
  wariant: WynikWariantuStudium;
  nazwaWezla: string;
  trybEkspercki: boolean;
}) {
  const fazy = {
    zdolnosc: wariant.zdolnosc,
    obszar: wariant.obszar,
    pokrycie: wariant.pokrycie,
  };
  return (
    <li className="mvd-studium-postep-wariant" data-testid={`mvd-studium-postep-${wariant.busRef}`}>
      <div className="mvd-studium-postep-naglowek">
        <span className="mvd-studium-postep-nazwa">{nazwaWezla}</span>
        {trybEkspercki && (
          <span className="mvd-studium-postep-id mvd-num">{wariant.busRef}</span>
        )}
      </div>
      <ul className="mvd-studium-postep-fazy">
        {FAZY_STUDIUM.map((faza) => {
          const stanFazy = fazy[faza];
          return (
            <li
              key={faza}
              className={`mvd-studium-faza mvd-studium-faza--${stanFazy.status}`}
              data-testid={`mvd-studium-faza-${wariant.busRef}-${faza}`}
            >
              <span className="mvd-studium-faza-nazwa">{fazaPL(faza)}</span>
              <span className="mvd-studium-faza-status">{statusFazyPL(stanFazy.status)}</span>
              {stanFazy.status === 'blad' && stanFazy.komunikat && (
                <span className="mvd-studium-faza-blad">{stanFazy.komunikat}</span>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Krok 4 — szczegóły wybranego wariantu (reużycie komponentów)
// ---------------------------------------------------------------------------

function SzczegolWariantu({
  wariant,
  trybEkspercki,
}: {
  wariant: WynikWariantuStudium;
  trybEkspercki: boolean;
}) {
  const widokZdolnosci = wariant.zdolnosc.dane;
  const widokObszaru = wariant.obszar.dane;

  const slupki = useMemo(
    () => (widokZdolnosci ? slupkiZdolnosci(widokZdolnosci.nodes) : []),
    [widokZdolnosci],
  );
  const punkty = useMemo(
    () => (widokObszaru ? punktyObszaru(widokObszaru.vertices) : []),
    [widokObszaru],
  );
  const kroki = useMemo(
    () => (widokObszaru ? krokiSladuObszar(widokObszaru) : []),
    [widokObszaru],
  );

  return (
    <section className="mvd-studium-szczegol" data-testid="mvd-studium-szczegol">
      <header className="mvd-studium-szczegol-naglowek">
        <h3 className="mvd-studium-szczegol-tytul">{STUDIUM_STRINGS.szczegolTytul}</h3>
        {trybEkspercki && (
          <span className="mvd-studium-szczegol-id mvd-num">{wariant.busRef}</span>
        )}
      </header>

      <div className="mvd-studium-szczegol-blok">
        <h4 className="mvd-studium-szczegol-podtytul">{STUDIUM_STRINGS.szczegolZdolnosc}</h4>
        {slupki.length > 0 ? (
          <WykresZdolnosciChart slupki={slupki} />
        ) : (
          <p className="mvd-studium-szczegol-brak">{STUDIUM_STRINGS.szczegolBrakDanych}</p>
        )}
      </div>

      <div className="mvd-studium-szczegol-blok">
        <h4 className="mvd-studium-szczegol-podtytul">{STUDIUM_STRINGS.szczegolObszar}</h4>
        {punkty.length > 0 ? (
          <>
            <WykresObszaruChart punkty={punkty} zNakladkaProducenta={false} />
            <div className="mvd-oze">
              <span className="mvd-studium-szczegol-podtytul">
                {STUDIUM_STRINGS.szczegolSladObszar}
              </span>
              <SladAnalizy kroki={kroki} />
            </div>
          </>
        ) : (
          <p className="mvd-studium-szczegol-brak">{STUDIUM_STRINGS.szczegolBrakDanych}</p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Kreator studium przyłączenia
// ---------------------------------------------------------------------------

export interface KreatorStudiumProps {
  trybZaawansowania: AdvancementMode;
}

export function KreatorStudium({ trybZaawansowania }: KreatorStudiumProps) {
  const trybEkspercki = trybZaawansowania === 'expert';

  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  const runId = useMemo(() => wybierzPrzebiegRozplywu(runs, activeRunId), [runs, activeRunId]);

  const snapshot = useSnapshotStore((s) => s.snapshot);
  const opcjeWezlow = useMemo(() => selectBusOptions(snapshot), [snapshot]);
  const nazwaWezla = useMemo(() => {
    const mapa = new Map(opcjeWezlow.map((o) => [o.ref_id, o.name]));
    return (busRef: string): string => mapa.get(busRef) ?? busRef;
  }, [opcjeWezlow]);
  const napiecieWezla = useMemo(() => {
    const mapa = new Map(opcjeWezlow.map((o) => [o.ref_id, o.voltage_kv]));
    return (busRef: string): number | null => mapa.get(busRef) ?? null;
  }, [opcjeWezlow]);

  const [krok, setKrok] = useState(1);
  const [wybraneWezly, setWybraneWezly] = useState<readonly string[]>([]);
  const [rodzaj, setRodzaj] = useState<RodzajZrodlaStudium>('PV');
  const [rekordy, setRekordy] = useState<RekordKonwertera[]>([]);
  const [wybranyTyp, setWybranyTyp] = useState('');
  const [katalog, setKatalog] = useState<OdpowiedzKatalogNcRfg | null>(null);
  const [operatorId, setOperatorId] = useState('');

  const [stan, setStan] = useState<StanStudium | null>(null);
  const [trwaBieg, setTrwaBieg] = useState(false);
  const [wybranyWariant, setWybranyWariant] = useState<string | null>(null);

  // Identyfikacja domyślna z aktywnego projektu/przypadku (read-only, do dokumentu).
  const nazwaProjektuBazowa = useAppStateStore((s) => s.activeProjectName);
  const nazwaPrzypadkuBazowa = useAppStateStore((s) => s.activeCaseName);

  // Parametry zakończonego biegu — źródło żądania dokumentu 1:1 (nie stan formularza,
  // który użytkownik może zmienić po biegu). Ustawiane wyłącznie po zakończonym biegu.
  const [zakonczonyBieg, setZakonczonyBieg] = useState<ParametryZakonczonegoBiegu | null>(null);

  // Stan podglądu dokumentu studium (widok, braki 422 lub błąd — rozłącznie).
  const [dokument, setDokument] = useState<WidokDokumentuStudium | null>(null);
  const [dokBraki, setDokBraki] = useState<BrakiDokumentu | null>(null);
  const [dokBlad, setDokBlad] = useState<string | null>(null);
  const [dokLadowanie, setDokLadowanie] = useState(false);
  const [docxLadowanie, setDocxLadowanie] = useState(false);
  const [pdfLadowanie, setPdfLadowanie] = useState(false);

  // Wczytanie katalogu konwerterów i katalogu NC RfG (raz, przy montażu).
  useEffect(() => {
    let anulowane = false;
    pobierzKonwertery()
      .then((dane) => {
        if (!anulowane) setRekordy(dane);
      })
      .catch(() => {
        if (!anulowane) setRekordy([]);
      });
    pobierzKatalogKlasNcRfg()
      .then((dane) => {
        if (anulowane) return;
        setKatalog(dane);
        setOperatorId((biezacy) => biezacy || (dane.operators[0]?.operator_id ?? ''));
      })
      .catch(() => {
        /* Brak katalogu → klasa/pokrycie pokażą „—"; kreator pozostaje sprawny. */
      });
    return () => {
      anulowane = true;
    };
  }, []);

  // Prefill typu katalogowego: pierwszy rekord pasujący do rodzaju (zero pustych pól).
  const rekordyRodzaju = useMemo(() => konwerteryRodzaju(rekordy, rodzaj), [rekordy, rodzaj]);
  useEffect(() => {
    const domyslny = domyslnyKonwerter(rekordy, rodzaj);
    setWybranyTyp(domyslny?.id ?? '');
  }, [rekordy, rodzaj]);

  const rekordTypu = useMemo(
    () => rekordyRodzaju.find((r) => r.id === wybranyTyp) ?? null,
    [rekordyRodzaju, wybranyTyp],
  );

  const klasy = useMemo(() => klasyOperatora(katalog, operatorId), [katalog, operatorId]);

  const przelaczWezel = (ref: string) => {
    setWybraneWezly((biezace) =>
      biezace.includes(ref) ? biezace.filter((r) => r !== ref) : [...biezace, ref],
    );
  };

  const mozeUruchomic =
    runId !== null
    && wybraneWezly.length > 0
    && wybranyTyp !== ''
    && operatorId !== ''
    && !trwaBieg;

  const uruchomAnalizy = async () => {
    if (runId === null || wybraneWezly.length === 0 || wybranyTyp === '' || operatorId === '') {
      return;
    }
    // Snapshot parametrów biegu — dokument buduje żądanie 1:1 z nich, nie z formularza.
    const parametry: ParametryZakonczonegoBiegu = {
      runId,
      catalogItemId: wybranyTyp,
      operatorId,
      warianty: [...wybraneWezly],
    };
    setWybranyWariant(null);
    setZakonczonyBieg(null);
    zamknijDokument();
    setStan(stanPoczatkowyStudium(wybraneWezly));
    setTrwaBieg(true);
    await przeprowadzStudium(
      { runId: parametry.runId, warianty: parametry.warianty, catalogItemId: parametry.catalogItemId, operatorId: parametry.operatorId },
      {
        zdolnosc: pobierzZdolnoscPrzylaczeniowa,
        obszar: pobierzObszarPQ,
        pokrycie: pobierzPokryciePQ,
      },
      (zdarzenie) => setStan((biezacy) => (biezacy ? zastosujZdarzenieStudium(biezacy, zdarzenie) : biezacy)),
    );
    setTrwaBieg(false);
    setZakonczonyBieg(parametry);
    setKrok(4);
  };

  const kontekstWierszy: KontekstWierszaStudium = useMemo(
    () => ({
      nazwaWezla,
      napiecieWezla,
      klasy,
      mocZrodlaMW: rekordTypu?.pmax_mw ?? 0,
    }),
    [nazwaWezla, napiecieWezla, klasy, rekordTypu],
  );

  // Dokument dostępny wyłącznie z zakończonego biegu z co najmniej jednym wariantem
  // policzonym (dowolna faza „gotowe") — zero martwych klików.
  const dokumentDostepny =
    zakonczonyBieg !== null
    && !trwaBieg
    && stan !== null
    && [...stan.values()].some(
      (w) =>
        w.zdolnosc.status === 'gotowe'
        || w.obszar.status === 'gotowe'
        || w.pokrycie.status === 'gotowe',
    );

  // Żądanie 1:1 z parametrów zakończonego biegu + identyfikacja z aktywnego projektu.
  const zbudujZadanieDokumentu = (): ZadanieDokumentuStudium | null => {
    if (zakonczonyBieg === null) return null;
    return {
      nazwa_projektu: nazwaProjektuBazowa?.trim()
        ? nazwaProjektuBazowa
        : STUDIUM_STRINGS.dokProjektBezNazwy,
      nazwa_przypadku: nazwaPrzypadkuBazowa ?? null,
      run_id: zakonczonyBieg.runId,
      catalog_item_id: zakonczonyBieg.catalogItemId,
      operator_id: zakonczonyBieg.operatorId,
      warianty: zakonczonyBieg.warianty,
    };
  };

  const obsluzBladDokumentu = (err: unknown): void => {
    if (err instanceof DokumentStudiumBrakiError) {
      setDokument(null);
      setDokBlad(null);
      setDokBraki({ komunikat: err.message, braki: err.braki });
    } else {
      setDokBraki(null);
      setDokBlad(err instanceof Error ? err.message : STUDIUM_STRINGS.dokBlad);
    }
  };

  const generujDokument = async (): Promise<void> => {
    const zadanie = zbudujZadanieDokumentu();
    if (zadanie === null) return;
    setDokLadowanie(true);
    setDokBlad(null);
    setDokBraki(null);
    try {
      setDokument(await pobierzDokumentStudium(zadanie));
    } catch (err) {
      obsluzBladDokumentu(err);
    } finally {
      setDokLadowanie(false);
    }
  };

  const pobierzDocx = async (): Promise<void> => {
    const zadanie = zbudujZadanieDokumentu();
    if (zadanie === null) return;
    setDocxLadowanie(true);
    setDokBlad(null);
    try {
      const blob = await pobierzDokumentStudiumDocx(zadanie);
      zapiszBlob(blob, nazwaPlikuDokumentuStudium(new Date(), 'docx'));
    } catch (err) {
      obsluzBladDokumentu(err);
    } finally {
      setDocxLadowanie(false);
    }
  };

  const pobierzPdf = async (): Promise<void> => {
    const zadanie = zbudujZadanieDokumentu();
    if (zadanie === null) return;
    setPdfLadowanie(true);
    setDokBlad(null);
    try {
      const blob = await pobierzDokumentStudiumPdf(zadanie);
      zapiszBlob(blob, nazwaPlikuDokumentuStudium(new Date(), 'pdf'));
    } catch (err) {
      obsluzBladDokumentu(err);
    } finally {
      setPdfLadowanie(false);
    }
  };

  function zamknijDokument(): void {
    setDokument(null);
    setDokBraki(null);
    setDokBlad(null);
  }

  return (
    <div className="mvd-studium" data-testid="mvd-studium-ekran">
      <header className="mvd-studium-naglowek">
        <h2 className="mvd-studium-tytul">{STUDIUM_STRINGS.tytul}</h2>
        <p className="mvd-studium-opis">{STUDIUM_STRINGS.opisWstep}</p>
      </header>

      <PasekKrokow krok={krok} ustawKrok={setKrok} />

      {krok === 1 && (
        <section className="mvd-studium-panel" data-testid="mvd-studium-krok1">
          <h3 className="mvd-studium-panel-tytul">{STUDIUM_STRINGS.krok1Naglowek}</h3>
          <p className="mvd-studium-hint">{STUDIUM_STRINGS.krok1Hint}</p>
          {opcjeWezlow.length === 0 ? (
            <StanPanel
              komunikat={STUDIUM_STRINGS.krok1BrakWezlow}
              wariant="info"
              testid="mvd-studium-brak-wezlow"
            />
          ) : (
            <fieldset className="mvd-studium-wezly" data-testid="mvd-studium-wezly">
              <legend>{STUDIUM_STRINGS.krok1Wybrano}</legend>
              <div className="mvd-studium-wezly-lista">
                {opcjeWezlow.map((o) => (
                  <label key={o.ref_id} className="mvd-studium-wezel-opcja">
                    <input
                      type="checkbox"
                      checked={wybraneWezly.includes(o.ref_id)}
                      onChange={() => przelaczWezel(o.ref_id)}
                      data-testid={`mvd-studium-wybor-${o.ref_id}`}
                    />
                    <span>{o.name}</span>
                  </label>
                ))}
              </div>
              {wybraneWezly.length === 0 && (
                <p className="mvd-studium-pole-uwaga">{STUDIUM_STRINGS.krok1BrakWyboru}</p>
              )}
            </fieldset>
          )}
        </section>
      )}

      {krok === 2 && (
        <section className="mvd-studium-panel" data-testid="mvd-studium-krok2">
          <h3 className="mvd-studium-panel-tytul">{STUDIUM_STRINGS.krok2Naglowek}</h3>

          <div className="mvd-studium-pole">
            <label htmlFor="mvd-studium-rodzaj">{STUDIUM_STRINGS.paramRodzaj}</label>
            <select
              id="mvd-studium-rodzaj"
              value={rodzaj}
              onChange={(e) => setRodzaj(e.target.value as RodzajZrodlaStudium)}
              data-testid="mvd-studium-rodzaj"
            >
              {opcjeRodzajuStudium().map((o) => (
                <option key={o.rodzaj} value={o.rodzaj}>
                  {o.etykieta}
                </option>
              ))}
            </select>
            <p className="mvd-studium-hint">{STUDIUM_STRINGS.paramRodzajHint}</p>
          </div>

          <div className="mvd-studium-pole">
            <label htmlFor="mvd-studium-typ">{STUDIUM_STRINGS.paramTyp}</label>
            {rekordyRodzaju.length === 0 ? (
              <p className="mvd-studium-pole-uwaga" data-testid="mvd-studium-typ-brak">
                {STUDIUM_STRINGS.paramTypBrak}
              </p>
            ) : (
              <select
                id="mvd-studium-typ"
                value={wybranyTyp}
                onChange={(e) => setWybranyTyp(e.target.value)}
                data-testid="mvd-studium-typ"
              >
                {rekordyRodzaju.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            <p className="mvd-studium-hint">{STUDIUM_STRINGS.paramTypHint}</p>
          </div>

          {rekordTypu !== null && (
            <dl className="mvd-studium-typ-dane" data-testid="mvd-studium-typ-dane">
              <div className="mvd-studium-typ-para">
                <dt>{STUDIUM_STRINGS.paramMocTypu}</dt>
                <dd className="mvd-num">
                  {fmtMocMW(rekordTypu.pmax_mw)} {STUDIUM_STRINGS.jednMW}
                </dd>
              </div>
              <div className="mvd-studium-typ-para">
                <dt>{STUDIUM_STRINGS.paramNapiecieTypu}</dt>
                <dd className="mvd-num">
                  {fmtMocMW(rekordTypu.un_kv)} {STUDIUM_STRINGS.jednKV}
                </dd>
              </div>
            </dl>
          )}

          <div className="mvd-studium-pole">
            <label htmlFor="mvd-studium-operator">{STUDIUM_STRINGS.paramOperator}</label>
            {(katalog?.operators.length ?? 0) === 0 ? (
              <p className="mvd-studium-pole-uwaga" data-testid="mvd-studium-operator-brak">
                {STUDIUM_STRINGS.paramOperatorBrak}
              </p>
            ) : (
              <select
                id="mvd-studium-operator"
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                data-testid="mvd-studium-operator"
              >
                {(katalog?.operators ?? []).map((o) => (
                  <option key={o.operator_id} value={o.operator_id}>
                    {o.operator_name_pl}
                  </option>
                ))}
              </select>
            )}
            <p className="mvd-studium-hint">{STUDIUM_STRINGS.paramOperatorHint}</p>
          </div>
        </section>
      )}

      {krok === 3 && (
        <section className="mvd-studium-panel" data-testid="mvd-studium-krok3">
          <h3 className="mvd-studium-panel-tytul">{STUDIUM_STRINGS.krok3Naglowek}</h3>
          <p className="mvd-studium-hint">{STUDIUM_STRINGS.krok3Hint}</p>

          {runId === null ? (
            <StanPanel
              komunikat={STUDIUM_STRINGS.brakPrzebiegu}
              opis={STUDIUM_STRINGS.brakPrzebieguOpis}
              wariant="info"
              testid="mvd-studium-brak-przebiegu"
            />
          ) : (
            <>
              <button
                type="button"
                className="mvd-studium-uruchom"
                onClick={uruchomAnalizy}
                disabled={!mozeUruchomic}
                data-testid="mvd-studium-uruchom"
              >
                {stan === null
                  ? STUDIUM_STRINGS.przyciskUruchom
                  : STUDIUM_STRINGS.przyciskUruchomPonownie}
              </button>
              {!mozeUruchomic && !trwaBieg && stan === null && (
                <p className="mvd-studium-pole-uwaga">{STUDIUM_STRINGS.brakGotowosci}</p>
              )}
              {trwaBieg && (
                <p className="mvd-studium-biegnie" data-testid="mvd-studium-biegnie">
                  {STUDIUM_STRINGS.biegTrwa}
                </p>
              )}
              {stan !== null && (
                <ul className="mvd-studium-postep" data-testid="mvd-studium-postep">
                  {[...stan.values()].map((wariant) => (
                    <PostepWariantu
                      key={wariant.busRef}
                      wariant={wariant}
                      nazwaWezla={nazwaWezla(wariant.busRef)}
                      trybEkspercki={trybEkspercki}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {krok === 4 && (
        <section className="mvd-studium-panel" data-testid="mvd-studium-krok4">
          <h3 className="mvd-studium-panel-tytul">{STUDIUM_STRINGS.krok4Naglowek}</h3>
          <p className="mvd-studium-hint">{STUDIUM_STRINGS.krok4Hint}</p>

          {stan === null || stan.size === 0 ? (
            <StanPanel
              komunikat={STUDIUM_STRINGS.brakWynikow}
              wariant="info"
              testid="mvd-studium-brak-wynikow"
            />
          ) : (
            <PrzegladStudium
              stan={stan}
              kontekst={kontekstWierszy}
              trybZaawansowania={trybZaawansowania}
              wybranyWariant={wybranyWariant}
              ustawWariant={setWybranyWariant}
            />
          )}

          <div className="mvd-studium-dok-akcja">
            <button
              type="button"
              className="mvd-studium-uruchom"
              onClick={() => void generujDokument()}
              disabled={!dokumentDostepny || dokLadowanie}
              title={
                dokumentDostepny
                  ? STUDIUM_STRINGS.dokTytulAktywny
                  : STUDIUM_STRINGS.dokTytulNieaktywny
              }
              data-testid="mvd-studium-dok-przycisk"
            >
              {STUDIUM_STRINGS.dokPrzycisk}
            </button>
          </div>

          {dokument || dokBraki || dokBlad || dokLadowanie ? (
            <section className="mvd-studium-dok" data-testid="mvd-studium-dokument">
              <div className="mvd-studium-dok-head">
                <h4 className="mvd-studium-dok-tytul">{STUDIUM_STRINGS.dokNaglowek}</h4>
                <button
                  type="button"
                  className="mvd-studium-naw"
                  onClick={zamknijDokument}
                  data-testid="mvd-studium-dok-zamknij"
                >
                  {STUDIUM_STRINGS.dokZamknij}
                </button>
              </div>

              {dokLadowanie ? (
                <p className="mvd-studium-biegnie" data-testid="mvd-studium-dok-ladowanie">
                  {STUDIUM_STRINGS.dokLadowanie}
                </p>
              ) : null}

              {dokBlad ? (
                <div className="mvd-studium-stan mvd-studium-stan--blad" data-testid="mvd-studium-dok-blad">
                  <p className="mvd-studium-stan-title">
                    {STUDIUM_STRINGS.dokBlad}: {dokBlad}
                  </p>
                </div>
              ) : null}

              {dokBraki ? (
                <div className="mvd-studium-stan mvd-studium-stan--blad" data-testid="mvd-studium-dok-braki">
                  <p className="mvd-studium-stan-title">{STUDIUM_STRINGS.dokBrakiTytul}</p>
                  <p className="mvd-studium-stan-desc">{dokBraki.komunikat}</p>
                  <ul className="mvd-studium-dok-braki-lista">
                    {dokBraki.braki.map((brak, indeks) => (
                      <li key={indeks}>{brak}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {dokument ? (
                <SekcjaPodgladuDokumentu
                  dokument={dokument}
                  docxLadowanie={docxLadowanie}
                  pdfLadowanie={pdfLadowanie}
                  onPobierzDocx={() => void pobierzDocx()}
                  onPobierzPdf={() => void pobierzPdf()}
                />
              ) : null}
            </section>
          ) : null}
        </section>
      )}

      <nav className="mvd-studium-nawigacja" data-testid="mvd-studium-nawigacja">
        <button
          type="button"
          className="mvd-studium-naw"
          onClick={() => setKrok((k) => Math.max(1, k - 1))}
          disabled={krok === 1}
          data-testid="mvd-studium-wstecz"
        >
          {STUDIUM_STRINGS.nawWstecz}
        </button>
        <button
          type="button"
          className="mvd-studium-naw"
          onClick={() => setKrok((k) => Math.min(LICZBA_KROKOW, k + 1))}
          disabled={krok === LICZBA_KROKOW || (krok === 1 && wybraneWezly.length === 0)}
          data-testid="mvd-studium-dalej"
        >
          {STUDIUM_STRINGS.nawDalej}
        </button>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Przegląd zbiorczy — tabela wzorca + szczegół wybranego wariantu
// ---------------------------------------------------------------------------

function PrzegladStudium({
  stan,
  kontekst,
  trybZaawansowania,
  wybranyWariant,
  ustawWariant,
}: {
  stan: StanStudium;
  kontekst: KontekstWierszaStudium;
  trybZaawansowania: AdvancementMode;
  wybranyWariant: string | null;
  ustawWariant: (busRef: string | null) => void;
}) {
  const kolumny = useMemo(() => kolumnyStudium(), []);
  const wiersze = useMemo(() => wierszeStudium(stan, kontekst), [stan, kontekst]);
  const trybEkspercki = trybZaawansowania === 'expert';

  const wariant = wybranyWariant !== null ? stan.get(wybranyWariant) ?? null : null;
  const ktorykolwiekWToku = [...stan.values()].some(wariantWToku);

  return (
    <div data-testid="mvd-studium-przeglad">
      <TabelaWynikow
        kolumny={kolumny}
        wiersze={wiersze}
        onOtworzDowod={() => undefined}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_WIERSZA_STUDIUM}
        onWybierzWiersz={ustawWariant}
        wybranyWiersz={wybranyWariant}
      />

      {ktorykolwiekWToku && (
        <p className="mvd-studium-biegnie" data-testid="mvd-studium-przeglad-biegnie">
          {STUDIUM_STRINGS.biegTrwa}
        </p>
      )}

      {wariant !== null ? (
        <SzczegolWariantu wariant={wariant} trybEkspercki={trybEkspercki} />
      ) : (
        <StanPanel
          komunikat={STUDIUM_STRINGS.szczegolBrakWyboru}
          wariant="info"
          testid="mvd-studium-szczegol-brak"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Podgląd dokumentu studium — identyfikacja, założenia, tabela wariantów,
// sekcje błędów (uczciwie) i pobrania DOCX/PDF. Zero fizyki, zero ocen lokalnych.
// ---------------------------------------------------------------------------

function fmtMocDok(moc: number | null): string {
  return moc === null ? STUDIUM_STRINGS.kreska : `${fmtMocMW(moc)} ${STUDIUM_STRINGS.jednMW}`;
}

function SekcjaPodgladuDokumentu({
  dokument,
  docxLadowanie,
  pdfLadowanie,
  onPobierzDocx,
  onPobierzPdf,
}: {
  dokument: WidokDokumentuStudium;
  docxLadowanie: boolean;
  pdfLadowanie: boolean;
  onPobierzDocx: () => void;
  onPobierzPdf: () => void;
}) {
  const bledyWariantow = dokument.warianty
    .map((wariant) => {
      const pozycje: { faza: string; komunikat: string }[] = [];
      if (wariant.zdolnosc.status === 'blad' && wariant.zdolnosc.komunikat_bledu) {
        pozycje.push({ faza: STUDIUM_STRINGS.dokBladZdolnosc, komunikat: wariant.zdolnosc.komunikat_bledu });
      }
      if (wariant.obszar_pq.status === 'blad' && wariant.obszar_pq.komunikat_bledu) {
        pozycje.push({ faza: STUDIUM_STRINGS.dokBladObszar, komunikat: wariant.obszar_pq.komunikat_bledu });
      }
      if (wariant.pokrycie_pq.status === 'blad' && wariant.pokrycie_pq.komunikat_bledu) {
        pozycje.push({ faza: STUDIUM_STRINGS.dokBladPokrycie, komunikat: wariant.pokrycie_pq.komunikat_bledu });
      }
      return { busRef: wariant.bus_ref, nazwa: wariant.nazwa_wezla, pozycje };
    })
    .filter((w) => w.pozycje.length > 0);

  return (
    <div className="mvd-studium-dok-widok" data-testid="mvd-studium-dok-widok">
      <dl className="mvd-studium-dok-meta" data-testid="mvd-studium-dok-identyfikacja">
        <div>
          <dt>{STUDIUM_STRINGS.dokProjekt}</dt>
          <dd>{dokument.identyfikacja.projekt}</dd>
        </div>
        {dokument.identyfikacja.przypadek ? (
          <div>
            <dt>{STUDIUM_STRINGS.dokPrzypadek}</dt>
            <dd>{dokument.identyfikacja.przypadek}</dd>
          </div>
        ) : null}
        <div>
          <dt>{STUDIUM_STRINGS.dokTypKatalogowy}</dt>
          <dd>{dokument.zalozenia.typ_katalogowy.nazwa}</dd>
        </div>
        <div>
          <dt>{STUDIUM_STRINGS.dokOperator}</dt>
          <dd>{dokument.zalozenia.operator.nazwa}</dd>
        </div>
        <div>
          <dt>{STUDIUM_STRINGS.dokPrzebieg}</dt>
          <dd className="mvd-num">{dokument.zalozenia.przebieg_bazowy.run_id}</dd>
        </div>
        <div>
          <dt>{STUDIUM_STRINGS.dokLiczbaWariantow}</dt>
          <dd className="mvd-num">{dokument.zalozenia.liczba_wariantow}</dd>
        </div>
      </dl>

      <h5 className="mvd-studium-dok-podtytul">{STUDIUM_STRINGS.dokPodsumowanieTytul}</h5>
      <div className="mvd-studium-dok-tabela-wrap">
        <table className="mvd-studium-dok-tabela" data-testid="mvd-studium-dok-podsumowanie">
          <thead>
            <tr>
              <th>{STUDIUM_STRINGS.dokKolWezel}</th>
              <th>{STUDIUM_STRINGS.dokKolMoc}</th>
              <th>{STUDIUM_STRINGS.dokKolKlasa}</th>
              <th>{STUDIUM_STRINGS.dokKolPokrycie}</th>
              <th>{STUDIUM_STRINGS.dokKolPasmoQ}</th>
            </tr>
          </thead>
          <tbody>
            {dokument.podsumowanie.map((wiersz) => (
              <tr key={wiersz.bus_ref} data-testid={`mvd-studium-dok-wiersz-${wiersz.bus_ref}`}>
                <td>{wiersz.nazwa_wezla}</td>
                <td className="mvd-num">{fmtMocDok(wiersz.max_moc_mw)}</td>
                <td>{wiersz.klasa ?? STUDIUM_STRINGS.kreska}</td>
                <td>{wiersz.pokrycie_pl ?? STUDIUM_STRINGS.kreska}</td>
                <td className="mvd-num">{wiersz.pasmo_q_pl ?? STUDIUM_STRINGS.kreska}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h5 className="mvd-studium-dok-podtytul">{STUDIUM_STRINGS.dokSekcjeBledowTytul}</h5>
      {bledyWariantow.length === 0 ? (
        <p className="mvd-studium-hint" data-testid="mvd-studium-dok-bez-bledow">
          {STUDIUM_STRINGS.dokBezBledow}
        </p>
      ) : (
        <ul className="mvd-studium-dok-bledy" data-testid="mvd-studium-dok-bledy">
          {bledyWariantow.map((w) => (
            <li key={w.busRef} data-testid={`mvd-studium-dok-blad-${w.busRef}`}>
              <span className="mvd-studium-dok-blad-wezel">{w.nazwa}</span>
              <ul>
                {w.pozycje.map((p, i) => (
                  <li key={i}>
                    {p.faza}: {p.komunikat}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <h5 className="mvd-studium-dok-podtytul">{STUDIUM_STRINGS.dokZalozeniaTytul}</h5>
      <ul className="mvd-studium-dok-zalozenia">
        {dokument.zalozenia_pl.map((pozycja, i) => (
          <li key={i}>{pozycja}</li>
        ))}
      </ul>

      <div className="mvd-studium-dok-pobrania">
        <button
          type="button"
          className="mvd-studium-uruchom"
          onClick={onPobierzDocx}
          disabled={docxLadowanie}
          data-testid="mvd-studium-dok-pobierz-docx"
        >
          {STUDIUM_STRINGS.dokPobierzDocx}
        </button>
        <button
          type="button"
          className="mvd-studium-uruchom"
          onClick={onPobierzPdf}
          disabled={pdfLadowanie}
          data-testid="mvd-studium-dok-pobierz-pdf"
        >
          {STUDIUM_STRINGS.dokPobierzPdf}
        </button>
      </div>
    </div>
  );
}
