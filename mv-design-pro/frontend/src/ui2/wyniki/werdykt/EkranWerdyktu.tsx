/*
 * EKRAN „Werdykt projektowy" (karta F-K3, etap E7 flow projektanta).
 *
 * Naprawa znaleziska Z3 audytu FLOW: projektant nie miał JEDNEJ odpowiedzi na
 * pytanie „czy ten projekt spełnia wymagania i czego jeszcze brakuje?". Były
 * ekrany per analiza, każdy znający tylko własne kryterium.
 *
 * Kontrakt ekranu prowadzącego (docs/uiux/AUDYT_I_PROJEKT_FLOW_2026-07.md §9):
 *   1. cel jednym zdaniem — nagłówek,
 *   2. skąd dane — sekcja źródeł z aktualnością biegu wobec modelu,
 *   3. kryterium i norma — kolumna kryterium niesie warunek i odniesienie,
 *   4. trzy stany — spełnione / naruszone / NIESPRAWDZONE (nigdy dwa),
 *   6. akcja naprawcza z adresem — pętla decyzji do elementu wiodącego,
 *   7. jawny następny krok — opis werdyktu całościowego.
 *
 * ZERO fizyki i zero ocen własnych: wszystkie stany, liczniki i przyczyny
 * pochodzą z backendu (`/api/quality/design-verdict`).
 */

import { useEffect, useState } from 'react';

import { fetchWerdyktProjektowy, type WerdyktResponse } from './api';
import {
  klasaStanu,
  przyczynaPL,
  rodzajPrzekroczeniaKryterium,
  stanPL,
  stanZrodlaPL,
  typElementuKryterium,
  werdyktOpisPL,
  werdyktPL,
  zakresOcenyPL,
  zrodloPL,
} from './werdyktModel';
import { WERDYKT_STRINGS as T } from './strings';
import {
  PrzyciskAkcjiStanu,
  akcjaNaprawcza,
  useAkcjaPrzejdzDoPrzypadkow,
  usePoprawWModelu,
} from '../wzorzec';
import { useAppStateStore } from '../../../ui/app-state';
import './werdykt.css';
import { TekstZWzorami } from '../../kreatory/rama';

export function EkranWerdyktu() {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const poprawWModelu = usePoprawWModelu();
  // K6 / H-5: werdykt zestawia kryteria PRZYPADKU — bez aktywnego zakresu
  // obliczeń jedyny realny krok to jego wybór w przestrzeni „Obliczenia".
  const akcjaPrzypadki = useAkcjaPrzejdzDoPrzypadkow();
  const [dane, setDane] = useState<WerdyktResponse | null>(null);
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
    fetchWerdyktProjektowy(activeCaseId)
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

  return (
    <section className="mvd-werdykt" data-testid="mvd-werdykt">
      <header className="mvd-werdykt-head">
        <h2 className="mvd-werdykt-title">{T.tytul}</h2>
        <p className="mvd-werdykt-cel">{T.cel}</p>
      </header>

      {!activeCaseId && (
        <div className="mvd-werdykt-pusty" data-testid="mvd-werdykt-brak-przypadku">
          <p className="mvd-werdykt-pusty-glowny">{T.brakPrzypadku}</p>
          <p className="mvd-werdykt-pusty-krok">{T.brakPrzypadkuKrok}</p>
          <PrzyciskAkcjiStanu akcja={akcjaPrzypadki} testid="mvd-werdykt-brak-przypadku" />
        </div>
      )}

      {activeCaseId && ladowanie && !dane && (
        <p className="mvd-werdykt-ladowanie" data-testid="mvd-werdykt-ladowanie">
          {T.ladowanie}
        </p>
      )}

      {blad && (
        <p className="mvd-werdykt-blad" role="alert" data-testid="mvd-werdykt-blad">
          {blad}
        </p>
      )}

      {dane && (
        <>
          <div
            className={`mvd-werdykt-glowny ${klasaStanu(dane.werdykt)}`}
            data-testid="mvd-werdykt-glowny"
          >
            <strong className="mvd-werdykt-glowny-etykieta">{werdyktPL(dane.werdykt)}</strong>
            <span className="mvd-werdykt-glowny-opis">{werdyktOpisPL(dane.werdykt)}</span>
            <span className="mvd-werdykt-glowny-liczby mvd-num" data-testid="mvd-werdykt-podsumowanie">
              {T.podsumowanie(dane.podsumowanie)}
            </span>
          </div>

          <section className="mvd-werdykt-zrodla" data-testid="mvd-werdykt-zrodla">
            <h3 className="mvd-werdykt-podtytul">{T.zrodlaTytul}</h3>
            <ul className="mvd-werdykt-zrodla-lista">
              {dane.zrodla.map((zrodlo) => (
                <li
                  key={zrodlo.rodzaj}
                  className={
                    zrodlo.dostepny && zrodlo.aktualny
                      ? 'mvd-werdykt-zrodlo'
                      : 'mvd-werdykt-zrodlo mvd-werdykt-zrodlo-uwaga'
                  }
                  data-testid={`mvd-werdykt-zrodlo-${zrodlo.rodzaj}`}
                >
                  <span className="mvd-werdykt-zrodlo-nazwa">{zrodloPL(zrodlo.rodzaj)}</span>
                  <span className="mvd-werdykt-zrodlo-stan">{stanZrodlaPL(zrodlo)}</span>
                </li>
              ))}
            </ul>
          </section>

          <table className="mvd-werdykt-tabela" aria-label={T.ariaTabela}>
            <thead>
              <tr>
                <th scope="col">{T.kolEtap}</th>
                <th scope="col">{T.kolKryterium}</th>
                <th scope="col">{T.kolStan}</th>
                <th scope="col">{T.kolZakres}</th>
                <th scope="col">{T.kolPrzyczyna}</th>
                <th scope="col">{T.kolDecyzja}</th>
              </tr>
            </thead>
            <tbody>
              {dane.pozycje.map((pozycja) => {
                const typElementu = typElementuKryterium(pozycja);
                const rodzaj = rodzajPrzekroczeniaKryterium(pozycja);
                const pokazDecyzje =
                  typElementu !== null &&
                  pozycja.wiodacy_element_id !== null &&
                  (pozycja.stan === 'NARUSZONE' || pozycja.stan === 'NIESPRAWDZONE');
                return (
                  <tr
                    key={pozycja.kryterium_id}
                    className={klasaStanu(pozycja.stan)}
                    data-testid={`mvd-werdykt-pozycja-${pozycja.kryterium_id}`}
                  >
                    <td className="mvd-werdykt-etap">{pozycja.etap}</td>
                    <td className="mvd-werdykt-kryterium">
                      <span className="mvd-werdykt-kryterium-nazwa">{pozycja.nazwa_pl}</span>
                      <span className="mvd-werdykt-kryterium-warunek mvd-num">
                        {/* Warunek kryterialny z backendu: wzory inline `$...$` → KaTeX. */}
                        <TekstZWzorami tekst={pozycja.warunek_pl} />
                      </span>
                      <span className="mvd-werdykt-kryterium-norma">{pozycja.norma_pl}</span>
                    </td>
                    <td className="mvd-werdykt-stan" data-testid="mvd-werdykt-stan">
                      {stanPL(pozycja.stan)}
                    </td>
                    <td className="mvd-werdykt-zakres mvd-num">{zakresOcenyPL(pozycja)}</td>
                    <td className="mvd-werdykt-przyczyna">
                      {pozycja.wiodacy_element_id && (
                        <span className="mvd-werdykt-element mvd-num">
                          {pozycja.wiodacy_element_id}
                        </span>
                      )}
                      <span className="mvd-werdykt-przyczyna-opis">{przyczynaPL(pozycja)}</span>
                    </td>
                    <td className="mvd-werdykt-decyzja">
                      {pokazDecyzje && (
                        <button
                          type="button"
                          className="mvd-werdykt-popraw"
                          data-testid="mvd-werdykt-popraw"
                          title={akcjaNaprawcza(rodzaj).opis}
                          onClick={() =>
                            poprawWModelu(
                              pozycja.wiodacy_element_id as string,
                              typElementu,
                              pozycja.wiodacy_element_id as string,
                              rodzaj,
                            )
                          }
                        >
                          {akcjaNaprawcza(rodzaj).etykieta}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <section className="mvd-werdykt-zakres-sekcja" data-testid="mvd-werdykt-zakres">
            <h3 className="mvd-werdykt-podtytul">{T.zakresTytul}</h3>
            <p className="mvd-werdykt-zakres-opis">{T.zakresOpis}</p>
            <ul className="mvd-werdykt-zakres-lista">
              {dane.zakres_poza_automatem.map((wpis) => (
                <li key={wpis.kryterium_pl} className="mvd-werdykt-zakres-wpis">
                  <span className="mvd-werdykt-etap">{wpis.etap}</span>
                  <span className="mvd-werdykt-zakres-nazwa">{wpis.kryterium_pl}</span>
                  <span className="mvd-werdykt-zakres-powod">{wpis.powod_pl}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
