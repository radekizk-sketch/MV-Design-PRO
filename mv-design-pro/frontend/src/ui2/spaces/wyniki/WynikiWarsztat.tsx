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
 * KONTEKST BIEGU (karta K8): nad treścią zakładki stoi pas kontekstu — aktywny bieg
 * rodziny zakładki (wybór biegu tu zmienia go WSZĘDZIE: schemat, panel dolny, pasek
 * stanu, inspektor, „Dowody") z jego świeżością z jednego predykatu; gdy na schemacie
 * oglądany jest bieg innej rodziny, pas mówi to wprost i daje przełączenie. Wybór
 * wiersza elementu w tabeli zakładki przełącza schemat na bieg zakładki
 * (`KontekstBieguEkranu`) — wynik innego biegu nie zostaje po cichu pod zaznaczeniem.
 *
 * Założenia przebiegu zwarciowego (współczynnik c, czas cieplny) pochodzą
 * z konfiguracji AKTYWNEGO przypadku obliczeniowego — przekazywane tylko, gdy
 * aktywny przebieg należy do aktywnego przypadku (inaczej „—", zero zgadywania).
 */
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';

import { hydratujPowloke } from '../../shell/useHydratacjaPowloki';
import { useShellStore } from '../../shell/useShellStore';
import { EkranBadanOltc } from '../../wyniki/oltc';
import { EkranCoWymagaUwagi } from '../../wyniki/co-wymaga-uwagi';
import { EkranOceny } from '../../wyniki/ocena';
import { EkranRozplywu } from '../../wyniki/rozplyw';
import { EkranZwarc } from '../../wyniki/zwarcia';
import { jestDawnymHubem } from '../../wyniki/analizy';
import { useAppStateStore } from '../../../ui/app-state';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
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
import { EkranDynamiki } from '../../wyniki/dynamika';
import { EkranStanuFazowego } from '../../wyniki/stan-fazowy';
import { EkranOdbioru } from '../../wyniki/odbior';
import { EkranPorownania } from '../../wyniki/porownanie';
import { EkranZbieznosci } from '../../wyniki/zbieznosc';
import {
  ETYKIETA_RODZINY,
  KontekstBieguEkranu,
  WyborBieguRodziny,
  rodzinaAnalizy,
  useAktywnyBieg,
  useBiegOgladany,
  useKontekstWynikuStore,
  type RodzinaAnalizy,
} from '../../wyniki/kontekst';
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
  szczegolyAudytowe: boolean;
  /** Zawartość zakładki „Widoki klasyczne" (most — LegacySurface). */
  pozostale: ReactNode;
  /** Nawigacja do przestrzeni „Dokumentacja" (pulpit OZE — decyzja AppRoot). */
  onOtworzDokumentacje: () => void;
}

/** Porównanie A/B (E12.1) dla aktywnego projektu — bez projektu uczciwy stan pusty. */
function PorownanieAktywnegoProjektu({ szczegolyAudytowe }: { szczegolyAudytowe: boolean }) {
  const projektId = useAppStateStore((s) => s.activeProjectId);
  if (!projektId) {
    return (
      <p className="mvd-wyniki-pusty" data-testid="mvd-wyniki-porownanie-bez-projektu">
        {T.porownanieBezProjektu}
      </p>
    );
  }
  return <EkranPorownania projektId={projektId} szczegolyAudytowe={szczegolyAudytowe} />;
}

/**
 * Rodzina analizy, której AKTYWNY bieg pokazuje zakładka (ekran jednego biegu). Zakładki
 * spoza mapy pokazują wiele biegów albo własne biegi (ocena, porównanie, OZE) —
 * „Dowód obliczeń" pokazuje bieg OGLĄDANY (dowolnej rodziny).
 */
const RODZINA_ZAKLADKI: Partial<Record<ZakladkaId, RodzinaAnalizy>> = {
  rozplyw: 'rozplyw',
  zbieznosc: 'rozplyw',
  zwarcia: 'zwarcie',
  skladowe: 'zwarcie',
  'stan-fazowy': 'fazowy',
  dynamika: 'dynamika',
};

/** Pas kontekstu biegu zakładki: wybór aktywnego biegu rodziny + jawna różnica ze schematem. */
function PasKontekstuBiegu({ rodzina }: { rodzina: RodzinaAnalizy }) {
  const bieg = useAktywnyBieg(rodzina);
  const ogladany = useBiegOgladany();
  const wybierzBieg = useKontekstWynikuStore((s) => s.wybierzBieg);
  if (!bieg) return null;
  const rodzinaSchematu = ogladany ? rodzinaAnalizy(ogladany.analysis_type) : null;
  const inny = ogladany != null && ogladany.id !== bieg.id;
  return (
    <div
      className="mvd-wyniki-kontekst"
      data-testid="mvd-wyniki-kontekst"
      data-rodzina={rodzina}
      data-run-id={bieg.id}
      data-zgodny-ze-schematem={inny ? 'false' : 'true'}
    >
      <WyborBieguRodziny rodzina={rodzina} zrodlo="ekran" testid="mvd-wyniki-kontekst-rodzina" />
      {inny && (
        <span className="mvd-wyniki-kontekst-roznica" role="status" data-testid="mvd-wyniki-kontekst-roznica">
          {`Na schemacie i w panelu dolnym jest inny przebieg${
            rodzinaSchematu ? ` (${ETYKIETA_RODZINY[rodzinaSchematu]})` : ''
          }.`}
          <button
            type="button"
            className="mvd-btn"
            onClick={() => wybierzBieg(bieg.id, 'ekran')}
            data-testid="mvd-wyniki-kontekst-pokaz"
          >
            Pokaż ten przebieg na schemacie
          </button>
        </span>
      )}
    </div>
  );
}

/** Krok strzałek w liście (w prawo +1, w lewo −1 z zawinięciem). */
function sasiad<Id extends string>(kolejnosc: readonly Id[], biezacy: Id, klawisz: string): Id | null {
  if (klawisz !== 'ArrowRight' && klawisz !== 'ArrowLeft') return null;
  const idx = kolejnosc.indexOf(biezacy);
  const krok = klawisz === 'ArrowRight' ? 1 : kolejnosc.length - 1;
  return kolejnosc[(idx + krok) % kolejnosc.length];
}

export function WynikiWarsztat({
  szczegolyAudytowe,
  pozostale,
  onOtworzDokumentacje,
}: WynikiWarsztatProps) {
  const wybierzBieg = useKontekstWynikuStore((s) => s.wybierzBieg);
  // K3-A4: zakładka STARTOWA jest pochodną rodzaju aktywnego przebiegu — po
  // zimnym starcie rejestr przebiegów hydratuje z serwera PO montażu (K2,
  // useHydratacjaPowloki), więc rodzaj zmienia się z null na 'rozplyw'/'zwarcie'.
  // Pochodna liczona PRZY RENDERZE (nie efektem): zmiana rodzaju nie daje klatki
  // z poprzednią zakładką, którą efekt dopiero by nadpisał. Ręczny wybór
  // (klik/klawiatura/deep-link/2×klik) wygrywa i od tej chwili rodzaj przebiegu
  // zakładki nie rusza.
  const [zakladkaWybrana, setZakladkaWybrana] = useState<ZakladkaId | null>(null);
  // Zakładka bieżąca jest kluczem ponowienia ładowania wyników (magazyn inspektora wyników
  // współdzieli zakładka „Dowód obliczeń" — patrz `useWpiecieWynikow`).
  const { aktywnyRodzaj, rejestrZsynchronizowany, biegOczekujacy } = useWpiecieWynikow(
    zakladkaWybrana,
  );
  const zakladkaStartowa: ZakladkaId =
    aktywnyRodzaj === 'rozplyw' ? 'rozplyw' : aktywnyRodzaj === 'zwarcie' ? 'zwarcia' : 'ocena';
  const zakladka = zakladkaWybrana ?? zakladkaStartowa;
  const rodzinaZakladki = RODZINA_ZAKLADKI[zakladka] ?? null;
  const biegZakladki = useAktywnyBieg(rodzinaZakladki ?? 'rozplyw');
  const runIdEkranu = rodzinaZakladki ? biegZakladki?.id ?? null : null;
  // Start NIEUSTALONY: jest aktywny przebieg, ale rejestr przebiegów nie jest
  // jeszcze zsynchronizowany z aktywnym zakresem obliczeń (hydratacja K2 w toku
  // albo nierozpoczęta). Warsztat nie pokazuje wtedy nawigacji: „Ocena" na
  // ułamek sekundy i przeskok na „Rozpływ" to fałszywy stan startowy (klasa:
  // spec e2e czytał `aria-selected` obszaru przed hydratacją, pomijał klik
  // obszaru, a hydratacja zabierała mu zakładkę spod kursora — run CI 444).
  const startNieustalony =
    zakladkaWybrana === null
    && biegOczekujacy
    && aktywnyRodzaj === null
    && !rejestrZsynchronizowany;
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
  /** KD-4 (L-11): element wskazany 2× klikiem — zawęża wywód do jego kroków. */
  const [elementDowodu, setElementDowodu] = useState<string | null>(null);
  const [modulNcRfg, setModulNcRfg] = useState<string | null>(null);
  const [elementRozplywu, setElementRozplywu] = useState<string | null>(null);
  const [elementDynamiki, setElementDynamiki] = useState<string | null>(null);
  useEffect(() => {
    if (!wynikiTab) return;
    // V126-JEZYK: deep-link nie może obejść bramy trybu — żądanie zakładki
    // niedostępnej w bieżącym trybie jest konsumowane bez przełączenia
    // (inaczej brama byłaby dekoracją, a nie regułą).
    if (jestZakladka(wynikiTab) && zakladkaDostepna(wynikiTab, szczegolyAudytowe)) {
      // K3-A4: deep-link = jawny wybór celu — hydratacja K2 nie może go nadpisać.
      setZakladkaWybrana(wynikiTab);
      if (wynikiTab === 'kompensacja' && wynikiTabElement) {
        setElementKompensacji(wynikiTabElement);
      }
      if (wynikiTab === 'dowod') {
        // Karta K8: kontekst deep-linku (run_id) to WYBÓR biegu — zmienia bieg oglądany
        // wszędzie (schemat, panel dolny, pasek stanu); bez kontekstu = bieg oglądany.
        if (wynikiTabElement) wybierzBieg(wynikiTabElement, 'dowody');
        // Kontekst deep-linku to run_id, nie element — wskazanie elementu
        // z poprzedniego wejścia nie może zalegać (izolacja kontekstu).
        setElementDowodu(null);
      }
      if (wynikiTab === 'ncrfg' && wynikiTabElement) {
        // P-1 (akcja SLD „Pokaż zgodność przyłączeniową"): kontekst modułu
        // wytwórczego — macierz pre-selekcjonuje kolumnę wskazanego DER.
        setModulNcRfg(wynikiTabElement);
      }
      if (wynikiTab === 'dynamika') {
        // Karta AB-P1 (akcja naprawcza `der.dynamika_missing`, fokus `dynamic_model_ref`):
        // kontekst = wytwórca, którego wiersz modelu dynamicznego ekran wyróżnia.
        setElementDynamiki(wynikiTabElement ?? null);
      }
      if (wynikiTab === 'rozplyw' && wynikiTabElement) {
        // D-2 (akcja SLD „Pokaż wyniki"): kontekst elementu klikniętego na
        // schemacie — okno rozpływu pre-selekcjonuje wiersz (bus_id/branch_id).
        setElementRozplywu(wynikiTabElement);
      }
    }
    setWynikiTab(null); // czyści OBA pola żądania (tab + element)
  }, [wynikiTab, wynikiTabElement, setWynikiTab, szczegolyAudytowe, wybierzBieg]);

  // Powierzchnia trasowa mostu spoza dawnego huba (klasa C: E-27/E-28 i taby
  // compare/trace/ncrfg-tests; klasa B: panel prawy) ma router WYŁĄCZNIE w
  // zakładce „Widoki klasyczne" — deep-link `#analysis?tab=trace` albo karta
  // widoku klasycznego otwarta przy innej zakładce nie może zostać niewidoczna.
  // Zamknięcie powierzchni (powrót) zakładki nie rusza: użytkownik wraca do
  // rejestru widoków klasycznych, skąd wybiera dalej sam.
  const activeSurface = useNetworkBuildStore((s) => s.activeSurface);
  // Okno klasy B (panel prawy, np. okno techniczne zaznaczenia ze schematu) jest widoczne
  // w inspektorze niezależnie od zakładki, a „Widoki klasyczne" i tak pokazują przy nim
  // sam rejestr — nie może więc zabierać zakładki (karta UI-02: „Otwórz dowód" z panelu
  // dolnego przy otwartym oknie stacji lądował w „Widokach klasycznych", nie w dowodzie).
  useEffect(() => {
    if (jestDawnymHubem(activeSurface) || activeSurface?.openMode === 'replace_right_panel') return;
    setZakladkaWybrana('pozostale');
  }, [activeSurface]);

  // V126-JEZYK: obniżenie trybu w trakcie pracy nie może zostawić otwartej
  // zakładki spoza toru — wracamy na ocenę (pierwsza zakładka warsztatu).
  useEffect(() => {
    if (!zakladkaDostepna(zakladka, szczegolyAudytowe)) setZakladkaWybrana('ocena');
  }, [zakladka, szczegolyAudytowe]);

  // Nawigacja ręczna (klik/klawiatura): wejście na „Dowód obliczeń" pokazuje bieg
  // oglądany; wskazanie elementu z poprzedniego wejścia nie może zalegać.
  const przejdzDoZakladki = (id: ZakladkaId) => {
    if (id === 'dowod') {
      setElementDowodu(null);
    }
    // K3-A4: ręczny wybór użytkownika — rodzaj przebiegu przestaje sterować zakładką.
    setZakladkaWybrana(id);
  };

  // Obszar = pochodna zakładki (jeden stan). Wejście w obszar otwiera jego
  // pierwszą zakładkę dostępną w trybie.
  const obszary = obszaryDostepne(szczegolyAudytowe);
  const obszarAktywny = obszarZakladki(zakladka);
  const zakladkiAktywnegoObszaru = zakladkiObszaru(obszarAktywny, szczegolyAudytowe);
  const przejdzDoObszaru = (id: ObszarId) => {
    const obszar = obszary.find((o) => o.id === id);
    if (!obszar || obszar.id === obszarAktywny.id) return;
    przejdzDoZakladki(zakladkiObszaru(obszar, szczegolyAudytowe)[0]);
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
  // innego niż oglądany — rozpływ vs zwarcia). Karta K8: wskazanie przebiegu jest
  // WYBOREM biegu (jedna akcja magazynu kontekstu); bez wskazania = bieg zakładki,
  // z której otwarto dowód (jeśli zakładka pokazuje bieg jednej rodziny).
  const otworzDowod = (ref: string, runId?: string) => {
    const bieg = runId ?? runIdEkranu;
    if (bieg) wybierzBieg(bieg, 'ekran');
    setZakladkaWybrana('dowod');
    setElementDowodu(ref || null);
  };

  if (startNieustalony) {
    // Uczciwy stan przejściowy zamiast fałszywej zakładki startowej; przycisk
    // ponowienia = wyjście z tego stanu, gdy hydratacja K2 się nie powiodła
    // (np. chwilowy błąd serwera przy sprawdzaniu projektu — K2 nie ponawia
    // sama, dopóki backend nie przejdzie przez stan „błąd" → „połączono").
    return (
      <div className="mvd-wyniki-warsztat" data-testid="mvd-wyniki-warsztat">
        <div
          className="mvd-wyniki-pusty"
          role="status"
          data-testid="mvd-wyniki-rejestr-wczytywanie"
        >
          <p>{T.rejestrWczytywanie}</p>
          <button
            type="button"
            className="mvd-btn"
            onClick={() => void hydratujPowloke({ wymus: true })}
          >
            {T.rejestrWczytajPonownie}
          </button>
        </div>
      </div>
    );
  }

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
                data-zakladki={zakladkiObszaru(obszar, szczegolyAudytowe).join(' ')}
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
      {rodzinaZakladki && <PasKontekstuBiegu rodzina={rodzinaZakladki} />}
      <KontekstBieguEkranu.Provider value={runIdEkranu}>
      <div role="tabpanel" className="mvd-wyniki-tresc">
        {/* B-02 / W3-E: ocena techniczna wyników (następca werdyktu projektowego
            i huba „Analizy techniczne") — dowód otwierany dla KONKRETNEGO biegu. */}
        {zakladka === 'ocena' && (
          <EkranOceny szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'co-wymaga-uwagi' && <EkranCoWymagaUwagi />}
        {zakladka === 'rozplyw' && (
          <EkranRozplywu
            szczegolyAudytowe={szczegolyAudytowe}
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
          <EkranKontyngencji szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'skladowe' && <EkranSkladowych />}
        {zakladka === 'stan-fazowy' && <EkranStanuFazowego />}
        {/* Karta AB-P1: bieg kanoniczny dynamiki czasowej RMS (tryb sieci, bez werdyktu);
            kontekst deep-linku = wytwórca wskazany akcją naprawczą `der.dynamika_missing`. */}
        {zakladka === 'dynamika' && (
          <EkranDynamiki szczegolyAudytowe={szczegolyAudytowe} wskazanyElement={elementDynamiki} />
        )}
        {zakladka === 'zwarcia' && (
          <EkranZwarc szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {/* K8: dostawca zakładkowy dla wygaszonej trasy mostu #protection-results
            (dawniej: generyczna tabela analityczna powierzchni E-35 bez treści
            zabezpieczeniowej). Ekran ui2 czyta store'y sam — bez propsów. */}
        {zakladka === 'koordynacja' && <EkranKoordynacji />}
        {zakladka === 'dowod' && (
          <DowodPrzebiegu
            szczegolyAudytowe={szczegolyAudytowe}
            wskazanyElementRef={elementDowodu}
          />
        )}
        {zakladka === 'jakosc' && (
          <EkranJakosci szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {/* ROUTERY-4A: dostawca zdolności A6/A17 (wrażliwość LF + ogólna) —
            ekran ui2 czyta rejestr przebiegów sam (uczciwy stan zerowy z akcją). */}
        {zakladka === 'wrazliwosc' && <EkranWrazliwosci szczegolyAudytowe={szczegolyAudytowe} />}
        {zakladka === 'porownanie' && <PorownanieAktywnegoProjektu szczegolyAudytowe={szczegolyAudytowe} />}
        {zakladka === 'odbior' && (
          <EkranOdbioru szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'estymacja' && (
          <EkranEstymacji szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'ssci' && <EkranSsci szczegolyAudytowe={szczegolyAudytowe} />}
        {/* B-02: „Analizy specjalistyczne" — katalog kart z backendu i widok analizy
            (przedmiot → dane → gotowość → kryteria → uruchomienie).
            V126-JEZYK: treść renderuje się WYŁĄCZNIE za bramą trybu — ten sam
            predykat co pasek zakładek (jedno źródło prawdy, zero rozjazdu). */}
        {zakladka === 'akademickie' && zakladkaDostepna('akademickie', szczegolyAudytowe) && (
          <EkranAnalizAkademickich szczegolyAudytowe={szczegolyAudytowe} />
        )}
        {zakladka === 'ncrfg' && (
          <MacierzNcRfg
            szczegolyAudytowe={szczegolyAudytowe}
            preselekcjaModulu={modulNcRfg}
            onPreselekcjaSkonsumowana={() => setModulNcRfg(null)}
          />
        )}
        {zakladka === 'zdolnosc' && <EkranZdolnosci szczegolyAudytowe={szczegolyAudytowe} />}
        {zakladka === 'ranking' && <EkranRankingu szczegolyAudytowe={szczegolyAudytowe} />}
        {zakladka === 'krzywe' && (
          <EkranKrzywych szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'obszar' && (
          <EkranObszaruPQ szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'studium' && (
          <KreatorStudium szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'frt' && (
          <EkranFrt szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'osd' && (
          <EkranOsd szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'kompensacja' && (
          <EkranKompensacji
            szczegolyAudytowe={szczegolyAudytowe}
            preselekcjaWezla={elementKompensacji}
            onPreselekcjaSkonsumowana={() => setElementKompensacji(null)}
            onOtworzDowod={otworzDowod}
          />
        )}
        {zakladka === 'wniosek' && <EkranWniosku szczegolyAudytowe={szczegolyAudytowe} />}
        {zakladka === 'lom' && (
          <EkranLom szczegolyAudytowe={szczegolyAudytowe} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'pulpit-oze' && (
          <PulpitOze
            szczegolyAudytowe={szczegolyAudytowe}
            onNawiguj={() => onOtworzDokumentacje()}
          />
        )}
        {zakladka === 'pozostale' && pozostale}
      </div>
      </KontekstBieguEkranu.Provider>
    </div>
  );
}
