/*
 * Nowy / otwórz projekt (przestrzeń „Projekt", N1, okno W-102, karta E2.2).
 * Ekran startowy bez otwartego projektu: trzy sekcje w kolejności pracy
 * inżyniera (karta §2) — cel → gotowe przykłady → istniejące projekty
 * (`AUDYT_RADY_SPECJALISTOW_2026-07.md` W-102: „start od celu").
 *
 * W pełni sterowany propsami (karta „ZAKAZ"): `projekty` z wołającego (adapter
 * `adapters/projektyAdapter.ts` jest szkieletem projekcji — źródło wymaga
 * `fetch`, patrz TODO-KARTA tamże), `onOtworzProjekt`, `onNowyProjekt`,
 * `onWczytajPrzyklad`. Zero wołań API, zero mutacji, zero fizyki (warstwa
 * prezentacji). Wpięcie do AppRoot/AppShell = karta zarządcy; wczytywanie
 * przykładów (P-01…P-05) jest wyłącznie callbackiem — realizacja = E3.
 *
 * Parytet z mostem `#dashboard` (karta KD-1, luki L-2…L-5) — WYŁĄCZNIE
 * prezentacja i potwierdzenia; realne wywołania API robi kontener:
 * - L-2 usunięcie projektu (przycisk listy + dialog potwierdzenia),
 * - L-3 nowy projekt z dowolną nazwą i opisem (`NowyProjektDialog`),
 * - L-4 odświeżenie listy (przycisk listy),
 * - L-5 zmiana projektu przy otwartym projekcie (`aktywnyProjekt` ⇒ otwarcie
 *   INNEGO projektu wymaga potwierdzenia zmiany kontekstu).
 */

import { useState } from 'react';
import '../pulpit.css';
import './otworz.css';
import { OTWORZ_STRINGS } from './strings';
import type { PrzykladDane } from './strings';
import { CelProjektu } from './CelProjektu';
import type { CelProjektuId } from './CelProjektu';
import { DialogPotwierdzenia } from './DialogPotwierdzenia';
import { ListaProjektow } from './ListaProjektow';
import { NowyProjektDialog } from './NowyProjektDialog';
import type { ProjektWiersz } from './adapters/projektyAdapter';
import { Kafel } from '../Kafel';

export interface OtworzProjektProps {
  /** Lista istniejących projektów — źródło u wołającego (karta §2 TODO-KARTA). */
  projekty: ProjektWiersz[];
  /** Stan „ładowanie" listy istniejących projektów. */
  ladowanieProjektow?: boolean;
  /**
   * Gotowe przykłady (P-01…P-05) — sekcja renderuje się WYŁĄCZNIE przy
   * niepustej liście (K4 §c, zero fabrykacji: wołający przekazuje przykłady
   * tylko wtedy, gdy istnieje realny dostawca materializacji przykładu do
   * projektu; domyślnie pusto = sekcja ukryta).
   */
  przyklady?: readonly PrzykladDane[];
  /** 2× klik / `Enter` / przycisk „Otwórz" na wierszu listy istniejących projektów. */
  onOtworzProjekt: (id: string) => void;
  /** Klik kafla celu (`CelProjektu`). */
  onNowyProjekt: (cel: CelProjektuId) => void;
  /** Klik kafla gotowego przykładu (P-01…P-05). */
  onWczytajPrzyklad: (idPrzykladu: string) => void;
  /**
   * L-3: utworzenie projektu z własną nazwą i opisem. Brak funkcji = ścieżka
   * własnej nazwy się nie renderuje (zero martwych kontrolek).
   */
  onNowyProjektZDanymi?: (nazwa: string, opis: string) => void;
  /** L-4: ponowne pobranie listy projektów z serwera. */
  onOdswiezListe?: () => void;
  /** L-2: usunięcie projektu (wywoływane PO potwierdzeniu w tym ekranie). */
  onUsunProjekt?: (id: string) => void;
  /**
   * L-5: aktualnie otwarty projekt (identyfikator + nazwa). Ustawiony ⇒ ekran
   * działa w trybie ZMIANY projektu: otwarcie INNEGO projektu wymaga
   * potwierdzenia, a użytkownik może wrócić na pulpit bez zmiany kontekstu
   * (`onWrocDoPulpitu`).
   */
  aktywnyProjekt?: { id: string; nazwa: string } | null;
  /** L-5: powrót na pulpit otwartego projektu (bez zmiany kontekstu). */
  onWrocDoPulpitu?: () => void;
  /** Operacja (tworzenie / otwarcie / usunięcie) w toku. */
  wToku?: boolean;
}

export function OtworzProjekt({
  projekty,
  ladowanieProjektow = false,
  przyklady = [],
  onOtworzProjekt,
  onNowyProjekt,
  onWczytajPrzyklad,
  onNowyProjektZDanymi,
  onOdswiezListe,
  onUsunProjekt,
  aktywnyProjekt = null,
  onWrocDoPulpitu,
  wToku = false,
}: OtworzProjektProps) {
  const [zaznaczonyId, setZaznaczonyId] = useState<string | null>(null);
  const [doUsunieciaId, setDoUsunieciaId] = useState<string | null>(null);
  const [doOtwarciaId, setDoOtwarciaId] = useState<string | null>(null);
  const [nowyOtwarty, setNowyOtwarty] = useState(false);

  const doUsuniecia = projekty.find((p) => p.id === doUsunieciaId) ?? null;
  const doOtwarcia = projekty.find((p) => p.id === doOtwarciaId) ?? null;

  /**
   * Otwarcie projektu. Przy OTWARTYM projekcie (L-5) zmiana kontekstu wymaga
   * potwierdzenia; ponowne otwarcie tego samego projektu = powrót na pulpit
   * (żadnej zmiany kontekstu, więc żadnego pytania).
   */
  function zadajOtwarcie(id: string) {
    if (aktywnyProjekt != null && id !== aktywnyProjekt.id) {
      setDoOtwarciaId(id);
      return;
    }
    onOtworzProjekt(id);
  }

  return (
    <div className="mvd-otworz">
      <header className="mvd-pulpit-head">
        <h2 className="mvd-pulpit-title">{OTWORZ_STRINGS.tytul}</h2>
        {aktywnyProjekt != null && onWrocDoPulpitu && (
          <button
            type="button"
            className="mvd-btn"
            onClick={onWrocDoPulpitu}
            data-testid="mvd-projekty-wroc"
          >
            {OTWORZ_STRINGS.wrocDoPulpitu}
          </button>
        )}
      </header>

      <CelProjektu onWybierzCel={onNowyProjekt} />
      {onNowyProjektZDanymi && (
        <button
          type="button"
          className="mvd-otworz-cel-wlasna"
          onClick={() => setNowyOtwarty(true)}
          data-testid="mvd-projekty-wlasna-nazwa"
        >
          {OTWORZ_STRINGS.wlasnaNazwa}
        </button>
      )}

      {przyklady.length > 0 && (
        <section className="mvd-otworz-przyklady" aria-label={OTWORZ_STRINGS.przykladyTytul}>
          <h3 className="mvd-pulpit-cases-title">{OTWORZ_STRINGS.przykladyTytul}</h3>
          <div className="mvd-otworz-przyklady-grid">
            {przyklady.map((p) => (
              <Kafel
                key={p.id}
                tytul={p.nazwa}
                onKlik={() => onWczytajPrzyklad(p.id)}
                ariaLabel={`${p.nazwa}. ${p.opis}`}
              >
                <p className="mvd-otworz-przyklad-opis">{p.opis}</p>
              </Kafel>
            ))}
          </div>
        </section>
      )}

      <ListaProjektow
        projekty={projekty}
        ladowanie={ladowanieProjektow}
        zaznaczonyId={zaznaczonyId}
        onZaznacz={setZaznaczonyId}
        onOtworz={zadajOtwarcie}
        onOdswiez={onOdswiezListe}
        onUsun={onUsunProjekt ? setDoUsunieciaId : undefined}
        wToku={wToku}
      />

      {nowyOtwarty && onNowyProjektZDanymi && (
        <NowyProjektDialog
          wToku={wToku}
          onAnuluj={() => setNowyOtwarty(false)}
          onUtworz={(nazwa, opis) => {
            setNowyOtwarty(false);
            onNowyProjektZDanymi(nazwa, opis);
          }}
        />
      )}

      {doUsuniecia && onUsunProjekt && (
        <DialogPotwierdzenia
          testId="mvd-projekty-usun-dialog"
          tytul={OTWORZ_STRINGS.usunTytul}
          pytanie={OTWORZ_STRINGS.usunPytanie(doUsuniecia.nazwa)}
          skutek={OTWORZ_STRINGS.usunNieodwracalne}
          etykietaPotwierdz={OTWORZ_STRINGS.usunPotwierdz}
          etykietaAnuluj={OTWORZ_STRINGS.anuluj}
          destrukcyjna
          wToku={wToku}
          onAnuluj={() => setDoUsunieciaId(null)}
          onPotwierdz={() => {
            const id = doUsuniecia.id;
            setDoUsunieciaId(null);
            if (zaznaczonyId === id) setZaznaczonyId(null);
            onUsunProjekt(id);
          }}
        />
      )}

      {doOtwarcia && aktywnyProjekt != null && (
        <DialogPotwierdzenia
          testId="mvd-projekty-zmiana-dialog"
          tytul={OTWORZ_STRINGS.zmianaTytul}
          pytanie={OTWORZ_STRINGS.zmianaPytanie(aktywnyProjekt.nazwa, doOtwarcia.nazwa)}
          skutek={OTWORZ_STRINGS.zmianaSkutek}
          etykietaPotwierdz={OTWORZ_STRINGS.zmianaPotwierdz}
          etykietaAnuluj={OTWORZ_STRINGS.anuluj}
          wToku={wToku}
          onAnuluj={() => setDoOtwarciaId(null)}
          onPotwierdz={() => {
            const id = doOtwarcia.id;
            setDoOtwarciaId(null);
            onOtworzProjekt(id);
          }}
        />
      )}
    </div>
  );
}
