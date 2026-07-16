/*
 * Przeglądarka biblioteki szablonów stacji (przestrzeń „Model sieci", okno
 * W-203, karta E3.1) — fundament kreatora stacji. Układ: drzewko ról A–E
 * (poziom 1) → kategorie/typ konstrukcyjny (poziom 2, karta §2/§3) → kafle
 * wariantów → panel szczegółów / porównanie. Samodzielny widget: wczytuje
 * własne dane przez `szablonyClient.ts` (wzorzec `ui2/shell/backendHealth.ts`
 * — hook `use*` + `fetch` bezpośrednio w karcie ui2, bez pośredniego store'a).
 *
 * Gramatyka interakcji (MODEL_INTERAKCJI §2, karta §3):
 *   1× klik na kaflu = podgląd (panel szczegółów) · 2× klik / `Enter` =
 *   „Zastosuj i edytuj" (callback `onZastosuj` — realny endpoint apply
 *   pozostaje w karcie integracyjnej, poza tą kartą) · prawy klik = menu
 *   (Porównaj / Pokaż wymagania danych).
 *
 * Stany (karta §3): ładowanie / błąd (z akcją „Spróbuj ponownie") / pusty /
 * gotowy — na dwóch poziomach: biblioteka (drzewko ról, `/categories`) i
 * wybrana grupa (kafle, listy filtrowane po kategorii + pełne dane per id).
 *
 * Źródła danych (mapowanie plik:linia — `backend/src/api/station_templates.py`):
 * - `/api/station-templates/categories` (linie 210-226) → drzewko ról A–E
 *   (`GrupyRol.zbudujDrzewkoRol`).
 * - `/api/station-templates?category=<id>` (linie 187-207) → id szablonów
 *   widocznej grupy (podsumowanie, bez `schema`).
 * - `/api/station-templates/{id}` (linie 229-235) → pełny szablon ze `schema`
 *   (potrzebny do miniatury/liczby pól/porównania/parametrów edytowalnych) —
 *   pobierany leniwie WYŁĄCZNIE dla id widocznej grupy, cache'owany w `useRef`
 *   (bez ponownych zapytań przy powrocie do już wczytanej grupy).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import './szablony.css';
import {
  kategorieRoli,
  zbudujDrzewkoRol,
  type RolaId,
  type WezelRoli,
} from './GrupyRol';
import {
  FILTRY_PUSTE,
  FiltrySzablonow,
  filtrujSzablony,
  type FiltrySzablonowStan,
} from './FiltrySzablonow';
import { KafelSzablonu } from './KafelSzablonu';
import { SzczegolySzablonu } from './SzczegolySzablonu';
import { PorownanieSzablonow } from './PorownanieSzablonow';
import {
  pobierzKategorieSzablonow,
  pobierzSzablon,
  pobierzSzablony,
} from './szablonyClient';
import type { StationTemplateFull, StationTemplateSummary } from './szablonyClient';
import { SZABLONY_STRINGS } from './strings';

type FazaDrzewka = 'ladowanie' | 'blad' | 'gotowy';
type FazaGrupy = 'brak-wyboru' | 'ladowanie' | 'blad' | 'gotowy';

interface WyborGrupy {
  rolaId: RolaId;
  /** `null` = cała rola (wszystkie jej kategorie); w przeciwnym razie jedna kategoria. */
  kategoriaId: string | null;
}

interface StanMenu {
  idSzablonu: string;
  pozycja: { x: number; y: number };
}

function komunikatBledu(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface PrzegladarkaSzablonowProps {
  /** 2× klik / `Enter` na kaflu / przycisk „Zastosuj i edytuj" (karta §3). */
  onZastosuj: (idSzablonu: string) => void;
  /** Pozycja menu „Pokaż wymagania danych" — poza kartą, gdy brak: wyszarzona. */
  onPokazWymaganiaDanych?: (idSzablonu: string) => void;
}

export function PrzegladarkaSzablonow({ onZastosuj, onPokazWymaganiaDanych }: PrzegladarkaSzablonowProps) {
  const [fazaDrzewka, setFazaDrzewka] = useState<FazaDrzewka>('ladowanie');
  const [drzewko, setDrzewko] = useState<WezelRoli[]>([]);
  const [bladDrzewka, setBladDrzewka] = useState<string | null>(null);
  const [roleRozwiniete, setRoleRozwiniete] = useState<Set<RolaId>>(new Set());

  const [wybor, setWybor] = useState<WyborGrupy | null>(null);
  const [fazaGrupy, setFazaGrupy] = useState<FazaGrupy>('brak-wyboru');
  const [szablonyGrupy, setSzablonyGrupy] = useState<StationTemplateFull[]>([]);
  const [bladGrupy, setBladGrupy] = useState<string | null>(null);

  const [filtry, setFiltry] = useState<FiltrySzablonowStan>(FILTRY_PUSTE);
  const [zaznaczonyId, setZaznaczonyId] = useState<string | null>(null);
  const [doPorownania, setDoPorownania] = useState<string[]>([]);
  const [menu, setMenu] = useState<StanMenu | null>(null);

  const cachePelnych = useRef(new Map<string, StationTemplateFull>());
  const drzewkoRef = useRef<WezelRoli[]>([]);
  drzewkoRef.current = drzewko;

  const wczytajDrzewko = useCallback(() => {
    setFazaDrzewka('ladowanie');
    setBladDrzewka(null);
    pobierzKategorieSzablonow()
      .then((odpowiedz) => {
        setDrzewko(zbudujDrzewkoRol(odpowiedz.categories));
        setFazaDrzewka('gotowy');
      })
      .catch((e: unknown) => {
        setBladDrzewka(komunikatBledu(e));
        setFazaDrzewka('blad');
      });
  }, []);

  useEffect(() => {
    wczytajDrzewko();
  }, [wczytajDrzewko]);

  const wczytajPelneSzablony = useCallback(async (idy: readonly string[]): Promise<StationTemplateFull[]> => {
    const brakujace = idy.filter((id) => !cachePelnych.current.has(id));
    if (brakujace.length > 0) {
      const pobrane = await Promise.all(brakujace.map((id) => pobierzSzablon(id)));
      for (const pelny of pobrane) cachePelnych.current.set(pelny.id, pelny);
    }
    return idy.map((id) => cachePelnych.current.get(id)).filter((t): t is StationTemplateFull => t != null);
  }, []);

  const wczytajGrupe = useCallback(
    (nowyWybor: WyborGrupy) => {
      setWybor(nowyWybor);
      setFazaGrupy('ladowanie');
      setBladGrupy(null);
      setZaznaczonyId(null);
      setDoPorownania([]);

      const kategorieDoPobrania =
        nowyWybor.kategoriaId != null
          ? [nowyWybor.kategoriaId]
          : kategorieRoli(drzewkoRef.current, nowyWybor.rolaId);

      Promise.all(kategorieDoPobrania.map((kategoriaId) => pobierzSzablony(kategoriaId)))
        .then((odpowiedzi) => {
          const podsumowania: StationTemplateSummary[] = odpowiedzi.flatMap((o) => o.templates);
          return wczytajPelneSzablony(podsumowania.map((s) => s.id));
        })
        .then((pelne) => {
          setSzablonyGrupy([...pelne].sort((a, b) => a.id.localeCompare(b.id)));
          setFazaGrupy('gotowy');
        })
        .catch((e: unknown) => {
          setBladGrupy(komunikatBledu(e));
          setFazaGrupy('blad');
        });
    },
    [wczytajPelneSzablony],
  );

  function wybierzRole(rolaId: RolaId) {
    setRoleRozwiniete((prev) => {
      const next = new Set(prev);
      next.add(rolaId);
      return next;
    });
    wczytajGrupe({ rolaId, kategoriaId: null });
  }

  function wybierzKategorie(rolaId: RolaId, kategoriaId: string) {
    wczytajGrupe({ rolaId, kategoriaId });
  }

  function przelaczRozwiniecie(rolaId: RolaId) {
    setRoleRozwiniete((prev) => {
      const next = new Set(prev);
      if (next.has(rolaId)) next.delete(rolaId);
      else next.add(rolaId);
      return next;
    });
  }

  function przelaczPorownanie(idSzablonu: string) {
    setDoPorownania((prev) => {
      if (prev.includes(idSzablonu)) return prev.filter((id) => id !== idSzablonu);
      if (prev.length >= 2) return prev;
      return [...prev, idSzablonu];
    });
    setMenu(null);
  }

  function pokazWymagania(idSzablonu: string) {
    onPokazWymaganiaDanych?.(idSzablonu);
    setMenu(null);
  }

  useEffect(() => {
    if (!menu) return undefined;
    function naEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null);
    }
    function naKlikPoza() {
      setMenu(null);
    }
    document.addEventListener('keydown', naEsc);
    document.addEventListener('click', naKlikPoza);
    return () => {
      document.removeEventListener('keydown', naEsc);
      document.removeEventListener('click', naKlikPoza);
    };
  }, [menu]);

  if (fazaDrzewka === 'ladowanie') {
    return (
      <div className="mvd-szablony" data-testid="mvd-szablony-ladowanie" aria-busy="true">
        <p role="status">{SZABLONY_STRINGS.ladowanieDrzewka}</p>
      </div>
    );
  }

  if (fazaDrzewka === 'blad') {
    return (
      <div className="mvd-szablony" data-testid="mvd-szablony-blad">
        <p>{SZABLONY_STRINGS.bladDrzewkaTytul}</p>
        {bladDrzewka && <p className="mvd-szablony-blad-szczegol">{bladDrzewka}</p>}
        <button type="button" className="mvd-btn mvd-btn-primary" onClick={wczytajDrzewko}>
          {SZABLONY_STRINGS.sprobujPonownie}
        </button>
      </div>
    );
  }

  const widoczneKafle = filtrujSzablony(szablonyGrupy, filtry);
  const zaznaczonyPelny = zaznaczonyId ? cachePelnych.current.get(zaznaczonyId) ?? null : null;
  const parPorownania: [StationTemplateFull, StationTemplateFull] | null =
    doPorownania.length === 2
      ? [cachePelnych.current.get(doPorownania[0])!, cachePelnych.current.get(doPorownania[1])!]
      : null;

  return (
    <div className="mvd-szablony" data-testid="mvd-szablony">
      <header className="mvd-szablony-head">
        <h2>{SZABLONY_STRINGS.tytul}</h2>
        <p className="mvd-szablony-podtytul">{SZABLONY_STRINGS.podtytul}</p>
      </header>

      <div className="mvd-szablony-layout">
        <nav
          className="mvd-szablony-drzewko"
          role="tree"
          aria-label={SZABLONY_STRINGS.drzewkoEtykieta}
          data-testid="mvd-szablony-drzewko"
        >
          {drzewko.map((rola) => {
            const rozwiniety = roleRozwiniete.has(rola.id);
            const rolaZaznaczona = wybor?.rolaId === rola.id && wybor.kategoriaId == null;
            return (
              <div key={rola.id} role="treeitem" aria-expanded={rozwiniety} data-testid={`mvd-szablony-rola-${rola.id}`}>
                <div className="mvd-szablony-drzewko-wiersz">
                  <button
                    type="button"
                    className="mvd-szablony-drzewko-chevron"
                    aria-label={rozwiniety ? 'Zwiń' : 'Rozwiń'}
                    onClick={() => przelaczRozwiniecie(rola.id)}
                  >
                    {rozwiniety ? '▾' : '▸'}
                  </button>
                  <button
                    type="button"
                    className={rolaZaznaczona ? 'mvd-szablony-drzewko-etykieta mvd-on' : 'mvd-szablony-drzewko-etykieta'}
                    aria-selected={rolaZaznaczona}
                    onClick={() => wybierzRole(rola.id)}
                  >
                    <span>{rola.etykieta}</span>
                    <span className="mvd-tag mvd-tag-mut mvd-num">{rola.liczbaSzablonow}</span>
                  </button>
                </div>
                {rozwiniety && (
                  <div className="mvd-szablony-drzewko-dzieci">
                    {rola.kategorie.map((kategoria) => {
                      const kategoriaZaznaczona = wybor?.rolaId === rola.id && wybor.kategoriaId === kategoria.id;
                      return (
                        <button
                          key={kategoria.id}
                          type="button"
                          data-testid={`mvd-szablony-kategoria-${kategoria.id}`}
                          className={
                            kategoriaZaznaczona
                              ? 'mvd-szablony-drzewko-etykieta mvd-szablony-drzewko-etykieta-dziecko mvd-on'
                              : 'mvd-szablony-drzewko-etykieta mvd-szablony-drzewko-etykieta-dziecko'
                          }
                          aria-selected={kategoriaZaznaczona}
                          onClick={() => wybierzKategorie(rola.id, kategoria.id)}
                        >
                          <span>{kategoria.etykieta}</span>
                          <span className="mvd-tag mvd-tag-mut mvd-num">{kategoria.liczbaSzablonow}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="mvd-szablony-glowna">
          {wybor == null && (
            <p className="mvd-szablony-podpowiedz" data-testid="mvd-szablony-brak-wyboru">
              {SZABLONY_STRINGS.wybierzGrupe}
            </p>
          )}

          {wybor != null && fazaGrupy === 'ladowanie' && (
            <p role="status" data-testid="mvd-szablony-grupa-ladowanie">
              {SZABLONY_STRINGS.ladowanieGrupy}
            </p>
          )}

          {wybor != null && fazaGrupy === 'blad' && (
            <div data-testid="mvd-szablony-grupa-blad">
              <p>{SZABLONY_STRINGS.bladGrupyTytul}</p>
              {bladGrupy && <p className="mvd-szablony-blad-szczegol">{bladGrupy}</p>}
              <button type="button" className="mvd-btn mvd-btn-primary" onClick={() => wczytajGrupe(wybor)}>
                {SZABLONY_STRINGS.sprobujPonownie}
              </button>
            </div>
          )}

          {wybor != null && fazaGrupy === 'gotowy' && (
            <>
              <FiltrySzablonow filtry={filtry} onZmiana={setFiltry} />
              {szablonyGrupy.length === 0 ? (
                <p data-testid="mvd-szablony-stan-pusty">{SZABLONY_STRINGS.pustaGrupa}</p>
              ) : widoczneKafle.length === 0 ? (
                <p data-testid="mvd-szablony-stan-pusty">{SZABLONY_STRINGS.pustoPoFiltrach}</p>
              ) : (
                <div className="mvd-szablony-kafle" data-testid="mvd-szablony-kafle">
                  {widoczneKafle.map((szablon) => (
                    <KafelSzablonu
                      key={szablon.id}
                      szablon={szablon}
                      zaznaczony={zaznaczonyId === szablon.id}
                      doPorownania={doPorownania.includes(szablon.id)}
                      onKlik={setZaznaczonyId}
                      onOtworz={onZastosuj}
                      onMenuKontekstowe={(idSzablonu, pozycja) => setMenu({ idSzablonu, pozycja })}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="mvd-szablony-prawy">
          {parPorownania ? (
            <PorownanieSzablonow a={parPorownania[0]} b={parPorownania[1]} onZamknij={() => setDoPorownania([])} />
          ) : (
            <SzczegolySzablonu szablon={zaznaczonyPelny} onZastosuj={onZastosuj} />
          )}
        </div>
      </div>

      {menu && (
        <div
          className="mvd-szablony-menu"
          role="menu"
          data-testid="mvd-szablony-menu"
          style={{ left: menu.pozycja.x, top: menu.pozycja.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="mvd-szablony-menu-pozycja"
            data-testid="mvd-szablony-menu-porownaj"
            disabled={!doPorownania.includes(menu.idSzablonu) && doPorownania.length >= 2}
            title={
              !doPorownania.includes(menu.idSzablonu) && doPorownania.length >= 2
                ? SZABLONY_STRINGS.menuPorownajPelne
                : undefined
            }
            onClick={() => przelaczPorownanie(menu.idSzablonu)}
          >
            {doPorownania.includes(menu.idSzablonu) ? SZABLONY_STRINGS.menuPorownajUsun : SZABLONY_STRINGS.menuPorownaj}
          </button>
          <button
            type="button"
            role="menuitem"
            className="mvd-szablony-menu-pozycja"
            data-testid="mvd-szablony-menu-wymagania"
            disabled={!onPokazWymaganiaDanych}
            title={!onPokazWymaganiaDanych ? SZABLONY_STRINGS.menuWymaganiaDanychNiedostepne : undefined}
            onClick={() => pokazWymagania(menu.idSzablonu)}
          >
            {SZABLONY_STRINGS.menuWymaganiaDanych}
          </button>
        </div>
      )}
    </div>
  );
}
