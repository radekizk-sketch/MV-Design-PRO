/*
 * EkranJakosci — okno „Jakość wyników" (karta E8.4 / W-607). DWIE niezależne
 * sekcje na wspólnym wzorcu ekranu analizy (`EkranAnalizy`/`TabelaWynikow`):
 *   1. Wiarygodność zwarciowa  — `GET /api/quality/sanity-bounds`  (przebieg SC/DONE),
 *   2. Walidacja energetyczna  — `GET /api/quality/energy-validation` (LOAD_FLOW/DONE).
 *
 * Każda sekcja niezależnie dobiera przebieg z rejestru (`useExecutionRunsStore`:
 * aktywny/ostatni zakończony danego rodzaju) i osobno zarządza stanem
 * (brak przebiegu / ładowanie / błąd / gotowe). Zero fizyki, zero ocen lokalnych
 * — statusy, granice i progi pochodzą WYŁĄCZNIE z backendu. Identyfikatory (run
 * id, target_id) wyłącznie w trybie eksperckim (jako wyrażenia `{...}`).
 *
 * why_pl — DECYZJA PREZENTACJI: panel SZCZEGÓŁU pod tabelą (wybór wiersza), nie
 * tooltip. Uzasadnienie: teksty why_pl są pełnymi zdaniami (np. „Ik" = 116 kA
 * przekracza górną granicę…"), a dymek (`title`) obcina treść i jest słaby dla
 * czytników ekranu/klawiatury; dedykowany panel jest czytelny i dostępny.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import './jakosc.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { MathBlock } from '../../../ui/proof/MathRenderer';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { EkranAnalizy, usePoprawWModelu } from '../wzorzec';
import { PrzegladDowodu } from '../dowod';
import {
  fetchArcFlash,
  fetchMigotanie,
  fetchWalidacjaEnergetyczna,
  fetchWarunkiPrzylaczenia,
  fetchDowodCieplny,
  fetchWytrzymaloscCieplna,
  fetchWiarygodnoscZwarciowa,
  pobierzRaportArcFlash,
  type ArcFlashResponse,
  type FormatRaportuArcFlash,
  type KonfiguracjaElektrod,
  type KrokArcFlash,
  type KrokMigotania,
  type MigotanieResponse,
  type ParametryArcFlash,
  type TypObudowy,
  type WalidacjaItem,
  type WalidacjaResponse,
  type WarunkiPrzylaczeniaResponse,
  type DowodCieplnyResponse,
  type WytrzymaloscCieplnaResponse,
  type WezelMigotania,
  type WiarygodnoscItem,
  type WiarygodnoscResponse,
  type WynikArcFlash,
} from './api';
import {
  KLUCZ_WIARYGODNOSCI_WEZEL,
  KLUCZ_WIERSZA_ARC_FLASH,
  KLUCZ_WIERSZA_MIGOTANIE,
  KLUCZ_WIERSZA_WALIDACJI,
  KOLUMNY_ARC_FLASH,
  KOLUMNY_MIGOTANIE,
  KOLUMNY_WALIDACJI,
  KOLUMNY_CIEPLNE,
  KLUCZ_CIEPLNA_GALAZ,
  KOLUMNY_WARUNKOW,
  KOLUMNY_WIARYGODNOSCI,
  kluczWalidacji,
  rodzajPrzekroczeniaWalidacji,
  naWierszeArcFlash,
  naWierszeMigotania,
  naWierszeWalidacji,
  naWierszeCieplne,
  naWierszeWarunkow,
  naWierszeWiarygodnosci,
  naZalozeniaMigotania,
  naZalozeniaWalidacji,
  naZalozeniaCieplne,
  naZalozeniaWarunkow,
  naZalozeniaWiarygodnosci,
  typElementuWalidacji,
  przebiegRozplywu,
  przebiegZwarciowy,
} from './jakoscModel';
import {
  JAKOSC_STRINGS,
  fmtCal,
  fmtKA,
  fmtKV,
  fmtMm,
  fmtMva,
  fmtProcent,
  fmtPst,
  fmtWartosc,
  istotnoscArcFlash,
  istotnoscMigotania,
  istotnoscWalidacji,
  istotnoscWiarygodnosci,
  rodzajKontroliPL,
  statusWalidacjiPL,
  type IstotnoscStatusu,
} from './strings';

// ---------------------------------------------------------------------------
// Zasób jakości — stan pobierania (brak przebiegu / ładowanie / błąd / gotowe)
// ---------------------------------------------------------------------------

type StanZasobu = 'brakPrzebiegu' | 'ladowanie' | 'blad' | 'gotowe';

function useZasobJakosci<T>(
  runId: string | null,
  pobierz: (id: string) => Promise<T>,
): { stan: StanZasobu; dane: T | null } {
  const [stan, setStan] = useState<StanZasobu>(runId ? 'ladowanie' : 'brakPrzebiegu');
  const [dane, setDane] = useState<T | null>(null);

  useEffect(() => {
    if (!runId) {
      setStan('brakPrzebiegu');
      setDane(null);
      return;
    }
    let anulowane = false;
    setStan('ladowanie');
    setDane(null);
    pobierz(runId)
      .then((wynik) => {
        if (!anulowane) {
          setDane(wynik);
          setStan('gotowe');
        }
      })
      .catch(() => {
        if (!anulowane) {
          setDane(null);
          setStan('blad');
        }
      });
    return () => {
      anulowane = true;
    };
  }, [runId, pobierz]);

  return { stan, dane };
}

// ---------------------------------------------------------------------------
// Elementy wspólne (tag statusu, chip podsumowania, panele stanu)
// ---------------------------------------------------------------------------

function TagStatusu({ tekst, istotnosc }: { tekst: string; istotnosc: IstotnoscStatusu }) {
  return (
    <span className={`mvd-jakosc-tag mvd-jakosc-tag--${istotnosc}`} data-testid="mvd-jakosc-tag">
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
  istotnosc: IstotnoscStatusu;
}) {
  return (
    <div className={`mvd-jakosc-chip mvd-jakosc-chip--${istotnosc}`} data-testid="mvd-jakosc-chip">
      <span className="mvd-jakosc-chip-liczba mvd-num">{wartosc}</span>
      <span className="mvd-jakosc-chip-etykieta">{etykieta}</span>
    </div>
  );
}

function StanSekcji({
  tytul,
  komunikat,
  opis,
  wariant,
  testid,
}: {
  tytul: string;
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
}) {
  return (
    <section className="mvd-jakosc-sekcja" data-testid={testid}>
      <h2 className="mvd-jakosc-sekcja-tytul">{tytul}</h2>
      <div
        className={wariant === 'blad' ? 'mvd-jakosc-stan mvd-jakosc-stan--blad' : 'mvd-jakosc-stan'}
      >
        <p className="mvd-jakosc-stan-title">{komunikat}</p>
        {opis && <p className="mvd-jakosc-stan-desc">{opis}</p>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sekcja 1 — Wiarygodność zwarciowa
// ---------------------------------------------------------------------------

interface SekcjaProps {
  przebieg: ExecutionRun | null;
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
  onEksport?: () => void;
}

export function SekcjaWiarygodnosci({
  przebieg,
  trybZaawansowania,
  onOtworzDowod,
  onEksport,
}: SekcjaProps) {
  const runId = przebieg?.id ?? null;
  const { stan, dane } = useZasobJakosci<WiarygodnoscResponse>(runId, fetchWiarygodnoscZwarciowa);
  const [wybrany, setWybrany] = useState<string | null>(null);

  const items = dane?.items ?? [];
  const wierszeSelektora = useMemo(
    () => new Map<string, WiarygodnoscItem>(items.map((it) => [it.target_id, it])),
    [items],
  );
  const wybranyItem = wybrany ? wierszeSelektora.get(wybrany) ?? null : null;

  if (stan === 'brakPrzebiegu') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaWiarygodnosc}
        komunikat={JAKOSC_STRINGS.brakPrzebieguZwarciowego}
        opis={JAKOSC_STRINGS.brakPrzebieguZwarciowegoOpis}
        wariant="info"
        testid="mvd-jakosc-wiarygodnosc-brak"
      />
    );
  }
  if (stan === 'ladowanie') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaWiarygodnosc}
        komunikat={JAKOSC_STRINGS.ladowanie}
        wariant="info"
        testid="mvd-jakosc-wiarygodnosc-ladowanie"
      />
    );
  }
  if (stan === 'blad' || dane === null) {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaWiarygodnosc}
        komunikat={JAKOSC_STRINGS.blad}
        opis={JAKOSC_STRINGS.bladOpis}
        wariant="blad"
        testid="mvd-jakosc-wiarygodnosc-blad"
      />
    );
  }

  const { summary } = dane;
  return (
    <section data-testid="mvd-jakosc-wiarygodnosc">
      <EkranAnalizy
        naglowek={{ analizaPL: JAKOSC_STRINGS.sekcjaWiarygodnosc, runId: runId ?? undefined }}
        zalozenia={naZalozeniaWiarygodnosci()}
        kolumny={KOLUMNY_WIARYGODNOSCI}
        wiersze={naWierszeWiarygodnosci(items)}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_WIARYGODNOSCI_WEZEL}
        onWybierzWiersz={setWybrany}
        wybranyWiersz={wybrany}
      />
      <div className="mvd-jakosc-podsumowanie" data-testid="mvd-jakosc-wiarygodnosc-podsumowanie">
        <Chip etykieta={JAKOSC_STRINGS.podsumZweryfikowane} wartosc={summary.credible_count} istotnosc="ok" />
        <Chip etykieta={JAKOSC_STRINGS.podsumPozaZakresem} wartosc={summary.out_of_range_count} istotnosc="err" />
        <Chip etykieta={JAKOSC_STRINGS.podsumNiekompletne} wartosc={summary.incomplete_count} istotnosc="neutral" />
        <Chip etykieta={JAKOSC_STRINGS.podsumBlokadaOsd} wartosc={summary.blocks_osd_package_count} istotnosc="warn" />
      </div>
      <SzczegolWiarygodnosci item={wybranyItem} trybZaawansowania={trybZaawansowania} />
    </section>
  );
}

function SzczegolWiarygodnosci({
  item,
  trybZaawansowania,
}: {
  item: WiarygodnoscItem | null;
  trybZaawansowania: AdvancementMode;
}) {
  if (!item) {
    return (
      <section className="mvd-jakosc-szczegol mvd-jakosc-szczegol--pusty" data-testid="mvd-jakosc-wiarygodnosc-szczegol-pusty">
        <p className="mvd-jakosc-szczegol-brak">{JAKOSC_STRINGS.szczegolBrakWyboru}</p>
      </section>
    );
  }
  const trybEkspercki = trybZaawansowania === 'expert';
  const blokada = item.blocks_osd_package ? JAKOSC_STRINGS.blokadaTak : JAKOSC_STRINGS.blokadaNie;
  return (
    <section className="mvd-jakosc-szczegol" data-testid="mvd-jakosc-wiarygodnosc-szczegol">
      <header className="mvd-jakosc-szczegol-head">
        <h3 className="mvd-jakosc-szczegol-tytul">{item.target_name ?? item.target_id}</h3>
        <TagStatusu tekst={item.status} istotnosc={istotnoscWiarygodnosci(item.status)} />
        {trybEkspercki && (
          <span className="mvd-jakosc-szczegol-id mvd-num" aria-label={JAKOSC_STRINGS.kolIdentyfikatorWezla}>
            {item.target_id}
          </span>
        )}
      </header>
      <dl className="mvd-jakosc-szczegol-dane">
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolNapiecie}</dt>
          <dd className="mvd-num">
            {item.voltage_kv !== null ? `${fmtKV(item.voltage_kv)} ${JAKOSC_STRINGS.jednKV}` : JAKOSC_STRINGS.kreska}
          </dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolIkss}</dt>
          <dd className="mvd-num">
            {item.ikss_ka !== null ? `${fmtKA(item.ikss_ka)} ${JAKOSC_STRINGS.jednKA}` : JAKOSC_STRINGS.kreska}
          </dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolPasmo}</dt>
          <dd>{item.voltage_band ?? JAKOSC_STRINGS.kreska}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.szczegolBlokadaOsd}</dt>
          <dd>{blokada}</dd>
        </div>
      </dl>
      <p className="mvd-jakosc-szczegol-why">{item.why_pl}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sekcja 2 — Walidacja energetyczna
// ---------------------------------------------------------------------------

export function SekcjaWalidacji({ przebieg, trybZaawansowania, onOtworzDowod, onEksport }: SekcjaProps) {
  const runId = przebieg?.id ?? null;
  const { stan, dane } = useZasobJakosci<WalidacjaResponse>(runId, fetchWalidacjaEnergetyczna);
  const [wybrany, setWybrany] = useState<string | null>(null);
  const poprawWModelu = usePoprawWModelu();

  const items = dane?.items ?? [];
  const wierszeSelektora = useMemo(
    () => new Map<string, WalidacjaItem>(items.map((it, i) => [kluczWalidacji(it, i), it])),
    [items],
  );
  const wybranyItem = wybrany ? wierszeSelektora.get(wybrany) ?? null : null;

  if (stan === 'brakPrzebiegu') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaWalidacja}
        komunikat={JAKOSC_STRINGS.brakPrzebieguRozplywu}
        opis={JAKOSC_STRINGS.brakPrzebieguRozplywuOpis}
        wariant="info"
        testid="mvd-jakosc-walidacja-brak"
      />
    );
  }
  if (stan === 'ladowanie') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaWalidacja}
        komunikat={JAKOSC_STRINGS.ladowanie}
        wariant="info"
        testid="mvd-jakosc-walidacja-ladowanie"
      />
    );
  }
  if (stan === 'blad' || dane === null) {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaWalidacja}
        komunikat={JAKOSC_STRINGS.blad}
        opis={JAKOSC_STRINGS.bladOpis}
        wariant="blad"
        testid="mvd-jakosc-walidacja-blad"
      />
    );
  }

  const { summary } = dane;
  return (
    <section data-testid="mvd-jakosc-walidacja">
      <EkranAnalizy
        naglowek={{ analizaPL: JAKOSC_STRINGS.sekcjaWalidacja, runId: runId ?? undefined }}
        zalozenia={naZalozeniaWalidacji(dane.config)}
        kolumny={KOLUMNY_WALIDACJI}
        wiersze={naWierszeWalidacji(items)}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_WIERSZA_WALIDACJI}
        onWybierzWiersz={setWybrany}
        wybranyWiersz={wybrany}
        onPoprawWModelu={(klucz) => {
          const it = wierszeSelektora.get(klucz);
          const typ = it ? typElementuWalidacji(it.check_type) : null;
          // K1 / F-E6.3: rodzaj z realnego `check_type` → akcja kontekstowa
          // (np. REACTIVE_BALANCE → okno „Dobór kompensacji").
          if (it && typ) {
            poprawWModelu(
              it.target_id,
              typ,
              it.target_name ?? it.target_id,
              rodzajPrzekroczeniaWalidacji(it.check_type) ?? undefined,
            );
          }
        }}
        wierszDecyzyjny={(klucz) => {
          const it = wierszeSelektora.get(klucz);
          return it != null && typElementuWalidacji(it.check_type) != null;
        }}
        rodzajWiersza={(klucz) => {
          const it = wierszeSelektora.get(klucz);
          return it ? rodzajPrzekroczeniaWalidacji(it.check_type) ?? undefined : undefined;
        }}
      />
      <div className="mvd-jakosc-podsumowanie" data-testid="mvd-jakosc-walidacja-podsumowanie">
        <Chip etykieta={JAKOSC_STRINGS.podsumZgodne} wartosc={summary.pass_count} istotnosc="ok" />
        <Chip etykieta={JAKOSC_STRINGS.podsumOstrzezenia} wartosc={summary.warning_count} istotnosc="warn" />
        <Chip etykieta={JAKOSC_STRINGS.podsumPrzekroczenia} wartosc={summary.fail_count} istotnosc="err" />
        <Chip etykieta={JAKOSC_STRINGS.podsumNieobliczone} wartosc={summary.not_computed_count} istotnosc="neutral" />
      </div>
      <SzczegolWalidacji item={wybranyItem} trybZaawansowania={trybZaawansowania} />
    </section>
  );
}

function SzczegolWalidacji({
  item,
  trybZaawansowania,
}: {
  item: WalidacjaItem | null;
  trybZaawansowania: AdvancementMode;
}) {
  // Ślad WHITE BOX per pozycja (R2-A / K3-G1) — zwijany, tryb ekspercki.
  const [sladWidoczny, setSladWidoczny] = useState(false);
  if (!item) {
    return (
      <section className="mvd-jakosc-szczegol mvd-jakosc-szczegol--pusty" data-testid="mvd-jakosc-walidacja-szczegol-pusty">
        <p className="mvd-jakosc-szczegol-brak">{JAKOSC_STRINGS.szczegolBrakWyboru}</p>
      </section>
    );
  }
  const trybEkspercki = trybZaawansowania === 'expert';
  const wartoscZJedn = (v: number | null): string =>
    v !== null ? `${fmtWartosc(v)} ${item.unit}` : JAKOSC_STRINGS.kreska;
  return (
    <section className="mvd-jakosc-szczegol" data-testid="mvd-jakosc-walidacja-szczegol">
      <header className="mvd-jakosc-szczegol-head">
        <h3 className="mvd-jakosc-szczegol-tytul">{rodzajKontroliPL(item.check_type)}</h3>
        <TagStatusu tekst={statusWalidacjiPL(item.status)} istotnosc={istotnoscWalidacji(item.status)} />
        {trybEkspercki && (
          <span className="mvd-jakosc-szczegol-id mvd-num" aria-label={JAKOSC_STRINGS.kolIdentyfikatorObiektu}>
            {item.target_id}
          </span>
        )}
      </header>
      <dl className="mvd-jakosc-szczegol-dane">
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolObiekt}</dt>
          <dd>{item.target_name ?? item.target_id}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolWartosc}</dt>
          <dd className="mvd-num">{wartoscZJedn(item.observed_value)}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolProgOstrzezenia}</dt>
          <dd className="mvd-num">{wartoscZJedn(item.limit_warn)}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolProgPrzekroczenia}</dt>
          <dd className="mvd-num">{wartoscZJedn(item.limit_fail)}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolMargines}</dt>
          <dd className="mvd-num">
            {item.margin_pct !== null
              ? `${fmtProcent(item.margin_pct)} ${JAKOSC_STRINGS.jednProcent}`
              : JAKOSC_STRINGS.kreska}
          </dd>
        </div>
      </dl>
      <p className="mvd-jakosc-szczegol-why">{item.why_pl}</p>
      {trybEkspercki && (item.white_box?.length ?? 0) > 0 && (
        <div className="mvd-jakosc-slad-blok">
          <button
            type="button"
            className="mvd-jakosc-slad-btn"
            onClick={() => setSladWidoczny((w) => !w)}
            data-testid="mvd-jakosc-wal-slad-otworz"
          >
            {sladWidoczny ? JAKOSC_STRINGS.sladUkryj : JAKOSC_STRINGS.sladPokaz}
          </button>
          {sladWidoczny && (
            <div data-testid="mvd-jakosc-wal-slad-blok">
              <span className="mvd-jakosc-slad-tytul">{JAKOSC_STRINGS.sladTytul}</span>
              <ol className="mvd-jakosc-slad" data-testid="mvd-jakosc-wal-slad">
                {/* R3-D (recenzja właściciela): wzór i podstawienie renderowane
                    KaTeX-em (kanon Proof Engine — matematyka w LaTeX); kroki bez
                    formuły (dane/progi/werdykt) pozostają tekstowe. */}
                {(item.white_box ?? []).map((krok) => (
                  <li key={krok.tekst} className="mvd-jakosc-slad-krok">
                    {krok.latex ? (
                      <MathBlock latex={krok.latex} />
                    ) : (
                      <code className="mvd-num">{krok.tekst}</code>
                    )}
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
// Sekcja 3 — Migotanie i szybkie zmiany napięcia (P37)
// ---------------------------------------------------------------------------

/** Ślad WHITE BOX (Wzór → Podstawienie → Wynik) — wzorzec `SladAnalizy`, inline. */
function SladMigotania({ kroki }: { kroki: readonly KrokMigotania[] }) {
  if (kroki.length === 0) return null;
  return (
    <ol className="mvd-jakosc-slad" data-testid="mvd-jakosc-mig-slad">
      {kroki.map((krok) => (
        <li key={krok.symbol} className="mvd-jakosc-slad-krok">
          <span className="mvd-jakosc-slad-etyk">
            {JAKOSC_STRINGS.sladWzor} ({krok.symbol})
          </span>
          <MathBlock latex={krok.formula_latex} />
          {krok.substitution_pl && (
            <>
              <span className="mvd-jakosc-slad-etyk">{JAKOSC_STRINGS.sladPodstawienie}</span>
              <code className="mvd-num">{krok.substitution_pl}</code>
            </>
          )}
          <span className="mvd-jakosc-slad-etyk">{JAKOSC_STRINGS.sladWynik}</span>
          <code className="mvd-num">{krok.result_pl}</code>
        </li>
      ))}
    </ol>
  );
}

function SzczegolMigotania({
  wezel,
  trybZaawansowania,
}: {
  wezel: WezelMigotania | null;
  trybZaawansowania: AdvancementMode;
}) {
  const [sladWidoczny, setSladWidoczny] = useState(false);
  if (!wezel) {
    return (
      <section
        className="mvd-jakosc-szczegol mvd-jakosc-szczegol--pusty"
        data-testid="mvd-jakosc-migotanie-szczegol-pusty"
      >
        <p className="mvd-jakosc-szczegol-brak">{JAKOSC_STRINGS.szczegolBrakWyboru}</p>
      </section>
    );
  }
  const trybEkspercki = trybZaawansowania === 'expert';
  const wartoscMva = (v: number | null): string =>
    v !== null ? `${fmtMva(v)} ${JAKOSC_STRINGS.jednMva}` : JAKOSC_STRINGS.kreska;
  const wartoscPst = (v: number | null): string =>
    v !== null ? fmtPst(v) : JAKOSC_STRINGS.kreska;
  return (
    <section className="mvd-jakosc-szczegol" data-testid="mvd-jakosc-migotanie-szczegol">
      <header className="mvd-jakosc-szczegol-head">
        <h3 className="mvd-jakosc-szczegol-tytul">{wezel.bus_ref}</h3>
        <TagStatusu tekst={wezel.verdict_pl} istotnosc={istotnoscMigotania(wezel.verdict_pl)} />
      </header>
      <dl className="mvd-jakosc-szczegol-dane">
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolSk}</dt>
          <dd className="mvd-num">{wartoscMva(wezel.sk_mva)}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.szczegolLimitPst}</dt>
          <dd className="mvd-num">{fmtPst(wezel.pst_limit)}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.szczegolLimitPlt}</dt>
          <dd className="mvd-num">{fmtPst(wezel.plt_limit)}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolDpercent}</dt>
          <dd className="mvd-num">
            {wezel.d_percent !== null
              ? `${fmtProcent(wezel.d_percent)} ${JAKOSC_STRINGS.jednProcent}`
              : JAKOSC_STRINGS.kreska}
          </dd>
        </div>
      </dl>

      <p className="mvd-jakosc-szczegol-sekcja-tytul">{JAKOSC_STRINGS.szczegolModuly}</p>
      {wezel.modules.length === 0 ? (
        <p className="mvd-jakosc-szczegol-brak">{JAKOSC_STRINGS.szczegolBrakModulow}</p>
      ) : (
        <ul className="mvd-jakosc-mig-moduly" data-testid="mvd-jakosc-mig-moduly">
          {wezel.modules.map((modul) => (
            <li key={modul.gen_ref} className="mvd-jakosc-mig-modul">
              <div className="mvd-jakosc-mig-modul-head">
                <span className="mvd-num">{modul.gen_ref}</span>
                <TagStatusu
                  tekst={modul.included ? JAKOSC_STRINGS.modulWliczony : JAKOSC_STRINGS.modulPominiety}
                  istotnosc={modul.included ? 'ok' : 'neutral'}
                />
              </div>
              <dl className="mvd-jakosc-szczegol-dane">
                <div className="mvd-jakosc-szczegol-para">
                  <dt>{JAKOSC_STRINGS.modulSn}</dt>
                  <dd className="mvd-num">{wartoscMva(modul.sn_mva)}</dd>
                </div>
                <div className="mvd-jakosc-szczegol-para">
                  <dt>{JAKOSC_STRINGS.modulWspolczynnikC}</dt>
                  <dd className="mvd-num">{wartoscPst(modul.flicker_c)}</dd>
                </div>
                <div className="mvd-jakosc-szczegol-para">
                  <dt>{JAKOSC_STRINGS.modulPstI}</dt>
                  <dd className="mvd-num">{wartoscPst(modul.pst_i)}</dd>
                </div>
              </dl>
              {!modul.included && modul.info_pl && (
                <p className="mvd-jakosc-mig-modul-info" data-testid="mvd-jakosc-mig-modul-info">
                  {modul.info_pl}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {trybEkspercki && wezel.white_box.length > 0 && (
        <div className="mvd-jakosc-slad-blok">
          <button
            type="button"
            className="mvd-jakosc-slad-btn"
            aria-expanded={sladWidoczny}
            onClick={() => setSladWidoczny((s) => !s)}
            data-testid="mvd-jakosc-mig-slad-otworz"
          >
            {sladWidoczny ? JAKOSC_STRINGS.sladUkryj : JAKOSC_STRINGS.sladPokaz}
          </button>
          {sladWidoczny && (
            <div data-testid="mvd-jakosc-mig-slad-blok">
              <span className="mvd-jakosc-slad-tytul">{JAKOSC_STRINGS.sladTytul}</span>
              <SladMigotania kroki={wezel.white_box} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function SekcjaMigotania({
  przebieg,
  trybZaawansowania,
  onOtworzDowod,
  onEksport,
}: SekcjaProps) {
  const runId = przebieg?.id ?? null;
  const { stan, dane } = useZasobJakosci<MigotanieResponse>(runId, fetchMigotanie);
  const [wybrany, setWybrany] = useState<string | null>(null);
  const poprawWModelu = usePoprawWModelu();

  const buses = dane?.buses ?? [];
  const wierszeSelektora = useMemo(
    () => new Map<string, WezelMigotania>(buses.map((b) => [b.bus_ref, b])),
    [buses],
  );
  const wybranyWezel = wybrany ? wierszeSelektora.get(wybrany) ?? null : null;

  if (stan === 'brakPrzebiegu') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaMigotanie}
        komunikat={JAKOSC_STRINGS.brakMigotanie}
        opis={JAKOSC_STRINGS.brakMigotanieOpis}
        wariant="info"
        testid="mvd-jakosc-migotanie-brak"
      />
    );
  }
  if (stan === 'ladowanie') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaMigotanie}
        komunikat={JAKOSC_STRINGS.ladowanie}
        wariant="info"
        testid="mvd-jakosc-migotanie-ladowanie"
      />
    );
  }
  if (stan === 'blad' || dane === null) {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaMigotanie}
        komunikat={JAKOSC_STRINGS.blad}
        opis={JAKOSC_STRINGS.bladOpis}
        wariant="blad"
        testid="mvd-jakosc-migotanie-blad"
      />
    );
  }

  const { summary } = dane;
  return (
    <section data-testid="mvd-jakosc-migotanie">
      <EkranAnalizy
        naglowek={{ analizaPL: JAKOSC_STRINGS.sekcjaMigotanie, runId: runId ?? undefined }}
        zalozenia={naZalozeniaMigotania(dane.config)}
        kolumny={KOLUMNY_MIGOTANIE}
        wiersze={naWierszeMigotania(buses)}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_WIERSZA_MIGOTANIE}
        onWybierzWiersz={setWybrany}
        wybranyWiersz={wybrany}
        // K1 / F-E6.3: werdykt tej sekcji = migotanie (Pst/Plt/d%) → rodzaj 'migotanie'.
        onPoprawWModelu={(ref) => poprawWModelu(ref, 'Bus', ref, 'migotanie')}
      />
      <div className="mvd-jakosc-podsumowanie" data-testid="mvd-jakosc-migotanie-podsumowanie">
        <Chip etykieta={JAKOSC_STRINGS.podsumOcenione} wartosc={summary.assessed_count} istotnosc="ok" />
        <Chip etykieta={JAKOSC_STRINGS.podsumPrzekroczenia} wartosc={summary.exceeded_count} istotnosc="err" />
        <Chip etykieta={JAKOSC_STRINGS.podsumNieocenione} wartosc={summary.not_assessed_count} istotnosc="neutral" />
      </div>
      <SzczegolMigotania wezel={wybranyWezel} trybZaawansowania={trybZaawansowania} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sekcja 4 — Arc Flash (IEEE 1584-2018), audyt V12K-059 poz. A
// ---------------------------------------------------------------------------

const ELEKTRODY: readonly KonfiguracjaElektrod[] = ['VCB', 'VCBB', 'HCB', 'VOA', 'HOA'];
const OBUDOWY: readonly TypObudowy[] = ['Typical', 'Shallow'];

function SladArcFlash({ kroki }: { kroki: readonly KrokArcFlash[] }) {
  if (kroki.length === 0) return null;
  return (
    <ol className="mvd-jakosc-slad" data-testid="mvd-jakosc-af-slad">
      {kroki.map((krok) => (
        <li key={krok.symbol} className="mvd-jakosc-slad-krok">
          <span className="mvd-jakosc-slad-etyk">
            {JAKOSC_STRINGS.sladWzor} ({krok.symbol})
          </span>
          <MathBlock latex={krok.formula_latex} />
          {krok.substitution_pl && (
            <>
              <span className="mvd-jakosc-slad-etyk">{JAKOSC_STRINGS.sladPodstawienie}</span>
              <code className="mvd-num">{krok.substitution_pl}</code>
            </>
          )}
          <span className="mvd-jakosc-slad-etyk">{JAKOSC_STRINGS.sladWynik}</span>
          <code className="mvd-num">{krok.result_pl}</code>
        </li>
      ))}
    </ol>
  );
}

function SzczegolArcFlash({
  wynik,
  trybZaawansowania,
}: {
  wynik: WynikArcFlash | null;
  trybZaawansowania: AdvancementMode;
}) {
  const [sladWidoczny, setSladWidoczny] = useState(false);
  if (!wynik) {
    return (
      <section
        className="mvd-jakosc-szczegol mvd-jakosc-szczegol--pusty"
        data-testid="mvd-jakosc-af-szczegol-pusty"
      >
        <p className="mvd-jakosc-szczegol-brak">{JAKOSC_STRINGS.szczegolBrakWyboru}</p>
      </section>
    );
  }
  const trybEkspercki = trybZaawansowania === 'expert';
  const wartoscCal = (v: number | null): string =>
    v !== null ? `${fmtCal(v)} ${JAKOSC_STRINGS.jednCal}` : JAKOSC_STRINGS.kreska;
  const wartoscMm = (v: number | null): string =>
    v !== null ? `${fmtMm(v)} ${JAKOSC_STRINGS.jednMm}` : JAKOSC_STRINGS.kreska;
  return (
    <section className="mvd-jakosc-szczegol" data-testid="mvd-jakosc-af-szczegol">
      <header className="mvd-jakosc-szczegol-head">
        <h3 className="mvd-jakosc-szczegol-tytul">{wynik.bus_ref}</h3>
        <TagStatusu tekst={wynik.status_label_pl} istotnosc={istotnoscArcFlash(wynik.status)} />
      </header>
      <dl className="mvd-jakosc-szczegol-dane">
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolEnergia}</dt>
          <dd className="mvd-num">{wartoscCal(wynik.incident_energy_cal_cm2)}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolGranica}</dt>
          <dd className="mvd-num">{wartoscMm(wynik.arc_flash_boundary_mm)}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolPpe}</dt>
          <dd className="mvd-num">{wynik.ppe_category ?? JAKOSC_STRINGS.kreska}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.kolIbf}</dt>
          <dd className="mvd-num">
            {wynik.i_bf_ka !== null
              ? `${fmtKA(wynik.i_bf_ka)} ${JAKOSC_STRINGS.jednKA}`
              : JAKOSC_STRINGS.kreska}
          </dd>
        </div>
      </dl>
      <p className="mvd-jakosc-szczegol-why">{wynik.why_pl}</p>
      {wynik.missing_data.length > 0 && (
        <p className="mvd-jakosc-szczegol-brak" data-testid="mvd-jakosc-af-braki">
          {JAKOSC_STRINGS.szczegolBrakDanych}: {wynik.missing_data.join(', ')}
        </p>
      )}
      {wynik.provenance_caveat_pl && (
        <p className="mvd-jakosc-szczegol-uwaga" data-testid="mvd-jakosc-af-proweniencja">
          {wynik.provenance_caveat_pl}
        </p>
      )}
      {trybEkspercki && wynik.white_box.length > 0 && (
        <div className="mvd-jakosc-slad-blok">
          <button
            type="button"
            className="mvd-jakosc-slad-btn"
            aria-expanded={sladWidoczny}
            onClick={() => setSladWidoczny((s) => !s)}
            data-testid="mvd-jakosc-af-slad-otworz"
          >
            {sladWidoczny ? JAKOSC_STRINGS.sladUkryj : JAKOSC_STRINGS.sladPokaz}
          </button>
          {sladWidoczny && (
            <div data-testid="mvd-jakosc-af-slad-blok">
              <span className="mvd-jakosc-slad-tytul">{JAKOSC_STRINGS.sladTytul}</span>
              <SladArcFlash kroki={wynik.white_box} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Puste = null (bez zmyślania wejść); tekst liczbowy → number. */
function liczbaLubNull(tekst: string): number | null {
  const t = tekst.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Nagłówek ryzyka arc flash: najgorszy przypadek (max energia incydentu + szyna)
 * i liczba szyn z brakami danych. Agregacja prezentacyjna wartości POLICZONYCH przez
 * solver (max/count) — bez fizyki w UI. Zwraca null, gdy żadna szyna nie ma energii.
 */
function podsumowanieArcFlash(
  wyniki: readonly WynikArcFlash[],
): { najwyzsza: number; szyna: string; braki: number; soi: [string, number][] } | null {
  let najwyzsza = -Infinity;
  let szyna = '';
  let braki = 0;
  const soiMap = new Map<string, number>();
  for (const w of wyniki) {
    if (w.missing_data.length > 0) braki += 1;
    // Spójnie z raportem backendu (`arc_flash_report._summary`): każda szyna liczona,
    // brak kategorii → klucz „—" (nie pomijamy null).
    const kat = w.ppe_category ?? '—';
    soiMap.set(kat, (soiMap.get(kat) ?? 0) + 1);
    if (typeof w.incident_energy_cal_cm2 === 'number' && w.incident_energy_cal_cm2 > najwyzsza) {
      najwyzsza = w.incident_energy_cal_cm2;
      szyna = w.bus_ref;
    }
  }
  if (najwyzsza === -Infinity) return null;
  // Rozkład ŚOI, sort po punktach kodowych (jak backendowy `sorted(...)`) — determinizm
  // niezależny od locale (nie `localeCompare`).
  const soi = [...soiMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { najwyzsza, szyna, braki, soi };
}

/** Zapisz blob jako plik do pobrania (mechanika przeglądarkowa). */
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

export function SekcjaArcFlash({
  przebieg,
  trybZaawansowania,
  onOtworzDowod,
  onEksport,
}: SekcjaProps) {
  const runId = przebieg?.id ?? null;
  const [odlegloscRobocza, setOdlegloscRobocza] = useState('');
  const [odstepElektrod, setOdstepElektrod] = useState('');
  const [czasWylaczenia, setCzasWylaczenia] = useState('');
  const [elektroda, setElektroda] = useState<KonfiguracjaElektrod>('VCB');
  const [obudowa, setObudowa] = useState<TypObudowy>('Typical');
  const [stan, setStan] = useState<'bezliczenia' | 'ladowanie' | 'blad' | 'gotowe'>('bezliczenia');
  const [dane, setDane] = useState<ArcFlashResponse | null>(null);
  const [wybrany, setWybrany] = useState<string | null>(null);
  // Parametry faktycznie użyte do policzenia widoku — raport MUSI ich użyć,
  // aby dokument był spójny z pokazaną tabelą (nawet po zmianie pól formularza).
  const [uzyteParametry, setUzyteParametry] = useState<ParametryArcFlash | null>(null);
  const [raportStan, setRaportStan] = useState<'idle' | 'pobieranie' | 'blad'>('idle');

  const przelicz = useCallback(() => {
    if (!runId) return;
    const parametry: ParametryArcFlash = {
      working_distance_mm: liczbaLubNull(odlegloscRobocza),
      conductor_gap_mm: liczbaLubNull(odstepElektrod),
      arc_time_s: liczbaLubNull(czasWylaczenia),
      electrode_config: elektroda,
      enclosure_type: obudowa,
    };
    let anulowane = false;
    setStan('ladowanie');
    setDane(null);
    setWybrany(null);
    setUzyteParametry(parametry);
    setRaportStan('idle');
    fetchArcFlash(runId, parametry)
      .then((wynik) => {
        if (!anulowane) {
          setDane(wynik);
          setStan('gotowe');
        }
      })
      .catch(() => {
        if (!anulowane) {
          setDane(null);
          setStan('blad');
        }
      });
    return () => {
      anulowane = true;
    };
  }, [runId, odlegloscRobocza, odstepElektrod, czasWylaczenia, elektroda, obudowa]);

  const wyniki = dane?.results ?? [];
  const selektor = useMemo(
    () => new Map<string, WynikArcFlash>(wyniki.map((w) => [w.bus_ref, w])),
    [wyniki],
  );
  const wybranyWynik = wybrany ? selektor.get(wybrany) ?? null : null;
  const podsum = useMemo(() => podsumowanieArcFlash(wyniki), [wyniki]);

  const pobierzRaport = useCallback(
    async (format: FormatRaportuArcFlash) => {
      if (!runId || !uzyteParametry) return;
      setRaportStan('pobieranie');
      try {
        const blob = await pobierzRaportArcFlash(format, runId, uzyteParametry);
        zapiszBlob(blob, `raport_arc_flash.${format}`);
        setRaportStan('idle');
      } catch {
        setRaportStan('blad');
      }
    },
    [runId, uzyteParametry],
  );

  if (!runId) {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaArcFlash}
        komunikat={JAKOSC_STRINGS.brakArcFlash}
        opis={JAKOSC_STRINGS.brakArcFlashOpis}
        wariant="info"
        testid="mvd-jakosc-arcflash-brak"
      />
    );
  }

  return (
    <section data-testid="mvd-jakosc-arcflash">
      <h2 className="mvd-jakosc-sekcja-tytul">{JAKOSC_STRINGS.sekcjaArcFlash}</h2>
      <div className="mvd-jakosc-af-form" data-testid="mvd-jakosc-af-form">
        <p className="mvd-jakosc-af-form-opis">{JAKOSC_STRINGS.parametryOpis}</p>
        <div className="mvd-jakosc-af-form-pola">
          <label className="mvd-jakosc-af-pole">
            <span>
              {JAKOSC_STRINGS.paramOdlegloscRobocza} ({JAKOSC_STRINGS.jednMm})
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={odlegloscRobocza}
              onChange={(e) => setOdlegloscRobocza(e.target.value)}
              data-testid="mvd-jakosc-af-odleglosc"
            />
          </label>
          <label className="mvd-jakosc-af-pole">
            <span>
              {JAKOSC_STRINGS.paramOdstepElektrod} ({JAKOSC_STRINGS.jednMm})
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={odstepElektrod}
              onChange={(e) => setOdstepElektrod(e.target.value)}
              data-testid="mvd-jakosc-af-odstep"
            />
          </label>
          <label className="mvd-jakosc-af-pole">
            <span>
              {JAKOSC_STRINGS.paramCzasWylaczenia} ({JAKOSC_STRINGS.jednS})
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={czasWylaczenia}
              onChange={(e) => setCzasWylaczenia(e.target.value)}
              data-testid="mvd-jakosc-af-czas"
            />
          </label>
          <label className="mvd-jakosc-af-pole">
            <span>{JAKOSC_STRINGS.paramKonfElektrod}</span>
            <select
              value={elektroda}
              onChange={(e) => setElektroda(e.target.value as KonfiguracjaElektrod)}
              data-testid="mvd-jakosc-af-elektroda"
            >
              {ELEKTRODY.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="mvd-jakosc-af-pole">
            <span>{JAKOSC_STRINGS.paramTypObudowy}</span>
            <select
              value={obudowa}
              onChange={(e) => setObudowa(e.target.value as TypObudowy)}
              data-testid="mvd-jakosc-af-obudowa"
            >
              {OBUDOWY.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="mvd-jakosc-af-licz"
          onClick={przelicz}
          data-testid="mvd-jakosc-af-licz"
        >
          {JAKOSC_STRINGS.arcFlashLicz}
        </button>
      </div>

      {stan === 'ladowanie' && (
        <p className="mvd-jakosc-stan-title" data-testid="mvd-jakosc-af-ladowanie">
          {JAKOSC_STRINGS.ladowanie}
        </p>
      )}
      {stan === 'blad' && (
        <p className="mvd-jakosc-stan-title" data-testid="mvd-jakosc-af-blad">
          {JAKOSC_STRINGS.blad}
        </p>
      )}
      {stan === 'bezliczenia' && (
        <p className="mvd-jakosc-stan-desc" data-testid="mvd-jakosc-af-czeka">
          {JAKOSC_STRINGS.arcFlashCzekaNaParametry}
        </p>
      )}
      {stan === 'gotowe' && dane && (
        <>
          <div className="mvd-jakosc-af-podsum" data-testid="mvd-jakosc-af-podsum">
            {podsum ? (
              <>
                <span className="mvd-jakosc-af-podsum-glowna">
                  {JAKOSC_STRINGS.afPodsumNajwyzsza}:{' '}
                  <strong data-testid="mvd-jakosc-af-podsum-max">
                    {fmtCal(podsum.najwyzsza)} cal/cm²
                  </strong>{' '}
                  ({JAKOSC_STRINGS.afPodsumSzyna} {podsum.szyna})
                </span>
                {podsum.soi.length > 0 && (
                  <span className="mvd-jakosc-af-podsum-soi" data-testid="mvd-jakosc-af-podsum-soi">
                    {JAKOSC_STRINGS.afPodsumSoi}:{' '}
                    {podsum.soi.map(([kat, ile]) => (
                      <span key={kat} className="mvd-jakosc-af-podsum-soi-chip">
                        {JAKOSC_STRINGS.afPodsumSoiKat} {kat}: {ile}
                      </span>
                    ))}
                  </span>
                )}
                {podsum.braki > 0 && (
                  <span className="mvd-jakosc-af-podsum-braki">
                    {podsum.braki} {JAKOSC_STRINGS.afPodsumBraki}
                  </span>
                )}
              </>
            ) : (
              <span className="mvd-jakosc-af-podsum-braki">
                {JAKOSC_STRINGS.afPodsumBrakDanych}
              </span>
            )}
          </div>
          <EkranAnalizy
            naglowek={{ analizaPL: JAKOSC_STRINGS.sekcjaArcFlash, runId: runId ?? undefined }}
            zalozenia={[]}
            kolumny={KOLUMNY_ARC_FLASH}
            wiersze={naWierszeArcFlash(wyniki)}
            onOtworzDowod={onOtworzDowod}
            onEksport={onEksport}
            trybZaawansowania={trybZaawansowania}
            kluczWiersza={KLUCZ_WIERSZA_ARC_FLASH}
            onWybierzWiersz={setWybrany}
            wybranyWiersz={wybrany}
          />
          <SzczegolArcFlash wynik={wybranyWynik} trybZaawansowania={trybZaawansowania} />
          <div className="mvd-jakosc-af-raport" data-testid="mvd-jakosc-af-raport">
            <span className="mvd-jakosc-af-raport-tytul">
              {JAKOSC_STRINGS.arcFlashRaportTytul}
            </span>
            <button
              type="button"
              className="mvd-jakosc-af-raport-btn"
              onClick={() => void pobierzRaport('pdf')}
              disabled={raportStan === 'pobieranie'}
              data-testid="mvd-jakosc-af-raport-pdf"
            >
              {JAKOSC_STRINGS.arcFlashRaportPdf}
            </button>
            <button
              type="button"
              className="mvd-jakosc-af-raport-btn"
              onClick={() => void pobierzRaport('docx')}
              disabled={raportStan === 'pobieranie'}
              data-testid="mvd-jakosc-af-raport-docx"
            >
              {JAKOSC_STRINGS.arcFlashRaportDocx}
            </button>
            {raportStan === 'pobieranie' && (
              <span className="mvd-jakosc-af-raport-stan" data-testid="mvd-jakosc-af-raport-pobieranie">
                {JAKOSC_STRINGS.arcFlashRaportPobieranie}
              </span>
            )}
            {raportStan === 'blad' && (
              <span
                className="mvd-jakosc-af-raport-stan mvd-jakosc-af-raport-blad"
                data-testid="mvd-jakosc-af-raport-blad"
              >
                {JAKOSC_STRINGS.arcFlashRaportBlad}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Okno „Jakość wyników" — kompozycja sekcji z niezależnym doborem przebiegu
// ---------------------------------------------------------------------------

export interface EkranJakosciProps {
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
  onEksport?: () => void;
}

/**
 * Sekcja „Warunki przyłączenia OSD" (karta F-K2, znalezisko Z2 audytu FLOW).
 *
 * Domyka łańcuch E1 → E5 → E7: moc przyłączeniowa i wymagany cosφ z dokumentu OSD
 * (krok E1, kafel na pulpicie projektu) stają się KRYTERIUM oceny mocy i cosφ
 * rzeczywiście wymienianych w punkcie przyłączenia (wynik rozpływu, krok E5).
 * Wcześniej warunki były wyłącznie wyświetlane i nie oceniały niczego.
 *
 * ZERO fizyki w UI — werdykt, wielkości i założenia przychodzą gotowe z backendu.
 * Trzeci stan („Niesprawdzone — brak danych") jest pokazywany JAWNIE i nie może
 * być odczytany jako spełnienie kryterium.
 */
export function SekcjaWarunkowPrzylaczenia({
  przebieg,
  trybZaawansowania,
  onOtworzDowod,
  onEksport,
}: SekcjaProps) {
  const runId = przebieg?.id ?? null;
  const { stan, dane } = useZasobJakosci<WarunkiPrzylaczeniaResponse>(
    runId,
    fetchWarunkiPrzylaczenia,
  );

  if (stan === 'brakPrzebiegu') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaWarunki}
        komunikat={JAKOSC_STRINGS.brakPrzebieguRozplywu}
        opis={JAKOSC_STRINGS.brakPrzebieguRozplywuOpis}
        wariant="info"
        testid="mvd-jakosc-warunki-brak"
      />
    );
  }
  if (stan === 'ladowanie') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaWarunki}
        komunikat={JAKOSC_STRINGS.ladowanie}
        wariant="info"
        testid="mvd-jakosc-warunki-ladowanie"
      />
    );
  }
  if (stan === 'blad' || dane === null) {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaWarunki}
        komunikat={JAKOSC_STRINGS.blad}
        opis={JAKOSC_STRINGS.bladOpis}
        wariant="blad"
        testid="mvd-jakosc-warunki-blad"
      />
    );
  }

  const { ocena } = dane;
  // Brak warunków OSD to nie błąd i nie brak wyniku — to brak DANYCH WEJŚCIOWYCH
  // projektu. Mówimy wprost, czego brakuje i gdzie to uzupełnić (akcja naprawcza).
  const brakWarunkow = ocena.pozycje.every((p) => p.status === 'UNAVAILABLE');
  if (brakWarunkow) {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaWarunki}
        komunikat={JAKOSC_STRINGS.warunkiBrakWarunkow}
        opis={JAKOSC_STRINGS.warunkiBrakWarunkowOpis}
        wariant="info"
        testid="mvd-jakosc-warunki-bez-danych"
      />
    );
  }

  return (
    <section data-testid="mvd-jakosc-warunki">
      <EkranAnalizy
        naglowek={{ analizaPL: JAKOSC_STRINGS.sekcjaWarunki, runId: runId ?? undefined }}
        zalozenia={naZalozeniaWarunkow(ocena)}
        kolumny={KOLUMNY_WARUNKOW}
        wiersze={naWierszeWarunkow(ocena.pozycje)}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
      />
    </section>
  );
}

/**
 * Sekcja „Wytrzymałość zwarciowa przewodów" (karta F-K1, znalezisko Z1 audytu FLOW).
 *
 * Kryterium IEC 60949 per gałąź: czy przekrój żyły wytrzyma prąd zwarciowy przez
 * czas wyłączenia zabezpieczenia. Do tej karty NIKT tego nie sprawdzał — kabel
 * poprawny prądowo i napięciowo mógł ulec zniszczeniu przy zwarciu.
 *
 * ZERO fizyki w UI: prąd gałęzi, prąd dopuszczalny i minimalny wymagany przekrój
 * przychodzą gotowe z backendu. Trzeci stan („Niesprawdzone") jest pokazywany
 * jawnie; gałąź poza drogą zwarcia niesie własne uzasadnienie zamiast liczb.
 *
 * Pętla decyzji: naruszona pozycja prowadzi wprost do gałęzi w modelu (to jej
 * przekrój trzeba zmienić), zgodnie z kontraktem ekranu prowadzącego.
 */
export function SekcjaWytrzymaloscCieplna({
  przebieg,
  trybZaawansowania,
  onOtworzDowod,
  onEksport,
}: SekcjaProps) {
  const runId = przebieg?.id ?? null;
  const { stan, dane } = useZasobJakosci<WytrzymaloscCieplnaResponse>(
    runId,
    fetchWytrzymaloscCieplna,
  );
  const [wybrany, setWybrany] = useState<string | null>(null);
  const poprawWModelu = usePoprawWModelu();

  if (stan === 'brakPrzebiegu') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaCieplna}
        komunikat={JAKOSC_STRINGS.brakPrzebieguZwarciowego}
        opis={JAKOSC_STRINGS.brakPrzebieguZwarciowegoOpis}
        wariant="info"
        testid="mvd-jakosc-cieplna-brak"
      />
    );
  }
  if (stan === 'ladowanie') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaCieplna}
        komunikat={JAKOSC_STRINGS.ladowanie}
        wariant="info"
        testid="mvd-jakosc-cieplna-ladowanie"
      />
    );
  }
  if (stan === 'blad' || dane === null) {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaCieplna}
        komunikat={JAKOSC_STRINGS.blad}
        opis={JAKOSC_STRINGS.bladOpis}
        wariant="blad"
        testid="mvd-jakosc-cieplna-blad"
      />
    );
  }

  const { items, summary } = dane.ocena;
  // Wszystko niesprawdzone => brak DANYCH KATALOGOWYCH, nie brak wyniku. Mówimy
  // wprost, czego brakuje, zamiast pokazywać tabelę pustych liczb.
  if (items.length > 0 && items.every((it) => it.status === 'UNAVAILABLE')) {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaCieplna}
        komunikat={JAKOSC_STRINGS.cieplnaBrakDanych}
        opis={JAKOSC_STRINGS.cieplnaBrakDanychOpis}
        wariant="info"
        testid="mvd-jakosc-cieplna-bez-danych"
      />
    );
  }

  return (
    <section data-testid="mvd-jakosc-cieplna">
      <EkranAnalizy
        naglowek={{ analizaPL: JAKOSC_STRINGS.sekcjaCieplna, runId: runId ?? undefined }}
        zalozenia={naZalozeniaCieplne(dane.fault_node_id, dane.tk_s, summary, dane.czasy_wylaczenia)}
        kolumny={KOLUMNY_CIEPLNE}
        wiersze={naWierszeCieplne(items)}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_CIEPLNA_GALAZ}
        onWybierzWiersz={setWybrany}
        wybranyWiersz={wybrany}
        onPoprawWModelu={(klucz) => {
          // Naruszone kryterium cieplne poprawia się ZMIANA PRZEKROJU tej gałęzi,
          // więc prowadzimy wprost do niej w modelu.
          poprawWModelu(klucz, 'LineBranch', klucz);
        }}
      />
      <DowodCieplnyGalezi
        runId={runId}
        branchId={wybrany}
        trybZaawansowania={trybZaawansowania}
      />
    </section>
  );
}

/**
 * Dowód kryterium cieplnego wybranej gałęzi (karta F-K1 faza 5).
 *
 * Werdykt cieplny zależy od czasu trwania zwarcia tak samo mocno jak od prądu,
 * więc dowód zaczyna się od kroku nazywającego ŹRÓDŁO tego czasu (rozwiązana
 * nastawa zabezpieczenia albo założenie przypadku obliczeniowego). Kroki
 * przychodzą gotowe z backendu — ZERO fizyki w UI; okno kroków to istniejący
 * `PrzegladDowodu` (kanon pięciu pól), a nie druga implementacja.
 */
function DowodCieplnyGalezi({
  runId,
  branchId,
  trybZaawansowania,
}: {
  runId: string | null;
  branchId: string | null;
  trybZaawansowania: AdvancementMode;
}) {
  const [dowod, setDowod] = useState<DowodCieplnyResponse | null>(null);
  const [stan, setStan] = useState<'pusty' | 'ladowanie' | 'gotowe' | 'blad'>('pusty');

  useEffect(() => {
    if (!runId || !branchId) {
      setDowod(null);
      setStan('pusty');
      return;
    }
    let aktualne = true;
    setStan('ladowanie');
    fetchDowodCieplny(runId, branchId)
      .then((wynik) => {
        if (!aktualne) return;
        setDowod(wynik);
        setStan('gotowe');
      })
      .catch(() => {
        if (!aktualne) return;
        setDowod(null);
        setStan('blad');
      });
    return () => {
      aktualne = false;
    };
  }, [runId, branchId]);

  if (stan === 'pusty') {
    return (
      <p className="mvd-jakosc-dowod-podpowiedz" data-testid="mvd-jakosc-cieplna-dowod-pusty">
        {JAKOSC_STRINGS.dowodWybierzGalaz}
      </p>
    );
  }
  if (stan === 'blad') {
    return (
      <p className="mvd-jakosc-dowod-podpowiedz" data-testid="mvd-jakosc-cieplna-dowod-blad">
        {JAKOSC_STRINGS.dowodBlad}
      </p>
    );
  }

  return (
    <div data-testid="mvd-jakosc-cieplna-dowod">
      <PrzegladDowodu
        analizaPL={`${JAKOSC_STRINGS.dowodTytul} — ${dowod?.branch_name ?? ''}`}
        kroki={dowod ? [...dowod.kroki] : []}
        trybZaawansowania={trybZaawansowania}
        ladowanie={stan === 'ladowanie'}
      />
    </div>
  );
}

export function EkranJakosci({ trybZaawansowania, onOtworzDowod, onEksport }: EkranJakosciProps) {
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);

  const przebiegSC = useMemo(() => przebiegZwarciowy(runs, activeRunId), [runs, activeRunId]);
  const przebiegPF = useMemo(() => przebiegRozplywu(runs, activeRunId), [runs, activeRunId]);

  // Stabilny callback eksportu (uniknięcie zbędnych re-renderów sekcji).
  const eksport = useCallback(() => onEksport?.(), [onEksport]);

  return (
    <div className="mvd-jakosc" data-testid="mvd-jakosc-ekran">
      <SekcjaWiarygodnosci
        przebieg={przebiegSC}
        trybZaawansowania={trybZaawansowania}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport ? eksport : undefined}
      />
      <SekcjaWalidacji
        przebieg={przebiegPF}
        trybZaawansowania={trybZaawansowania}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport ? eksport : undefined}
      />
      <SekcjaWarunkowPrzylaczenia
        przebieg={przebiegPF}
        trybZaawansowania={trybZaawansowania}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport ? eksport : undefined}
      />
      <SekcjaMigotania
        przebieg={przebiegSC}
        trybZaawansowania={trybZaawansowania}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport ? eksport : undefined}
      />
      <SekcjaWytrzymaloscCieplna
        przebieg={przebiegSC}
        trybZaawansowania={trybZaawansowania}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport ? eksport : undefined}
      />
      <SekcjaArcFlash
        przebieg={przebiegSC}
        trybZaawansowania={trybZaawansowania}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport ? eksport : undefined}
      />
    </div>
  );
}
