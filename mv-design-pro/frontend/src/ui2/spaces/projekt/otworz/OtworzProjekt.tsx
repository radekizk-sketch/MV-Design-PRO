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
 */

import { useState } from 'react';
import '../pulpit.css';
import './otworz.css';
import { OTWORZ_STRINGS } from './strings';
import type { PrzykladDane } from './strings';
import { CelProjektu } from './CelProjektu';
import type { CelProjektuId } from './CelProjektu';
import { ListaProjektow } from './ListaProjektow';
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
}

export function OtworzProjekt({
  projekty,
  ladowanieProjektow = false,
  przyklady = [],
  onOtworzProjekt,
  onNowyProjekt,
  onWczytajPrzyklad,
}: OtworzProjektProps) {
  const [zaznaczonyId, setZaznaczonyId] = useState<string | null>(null);

  return (
    <div className="mvd-otworz">
      <header className="mvd-pulpit-head">
        <h2 className="mvd-pulpit-title">{OTWORZ_STRINGS.tytul}</h2>
      </header>

      <CelProjektu onWybierzCel={onNowyProjekt} />

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
        onOtworz={onOtworzProjekt}
      />
    </div>
  );
}
