/*
 * Elementy prezentacji WYNIKU WYJAŚNIALNEGO (karta AB-1a D2): podstawa strukturalna
 * z odznaką statusu źródła, dwie odznaki statusu modelu i sekcja „Szczegóły wyniku"
 * (punkt krytyczny, przyczyna, status modelu, jakość wejścia, niepewność, zakres
 * ważności). JEDNO miejsce prezentacji tych pól — konsumenci: ekran „Ocena techniczna
 * wyników" (łańcuch podstawa → wynik → odniesienie → ocena → wniosek → dowód),
 * szczegół werdyktu macierzy NC RfG i ekran ochrony od pracy wyspowej.
 *
 * ZERO fizyki, ZERO ocen: wyłącznie render pól z backendu; pole `null` = brak (w
 * sekcji szczegółów pole nieobecne nie jest renderowane, a cała sekcja pojawia się
 * wyłącznie, gdy dostawca podał choć jedno pole).
 */

import type {
  OcenaElementu,
  PodstawaNormatywnaOdpowiedz,
  StatusModeluOdpowiedz,
} from './api';
import {
  czesciPodstawy,
  czyZrodloNiezweryfikowane,
  fmtNiepewnosc,
  fmtPrzyczyna,
  fmtPunktKrytyczny,
  fmtZakresWaznosci,
  maSzczegolyWyniku,
  statusParametrowPL,
  statusRownanPL,
  statusWejsciaPL,
} from './model';
import { OCENA_STRINGS as T } from './strings';
import './wynik.css';

/** Odznaka statusu źródła podstawy (niezweryfikowane = ostrzeżenie). */
export function OdznakaZrodla({
  podstawa,
  testid,
}: {
  podstawa: PodstawaNormatywnaOdpowiedz;
  testid: string;
}) {
  const niezweryfikowane = czyZrodloNiezweryfikowane(podstawa);
  return (
    <span
      className={
        niezweryfikowane
          ? 'mvd-wynik-odznaka mvd-wynik-odznaka--uwaga'
          : 'mvd-wynik-odznaka mvd-wynik-odznaka--ok'
      }
      data-testid={`${testid}-zrodlo`}
      title={niezweryfikowane ? T.zrodloNiezweryfikowaneOpis : undefined}
    >
      {niezweryfikowane ? T.zrodloNiezweryfikowane : T.zrodloZweryfikowane}
    </span>
  );
}

/** Podstawa strukturalna: dokument · wersja · klauzula + odznaka źródła + uwaga. */
export function PodstawaStrukturalna({
  podstawa,
  testid,
}: {
  podstawa: PodstawaNormatywnaOdpowiedz;
  testid: string;
}) {
  const czesci = czesciPodstawy(podstawa);
  return (
    <div className="mvd-wynik-podstawa" data-testid={testid}>
      <span className="mvd-wynik-podstawa-dokument">
        {czesci.length > 0 ? czesci.join(' · ') : T.podstawaBrakDokumentu}
      </span>{' '}
      <OdznakaZrodla podstawa={podstawa} testid={testid} />
      {podstawa.uwaga_pl && (
        <span className="mvd-wynik-podstawa-uwaga" data-testid={`${testid}-uwaga`}>
          {podstawa.uwaga_pl}
        </span>
      )}
    </div>
  );
}

/** Dwie odznaki statusu modelu: oś równań i oś parametrów. */
export function OdznakiStatusuModelu({
  status,
  testid,
}: {
  status: StatusModeluOdpowiedz;
  testid: string;
}) {
  return (
    <span className="mvd-wynik-status-modelu" data-testid={testid}>
      <span
        className={
          status.rownania === 'VALIDATED'
            ? 'mvd-wynik-odznaka mvd-wynik-odznaka--ok'
            : 'mvd-wynik-odznaka mvd-wynik-odznaka--uwaga'
        }
        data-testid={`${testid}-rownania`}
        title={T.osRownan}
      >
        {statusRownanPL(status.rownania)}
      </span>
      <span
        className={
          status.parametry === 'MODEL_ZWALIDOWANY_POMIAREM'
            ? 'mvd-wynik-odznaka mvd-wynik-odznaka--ok'
            : 'mvd-wynik-odznaka mvd-wynik-odznaka--uwaga'
        }
        data-testid={`${testid}-parametry`}
        title={T.osParametrow}
      >
        {statusParametrowPL(status.parametry)}
      </span>
    </span>
  );
}

/** Sekcja „Szczegóły wyniku" elementu — tylko pola, które dostawca podał. */
export function SzczegolyWyniku({
  element,
  trybEkspercki,
  testid,
}: {
  element: OcenaElementu;
  trybEkspercki: boolean;
  testid: string;
}) {
  const krokSladu = element.dowod?.trace_ref ?? null;
  if (!maSzczegolyWyniku(element) && !(trybEkspercki && krokSladu !== null)) return null;
  return (
    <dl className="mvd-wynik-szczegoly" data-testid={testid} aria-label={T.szczegolyWyniku}>
      {element.punkt_krytyczny !== null && (
        <div className="mvd-wynik-szczegoly-para" data-testid={`${testid}-punkt`}>
          <dt>{T.punktKrytyczny}</dt>
          <dd className="mvd-num">{fmtPunktKrytyczny(element.punkt_krytyczny)}</dd>
        </div>
      )}
      {element.przyczyna !== null && (
        <div className="mvd-wynik-szczegoly-para" data-testid={`${testid}-przyczyna`}>
          <dt>{T.przyczyna}</dt>
          <dd>{fmtPrzyczyna(element.przyczyna)}</dd>
        </div>
      )}
      {element.status_modelu !== null && (
        <div className="mvd-wynik-szczegoly-para">
          <dt>{T.statusModelu}</dt>
          <dd>
            <OdznakiStatusuModelu status={element.status_modelu} testid={`${testid}-status-modelu`} />
          </dd>
        </div>
      )}
      {element.status_wejscia !== null && (
        <div className="mvd-wynik-szczegoly-para" data-testid={`${testid}-wejscie`}>
          <dt>{T.statusWejscia}</dt>
          <dd>{statusWejsciaPL(element.status_wejscia)}</dd>
        </div>
      )}
      {element.niepewnosc !== null && (
        <div className="mvd-wynik-szczegoly-para" data-testid={`${testid}-niepewnosc`}>
          <dt>{T.niepewnosc}</dt>
          <dd className="mvd-num">{fmtNiepewnosc(element.niepewnosc)}</dd>
        </div>
      )}
      {element.zakres_waznosci !== null && (
        <div className="mvd-wynik-szczegoly-para" data-testid={`${testid}-zakres`}>
          <dt>{T.zakresWaznosci}</dt>
          <dd>{fmtZakresWaznosci(element.zakres_waznosci)}</dd>
        </div>
      )}
      {trybEkspercki && krokSladu !== null && (
        <div className="mvd-wynik-szczegoly-para" data-testid={`${testid}-slad`}>
          <dt>{T.krokSladu}</dt>
          <dd className="mvd-num">{krokSladu}</dd>
        </div>
      )}
    </dl>
  );
}
