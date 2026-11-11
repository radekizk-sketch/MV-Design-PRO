/**
 * EkranZabezpieczenAutomatyki — ekran kanoniczny E-27 („Zabezpieczenia i automatyka").
 *
 * Karta OCHRONA-JEDNO-ZRODLO (ADR-022) i standard warsztatu (§10 kontraktu prezentacji
 * inżynierskiej): jedna zwarta tabela — sterownik zabezpieczeń = wiersz (pole rozdzielni albo
 * wyłącznik liniowy): urządzenie, funkcje, grupa aktywna, SPZ (funkcja 79). Rozwinięcie wiersza
 * („Nastawy") pokazuje edytor nastaw sterownika (funkcja = wiersz, grupy 1–4 jako przełącznik,
 * szczegóły na żądanie) — JEDYNY pisarz nastaw (`update_protection_settings`). Automatyka nie ma
 * osobnej sekcji: SPZ, SZR, LRW, SCO są funkcjami tego samego sterownika.
 *
 * Rama prowadząca: nagłówek z jednym zdaniem celu (§0.3), uczciwe stany zerowe (brak projektu,
 * brak pól i sterowników) z akcją prowadzącą, następny krok — koordynacja (E-28).
 *
 * ZERO fizyki, ZERO fabrykacji: wiersze z modelu (read model pola + migawka), nastawy rozwiązane
 * z read modelu `protection-view` (ta sama funkcja backendu co ocena).
 */

import './zabezpieczenia-automatyka.css';

import { Fragment, useEffect, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useFieldReadModel } from '../../../ui/field/useFieldReadModel';
import { useProtectionView } from '../../../ui/protection';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { EdytorNastawZabezpieczenia } from '../../kreatory/przekaznik';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useShellStore } from '../../shell/useShellStore';
import { buildWierszeZabezpieczen, type WierszZabezpieczenia } from './model';
import { ZABEZPIECZENIA_STRINGS as T } from './strings';

const LICZBA_KOLUMN = 7;

function StanZerowy({
  tytul,
  opis,
  akcja,
  onAkcja,
  testid,
}: {
  tytul: string;
  opis: string;
  akcja: string;
  onAkcja: () => void;
  testid: string;
}) {
  return (
    <div className="mvd-za-stan" data-testid={testid} data-tone="idle">
      <h3>{tytul}</h3>
      <p>{opis}</p>
      <button type="button" className="mvd-za-akcja" data-testid={`${testid}-akcja`} onClick={onAkcja}>
        {akcja}
      </button>
    </div>
  );
}

function opisSpz(w: WierszZabezpieczenia): string {
  if (!w.spz) return '—';
  return w.spz.wlaczone ? T.spzWlaczone(w.spz.cykle) : T.spzWylaczone;
}

/** Wyłączniki liniowe bez sterownika — prowadzenie do kreatorów przekładnika i sterownika. */
function WylacznikiBezSterownika() {
  const widok = useProtectionView();
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const wylaczniki = (widok.data.wylaczniki_liniowe ?? []).filter((w) => w.zabezpieczenia.length === 0);
  if (wylaczniki.length === 0) return null;
  return (
    <section className="mvd-za-sekcja" data-testid="mvd-za-wylaczniki">
      <h4>{T.wylacznikiTytul}</h4>
      <table className="mvd-za-tabela">
        <tbody>
          {wylaczniki.map((w) => (
            <tr key={w.ref_id} data-testid={`mvd-za-wylacznik-${w.ref_id}`}>
              <td>{w.nazwa ?? T.wylacznikBezNazwy}</td>
              <td>{T.wylacznikStanCt(w.przekladniki.length)}</td>
              <td>
                {w.przekladniki.length === 0 ? (
                  <button
                    type="button"
                    className="mvd-za-wiersz-akcja"
                    data-testid={`mvd-za-dodaj-ct-${w.ref_id}`}
                    onClick={() => openOperationForm('add_ct', { kotwica: 'wylacznik', breaker_ref: w.ref_id })}
                  >
                    {T.dodajPrzekladnik}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="mvd-za-wiersz-akcja"
                    data-testid={`mvd-za-dodaj-zabezpieczenie-${w.ref_id}`}
                    onClick={() => openOperationForm('add_relay', { kotwica: 'wylacznik', breaker_ref: w.ref_id })}
                  >
                    {T.dodajZabezpieczenie}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TabelaSterownikow({ wiersze }: { wiersze: readonly WierszZabezpieczenia[] }) {
  const widok = useProtectionView();
  const openInspectorPanel = useNetworkBuildStore((s) => s.openInspectorPanel);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const zSterownikiem = wiersze.filter((w) => w.sterownikRef !== null);
  // Ekran otwarty akcją „Uzupełnij” oceny zabezpieczeń: sterownik (`entityRef`) i funkcja
  // (`payload.funkcja_ref`) — wiersz rozwinięty, kursor w nastawie tej funkcji.
  const powierzchnia = useNetworkBuildStore((s) => s.activeSurface);
  const fokusSterownik = powierzchnia?.screenCode === 'E-27' ? powierzchnia.entityRef : null;
  const fokusFunkcja = fokusSterownik ? powierzchnia?.routeState.payload?.funkcja_ref : undefined;
  const fokusFunkcjaRef = typeof fokusFunkcja === 'string' ? fokusFunkcja : null;
  const kluczFokusu = zSterownikiem.find((w) => w.sterownikRef === fokusSterownik)?.klucz ?? null;
  // Jeden sterownik w modelu — rozwinięty od razu (zero kliknięć do nastaw); więcej — na żądanie.
  const [rozwiniete, setRozwiniete] = useState<ReadonlySet<string>>(
    () => new Set(zSterownikiem.length === 1 ? [zSterownikiem[0].klucz] : []),
  );
  useEffect(() => {
    if (kluczFokusu) setRozwiniete((r) => (r.has(kluczFokusu) ? r : new Set([...r, kluczFokusu])));
  }, [kluczFokusu]);
  const nastawyWgUrzadzenia = new Map(
    widok.data.assignments.filter((a) => a.nastawy).map((a) => [a.device_id, a.nastawy] as const),
  );
  const przelacz = (klucz: string) =>
    setRozwiniete((r) => {
      const n = new Set(r);
      if (n.has(klucz)) n.delete(klucz);
      else n.add(klucz);
      return n;
    });

  return (
    <section className="mvd-za-sekcja" data-testid="mvd-za-zabezpieczenia">
      <h4>{T.zabezpieczeniaTytul}</h4>
      {widok.error ? (
        <p className="mvd-za-pusto" role="alert" data-testid="mvd-za-nastawy-blad">
          {T.nastawyBlad}: {widok.error}
        </p>
      ) : null}
      <div className="mvd-za-tabela-scroll">
        <table className="mvd-za-tabela">
          <thead>
            <tr>
              <th>{T.kolStacja}</th>
              <th>{T.kolPole}</th>
              <th>{T.kolUrzadzenie}</th>
              <th>{T.kolFunkcje}</th>
              <th>{T.kolGrupa}</th>
              <th>{T.kolSpz}</th>
              <th>{T.kolAkcja}</th>
            </tr>
          </thead>
          <tbody>
            {wiersze.map((w) => {
              const otwarty = w.sterownikRef !== null && rozwiniete.has(w.klucz);
              return (
                <Fragment key={w.klucz}>
                  <tr data-testid={`mvd-za-wiersz-${w.klucz}`}>
                    <td data-testid={`mvd-za-stacja-${w.klucz}`}>{w.stacja ?? '—'}</td>
                    <td title={w.szablon ? T.szablonOpis(w.szablon, w.rodzina) : undefined}>{w.nazwa}</td>
                    <td>
                      {w.urzadzenie ?? (
                        <span className="mvd-za-brak" data-testid={`mvd-za-bez-zabezpieczenia-${w.klucz}`}>
                          {T.bezSterownika}
                        </span>
                      )}
                    </td>
                    <td className="mvd-za-kody" data-testid={`mvd-za-funkcje-${w.klucz}`}>
                      {w.funkcje.length > 0 ? w.funkcje.join(', ') : '—'}
                    </td>
                    <td className="mvd-num">{w.aktywnaGrupa ?? '—'}</td>
                    <td data-testid={`mvd-za-spz-${w.klucz}`}>{opisSpz(w)}</td>
                    <td className="mvd-za-akcje">
                      {w.sterownikRef !== null ? (
                        <button
                          type="button"
                          className="mvd-za-wiersz-akcja"
                          aria-expanded={otwarty}
                          title={T.nastawyOpis}
                          data-testid={`mvd-za-nastawy-${w.klucz}`}
                          onClick={() => przelacz(w.klucz)}
                        >
                          {otwarty ? T.nastawyZwin : T.nastawy}
                        </button>
                      ) : w.bayRef !== null ? (
                        <button
                          type="button"
                          className="mvd-za-wiersz-akcja"
                          data-testid={`mvd-za-dodaj-sterownik-${w.klucz}`}
                          onClick={() => openOperationForm('add_relay', { bay_ref: w.bayRef })}
                        >
                          {T.dodajSterownik}
                        </button>
                      ) : null}
                      {w.bayRef !== null ? (
                        <button
                          type="button"
                          className="mvd-za-wiersz-akcja"
                          title={T.otworzKartePolaOpis}
                          data-testid={`mvd-za-otworz-pole-${w.klucz}`}
                          onClick={() => openInspectorPanel('field_protection', w.bayRef as string, 'BaySN')}
                        >
                          {T.otworzKartePola}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {otwarty && w.sterownikRef !== null ? (
                    <tr className="mvd-za-edytor-wiersz">
                      <td colSpan={LICZBA_KOLUMN}>
                        <div className="mvd-za-edytor-tresc">
                        {widok.isLoading && !nastawyWgUrzadzenia.has(w.sterownikRef) ? (
                          <p className="mvd-za-pusto" data-testid="mvd-za-nastawy-ladowanie">
                            {T.nastawyLadowanie}
                          </p>
                        ) : null}
                        <EdytorNastawZabezpieczenia
                          urzadzenieRef={w.sterownikRef}
                          nastawy={nastawyWgUrzadzenia.get(w.sterownikRef)}
                          profile={widok.data.profile_charakterystyk ?? []}
                          fokusFunkcjaRef={w.sterownikRef === fokusSterownik ? fokusFunkcjaRef : null}
                          testid={`mvd-za-edytor-${w.sterownikRef}`}
                        />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function EkranZabezpieczenAutomatyki() {
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const { data } = useFieldReadModel();
  const migawka = useSnapshotStore((s) => s.snapshot);

  const wiersze = buildWierszeZabezpieczen(data.fields, migawka);

  return (
    <div className="mvd-za" data-testid="mvd-za">
      <header className="mvd-za-head">
        <span className="mvd-za-lbl">{T.eyebrow}</span>
        <p className="mvd-za-cel">{T.cel}</p>
      </header>

      {!activeProjectId ? (
        <StanZerowy
          tytul={T.brakProjektuTytul}
          opis={T.brakProjektuOpis}
          akcja={T.brakProjektuAkcja}
          onAkcja={() => setActiveSpace('projekt')}
          testid="mvd-za-brak-projektu"
        />
      ) : (
        <>
          {wiersze.length === 0 ? (
            <StanZerowy
              tytul={T.brakPolTytul}
              opis={T.brakPolOpis}
              akcja={T.brakPolAkcja}
              onAkcja={() => setActiveSpace('model')}
              testid="mvd-za-brak-pol"
            />
          ) : (
            <TabelaSterownikow wiersze={wiersze} />
          )}
          {/* Wyłączniki liniowe istnieją także bez pól rozdzielni. */}
          <WylacznikiBezSterownika />
          {wiersze.length > 0 ? (
            <div className="mvd-za-stopka">
              <span className="mvd-za-lbl">{T.nastepnyEyebrow}</span>
              <p>{T.nastepnyOpis}</p>
              <button
                type="button"
                className="mvd-za-nastepny"
                title={T.nastepnyAkcjaOpis}
                data-testid="mvd-za-nastepny"
                onClick={() => openRouteSurface('E-28')}
              >
                {T.nastepnyAkcja}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
