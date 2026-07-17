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
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { EkranAnalizy } from '../wzorzec';
import {
  fetchMigotanie,
  fetchWalidacjaEnergetyczna,
  fetchWiarygodnoscZwarciowa,
  type KrokMigotania,
  type MigotanieResponse,
  type WalidacjaItem,
  type WalidacjaResponse,
  type WezelMigotania,
  type WiarygodnoscItem,
  type WiarygodnoscResponse,
} from './api';
import {
  KLUCZ_WIARYGODNOSCI_WEZEL,
  KLUCZ_WIERSZA_MIGOTANIE,
  KLUCZ_WIERSZA_WALIDACJI,
  KOLUMNY_MIGOTANIE,
  KOLUMNY_WALIDACJI,
  KOLUMNY_WIARYGODNOSCI,
  kluczWalidacji,
  naWierszeMigotania,
  naWierszeWalidacji,
  naWierszeWiarygodnosci,
  naZalozeniaMigotania,
  naZalozeniaWalidacji,
  naZalozeniaWiarygodnosci,
  przebiegRozplywu,
  przebiegZwarciowy,
} from './jakoscModel';
import {
  JAKOSC_STRINGS,
  fmtKA,
  fmtKV,
  fmtMva,
  fmtProcent,
  fmtPst,
  fmtWartosc,
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
          <code className="mvd-num">{krok.formula_latex}</code>
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
// Okno „Jakość wyników" — kompozycja trzech sekcji z niezależnym doborem przebiegu
// ---------------------------------------------------------------------------

export interface EkranJakosciProps {
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
  onEksport?: () => void;
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
      <SekcjaMigotania
        przebieg={przebiegSC}
        trybZaawansowania={trybZaawansowania}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport ? eksport : undefined}
      />
    </div>
  );
}
