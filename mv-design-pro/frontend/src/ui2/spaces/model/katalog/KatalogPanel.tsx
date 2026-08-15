/**
 * KatalogPanel — przeglądarka katalogu typów (ui2 · Model sieci → Katalog).
 *
 * Układ trójkolumnowy: kategorie → lista typów (wyszukiwanie + filtr producenta)
 * → karta techniczna typu z sekcją „Gdzie użyty".
 *
 * Dane z REALNEGO API (`ui/catalog/api.ts` → `/api/catalog/*`) przez adapter.
 * Loader jest wstrzykiwalny (`zaladujTypy`) — testy podają deterministyczny stub.
 * Tylko odczyt — katalog niezmienny (kanon katalog-first, CLAUDE.md §10).
 */

import { useEffect, useMemo, useState } from 'react';

import './katalog.css';
import '../../../kryteria/kryteria.css';
import { SekcjaStarzeniaKabla, SekcjaStratTransformatora } from '../../../kryteria';
import {
  KATEGORIE,
  filtrujPozycje,
  metadanaKategorii,
  pobierzTypy,
  producenci,
} from './adapters/katalogAdapter';
import { GdzieUzyty } from './GdzieUzyty';
import { KartaTechniczna } from './KartaTechniczna';
import { ETYKIETY_KATEGORII, STRINGS } from './strings';
import type { ElementUzycia, KatalogPozycja, KategoriaId, LadowaczTypow } from './types';

export interface KatalogPanelProps {
  /** Loader typów; domyślnie realny klient katalogu (`adapters/katalogAdapter`). */
  zaladujTypy?: LadowaczTypow;
  /** Elementy modelu ze snapshotu (dla sekcji „Gdzie użyty"). */
  uzyciaSnapshot?: readonly ElementUzycia[];
  /** Nawigacja do elementu modelu z listy „Gdzie użyty". */
  onPokazElement?: (ref: string) => void;
  /** Kategoria początkowa (domyślnie pierwsza). */
  poczatkowaKategoria?: KategoriaId;
}

export function KatalogPanel({
  zaladujTypy = pobierzTypy,
  uzyciaSnapshot = [],
  onPokazElement,
  poczatkowaKategoria,
}: KatalogPanelProps): JSX.Element {
  const [kategoria, setKategoria] = useState<KategoriaId>(
    poczatkowaKategoria ?? KATEGORIE[0].id,
  );
  const [pozycje, setPozycje] = useState<KatalogPozycja[]>([]);
  const [stan, setStan] = useState<'ladowanie' | 'gotowe' | 'blad'>('ladowanie');
  const [fraza, setFraza] = useState('');
  const [producent, setProducent] = useState<string | null>(null);
  const [wybranyId, setWybranyId] = useState<string | null>(null);
  // KD-3 poz. 6: dane wejściowe kryteriów liczonych przez backend dla WYBRANEGO
  // typu. Trzymane w panelu, bo dotyczą pytania „jak ten typ zachowa się w moim
  // przypadku", a nie samej pozycji katalogowej (katalog pozostaje niezmienny).
  const [temperaturaPracyC, setTemperaturaPracyC] = useState<number | null>(null);
  const [beta, setBeta] = useState<number | null>(null);

  useEffect(() => {
    let aktywne = true;
    setStan('ladowanie');
    setProducent(null);
    setWybranyId(null);
    zaladujTypy(kategoria)
      .then((typy) => {
        if (!aktywne) return;
        setPozycje(typy);
        setStan('gotowe');
      })
      .catch(() => {
        if (!aktywne) return;
        setPozycje([]);
        setStan('blad');
      });
    return () => {
      aktywne = false;
    };
  }, [kategoria, zaladujTypy]);

  const listaProducentow = useMemo(() => producenci(pozycje), [pozycje]);
  const widoczne = useMemo(
    () => filtrujPozycje(pozycje, fraza, producent),
    [pozycje, fraza, producent],
  );
  const wybrany = useMemo(
    () => widoczne.find((p) => p.id === wybranyId) ?? null,
    [widoczne, wybranyId],
  );

  return (
    <div className="mvd-katalog">
      <nav className="mvd-katalog__kategorie" aria-label={STRINGS.tytul}>
        <h2 className="mvd-katalog__sekcja-tytul">{STRINGS.tytul}</h2>
        {KATEGORIE.map((k) => (
          <button
            key={k.id}
            type="button"
            className="mvd-katalog__kategoria-btn"
            aria-pressed={k.id === kategoria}
            onClick={() => setKategoria(k.id)}
          >
            {ETYKIETY_KATEGORII[k.id]}
          </button>
        ))}
      </nav>

      <div className="mvd-katalog__lista">
        <input
          className="mvd-katalog__szukaj"
          type="search"
          value={fraza}
          placeholder={STRINGS.szukajPlaceholder}
          aria-label={STRINGS.szukajPlaceholder}
          onChange={(e) => setFraza(e.target.value)}
        />
        {listaProducentow.length > 0 && (
          <select
            className="mvd-katalog__szukaj"
            aria-label={STRINGS.filtrProducent}
            value={producent ?? ''}
            onChange={(e) => setProducent(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">{STRINGS.filtrProducentWszyscy}</option>
            {listaProducentow.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}

        {stan === 'ladowanie' && <p className="mvd-katalog__param-def">{STRINGS.ladowanie}</p>}
        {stan === 'blad' && <p className="mvd-katalog__param-def">{STRINGS.bladLadowania}</p>}
        {stan === 'gotowe' && pozycje.length === 0 && (
          <p className="mvd-katalog__param-def">{STRINGS.listaPusta}</p>
        )}
        {stan === 'gotowe' && pozycje.length > 0 && widoczne.length === 0 && (
          <p className="mvd-katalog__param-def">{STRINGS.listaPustaFiltr}</p>
        )}
        {stan === 'gotowe' && widoczne.length > 0 && (
          <>
            <p className="mvd-katalog__param-def">{STRINGS.liczbaTypow(widoczne.length)}</p>
            {widoczne.map((p) => (
              <button
                key={p.id}
                type="button"
                className="mvd-katalog__typ-btn"
                aria-pressed={p.id === wybranyId}
                onClick={() => setWybranyId(p.id)}
              >
                {p.name}
                {typeof p.manufacturer === 'string' && p.manufacturer.trim().length > 0 && (
                  <span className="mvd-katalog__typ-producent">{p.manufacturer}</span>
                )}
              </button>
            ))}
          </>
        )}
      </div>

      <div>
        {wybrany ? (
          <>
            <KartaTechniczna
              pozycja={wybrany}
              kategoria={kategoria}
              poleParametrow={metadanaKategorii(kategoria).poleParametrow}
            />
            {/* Kryteria właściwe TYPOWI (KD-3 poz. 6): starzenie izolacji i straty
                to pytania zadawane PRZY WYBORZE typu, więc odpowiedź stoi tam,
                gdzie projektant widzi komplet danych znamionowych. Liczy backend. */}
            {kategoria === 'KABEL' ? (
              <SekcjaStarzeniaKabla
                key={wybrany.id}
                typId={wybrany.id}
                temperaturaPracyC={temperaturaPracyC}
                onZmianaTemperatury={setTemperaturaPracyC}
              />
            ) : null}
            {kategoria === 'TRANSFORMATOR' ? (
              <SekcjaStratTransformatora
                key={wybrany.id}
                typId={wybrany.id}
                beta={beta}
                onZmianaBety={setBeta}
              />
            ) : null}
            <GdzieUzyty
              typId={wybrany.id}
              uzycia={uzyciaSnapshot}
              onPokazElement={onPokazElement}
            />
          </>
        ) : (
          <section className="mvd-katalog__karta">
            <p className="mvd-katalog__param-def">{STRINGS.wybierzTyp}</p>
          </section>
        )}
      </div>
    </div>
  );
}
