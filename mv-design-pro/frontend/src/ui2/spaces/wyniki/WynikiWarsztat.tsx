/**
 * Warsztat przestrzeni „Wyniki" (scalenia U3 #1–#3, zarządca) — wygaszanie
 * mostu wyników okno po oknie: „Rozpływ mocy" (TabelaSzyn, karta E8.1),
 * „Zwarcia" (EkranZwarc, karta E8.2) i „Dowód obliczeń" (PrzegladDowodu,
 * karta E9.1) to okna nowej powłoki; „Pozostałe analizy" to slot mostu
 * (powierzchnia trasowa #analysis — zabezpieczenia, porównania, E10+).
 *
 * Zakładka startowa wg rodzaju aktywnego przebiegu (rozpływ/zwarcie/most);
 * wyliczana przy montażu i AKTUALIZOWANA po hydratacji K2 (rejestr przebiegów
 * doładowuje się z serwera PO montażu — zimny start nie może utknąć na moście),
 * ale wyłącznie dopóki użytkownik nie wybrał zakładki sam (ręczny wybór i
 * deep-link mają pierwszeństwo — K3-A4, zero zaskakującego przełączania).
 * 2×klik na wartości z dowodem przełącza na zakładkę „Dowód obliczeń"
 * (okno E9.1; fokus kroku wg elementu = TODO-KARTA w DowodPrzebiegu).
 *
 * Założenia przebiegu zwarciowego (współczynnik c, czas cieplny) pochodzą
 * z konfiguracji AKTYWNEGO przypadku obliczeniowego — przekazywane tylko, gdy
 * aktywny przebieg należy do aktywnego przypadku (inaczej „—", zero zgadywania).
 */
import { useEffect, useState, type ReactNode } from 'react';

import type { AdvancementMode } from '../../shell/modeModel';
import { useShellStore } from '../../shell/useShellStore';
import { EkranBadanOltc } from '../../wyniki/oltc';
import { EkranCoWymagaUwagi } from '../../wyniki/co-wymaga-uwagi';
import { EkranWerdyktu } from '../../wyniki/werdykt';
import { EkranRozplywu } from '../../wyniki/rozplyw';
import { EkranZwarc } from '../../wyniki/zwarcia';
import { useAppStateStore } from '../../../ui/app-state';
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
import { EkranKoordynacji } from '../../wyniki/koordynacja';
import { EkranEstymacji } from '../../wyniki/estymacja';
import { EkranSkladowych } from '../../wyniki/skladowe';
import { EkranSsci } from '../../wyniki/ssci';
import { EkranStabilnosci } from '../../wyniki/stabilnosc';
import { EkranStanuFazowego } from '../../wyniki/stan-fazowy';
import { EkranOdbioru } from '../../wyniki/odbior';
import { EkranPorownania } from '../../wyniki/porownanie';
import { EkranZbieznosci } from '../../wyniki/zbieznosc';
import { DowodPrzebiegu } from './DowodPrzebiegu';
import { useWpiecieWynikow } from './useWpiecieWynikow';
import { WYNIKI_WARSZTAT_STRINGS as T } from './strings';
import './wynikiWarsztat.css';

const ZAKLADKI = [
  { id: 'werdykt', etykieta: T.zakladkaWerdykt },
  { id: 'co-wymaga-uwagi', etykieta: T.zakladkaCoWymagaUwagi },
  { id: 'rozplyw', etykieta: T.zakladkaRozplyw },
  { id: 'regulacja-oltc', etykieta: T.zakladkaRegulacjaOltc },
  { id: 'zbieznosc', etykieta: T.zakladkaZbieznosc },
  { id: 'zwarcia', etykieta: T.zakladkaZwarcia },
  { id: 'koordynacja', etykieta: T.zakladkaKoordynacja },
  { id: 'skladowe', etykieta: T.zakladkaSkladowe },
  { id: 'dowod', etykieta: T.zakladkaDowod },
  { id: 'jakosc', etykieta: T.zakladkaJakosc },
  { id: 'porownanie', etykieta: T.zakladkaPorownanie },
  { id: 'odbior', etykieta: T.zakladkaOdbior },
  { id: 'estymacja', etykieta: T.zakladkaEstymacja },
  { id: 'stan-fazowy', etykieta: T.zakladkaStanFazowy },
  { id: 'ssci', etykieta: T.zakladkaSsci },
  { id: 'stabilnosc', etykieta: T.zakladkaStabilnosc },
  { id: 'ncrfg', etykieta: T.zakladkaNcRfg },
  { id: 'pulpit-oze', etykieta: T.zakladkaPulpitOze },
  { id: 'zdolnosc', etykieta: T.zakladkaZdolnosc },
  { id: 'ranking', etykieta: T.zakladkaRanking },
  { id: 'krzywe', etykieta: T.zakladkaKrzywe },
  { id: 'obszar', etykieta: T.zakladkaObszar },
  { id: 'studium', etykieta: T.zakladkaStudium },
  { id: 'frt', etykieta: T.zakladkaFrt },
  { id: 'osd', etykieta: T.zakladkaOsd },
  { id: 'kompensacja', etykieta: T.zakladkaKompensacja },
  { id: 'wniosek', etykieta: T.zakladkaWniosek },
  { id: 'lom', etykieta: T.zakladkaLom },
  { id: 'pozostale', etykieta: T.zakladkaPozostale },
] as const;

/** Grupowanie zakładek (przegląd IA po komplecie fali OZE) — czysta prezentacja:
 * jeden tablist, dwa nazwane klastry; testidy i klawiatura bez zmian. */
const GRUPY_ZAKLADEK: readonly { etykieta: string; zakladki: readonly ZakladkaId[] }[] = [
  {
    etykieta: T.grupaAnalizy,
    zakladki: [
      'werdykt',
      'co-wymaga-uwagi',
      'rozplyw',
      'regulacja-oltc',
      'zbieznosc',
      'zwarcia',
      'koordynacja',
      'skladowe',
      'dowod',
      'jakosc',
      'porownanie',
      'odbior',
      'estymacja',
      'stan-fazowy',
      'ssci',
      'stabilnosc',
      'pozostale',
    ],
  },
  {
    etykieta: T.grupaOze,
    zakladki: [
      'ncrfg',
      'pulpit-oze',
      'zdolnosc',
      'ranking',
      'krzywe',
      'obszar',
      'studium',
      'frt',
      'osd',
      'kompensacja',
      'wniosek',
      'lom',
    ],
  },
];

type ZakladkaId = (typeof ZAKLADKI)[number]['id'];

export interface WynikiWarsztatProps {
  trybZaawansowania: AdvancementMode;
  /** Zawartość zakładki „Pozostałe analizy" (most — LegacySurface). */
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

export function WynikiWarsztat({
  trybZaawansowania,
  pozostale,
  onOtworzDokumentacje,
}: WynikiWarsztatProps) {
  const { aktywnyRodzaj } = useWpiecieWynikow();
  const [zakladka, setZakladka] = useState<ZakladkaId>(
    aktywnyRodzaj === 'rozplyw' ? 'rozplyw' : aktywnyRodzaj === 'zwarcie' ? 'zwarcia' : 'pozostale',
  );
  // K3-A4: po zimnym starcie rejestr przebiegów hydratuje z serwera PO montażu
  // (K2, useHydratacjaPowloki) — `aktywnyRodzaj` zmienia się z null na
  // 'rozplyw'/'zwarcie', a zakładka z inicjalizatora zostawała na moście.
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
  const [modulNcRfg, setModulNcRfg] = useState<string | null>(null);
  const [elementRozplywu, setElementRozplywu] = useState<string | null>(null);
  useEffect(() => {
    if (!wynikiTab) return;
    if (ZAKLADKI.some((z) => z.id === wynikiTab)) {
      setZakladka(wynikiTab as ZakladkaId);
      // K3-A4: deep-link = jawny wybór celu — hydratacja K2 nie może go nadpisać.
      setZakladkaWybranaRecznie(true);
      if (wynikiTab === 'kompensacja' && wynikiTabElement) {
        setElementKompensacji(wynikiTabElement);
      }
      if (wynikiTab === 'dowod') {
        // Deep-link bez kontekstu = dowód aktywnego przebiegu (czyści wskazanie).
        setPrzebiegDowodu(wynikiTabElement ?? null);
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
  }, [wynikiTab, wynikiTabElement, setWynikiTab]);
  const zalozeniaZwarciowe = useZalozeniaZwarcioweAktywnegoPrzypadku();

  // Nawigacja ręczna (klik/klawiatura/2×klik w ekranach jednego przebiegu):
  // wejście na „Dowód obliczeń" bez deep-linku wraca do aktywnego przebiegu —
  // wskazanie z porównania nie może zalegać (izolacja kontekstu, R3-C).
  const przejdzDoZakladki = (id: ZakladkaId) => {
    if (id === 'dowod') setPrzebiegDowodu(null);
    // K3-A4: ręczny wybór użytkownika — hydratacja K2 przestaje sterować zakładką.
    setZakladkaWybranaRecznie(true);
    setZakladka(id);
  };

  // 2×klik na wartości z dowodem → zakładka „Dowód obliczeń" (okno E9.1).
  const otworzDowod = (_ref: string) => {
    przejdzDoZakladki('dowod');
  };

  return (
    <div className="mvd-wyniki-warsztat" data-testid="mvd-wyniki-warsztat">
      <div role="tablist" aria-label={T.ariaZakladki} className="mvd-wyniki-zakladki">
        {GRUPY_ZAKLADEK.map((grupa) => (
          <div key={grupa.etykieta} className="mvd-wyniki-grupa" role="presentation">
            <span className="mvd-wyniki-grupa-etykieta" aria-hidden="true">
              {grupa.etykieta}
            </span>
            {grupa.zakladki.map((id) => {
              const z = ZAKLADKI.find((x) => x.id === id)!;
              return (
                <button
                  key={z.id}
                  role="tab"
                  type="button"
                  aria-selected={zakladka === z.id}
                  tabIndex={zakladka === z.id ? 0 : -1}
                  className={zakladka === z.id ? 'mvd-wyniki-zakladka mvd-on' : 'mvd-wyniki-zakladka'}
                  data-testid={`mvd-wyniki-zakladka-${z.id}`}
                  onClick={() => przejdzDoZakladki(z.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      // Kolejność klawiatury = kolejność wizualna (spłaszczone grupy).
                      const kolejnosc = GRUPY_ZAKLADEK.flatMap((g) => g.zakladki);
                      const idx = kolejnosc.indexOf(zakladka);
                      const krok = e.key === 'ArrowRight' ? 1 : kolejnosc.length - 1;
                      przejdzDoZakladki(kolejnosc[(idx + krok) % kolejnosc.length]);
                    }
                  }}
                >
                  {z.etykieta}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div role="tabpanel" className="mvd-wyniki-tresc">
        {zakladka === 'werdykt' && <EkranWerdyktu />}
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
        {/* K3-A3: zakładkowi dostawcy kart huba E-29…E-32 (parytet E-33/E-34) —
            ekrany ui2 czytają store'y same (bez propsów, uczciwe stany zerowe). */}
        {zakladka === 'zbieznosc' && <EkranZbieznosci />}
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
          <DowodPrzebiegu trybZaawansowania={trybZaawansowania} wskazanyRunId={przebiegDowodu} />
        )}
        {zakladka === 'jakosc' && (
          <EkranJakosci trybZaawansowania={trybZaawansowania} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'porownanie' && <PorownanieAktywnegoProjektu trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'odbior' && (
          <EkranOdbioru trybZaawansowania={trybZaawansowania} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'estymacja' && (
          <EkranEstymacji trybZaawansowania={trybZaawansowania} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'ssci' && <EkranSsci trybZaawansowania={trybZaawansowania} />}
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
