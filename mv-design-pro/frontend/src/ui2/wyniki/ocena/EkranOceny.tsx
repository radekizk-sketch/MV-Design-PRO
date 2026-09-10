/*
 * EKRAN „Ocena techniczna wyników" (karta B-02 / W3-E, dyrektywa właściciela
 * 2026-09-10) — następca ekranu „Werdykt projektowy" (F-K3) i huba „Analizy
 * techniczne" (E-35). Odpowiada na pytanie: „CO z obliczenia wynika i NA JAKIEJ
 * PODSTAWIE tak oceniono?".
 *
 * Układ (prompt §4):
 *   1. PODSTAWA OCENY — projekt, przypadek obliczeniowy, wariant pracy, rewizja
 *      modelu, przebiegi (identyfikator, stan ZAKOŃCZONY, czas, aktualność),
 *      pakiet wyników;
 *   2. PODSUMOWANIE — OCENIONO n · SPEŁNIA WYMAGANIA n · NIE SPEŁNIA WYMAGAŃ n ·
 *      BRAK PODSTAW DO OCENY n (liczniki per element z backendu);
 *   3. POZYCJE OCENY w grupach znaczeniowych (wyłącznie grupy z wynikami):
 *      PRZEDMIOT · WIELKOŚĆ · WARTOŚĆ OBLICZONA · WARTOŚĆ ODNIESIENIA · MARGINES ·
 *      PODSTAWA OCENY · WYNIK OCENY · WNIOSEK — z powiązaniami: schemat (SLD),
 *      identyfikator w modelu, dowód obliczeń (przebieg + element);
 *   4. kryteria bez podstawy do oceny (z powodem) i kryteria poza oceną automatyczną;
 *   5. stan blokujący BRAK WYNIKÓW DO OCENY, gdy nie ma zakończonego, aktualnego
 *      przebiegu — z przejściem do obliczeń.
 *
 * ZERO fizyki i zero ocen własnych: wszystkie wyniki, liczniki, marginesy i wnioski
 * pochodzą z backendu (`/api/quality/design-verdict`). Kolory tylko tokenami `--mvd-*`.
 */

import { useEffect, useState } from 'react';

import { fetchOcenaTechniczna, type OcenaElementu, type OdpowiedzOceny, type PozycjaOceny } from './api';
import {
  czasWykonaniaPL,
  czyBrakWynikow,
  elementNaSchemacie,
  fmtMargines,
  fmtOdniesienie,
  fmtWartoscZJednostka,
  grupyZWynikami,
  klasaWyniku,
  nazwaPrzedmiotu,
  ocenaCalosciowaPL,
  pakietWynikowPL,
  podstawaOcenyPL,
  pozycjeBezPodstaw,
  rodzajPrzekroczeniaKryterium,
  stanPrzebieguPL,
  typElementu,
  wynikPL,
  zrodloPL,
} from './model';
import { OCENA_STRINGS as T } from './strings';
import {
  PrzyciskAkcjiStanu,
  akcjaNaprawcza,
  useAkcjaPrzejdzDoPrzypadkow,
  usePoprawWModelu,
} from '../wzorzec';
import { useAppStateStore } from '../../../ui/app-state';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { TekstZWzorami } from '../../kreatory/rama';
import './ocena.css';

export interface EkranOcenyProps {
  /** Tryb zaawansowania — identyfikatory modelu i przebiegów tylko w trybie eksperckim. */
  readonly trybZaawansowania?: AdvancementMode;
  /** Otwarcie dowodu obliczeń wskazanego przebiegu dla elementu (zakładka „Dowód obliczeń"). */
  readonly onOtworzDowod?: (elementRef: string, runId: string) => void;
}

function WierszPodstawy({ etykieta, children, testid }: { etykieta: string; children: React.ReactNode; testid?: string }) {
  return (
    <div className="mvd-ocena-podstawa-wiersz" data-testid={testid}>
      <span className="mvd-ocena-podstawa-etyk">{etykieta}</span>
      <span className="mvd-ocena-podstawa-wartosc">{children}</span>
    </div>
  );
}

function PodstawaOceny({ dane, trybEkspercki }: { dane: OdpowiedzOceny; trybEkspercki: boolean }) {
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);
  const rewizja = useSnapshotStore((s) => s.snapshot?.header.revision ?? null);
  const przebiegi = dane.zrodla.filter((zrodlo) => zrodlo.rodzaj !== 'model');
  return (
    <section className="mvd-ocena-podstawa" data-testid="mvd-ocena-podstawa" aria-label={T.podstawaTytul}>
      <h3 className="mvd-ocena-podtytul">{T.podstawaTytul}</h3>
      <div className="mvd-ocena-podstawa-siatka">
        <WierszPodstawy etykieta={T.podstawaProjekt}>{activeProjectName ?? T.marginesBrak}</WierszPodstawy>
        <WierszPodstawy etykieta={T.podstawaPrzypadek}>{activeCaseName ?? T.marginesBrak}</WierszPodstawy>
        <WierszPodstawy etykieta={T.podstawaWariant}>{T.podstawaWariantOpis}</WierszPodstawy>
        <WierszPodstawy etykieta={T.podstawaRewizja} testid="mvd-ocena-rewizja">
          {rewizja !== null ? <span className="mvd-num">{rewizja}</span> : T.marginesBrak}
          {' · '}
          {T.podstawaOdcisk} <span className="mvd-num">{dane.model_hash.slice(0, 12)}</span>
        </WierszPodstawy>
        <WierszPodstawy etykieta={T.podstawaPakiet} testid="mvd-ocena-pakiet">
          {pakietWynikowPL(dane.zrodla)}
        </WierszPodstawy>
      </div>
      <ul className="mvd-ocena-przebiegi" aria-label={T.podstawaPrzebiegi}>
        {przebiegi.map((zrodlo) => (
          <li
            key={zrodlo.rodzaj}
            className={
              zrodlo.dostepny && zrodlo.aktualny
                ? 'mvd-ocena-przebieg'
                : 'mvd-ocena-przebieg mvd-ocena-przebieg--uwaga'
            }
            data-testid={`mvd-ocena-przebieg-${zrodlo.rodzaj}`}
          >
            <span className="mvd-ocena-przebieg-nazwa">{zrodloPL(zrodlo.rodzaj)}</span>
            <span className="mvd-ocena-przebieg-stan">{stanPrzebieguPL(zrodlo)}</span>
            {zrodlo.run_id !== null && (
              <span className="mvd-ocena-przebieg-meta">
                {T.przebiegCzas}: <span className="mvd-num">{czasWykonaniaPL(zrodlo.wykonano)}</span>
                {trybEkspercki && (
                  <>
                    {' · '}
                    {T.przebiegIdentyfikator}: <span className="mvd-num">{zrodlo.run_id}</span>
                  </>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Podsumowanie({ dane }: { dane: OdpowiedzOceny }) {
  const liczniki = dane.ocena;
  return (
    <section className="mvd-ocena-podsumowanie" data-testid="mvd-ocena-podsumowanie" aria-label={T.podsumowanieTytul}>
      <div className="mvd-ocena-liczniki">
        <span className="mvd-ocena-licznik" data-testid="mvd-ocena-licznik-oceniono">
          <span className="mvd-ocena-licznik-etyk">{T.oceniono}</span>
          <span className="mvd-ocena-licznik-liczba mvd-num">{liczniki.oceniono}</span>
        </span>
        <span className="mvd-ocena-licznik mvd-ocena-licznik--spelnia" data-testid="mvd-ocena-licznik-spelnia">
          <span className="mvd-ocena-licznik-etyk">{T.spelnia}</span>
          <span className="mvd-ocena-licznik-liczba mvd-num">{liczniki.spelnia}</span>
        </span>
        <span className="mvd-ocena-licznik mvd-ocena-licznik--nie-spelnia" data-testid="mvd-ocena-licznik-nie-spelnia">
          <span className="mvd-ocena-licznik-etyk">{T.nieSpelnia}</span>
          <span className="mvd-ocena-licznik-liczba mvd-num">{liczniki.nie_spelnia}</span>
        </span>
        <span className="mvd-ocena-licznik mvd-ocena-licznik--brak" data-testid="mvd-ocena-licznik-brak-podstaw">
          <span className="mvd-ocena-licznik-etyk">{T.brakPodstaw}</span>
          <span className="mvd-ocena-licznik-liczba mvd-num">{liczniki.brak_podstaw}</span>
        </span>
      </div>
      <p className="mvd-ocena-calosciowa" data-testid="mvd-ocena-calosciowa">
        {ocenaCalosciowaPL(dane)}
      </p>
    </section>
  );
}

function WierszElementu({
  element,
  pozycja,
  trybEkspercki,
  onOtworzDowod,
}: {
  element: OcenaElementu;
  pozycja: PozycjaOceny;
  trybEkspercki: boolean;
  onOtworzDowod?: (elementRef: string, runId: string) => void;
}) {
  const poprawWModelu = usePoprawWModelu();
  const naSchemacie = elementNaSchemacie(element, pozycja);
  const rodzajPrzekroczenia = rodzajPrzekroczeniaKryterium(pozycja);
  const akcjaSchematu =
    element.wynik === 'NIE_SPELNIA' ? akcjaNaprawcza(rodzajPrzekroczenia) : akcjaNaprawcza('inspekcja-elementu');
  const typ = typElementu(element.element_rodzaj ?? pozycja.element_rodzaj);
  const nazwa = nazwaPrzedmiotu(element);
  return (
    <tr
      className={`mvd-ocena-wiersz ${klasaWyniku(element.wynik)}`}
      data-testid={`mvd-ocena-element-${pozycja.kryterium_id}-${element.element_id ?? 'agregat'}`}
      data-wynik={element.wynik}
    >
      <td className="mvd-ocena-przedmiot">
        <span className="mvd-ocena-przedmiot-nazwa">{nazwa}</span>
        {trybEkspercki && element.element_id !== null && (
          <span className="mvd-ocena-przedmiot-id mvd-num" title={T.identyfikatorModelu}>
            {element.element_id}
          </span>
        )}
      </td>
      <td className="mvd-ocena-wielkosc">
        {pozycja.wielkosc_pl}
        {pozycja.symbol !== '' && (
          <>
            {' '}
            <span className="mvd-num">{pozycja.symbol}</span>
          </>
        )}
      </td>
      <td className="mvd-num">{fmtWartoscZJednostka(element.wartosc, element.jednostka || pozycja.jednostka)}</td>
      <td className="mvd-num">{fmtOdniesienie(element, pozycja)}</td>
      <td className="mvd-num">{fmtMargines(element)}</td>
      <td className="mvd-ocena-podstawa-kryterium">
        <TekstZWzorami tekst={podstawaOcenyPL(pozycja)} />
      </td>
      <td className="mvd-ocena-wynik" data-testid="mvd-ocena-wynik">
        {wynikPL(element.wynik)}
      </td>
      <td className="mvd-ocena-wniosek">
        <span>{element.wniosek_pl}</span>
        {element.uwaga_pl && <span className="mvd-ocena-uwaga">{element.uwaga_pl}</span>}
        {element.wynik === 'BRAK_PODSTAW' && element.uzasadnienie_pl && (
          <span className="mvd-ocena-uwaga">{element.uzasadnienie_pl}</span>
        )}
      </td>
      <td className="mvd-ocena-dzialania">
        {naSchemacie && typ !== null && element.element_id !== null && (
          <button
            type="button"
            className="mvd-ocena-akcja"
            data-testid="mvd-ocena-pokaz"
            title={akcjaSchematu.opis}
            onClick={() =>
              poprawWModelu(
                element.element_id as string,
                typ,
                nazwa,
                element.wynik === 'NIE_SPELNIA' ? rodzajPrzekroczenia : 'inspekcja-elementu',
              )
            }
          >
            {akcjaSchematu.etykieta}
          </button>
        )}
        {element.dowod !== null && onOtworzDowod !== undefined && (
          <button
            type="button"
            className="mvd-ocena-akcja"
            data-testid="mvd-ocena-dowod"
            title={T.dowodObliczenOpis}
            onClick={() => onOtworzDowod(element.dowod!.element_id, element.dowod!.run_id)}
          >
            {T.dowodObliczen}
          </button>
        )}
      </td>
    </tr>
  );
}

function TabelaPozycji({
  pozycja,
  trybEkspercki,
  onOtworzDowod,
}: {
  pozycja: PozycjaOceny;
  trybEkspercki: boolean;
  onOtworzDowod?: (elementRef: string, runId: string) => void;
}) {
  return (
    <div className="mvd-ocena-pozycja" data-testid={`mvd-ocena-pozycja-${pozycja.kryterium_id}`}>
      <div className="mvd-ocena-pozycja-glowa">
        <span className="mvd-ocena-etap">{pozycja.etap}</span>
        <h4 className="mvd-ocena-pozycja-tytul">{pozycja.nazwa_pl}</h4>
        <span className="mvd-ocena-pozycja-licznik mvd-num">{T.liczbaElementow(pozycja.elementy.length)}</span>
      </div>
      <div className="mvd-ocena-tabela-otoczka">
        <table className="mvd-ocena-tabela" aria-label={T.ariaPozycje}>
          <thead>
            <tr>
              <th scope="col">{T.kolPrzedmiot}</th>
              <th scope="col">{T.kolWielkosc}</th>
              <th scope="col">{T.kolWartosc}</th>
              <th scope="col">{T.kolOdniesienie}</th>
              <th scope="col">{T.kolMargines}</th>
              <th scope="col">{T.kolPodstawa}</th>
              <th scope="col">{T.kolWynik}</th>
              <th scope="col">{T.kolWniosek}</th>
              <th scope="col">{T.kolDzialania}</th>
            </tr>
          </thead>
          <tbody>
            {pozycja.elementy.map((element, indeks) => (
              <WierszElementu
                key={`${element.element_id ?? 'agregat'}:${indeks}`}
                element={element}
                pozycja={pozycja}
                trybEkspercki={trybEkspercki}
                onOtworzDowod={onOtworzDowod}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EkranOceny({ trybZaawansowania = 'basic', onOtworzDowod }: EkranOcenyProps) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');
  const akcjaPrzypadki = useAkcjaPrzejdzDoPrzypadkow();
  const [dane, setDane] = useState<OdpowiedzOceny | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [ladowanie, setLadowanie] = useState(false);

  useEffect(() => {
    if (!activeCaseId) {
      setDane(null);
      setBlad(null);
      return;
    }
    let anulowane = false;
    setLadowanie(true);
    setBlad(null);
    fetchOcenaTechniczna(activeCaseId)
      .then((odpowiedz) => {
        if (anulowane) return;
        setDane(odpowiedz);
      })
      .catch((e: unknown) => {
        if (anulowane) return;
        setDane(null);
        setBlad(e instanceof Error ? e.message : T.bladDomyslny);
      })
      .finally(() => {
        if (!anulowane) setLadowanie(false);
      });
    return () => {
      anulowane = true;
    };
  }, [activeCaseId]);

  const akcjaObliczenia = {
    etykieta: T.przejdzDoObliczen,
    opis: T.przejdzDoObliczenOpis,
    onKlik: akcjaPrzypadki.onKlik,
  };

  return (
    <section className="mvd-ocena" data-testid="mvd-ocena">
      <header className="mvd-ocena-head">
        <h2 className="mvd-ocena-title">{T.tytul}</h2>
        <p className="mvd-ocena-cel">{T.cel}</p>
      </header>

      {!activeCaseId && (
        <div className="mvd-ocena-pusty" data-testid="mvd-ocena-brak-przypadku">
          <p className="mvd-ocena-pusty-glowny">{T.brakPrzypadku}</p>
          <p className="mvd-ocena-pusty-krok">{T.brakPrzypadkuKrok}</p>
          <PrzyciskAkcjiStanu akcja={akcjaPrzypadki} testid="mvd-ocena-brak-przypadku" />
        </div>
      )}

      {activeCaseId && ladowanie && !dane && (
        <p className="mvd-ocena-ladowanie" data-testid="mvd-ocena-ladowanie">
          {T.ladowanie}
        </p>
      )}

      {blad && (
        <p className="mvd-ocena-blad" role="alert" data-testid="mvd-ocena-blad">
          {blad}
        </p>
      )}

      {dane && czyBrakWynikow(dane) && (
        <>
          <div className="mvd-ocena-blokada" data-testid="mvd-ocena-brak-wynikow">
            <strong className="mvd-ocena-blokada-tytul">{T.brakWynikowTytul}</strong>
            <p className="mvd-ocena-blokada-opis">{T.brakWynikowOpis}</p>
            <PodstawaOceny dane={dane} trybEkspercki={trybEkspercki} />
            <PrzyciskAkcjiStanu akcja={akcjaObliczenia} testid="mvd-ocena-brak-wynikow" />
          </div>
          <ZakresPozaAutomatem dane={dane} />
        </>
      )}

      {dane && !czyBrakWynikow(dane) && (
        <>
          <PodstawaOceny dane={dane} trybEkspercki={trybEkspercki} />
          <Podsumowanie dane={dane} />

          {grupyZWynikami(dane).map((grupa) => (
            <section className="mvd-ocena-grupa" key={grupa.kod} data-testid={`mvd-ocena-grupa-${grupa.kod}`}>
              <h3 className="mvd-ocena-grupa-tytul">{grupa.nazwa}</h3>
              {grupa.pozycje.map((pozycja) => (
                <TabelaPozycji
                  key={pozycja.kryterium_id}
                  pozycja={pozycja}
                  trybEkspercki={trybEkspercki}
                  onOtworzDowod={onOtworzDowod}
                />
              ))}
            </section>
          ))}

          {pozycjeBezPodstaw(dane).length > 0 && (
            <section className="mvd-ocena-bez-podstaw" data-testid="mvd-ocena-bez-podstaw">
              <h3 className="mvd-ocena-podtytul">{T.bezPodstawTytul}</h3>
              <p className="mvd-ocena-zakres-opis">{T.bezPodstawOpis}</p>
              <ul className="mvd-ocena-zakres-lista">
                {pozycjeBezPodstaw(dane).map((pozycja) => (
                  <li
                    key={pozycja.kryterium_id}
                    className="mvd-ocena-zakres-wpis"
                    data-testid={`mvd-ocena-bez-podstaw-${pozycja.kryterium_id}`}
                  >
                    <span className="mvd-ocena-etap">{pozycja.etap}</span>
                    <span className="mvd-ocena-zakres-nazwa">{pozycja.nazwa_pl}</span>
                    <span className="mvd-ocena-zakres-powod">
                      {pozycja.powod_pl ?? pozycja.wiodacy_opis_pl ?? T.wynikBrakPodstaw}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ZakresPozaAutomatem dane={dane} />
        </>
      )}
    </section>
  );
}

function ZakresPozaAutomatem({ dane }: { dane: OdpowiedzOceny }) {
  if (dane.zakres_poza_automatem.length === 0) return null;
  return (
    <section className="mvd-ocena-zakres-sekcja" data-testid="mvd-ocena-zakres">
      <h3 className="mvd-ocena-podtytul">{T.zakresTytul}</h3>
      <p className="mvd-ocena-zakres-opis">{T.zakresOpis}</p>
      <ul className="mvd-ocena-zakres-lista">
        {dane.zakres_poza_automatem.map((wpis) => (
          <li key={wpis.kryterium_pl} className="mvd-ocena-zakres-wpis">
            <span className="mvd-ocena-etap">{wpis.etap}</span>
            <span className="mvd-ocena-zakres-nazwa">{wpis.kryterium_pl}</span>
            <span className="mvd-ocena-zakres-powod">{wpis.powod_pl}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
