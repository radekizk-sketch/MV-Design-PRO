/**
 * Warsztat przestrzeni „Wyniki" (scalenia U3 #1–#3, zarządca) — okna nowej
 * powłoki po wygaszeniu mostu wyników okno po oknie; „Widoki klasyczne" to
 * slot mostu (powierzchnia trasowa #analysis — zabezpieczenia E-27/E-28, taby
 * compare/trace/ncrfg-tests).
 *
 * Nawigacja OBSZAR → ANALIZA (karta B-02 / W3-E): rząd obszarów i rząd analiz
 * aktywnego obszaru; dane nawigacji w `obszary.ts` (jedno źródło prawdy dla
 * pasków, bramy trybu i deep-linków). Obszar jest POCHODNĄ wybranej zakładki —
 * jeden stan, zero rozjazdu między paskami.
 *
 * Zakładka startowa wg rodzaju aktywnego przebiegu (rozpływ/zwarcie), inaczej
 * „Ocena techniczna wyników" (stan blokujący BRAK WYNIKÓW DO OCENY prowadzi do
 * obliczeń); wyliczana przy montażu i AKTUALIZOWANA po hydratacji K2 (rejestr
 * przebiegów doładowuje się z serwera PO montażu — zimny start nie może utknąć),
 * ale wyłącznie dopóki użytkownik nie wybrał zakładki sam (ręczny wybór i
 * deep-link mają pierwszeństwo — K3-A4, zero zaskakującego przełączania).
 * Otwarta powierzchnia trasowa mostu spoza dawnego huba (klasa B/C — deep-link
 * `#analysis?tab=trace`, karta widoku klasycznego) przełącza warsztat na
 * „Widoki klasyczne", bo tylko tam ta powierzchnia ma router.
 * 2×klik na wartości z dowodem przełącza na zakładkę „Dowód obliczeń"
 * (okno E9.1; wskazanie elementu zawęża wywód do jego kroków — KD-4).
 *
 * Założenia przebiegu zwarciowego (współczynnik c, czas cieplny) pochodzą
 * z konfiguracji AKTYWNEGO przypadku obliczeniowego — przekazywane tylko, gdy
 * aktywny przebieg należy do aktywnego przypadku (inaczej „—", zero zgadywania).
 */
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';

import type { AdvancementMode } from '../../shell/modeModel';
import { useShellStore } from '../../shell/useShellStore';
import { EkranBadanOltc } from '../../wyniki/oltc';
import { EkranCoWymagaUwagi } from '../../wyniki/co-wymaga-uwagi';
import { EkranOceny } from '../../wyniki/ocena';
import { EkranRozplywu } from '../../wyniki/rozplyw';
import { EkranZwarc } from '../../wyniki/zwarcia';
import { jestDawnymHubem } from '../../wyniki/analizy';
import { useAppStateStore } from '../../../ui/app-state';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import {
  EkranFrt,
  EkranKompensacji,
  EkranLom,
  EkranOsd,
  EkranWniosku,
  EkranKrzywych,
  EkranObszaruPQ,
  EkranRankingu,
  EkranZdolnosci,
  KreatorStudium,
  MacierzNcRfg,
  PulpitOze,
} from '../../oze';
import { EkranJakosci } from '../../wyniki/jakosc';
import { EkranKontyngencji } from '../../wyniki/kontyngencje';
import { EkranWrazliwosci } from '../../wyniki/wrazliwosc';
import { EkranKoordynacji } from '../../wyniki/koordynacja';
import { EkranEstymacji } from '../../wyniki/estymacja';
import { EkranSkladowych } from '../../wyniki/skladowe';
import { EkranSsci } from '../../wyniki/ssci';
import { EkranAnalizAkademickich } from '../../wyniki/akademickie';
import { EkranStabilnosci } from '../../wyniki/stabilnosc';
import { EkranStanuFazowego } from '../../wyniki/stan-fazowy';
import { EkranOdbioru } from '../../wyniki/odbior';
import { EkranPorownania } from '../../wyniki/porownanie';
import { EkranZbieznosci } from '../../wyniki/zbieznosc';
import { DowodPrzebiegu } from './DowodPrzebiegu';
import {
  etykietaZakladki,
  jestZakladka,
  obszarZakladki,
  obszaryDostepne,
  zakladkaDostepna,
  zakladkiObszaru,
  type ObszarId,
  type ZakladkaId,
} from './obszary';
import { useWpiecieWynikow } from './useWpiecieWynikow';
import { WYNIKI_WARSZTAT_STRINGS as T } from './strings';
import './wynikiWarsztat.css';

export interface WynikiWarsztatProps {
  trybZaawansowania: AdvancementMode;
  /** Zawartość zakładki „Widoki klasyczne" (most — LegacySurface). */
  pozostale: ReactNode;
  /** Nawigacja do przestrzeni „Dokumentacja" (pulpit OZE — decyzja AppRoot). */
  onOtworzDokumentacje: () => void;
}

/** Parametry zwarciowe konfiguracji aktywnego przypadku — tylko gdy aktywny
 * przebieg należy do tego przypadku (uczciwość źródła danych). */
function useZalozeniaZwarcioweAktywnegoPrzypadku(): {
  wspolczynnikC?: number;
  czasCieplnyS?: number;
} {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const activeCase = useStudyCasesStore((s) => s.activeCase);
  const przebieg = activeRunId ? przebiegi.find((r) => r.id === activeRunId) : undefined;
  if (!przebieg || !activeCase || przebieg.study_case_id !== activeCase.id) return {};
  return {
    wspolczynnikC: activeCase.config?.c_factor_max ?? undefined,
    czasCieplnyS: activeCase.config?.thermal_time_seconds ?? undefined,
  };
}

/** Porównanie A/B (E12.1) dla aktywnego projektu — bez projektu uczciwy stan pusty. */
function PorownanieAktywnegoProjektu({ trybZaawansowania }: { trybZaawansowania: AdvancementMode }) {
  const projektId = useAppStateStore((s) => s.activeProjectId);
  if (!projektId) {
    return (
      <p className="mvd-wyniki-pusty" data-testid="mvd-wyniki-porownanie-bez-projektu">
        {T.porownanieBezProjektu}
      </p>
    );
  }
  return <EkranPorownania projektId={projektId} trybZaawansowania={trybZaawansowania} />;
}

/** Krok strzałek w liście (w prawo +1, w lewo −1 z zawinięciem). */
function sasiad<Id extends string>(kolejnosc: readonly Id[], biezacy: Id, klawisz: string): Id | null {
  if (klawisz !== 'ArrowRight' && klawisz !== 'ArrowLeft') return null;
  const idx = kolejnosc.indexOf(biezacy);
  const krok = klawisz === 'ArrowRight' ? 1 : kolejnosc.length - 1;
  return kolejnosc[(idx + krok) % kolejnosc.length];
}

export function WynikiWarsztat({
  trybZaawansowania,
  pozostale,
  onOtworzDokumentacje,
}: WynikiWarsztatProps) {
  const { aktywnyRodzaj } = useWpiecieWynikow();
  const [zakladka, setZakladka] = useState<ZakladkaId>(
    aktywnyRodzaj === 'rozplyw' ? 'rozplyw' : aktywnyRodzaj === 'zwarcie' ? 'zwarcia' : 'ocena',
  );
  // K3-A4: po zimnym starcie rejestr przebiegów hydratuje z serwera PO montażu
  // (K2, useHydratacjaPowloki) — `aktywnyRodzaj` zmienia się z null na
  // 'rozplyw'/'zwarcie', a zakładka z inicjalizatora zostawała na ocenie.
  // Dopóki użytkownik nie wybrał zakładki sam (klik/klawiatura/deep-link),
  // doprowadzamy ją do rodzaju aktywnego przebiegu; ręczny wybór wygrywa.
  const [zakladkaWybranaRecznie, setZakladkaWybranaRecznie] = useState(false);
  useEffect(() => {
    if (zakladkaWybranaRecznie) return;
    if (aktywnyRodzaj === 'rozplyw') setZakladka('rozplyw');
    else if (aktywnyRodzaj === 'zwarcie') setZakladka('zwarcia');
  }, [aktywnyRodzaj, zakladkaWybranaRecznie]);
  // Deep-link między-przestrzenny (np. hub Dokumentacji → generator studium OZE):
  // jednorazowe żądanie ze shell store; walidujemy id i czyścimy po konsumpcji.
  // R2-B: żądanie może nieść kontekst elementu (`wynikiTabElement`) —
  // konsumują go okno „Dobór kompensacji" (pre-selekcja węzła przekroczenia
  // bilansu mocy biernej), zakładka „Dowód obliczeń" (R3-C: kontekst =
  // KONKRETNY run_id, np. przebieg kolumny A/B porównania) oraz — od karty
  // D-2 — zakładka „Rozpływ" (pre-selekcja wiersza elementu klikniętego w
  // menu SLD „Pokaż wyniki", wzorzec P-1 `show-ncrfg`); dla innych zakładek
  // kontekst nie jest przechwytywany (zero zalegających refów między zakładkami).
  const wynikiTab = useShellStore((s) => s.wynikiTab);
  const wynikiTabElement = useShellStore((s) => s.wynikiTabElement);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const [elementKompensacji, setElementKompensacji] = useState<string | null>(null);
  const [przebiegDowodu, setPrzebiegDowodu] = useState<string | null>(null);
  /** KD-4 (L-11): element wskazany 2× klikiem — zawęża wywód do jego kroków. */
  const [elementDowodu, setElementDowodu] = useState<string | null>(null);
  const [modulNcRfg, setModulNcRfg] = useState<string | null>(null);
  const [elementRozplywu, setElementRozplywu] = useState<string | null>(null);
  useEffect(() => {
    if (!wynikiTab) return;
    // V126-JEZYK: deep-link nie może obejść bramy trybu — żądanie zakładki
    // niedostępnej w bieżącym trybie jest konsumowane bez przełączenia
    // (inaczej brama byłaby dekoracją, a nie regułą).
    if (jestZakladka(wynikiTab) && zakladkaDostepna(wynikiTab, trybZaawansowania)) {
      setZakladka(wynikiTab);
      // K3-A4: deep-link = jawny wybór celu — hydratacja K2 nie może go nadpisać.
      setZakladkaWybranaRecznie(true);
      if (wynikiTab === 'kompensacja' && wynikiTabElement) {
        setElementKompensacji(wynikiTabElement);
      }
      if (wynikiTab === 'dowod') {
        // Deep-link bez kontekstu = dowód aktywnego przebiegu (czyści wskazanie).
        setPrzebiegDowodu(wynikiTabElement ?? null);
        // Kontekst deep-linku to run_id, nie element — wskazanie elementu
        // z poprzedniego wejścia nie może zalegać (izolacja kontekstu).
        setElementDowodu(null);
      }
      if (wynikiTab === 'ncrfg' && wynikiTabElement) {
        // P-1 (akcja SLD „Pokaż zgodność przyłączeniową"): kontekst modułu
        // wytwórczego — macierz pre-selekcjonuje kolumnę wskazanego DER.
        setModulNcRfg(wynikiTabElement);
      }
      if (wynikiTab === 'rozplyw' && wynikiTabElement) {
        // D-2 (akcja SLD „Pokaż wyniki"): kontekst elementu klikniętego na
        // schemacie — okno rozpływu pre-selekcjonuje wiersz (bus_id/branch_id).
        setElementRozplywu(wynikiTabElement);
      }
    }
    setWynikiTab(null); // czyści OBA pola żądania (tab + element)
  }, [wynikiTab, wynikiTabElement, setWynikiTab, trybZaawansowania]);

  // Powierzchnia trasowa mostu spoza dawnego huba (klasa C: E-27/E-28 i taby
  // compare/trace/ncrfg-tests; klasa B: panel prawy) ma router WYŁĄCZNIE w
  // zakładce „Widoki klasyczne" — deep-link `#analysis?tab=trace` albo karta
  // widoku klasycznego otwarta przy innej zakładce nie może zostać niewidoczna.
  // Zamknięcie powierzchni (powrót) zakładki nie rusza: użytkownik wraca do
  // rejestru widoków klasycznych, skąd wybiera dalej sam.
  const activeSurface = useNetworkBuildStore((s) => s.activeSurface);
  useEffect(() => {
    if (jestDawnymHubem(activeSurface)) return;
    setZakladkaWybranaRecznie(true);
    setZakladka('pozostale');
  }, [activeSurface]);

  // V126-JEZYK: obniżenie trybu w trakcie pracy nie może zostawić otwartej
  // zakładki spoza toru — wracamy na ocenę (pierwsza zakładka warsztatu).
  useEffect(() => {
    if (!zakladkaDostepna(zakladka, trybZaawansowania)) setZakladka('ocena');
  }, [zakladka, trybZaawansowania]);
  const zalozeniaZwarciowe = useZalozeniaZwarcioweAktywnegoPrzypadku();

  // Nawigacja ręczna (klik/klawiatura/2×klik w ekranach jednego przebiegu):
  // wejście na „Dowód obliczeń" bez deep-linku wraca do aktywnego przebiegu —
  // wskazanie z porównania nie może zalegać (izolacja kontekstu, R3-C).
  const przejdzDoZakladki = (id: ZakladkaId) => {
    if (id === 'dowod') {
      setPrzebiegDowodu(null);
      setElementDowodu(null);
    }
    // K3-A4: ręczny wybór użytkownika — hydratacja K2 przestaje sterować zakładką.
    setZakladkaWybranaRecznie(true);
    setZakladka(id);
  };

  // Obszar = pochodna zakładki (jeden stan). Wejście w obszar otwiera jego
  // pierwszą zakładkę dostępną w trybie.
  const obszary = obszaryDostepne(trybZaawansowania);
  const obszarAktywny = obszarZakladki(zakladka);
  const zakladkiAktywnegoObszaru = zakladkiObszaru(obszarAktywny, trybZaawansowania);
  const przejdzDoObszaru = (id: ObszarId) => {
    const obszar = obszary.find((o) => o.id === id);
    if (!obszar || obszar.id === obszarAktywny.id) return;
    przejdzDoZakladki(zakladkiObszaru(obszar, trybZaawansowania)[0]);
  };
  const klawiszeObszarow = (e: KeyboardEvent<HTMLButtonElement>) => {
    const cel = sasiad(
      obszary.map((o) => o.id),
      obszarAktywny.id,
      e.key,
    );
    if (cel === null) return;
    e.preventDefault();
    przejdzDoObszaru(cel);
  };
  const klawiszeZakladek = (e: KeyboardEvent<HTMLButtonElement>) => {
    // Kolejność klawiatury = kolejność wizualna zakładek obszaru
    // (z pominięciem zakładek zamkniętych bramą trybu).
    const cel = sasiad(zakladkiAktywnegoObszaru, zakladka, e.key);
    if (cel === null) return;
    e.preventDefault();
    przejdzDoZakladki(cel);
  };

  // 2×klik na wartości z dowodem → zakładka „Dowód obliczeń" (okno E9.1).
  // KD-4 (luka L-11): ref elementu, na którym kliknięto, JEDZIE DALEJ — do tej
  // karty był przyjmowany i wyrzucany (`_ref`), więc wywód zawsze otwierał się
  // na całym przebiegu, choć użytkownik wskazał konkretną wielkość.
  // B-02: ekran oceny wskazuje TEŻ przebieg (kryterium może pochodzić z biegu
  // innego niż aktywny — rozpływ vs zwarcia); bez wskazania = aktywny przebieg.
  const otworzDowod = (ref: string, runId?: string) => {
    setPrzebiegDowodu(runId ?? null);
    setZakladkaWybranaRecznie(true);
    setZakladka('dowod');
    setElementDowodu(ref || null);
  };

  return (
    <div className="mvd-wyniki-warsztat" data-testid="mvd-wyniki-warsztat">
      <div className="mvd-wyniki-nawigacja">
        <div role="tablist" aria-label={T.ariaObszary} className="mvd-wyniki-obszary">
          {obszary.map((obszar) => {
            const aktywny = obszar.id === obszarAktywny.id;
            return (
              <button
                key={obszar.id}
                role="tab"
                type="button"
                aria-selected={aktywny}
                tabIndex={aktywny ? 0 : -1}
                className={aktywny ? 'mvd-wyniki-obszar mvd-on' : 'mvd-wyniki-obszar'}
                data-testid={`mvd-wyniki-obszar-${obszar.id}`}
                data-zakladki={zakladkiObszaru(obszar, trybZaawansowania).join(' ')}
                onClick={() => przejdzDoObszaru(obszar.id)}
                onKeyDown={klawiszeObszarow}
              >
                {obszar.etykieta}
              </button>
            );
          })}
        </div>
        <div role="tablist" aria-label={T.ariaZakladki} className="mvd-wyniki-zakladki">
          {zakladkiAktywnegoObszaru.map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={zakladka === id}
              tabIndex={zakladka === id ? 0 : -1}
              className={zakladka === id ? 'mvd-wyniki-zakladka mvd-on' : 'mvd-wyniki-zakladka'}
              data-testid={`mvd-wyniki-zakladka-${id}`}
              onClick={() => przejdzDoZakladki(id)}
              onKeyDown={klawiszeZakladek}
            >
              {etykietaZakladki(id)}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" className="mvd-wyniki-tresc">
        {/* B-02 / W3-E: ocena techniczna wyników (następca werdyktu projektowego
            i huba „Analizy techniczne") — dowód otwierany dla KONKRETNEGO biegu. */}
        {zakladka === 'ocena' && (
          <EkranOceny trybZaawansowania={trybZaawansowania} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'co-wymaga-uwagi' && <EkranCoWymagaUwagi />}
        {zakladka === 'rozplyw' && (
          <EkranRozplywu
            trybZaawansowania={trybZaawansowania}
            onOtworzDowod={otworzDowod}
            preselekcjaElementu={elementRozplywu}
            onPreselekcjaSkonsumowana={() => setElementRozplywu(null)}
          />
        )}
        {zakladka === 'regulacja-oltc' && <EkranBadanOltc />}
        {/* K3-A3: zakładkowi dostawcy kart dawnego huba E-29…E-32 (parytet E-33/E-34) —
            ekrany ui2 czytają store'y same (bez propsów, uczciwe stany zerowe). */}
        {zakladka === 'zbieznosc' && <EkranZbieznosci />}
        {/* EKRAN-N1 (D8): powierzchnia zdolności enumeracji kontyngencji N-1 —
            zakres wybiera inżynier, bieg startuje jawnym przyciskiem. */}
        {zakladka === 'kontyngencje' && (
          <EkranKontyngencji trybZaawansowania={trybZaawansowania} />
        )}
        {zakladka === 'skladowe' && <EkranSkladowych />}
        {zakladka === 'stan-fazowy' && <EkranStanuFazowego />}
        {zakladka === 'stabilnosc' && <EkranStabilnosci />}
        {zakladka === 'zwarcia' && (
          <EkranZwarc
            trybZaawansowania={trybZaawansowania}
            onOtworzDowod={otworzDowod}
            wspolczynnikC={zalozeniaZwarciowe.wspolczynnikC}
            czasCieplnyS={zalozeniaZwarciowe.czasCieplnyS}
          />
        )}
        {/* K8: dostawca zakładkowy dla wygaszonej trasy mostu #protection-results
            (dawniej: generyczna tabela analityczna powierzchni E-35 bez treści
            zabezpieczeniowej). Ekran ui2 czyta store'y sam — bez propsów. */}
        {zakladka === 'koordynacja' && <EkranKoordynacji />}
        {zakladka === 'dowod' && (
          <DowodPrzebiegu
            trybZaawansowania={trybZaawansowania}
            wskazanyRunId={przebiegDowodu}
            wskazanyElementRef={elementDowodu}
          />
        )}
        {zakladka === 'jakosc' && (
          <EkranJakosci trybZaawansowania={trybZaawansowania} onOtworzDowod={otworzDowod} />
        )}
        {/* ROUTERY-4A: dostawca zdolności A6/A17 (wrażliwość LF + ogólna) —
            ekran ui2 czyta rejestr przebiegów sam (uczciwy stan zerowy z akcją). */}
        {zakladka === 'wrazliwosc' && <EkranWrazliwosci trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'porownanie' && <PorownanieAktywnegoProjektu trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'odbior' && (
          <EkranOdbioru trybZaawansowania={trybZaawansowania} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'estymacja' && (
          <EkranEstymacji trybZaawansowania={trybZaawansowania} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'ssci' && <EkranSsci trybZaawansowania={trybZaawansowania} />}
        {/* B-02: „Analizy specjalistyczne" — katalog kart z backendu i widok analizy
            (przedmiot → dane → gotowość → kryteria → uruchomienie).
            V126-JEZYK: treść renderuje się WYŁĄCZNIE za bramą trybu — ten sam
            predykat co pasek zakładek (jedno źródło prawdy, zero rozjazdu). */}
        {zakladka === 'akademickie' && zakladkaDostepna('akademickie', trybZaawansowania) && (
          <EkranAnalizAkademickich trybZaawansowania={trybZaawansowania} />
        )}
        {zakladka === 'ncrfg' && (
          <MacierzNcRfg
            trybZaawansowania={trybZaawansowania}
            preselekcjaModulu={modulNcRfg}
            onPreselekcjaSkonsumowana={() => setModulNcRfg(null)}
          />
        )}
        {zakladka === 'zdolnosc' && <EkranZdolnosci trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'ranking' && <EkranRankingu trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'krzywe' && <EkranKrzywych trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'obszar' && <EkranObszaruPQ trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'studium' && <KreatorStudium trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'frt' && <EkranFrt trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'osd' && <EkranOsd trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'kompensacja' && (
          <EkranKompensacji
            trybZaawansowania={trybZaawansowania}
            preselekcjaWezla={elementKompensacji}
            onPreselekcjaSkonsumowana={() => setElementKompensacji(null)}
          />
        )}
        {zakladka === 'wniosek' && <EkranWniosku trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'lom' && <EkranLom trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'pulpit-oze' && (
          <PulpitOze
            trybZaawansowania={trybZaawansowania}
            onNawiguj={() => onOtworzDokumentacje()}
          />
        )}
        {zakladka === 'pozostale' && pozostale}
      </div>
    </div>
  );
}
