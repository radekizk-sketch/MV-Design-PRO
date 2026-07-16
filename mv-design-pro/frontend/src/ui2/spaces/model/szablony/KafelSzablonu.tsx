/*
 * Kafel wariantu szablonu (karta §3): miniatura jednokreskowa pól SN
 * (deterministyczna, z `schema.sn_bays_count.default` — patrz komentarz
 * `renderujMiniature`), nazwa (moc/wariant są częścią `name_pl` — TODO-KARTA
 * w `FiltrySzablonow.tsx` wyjaśnia brak osobnego pola liczbowego mocy),
 * liczba pól SN (`schema.sn_bays_count.default`, ustrukturyzowana) i opis
 * zastosowania PL (`use_case_pl`). Gramatyka MODEL_INTERAKCJI §2 / karta §3:
 * 1× klik = podgląd (aktualizuje panel szczegółów), 2× klik / `Enter` =
 * „Zastosuj i edytuj" (callback `onOtworz`), prawy klik = menu kontekstowe.
 * Zero `Date.now`/`Math.random` — miniatura wyłącznie z danych szablonu.
 */

import type { KeyboardEvent, MouseEvent } from 'react';
import type { StationTemplateFull } from './szablonyClient';
import { SZABLONY_STRINGS } from './strings';

const SZEROKOSC_POLA = 22;
const ODSTEP_POLA = 4;
const WYSOKOSC_POLA = 30;

/**
 * Miniatura jednokreskowa: jeden prostokąt na każde pole SN
 * (`schema.sn_bays_count.default` — liczba całkowita, brak fabrykowania roli
 * per pole, bo backend wystawia wyłącznie zestaw DOSTĘPNYCH rodzajów pól
 * (`sn_bay_roles`), nie przypisanie rodzaju do konkretnego pola — schema.py:71-78).
 * Deterministyczna funkcja czystych danych: ten sam szablon = ten sam SVG.
 */
function renderujMiniature(liczbaPol: number) {
  const pola = Array.from({ length: Math.max(1, liczbaPol) }, (_, indeks) => indeks);
  const szerokoscCalkowita = pola.length * SZEROKOSC_POLA + (pola.length - 1) * ODSTEP_POLA;
  return (
    <svg
      className="mvd-szablony-miniatura"
      viewBox={`0 0 ${szerokoscCalkowita} ${WYSOKOSC_POLA}`}
      width={szerokoscCalkowita}
      height={WYSOKOSC_POLA}
      role="img"
      aria-label={`Schemat: ${liczbaPol} pól SN`}
    >
      {pola.map((indeks) => (
        <rect
          key={indeks}
          x={indeks * (SZEROKOSC_POLA + ODSTEP_POLA)}
          y={2}
          width={SZEROKOSC_POLA}
          height={WYSOKOSC_POLA - 4}
          className="mvd-szablony-miniatura-pole"
        />
      ))}
    </svg>
  );
}

export interface KafelSzablonuProps {
  szablon: StationTemplateFull;
  zaznaczony: boolean;
  doPorownania: boolean;
  onKlik: (idSzablonu: string) => void;
  onOtworz: (idSzablonu: string) => void;
  onMenuKontekstowe: (idSzablonu: string, pozycja: { x: number; y: number }) => void;
}

export function KafelSzablonu({
  szablon,
  zaznaczony,
  doPorownania,
  onKlik,
  onOtworz,
  onMenuKontekstowe,
}: KafelSzablonuProps) {
  const liczbaPol = szablon.schema.sn_bays_count.default;
  const roleUnikalne = Array.from(new Set(szablon.schema.sn_bay_roles.map((r) => r.label_pl)));

  function obslugaKlawiszy(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onOtworz(szablon.id);
    }
  }

  function obslugaMenu(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    onMenuKontekstowe(szablon.id, { x: event.clientX, y: event.clientY });
  }

  return (
    <div
      className={`mvd-szablony-kafel${zaznaczony ? ' mvd-on' : ''}${doPorownania ? ' mvd-szablony-kafel-porownanie' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={zaznaczony}
      data-testid={`mvd-szablon-kafel-${szablon.id}`}
      onClick={() => onKlik(szablon.id)}
      onDoubleClick={() => onOtworz(szablon.id)}
      onKeyDown={obslugaKlawiszy}
      onContextMenu={obslugaMenu}
    >
      {doPorownania && <span className="mvd-tag mvd-tag-ok mvd-szablony-kafel-badge">{SZABLONY_STRINGS.menuPorownaj}</span>}
      {renderujMiniature(liczbaPol)}
      <h4 className="mvd-szablony-kafel-nazwa">{szablon.name_pl}</h4>
      <p className="mvd-szablony-kafel-opis">{szablon.use_case_pl}</p>
      <div className="mvd-kafel-kv-row">
        <span className="mvd-kafel-kv-label">{SZABLONY_STRINGS.liczbaPolSkrot}</span>
        <span className="mvd-kafel-kv-value mvd-num">{liczbaPol}</span>
      </div>
      {roleUnikalne.length > 0 && (
        <p className="mvd-szablony-kafel-role" title={roleUnikalne.join(', ')}>
          {roleUnikalne.join(' · ')}
        </p>
      )}
    </div>
  );
}
