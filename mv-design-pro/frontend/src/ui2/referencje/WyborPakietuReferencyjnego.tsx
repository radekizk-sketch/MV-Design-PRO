/*
 * Wybór pakietu referencyjnego — wspólna kontrolka WSZYSTKICH miejsc oceny
 * zgodności (karta REF-PAKIET; wcześniej ekran modelu miał pakiet zaszyty
 * stałą `PAKIET_OSD = 'osd_enea'`, a pozostałe miejsca nie dawały wyboru
 * w ogóle, mimo że końcówka `?packs=` istnieje od spec §9).
 *
 * Zasady:
 *  - lista pochodzi WYŁĄCZNIE z `GET /api/reference/packs` (gotowy klient
 *    `fetchReferencePacks` — reużycie, zero drugiego klienta);
 *  - wybór trzyma JEDEN store (`wyborPakietu.ts`) — trzy miejsca zgodności
 *    pokazują ten sam zakres oceny, nie trzy niezależne stany;
 *  - „Wszystkie referencje" = brak parametru `?packs` (domyślne zachowanie
 *    backendu), a nie wymyślony w UI „pakiet domyślny";
 *  - zapamiętany wybór, którego NIE MA już w rejestrze, jest wycofywany do
 *    „wszystkich" z jawnym powodem — inaczej zapytanie kończyłoby się 404,
 *    a projektant widziałby pusty ekran bez wyjaśnienia.
 *
 * Zero fizyki, zero danych modelu — kontrolka wyłącznie prezentacyjna.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  fetchReferencePacks,
  REFERENCE_PACK_KIND_LABELS_PL,
  type ReferencePackSummary,
} from './api';
import { useWyborPakietu } from './wyborPakietu';
import './referencje.css';

export const WYBOR_PAKIETU_TEKSTY = {
  etykieta: 'Zakres oceny',
  wszystkie: 'Wszystkie referencje',
  ladowanie: 'Wczytywanie listy referencji…',
  blad: 'Nie udało się pobrać listy referencji.',
  ponow: 'Ponów pobranie',
  pusto: 'Rejestr nie zwrócił żadnego pakietu referencyjnego — nie ma wg czego oceniać zgodności.',
  wycofany:
    'Zapamiętana referencja nie występuje już w rejestrze — zakres wrócił do wszystkich referencji.',
} as const;

/** Etykieta pozycji listy: nazwa PL + rodzaj + wersja (dane pakietu, nie domysł). */
export function etykietaPakietu(pack: ReferencePackSummary): string {
  return `${pack.name_pl} (${REFERENCE_PACK_KIND_LABELS_PL[pack.kind]} · ${pack.version})`;
}

export interface WyborPakietuReferencyjnegoProps {
  /** Unikalny identyfikator kontrolki (powiązanie etykiety w miejscu osadzenia). */
  readonly idKontrolki: string;
}

export function WyborPakietuReferencyjnego({
  idKontrolki,
}: WyborPakietuReferencyjnegoProps): JSX.Element {
  const pakietId = useWyborPakietu((s) => s.pakietId);
  const ustawPakiet = useWyborPakietu((s) => s.ustawPakiet);

  const [pakiety, setPakiety] = useState<readonly ReferencePackSummary[] | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState(false);
  const [wycofany, setWycofany] = useState(false);
  const [proba, setProba] = useState(0);

  useEffect(() => {
    let anulowano = false;
    setLadowanie(true);
    setBlad(false);
    fetchReferencePacks()
      .then((lista) => {
        if (anulowano) return;
        setPakiety(lista);
        // Para predykatów zapis/odczyt z JEDNEGO źródła: dopuszczalne są
        // wyłącznie identyfikatory obecne w rejestrze.
        if (pakietId !== null && !lista.some((p) => p.pack_id === pakietId)) {
          setWycofany(true);
          ustawPakiet(null);
        } else {
          setWycofany(false);
        }
      })
      .catch(() => {
        if (!anulowano) {
          setPakiety(null);
          setBlad(true);
        }
      })
      .finally(() => {
        if (!anulowano) setLadowanie(false);
      });
    return () => {
      anulowano = true;
    };
    // `pakietId` celowo poza zależnościami: zmiana wyboru nie przeładowuje
    // listy (lista zależy wyłącznie od rejestru i ręcznego ponowienia).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proba, ustawPakiet]);

  const ponow = useCallback(() => setProba((n) => n + 1), []);

  if (ladowanie && pakiety === null) {
    return (
      <p className="mvd-refwybor-stan" data-testid="mvd-ref-wybor-ladowanie">
        {WYBOR_PAKIETU_TEKSTY.ladowanie}
      </p>
    );
  }

  if (blad) {
    return (
      <div className="mvd-refwybor" data-testid="mvd-ref-wybor-blad">
        <p className="mvd-refwybor-stan mvd-refwybor-stan-blad" role="alert">
          {WYBOR_PAKIETU_TEKSTY.blad}
        </p>
        <button type="button" className="mvd-refwybor-akcja" onClick={ponow}>
          {WYBOR_PAKIETU_TEKSTY.ponow}
        </button>
      </div>
    );
  }

  if (pakiety !== null && pakiety.length === 0) {
    return (
      <div className="mvd-refwybor" data-testid="mvd-ref-wybor-pusto">
        <p className="mvd-refwybor-stan">{WYBOR_PAKIETU_TEKSTY.pusto}</p>
        <button type="button" className="mvd-refwybor-akcja" onClick={ponow}>
          {WYBOR_PAKIETU_TEKSTY.ponow}
        </button>
      </div>
    );
  }

  return (
    <div className="mvd-refwybor" data-testid="mvd-ref-wybor">
      <label className="mvd-refwybor-etykieta" htmlFor={idKontrolki}>
        {WYBOR_PAKIETU_TEKSTY.etykieta}
      </label>
      <select
        id={idKontrolki}
        className="mvd-refwybor-select"
        data-testid="mvd-ref-wybor-select"
        value={pakietId ?? ''}
        onChange={(e) => {
          setWycofany(false);
          ustawPakiet(e.target.value === '' ? null : e.target.value);
        }}
      >
        <option value="">{WYBOR_PAKIETU_TEKSTY.wszystkie}</option>
        {(pakiety ?? []).map((pack) => (
          <option key={pack.pack_id} value={pack.pack_id}>
            {etykietaPakietu(pack)}
          </option>
        ))}
      </select>
      {wycofany && (
        <p className="mvd-refwybor-stan" data-testid="mvd-ref-wybor-wycofany">
          {WYBOR_PAKIETU_TEKSTY.wycofany}
        </p>
      )}
    </div>
  );
}
