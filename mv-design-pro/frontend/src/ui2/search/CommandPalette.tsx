/*
 * CommandPalette — globalna wyszukiwarka poleceń (okno W-105, Ctrl+K,
 * karta E1.5). Dialog modalny w pełni sterowany propsami: pole tekstowe +
 * pogrupowana lista wyników + nawigacja klawiaturą. Otwarcie/zamknięcie
 * sterowane z zewnątrz (`otwarta`/`onZamknij`) — AppShell ma już skrót
 * Ctrl+K; wpięcie tego komponentu do powłoki jest kartą zarządcy.
 *
 * Gramatyka interakcji (karta §3): Esc = zamknij bez akcji · ↑↓ = nawigacja
 * · Enter = wykonaj. Pozycja o `trybMin` wyższym niż `trybAktualny` pokazuje
 * wiersz potwierdzenia „Dostępne w trybie {tryb} — przełączyć?" zamiast
 * wykonania — [Przełącz i otwórz] woła `onPrzelaczTryb` + `onWykonaj`,
 * [Anuluj] wraca do wyników. Fokus jest uwięziony w dialogu (focus trap);
 * po zamknięciu wraca do elementu sprzed otwarcia (SPEC_UKLAD_PANELI §2.2).
 *
 * Historia ostatnich wykonanych pozycji to stan SESJI w pamięci modułu
 * (karta §4: „nie localStorage") — przetrwa zamknięcie/otwarcie dialogu w
 * ramach tej samej sesji przeglądarki, resetuje się przy przeładowaniu
 * strony. `resetHistoriiWyszukiwania` służy wyłącznie izolacji testów.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import '../theme/tokens.css';
import './search.css';
import { filtrujISortuj } from './fuzzy';
import {
  KOLEJNOSC_GRUP,
  trybWystarczajacy,
  type GrupaWyszukiwania,
  type PozycjaWyszukiwania,
  type TrybZaawansowania,
} from './searchModel';
import { SEARCH_STRINGS, brakWynikowLabel, etykietaGrupy, potwierdzTrybLabel } from './strings';

const MAKS_HISTORII = 5;

/** Historia sesji — stan modułu (poza React), NIE localStorage (karta §4). */
let historiaSesji: PozycjaWyszukiwania[] = [];

/** Wyłącznie do izolacji testów — resetuje historię sesji między przypadkami testowymi. */
export function resetHistoriiWyszukiwania(): void {
  historiaSesji = [];
}

function dodajDoHistorii(pozycja: PozycjaWyszukiwania): void {
  historiaSesji = [pozycja, ...historiaSesji.filter((p) => p.id !== pozycja.id)].slice(0, MAKS_HISTORII);
}

export interface CommandPaletteProps {
  otwarta: boolean;
  onZamknij: () => void;
  pozycje: PozycjaWyszukiwania[];
  trybAktualny: TrybZaawansowania;
  onWykonaj: (pozycja: PozycjaWyszukiwania) => void;
  onPrzelaczTryb: (trybMin: TrybZaawansowania) => void;
}

interface GrupaWynikow {
  grupa: GrupaWyszukiwania;
  pozycje: PozycjaWyszukiwania[];
}

function grupujWyniki(dopasowane: PozycjaWyszukiwania[]): GrupaWynikow[] {
  return KOLEJNOSC_GRUP.map((grupa) => ({
    grupa,
    pozycje: dopasowane.filter((p) => p.grupa === grupa),
  })).filter((g) => g.pozycje.length > 0);
}

export function CommandPalette({
  otwarta,
  onZamknij,
  pozycje,
  trybAktualny,
  onWykonaj,
  onPrzelaczTryb,
}: CommandPaletteProps) {
  const [fraza, setFraza] = useState('');
  const [aktywnyId, setAktywnyId] = useState<string | null>(null);
  const [potwierdzenieId, setPotwierdzenieId] = useState<string | null>(null);
  const [historia, setHistoria] = useState<PozycjaWyszukiwania[]>([]);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const potwierdzBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Otwarcie: zapis fokusu sprzed otwarcia, reset stanu, fokus na pole.
  // Zamknięcie (cleanup): powrót fokusu do elementu sprzed otwarcia (§3).
  useEffect(() => {
    if (!otwarta) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setFraza('');
    setPotwierdzenieId(null);
    setHistoria(historiaSesji.slice(0, MAKS_HISTORII));
    inputRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, [otwarta]);

  const dopasowane = useMemo(
    () => filtrujISortuj(fraza, pozycje, (p) => p.etykietaPL),
    [fraza, pozycje],
  );

  const frazaPusta = fraza.trim() === '';
  const grupy = useMemo(() => (frazaPusta ? [] : grupujWyniki(dopasowane)), [frazaPusta, dopasowane]);
  const widoczneElementy = frazaPusta ? historia : dopasowane;
  const brakWynikow = !frazaPusta && dopasowane.length === 0;

  // Domyślna aktywna pozycja = pierwsza widoczna (Enter działa od razu po wpisaniu).
  useEffect(() => {
    if (!otwarta) return;
    if (widoczneElementy.length === 0) {
      setAktywnyId(null);
      return;
    }
    if (!widoczneElementy.some((p) => p.id === aktywnyId)) {
      setAktywnyId(widoczneElementy[0].id);
    }
    // Celowo bez `widoczneElementy` w zależnościach (nowa referencja co render) —
    // przeliczamy wyłącznie gdy zmienia się fraza, stan otwarcia lub historia.
  }, [fraza, otwarta, historia]);

  // Fokus na akcję domyślną wiersza potwierdzenia trybu (klawiatura-first).
  useEffect(() => {
    if (!potwierdzenieId) return;
    potwierdzBtnRef.current?.focus();
  }, [potwierdzenieId]);

  const pozycjaPotwierdzenia = potwierdzenieId
    ? (pozycje.find((p) => p.id === potwierdzenieId) ?? null)
    : null;

  function wykonajPozycje(pozycja: PozycjaWyszukiwania): void {
    if (pozycja.trybMin && !trybWystarczajacy(trybAktualny, pozycja.trybMin)) {
      setPotwierdzenieId(pozycja.id);
      return;
    }
    dodajDoHistorii(pozycja);
    onWykonaj(pozycja);
    onZamknij();
  }

  function potwierdzPrzelaczenie(): void {
    if (!pozycjaPotwierdzenia || !pozycjaPotwierdzenia.trybMin) return;
    onPrzelaczTryb(pozycjaPotwierdzenia.trybMin);
    dodajDoHistorii(pozycjaPotwierdzenia);
    onWykonaj(pozycjaPotwierdzenia);
    setPotwierdzenieId(null);
    onZamknij();
  }

  function anulujPotwierdzenie(): void {
    setPotwierdzenieId(null);
    inputRef.current?.focus();
  }

  function idAt(indeks: number): string | null {
    return widoczneElementy[indeks]?.id ?? null;
  }

  function biezacyIndeks(): number {
    if (aktywnyId == null) return -1;
    return widoczneElementy.findIndex((p) => p.id === aktywnyId);
  }

  function obslugaKlawiszyPola(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (potwierdzenieId) return; // fokus jest na wierszu potwierdzenia — obsługa w `obslugaKlawiszyDialogu`

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nastepny = idAt(biezacyIndeks() + 1);
      if (nastepny) setAktywnyId(nastepny);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const poprzedni = idAt(biezacyIndeks() - 1);
      if (poprzedni) setAktywnyId(poprzedni);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const pozycja = widoczneElementy.find((p) => p.id === aktywnyId);
      if (pozycja) wykonajPozycje(pozycja);
    }
  }

  /** Esc (dowolny fokus w dialogu) = zamknij bez akcji (§3); Tab = uwięziony fokus (focus trap). */
  function obslugaKlawiszyDialogu(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onZamknij();
      return;
    }
    if (event.key !== 'Tab') return;
    const wezel = dialogRef.current;
    if (!wezel) return;
    const fokusowalne = Array.from(
      wezel.querySelectorAll<HTMLElement>('input, button:not([disabled])'),
    );
    if (fokusowalne.length === 0) return;
    const pierwszy = fokusowalne[0];
    const ostatni = fokusowalne[fokusowalne.length - 1];
    if (event.shiftKey && document.activeElement === pierwszy) {
      event.preventDefault();
      ostatni.focus();
    } else if (!event.shiftKey && document.activeElement === ostatni) {
      event.preventDefault();
      pierwszy.focus();
    }
  }

  if (!otwarta) return null;

  return (
    <div className="mvd-cmdk-scrim" data-testid="mvd-cmdk-scrim" onClick={onZamknij}>
      <div
        ref={dialogRef}
        className="mvd-cmdk-box"
        role="dialog"
        aria-modal="true"
        aria-label={SEARCH_STRINGS.polePlaceholder}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={obslugaKlawiszyDialogu}
        data-testid="mvd-cmdk-dialog"
      >
        <input
          ref={inputRef}
          type="text"
          className="mvd-cmdk-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="mvd-cmdk-listbox"
          aria-activedescendant={aktywnyId ?? undefined}
          aria-autocomplete="list"
          aria-label={SEARCH_STRINGS.polePlaceholder}
          placeholder={SEARCH_STRINGS.polePlaceholder}
          value={fraza}
          onChange={(event) => setFraza(event.target.value)}
          onKeyDown={obslugaKlawiszyPola}
          data-testid="mvd-cmdk-input"
        />

        {frazaPusta && (
          <p className="mvd-cmdk-hint" data-testid="mvd-cmdk-hint">
            {SEARCH_STRINGS.podpowiedzPusta}
          </p>
        )}

        {brakWynikow && (
          <p className="mvd-cmdk-empty" data-testid="mvd-cmdk-empty">
            {brakWynikowLabel(fraza.trim())}
          </p>
        )}

        <div
          id="mvd-cmdk-listbox"
          role="listbox"
          aria-label={SEARCH_STRINGS.polePlaceholder}
          className="mvd-cmdk-listbox"
          data-testid="mvd-cmdk-listbox"
        >
          {frazaPusta
            ? historia.map((pozycja) => (
                <div
                  key={pozycja.id}
                  id={pozycja.id}
                  role="option"
                  aria-selected={pozycja.id === aktywnyId}
                  className={pozycja.id === aktywnyId ? 'mvd-cmdk-opcja mvd-on' : 'mvd-cmdk-opcja'}
                  onMouseEnter={() => setAktywnyId(pozycja.id)}
                  onClick={() => wykonajPozycje(pozycja)}
                  data-testid={`mvd-cmdk-opcja-${pozycja.id}`}
                >
                  {pozycja.etykietaPL}
                </div>
              ))
            : grupy.map((grupaWynikow) => (
                <div
                  key={grupaWynikow.grupa}
                  role="group"
                  aria-label={etykietaGrupy(grupaWynikow.grupa)}
                  className="mvd-cmdk-grupa"
                >
                  <div className="mvd-cmdk-naglowek" aria-hidden="true">
                    {etykietaGrupy(grupaWynikow.grupa)}
                  </div>
                  {grupaWynikow.pozycje.map((pozycja) => (
                    <div
                      key={pozycja.id}
                      id={pozycja.id}
                      role="option"
                      aria-selected={pozycja.id === aktywnyId}
                      className={pozycja.id === aktywnyId ? 'mvd-cmdk-opcja mvd-on' : 'mvd-cmdk-opcja'}
                      onMouseEnter={() => setAktywnyId(pozycja.id)}
                      onClick={() => wykonajPozycje(pozycja)}
                      data-testid={`mvd-cmdk-opcja-${pozycja.id}`}
                    >
                      {pozycja.etykietaPL}
                    </div>
                  ))}
                </div>
              ))}
        </div>

        {pozycjaPotwierdzenia && pozycjaPotwierdzenia.trybMin && (
          <div className="mvd-cmdk-potwierdzenie" data-testid="mvd-cmdk-potwierdzenie">
            <p className="mvd-cmdk-potwierdzenie-tekst">
              {potwierdzTrybLabel(pozycjaPotwierdzenia.trybMin)}
            </p>
            <div className="mvd-cmdk-potwierdzenie-akcje">
              <button
                ref={potwierdzBtnRef}
                type="button"
                onClick={potwierdzPrzelaczenie}
                data-testid="mvd-cmdk-przelacz"
              >
                {SEARCH_STRINGS.przelaczIOtworz}
              </button>
              <button type="button" onClick={anulujPotwierdzenie} data-testid="mvd-cmdk-anuluj">
                {SEARCH_STRINGS.anuluj}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
