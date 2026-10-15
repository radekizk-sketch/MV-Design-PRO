/*
 * Sekcja inspektora „Obliczenia kabla nN" (karta OBIEKT-KABEL-NN) — kabel nN jako obiekt
 * projektowy: wielkości odcinka, osiem sprawdzeń z odczytem technicznym, warunki ułożenia
 * edytowane w miejscu, porównanie wariantów przekroju z wyborem typu i dowód obwodu nN.
 *
 * ZERO fizyki w UI: każda liczba, margines, ocena techniczna i podstawienie pochodzi
 * z backendu (`GET /api/cases/{case}/enm/nn-cable…`). Wzory renderuje `MathRenderer`
 * z pól `*_latex`. Pierwszy plan = kryterium · wynik wobec limitu · podstawa · ocena
 * techniczna (hierarchia V12K-351); status maszynowy, etykieta zgodności i powody
 * niepełności dowodu — wyłącznie w szczegółach wiersza, identyfikatory biegu i odcisk
 * modelu — wyłącznie w zwiniętych „Informacjach audytowych" trybu eksperckiego.
 *
 * Zapis: warunki ułożenia — operacja `set_nn_cable_laying_conditions`; wybór wariantu —
 * `assign_catalog_to_element` z wiązaniem katalogowym wiersza (ten sam tor co wybór typu
 * w katalogu). Zmiana modelu podnosi rewizję migawki → sekcja liczy się na nowo i pokazuje
 * skutek zmiany (wielkości przed → po, oba z backendu).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import '../theme/tokens.css';
import './kabelNn.css';

import { MathBlock, MathInline } from '../../ui/proof/MathRenderer';
import { useAppStateStore } from '../../ui/app-state';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { formatPolishValue } from '../../ui/shared/formatPolishValue';
import { KartaWerdyktu, SEMANTYKA_KOLOR } from '../wyniki/wzorzec/KartaWerdyktu';
import { InformacjeAudytowe } from '../wyniki/wzorzec/InformacjeAudytowe';
import { useAkcjaUruchomObliczenie } from '../wyniki/wzorzec/akcjeStanuZerowego';
import {
  adresPakietuDowoduObwoduNn,
  czyObliczeniaOk,
  pobierzDowodObwoduNn,
  pobierzObliczeniaKablaNn,
  pobierzWariantyPrzekroju,
  type DowodObwoduNn,
  type KrokSzczegolu,
  type ObliczeniaKabla,
  type ObliczeniaKablaOk,
  type OpcjeUlozenia,
  type ParametrKroku,
  type SemantykaOceny,
  type WarunkiUlozenia,
  type WariantPrzekroju,
  type WariantyPrzekroju,
  type WielkoscKabla,
  type WierszKryterium,
} from './kabelNnApi';
import { KABEL_NN_STRINGS as T } from './kabelNnStrings';

export interface SekcjaKablaNnProps {
  /** Odnośnik gałęzi kabla nN w modelu (`Branch.ref_id`). */
  readonly cableRef: string;
  /** Tryb ekspercki — wyłącznie on pokazuje „Informacje audytowe". */
  readonly trybEkspercki: boolean;
}

type Stan<T> =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: T };

/** Liczba z backendu w postaci prezentacyjnej (separator PL, cyfry wg rzędu wielkości). */
export function liczbaPl(wartosc: number | null | undefined, jednostka?: string): string {
  if (wartosc === null || wartosc === undefined || !Number.isFinite(wartosc)) return '—';
  const modul = Math.abs(wartosc);
  const miejsca = modul >= 1000 ? 0 : modul >= 100 ? 1 : modul >= 10 ? 2 : 3;
  return formatPolishValue(wartosc, { decimals: miejsca, unit: jednostka, status: 'pelny' });
}

function slug(tekst: string): string {
  return tekst.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function wartoscParametru(parametr: ParametrKroku): string {
  if (parametr.wartosc !== null) return liczbaPl(parametr.wartosc, parametr.jednostka);
  return parametr.wartosc_pl ?? '—';
}

/** Kolor odczytu technicznego — JEDYNA mapa semantyka → token motywu (`SEMANTYKA_KOLOR`). */
function OcenaTechniczna({ tekst, semantyka }: { tekst: string; semantyka: SemantykaOceny }) {
  return (
    <span
      className="mvd-kabel-nn-ocena"
      data-semantyka={semantyka}
      style={{ color: SEMANTYKA_KOLOR[semantyka] }}
    >
      {tekst}
    </span>
  );
}

/** Krok dowodu: wzór → dane → podstawienie → wynik (wszystko z backendu). */
function KrokDowoduKabla({ krok, testid }: { krok: KrokSzczegolu; testid: string }) {
  return (
    <li className="mvd-kabel-nn-krok" data-testid={testid}>
      <div className="mvd-kabel-nn-krok-tytul">{krok.tytul_pl}</div>
      <div className="mvd-kabel-nn-krok-podstawa">
        {krok.nazwa_wzoru_pl} · {krok.podstawa_pl}
      </div>
      <div className="mvd-kabel-nn-krok-etap">{T.wzor}</div>
      <MathBlock latex={krok.wzor_latex} />
      {krok.parametry.length > 0 ? (
        <>
          <div className="mvd-kabel-nn-krok-etap">{T.parametry}</div>
          <dl className="mvd-kabel-nn-parametry">
            {krok.parametry.map((p, indeks) => (
              <div className="mvd-kabel-nn-parametr" key={`${p.symbol_latex}-${indeks}`}>
                <dt>
                  <MathInline latex={p.symbol_latex} />
                  {p.opis_pl ? <span className="mvd-kabel-nn-opis"> — {p.opis_pl}</span> : null}
                </dt>
                <dd className="mvd-num">{wartoscParametru(p)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      <div className="mvd-kabel-nn-krok-etap">{T.podstawienie}</div>
      <MathBlock latex={krok.podstawienie_latex} />
      <div className="mvd-kabel-nn-krok-wynik">
        <span className="mvd-kabel-nn-krok-etap">{T.wynik}</span>{' '}
        <MathInline latex={krok.wynik.symbol_latex} />{' '}
        <span className="mvd-num">= {wartoscParametru(krok.wynik)}</span>
      </div>
    </li>
  );
}

function ListaKrokow({ kroki, prefiks }: { kroki: readonly KrokSzczegolu[]; prefiks: string }) {
  return (
    <ol className="mvd-kabel-nn-kroki">
      {kroki.map((krok, indeks) => (
        <KrokDowoduKabla key={`${prefiks}-${indeks}`} krok={krok} testid={`${prefiks}-krok-${indeks}`} />
      ))}
    </ol>
  );
}

function WierszWielkosci({ w }: { w: WielkoscKabla }) {
  const [otwarte, setOtwarte] = useState(false);
  const testid = `mvd-kabel-nn-wielkosc-${slug(w.kod)}`;
  return (
    <>
      <tr data-testid={testid}>
        <td>{w.nazwa_pl}</td>
        <td>
          <MathInline latex={w.symbol_latex} />
        </td>
        <td className="mvd-num mvd-kabel-nn-wartosc">
          {w.wartosc !== null ? (
            liczbaPl(w.wartosc, w.jednostka)
          ) : (
            <span className="mvd-kabel-nn-brak">
              {T.nieObliczono}
              {w.powod_braku_pl ? ` — ${w.powod_braku_pl}` : ''}
            </span>
          )}
        </td>
        <td>
          {w.szczegoly.length > 0 ? (
            <button
              type="button"
              className="mvd-btn mvd-kabel-nn-maly"
              aria-expanded={otwarte}
              data-testid={`${testid}-szczegoly`}
              onClick={() => setOtwarte((s) => !s)}
            >
              {otwarte ? T.ukryjSzczegoly : T.pokazSzczegoly}
            </button>
          ) : null}
        </td>
      </tr>
      {otwarte ? (
        <tr>
          <td colSpan={4}>
            <ListaKrokow kroki={w.szczegoly} prefiks={testid} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function WierszKryteriumKabla({ k }: { k: WierszKryterium }) {
  const [otwarte, setOtwarte] = useState(false);
  const testid = `mvd-kabel-nn-kryterium-${slug(k.kryterium_id)}`;
  const rekord = k.rekord;
  // Układ kolumnowy (panel inspektora jest wąski): kryterium · wynik wobec limitu · podstawa ·
  // ocena techniczna — ta sama kolejność co pierwszy plan V12K-351, bez przewijania w bok.
  return (
    <li className="mvd-kabel-nn-kryterium" data-testid={testid} data-kryterium={k.kryterium_id} data-semantyka={k.ocena_semantyka}>
      <div className="mvd-kabel-nn-kryterium-glowa">
        <span>{rekord.kryterium.opis_pl}</span>
        <button
          type="button"
          className="mvd-btn mvd-kabel-nn-maly"
          aria-expanded={otwarte}
          data-testid={`${testid}-szczegoly`}
          onClick={() => setOtwarte((s) => !s)}
        >
          {otwarte ? T.ukryjSzczegoly : T.pokazSzczegoly}
        </button>
      </div>
      <div className="mvd-kabel-nn-sprawdzenie">
        {k.sprawdzenie_latex ? (
          <MathInline latex={k.sprawdzenie_latex} />
        ) : (
          <MathInline latex={rekord.kryterium.warunek_latex} />
        )}
      </div>
      <div className="mvd-kabel-nn-norma">{k.norma_pl}</div>
      <OcenaTechniczna tekst={k.ocena_techniczna_pl} semantyka={k.ocena_semantyka} />
      {otwarte ? (
        <div className="mvd-kabel-nn-szczegol" data-testid={`${testid}-szczegol`}>
          {k.szczegoly.length > 0 ? <ListaKrokow kroki={k.szczegoly} prefiks={testid} /> : null}
          <div className="mvd-kabel-nn-krok-etap">{T.wyjasnienie}</div>
          <KartaWerdyktu rekord={rekord} />
        </div>
      ) : null}
    </li>
  );
}

/** Domyślny szkic warunków przy pierwszej edycji: zapisane warunki albo pierwsze opcje rejestru. */
function szkicWarunkow(zapisane: WarunkiUlozenia | null, opcje: OpcjeUlozenia): WarunkiUlozenia {
  if (zapisane) return zapisane;
  const srodowisko = opcje.srodowiska[0];
  const izolacja = opcje.izolacje[0];
  const temperatury = opcje.temperatury[srodowisko]?.[izolacja] ?? [];
  return {
    environment: srodowisko,
    insulation: izolacja,
    ambient_temperature_c: temperatury[0],
    circuit_count: opcje.liczby_obwodow[srodowisko][0],
    soil_thermal_resistivity_km_w:
      srodowisko === 'grunt' ? opcje.rezystywnosci_gruntu[0] : null,
  };
}

/** Uzgodnienie szkicu z rejestrem po zmianie środowiska/izolacji (wybór, nie wpis). */
function uzgodnijSzkic(szkic: WarunkiUlozenia, opcje: OpcjeUlozenia): WarunkiUlozenia {
  const temperatury = opcje.temperatury[szkic.environment]?.[szkic.insulation] ?? [];
  const obwody = opcje.liczby_obwodow[szkic.environment] ?? [];
  return {
    ...szkic,
    ambient_temperature_c: temperatury.includes(szkic.ambient_temperature_c)
      ? szkic.ambient_temperature_c
      : temperatury[0],
    circuit_count: obwody.includes(szkic.circuit_count) ? szkic.circuit_count : obwody[0],
    soil_thermal_resistivity_km_w:
      szkic.environment === 'grunt'
        ? szkic.soil_thermal_resistivity_km_w ?? opcje.rezystywnosci_gruntu[0]
        : null,
  };
}

interface WarunkiUlozeniaProps {
  readonly dane: ObliczeniaKablaOk;
  readonly onZapisz: (warunki: WarunkiUlozenia | 'warunki_katalogowe') => Promise<void>;
  readonly zajete: boolean;
}

function EdycjaWarunkowUlozenia({ dane, onZapisz, zajete }: WarunkiUlozeniaProps) {
  const opcje = dane.opcje_ulozenia;
  const [szkic, setSzkic] = useState<WarunkiUlozenia | null>(null);
  const zmien = (zmiana: Partial<WarunkiUlozenia>) =>
    setSzkic((s) => (s ? uzgodnijSzkic({ ...s, ...zmiana }, opcje) : s));

  return (
    <section className="mvd-kabel-nn-blok" data-testid="mvd-kabel-nn-ulozenie">
      <h5 className="mvd-kabel-nn-podtytul">{T.ulozenieTytul}</h5>
      <p className="mvd-kabel-nn-info" data-testid="mvd-kabel-nn-ulozenie-opis">
        {dane.kabel.warunki_ulozenia_opis_pl}
      </p>
      {szkic === null ? (
        <button
          type="button"
          className="mvd-btn"
          data-testid="mvd-kabel-nn-ulozenie-zmien"
          disabled={zajete}
          onClick={() => setSzkic(szkicWarunkow(dane.kabel.warunki_ulozenia, opcje))}
        >
          {T.ulozenieZmien}
        </button>
      ) : (
        <div className="mvd-kabel-nn-formularz">
          <label>
            <span>{T.srodowisko}</span>
            <select
              data-testid="mvd-kabel-nn-ulozenie-srodowisko"
              value={szkic.environment}
              onChange={(e) => zmien({ environment: e.target.value as WarunkiUlozenia['environment'] })}
            >
              {opcje.srodowiska.map((s) => (
                <option key={s} value={s}>
                  {T.srodowiskoPl[s] ?? s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{T.izolacja}</span>
            <select
              data-testid="mvd-kabel-nn-ulozenie-izolacja"
              value={szkic.insulation}
              onChange={(e) => zmien({ insulation: e.target.value as WarunkiUlozenia['insulation'] })}
            >
              {opcje.izolacje.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{T.temperatura}</span>
            <select
              data-testid="mvd-kabel-nn-ulozenie-temperatura"
              value={String(szkic.ambient_temperature_c)}
              onChange={(e) => zmien({ ambient_temperature_c: Number(e.target.value) })}
            >
              {(opcje.temperatury[szkic.environment]?.[szkic.insulation] ?? []).map((t) => (
                <option key={t} value={String(t)}>
                  {t} °C
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{T.liczbaObwodow}</span>
            <select
              data-testid="mvd-kabel-nn-ulozenie-obwody"
              value={String(szkic.circuit_count)}
              onChange={(e) => zmien({ circuit_count: Number(e.target.value) })}
            >
              {(opcje.liczby_obwodow[szkic.environment] ?? []).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {szkic.environment === 'grunt' ? (
            <label>
              <span>{T.rezystywnosc}</span>
              <select
                data-testid="mvd-kabel-nn-ulozenie-rezystywnosc"
                value={String(szkic.soil_thermal_resistivity_km_w ?? '')}
                onChange={(e) => zmien({ soil_thermal_resistivity_km_w: Number(e.target.value) })}
              >
                {opcje.rezystywnosci_gruntu.map((r) => (
                  <option key={r} value={String(r)}>
                    {formatPolishValue(r, { decimals: 1, unit: 'K·m/W', status: 'pelny' })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="mvd-kabel-nn-przyciski">
            <button
              type="button"
              className="mvd-btn mvd-btn-primary"
              data-testid="mvd-kabel-nn-ulozenie-zapisz"
              disabled={zajete}
              onClick={() => {
                void onZapisz(szkic).then(() => setSzkic(null));
              }}
            >
              {T.ulozenieZapisz}
            </button>
            <button
              type="button"
              className="mvd-btn"
              data-testid="mvd-kabel-nn-ulozenie-anuluj"
              onClick={() => setSzkic(null)}
            >
              {T.ulozenieAnuluj}
            </button>
            {dane.kabel.warunki_ulozenia ? (
              <button
                type="button"
                className="mvd-btn"
                data-testid="mvd-kabel-nn-ulozenie-katalogowe"
                disabled={zajete}
                onClick={() => {
                  void onZapisz('warunki_katalogowe').then(() => setSzkic(null));
                }}
              >
                {T.ulozenieKatalogowe}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function liczbaPrzekroczen(w: WariantPrzekroju): number {
  return w.kryteria.filter((k) => k.ocena_semantyka === 'negatywna').length;
}

function TabelaWariantow({
  dane,
  onWybierz,
  zajete,
}: {
  dane: WariantyPrzekroju;
  onWybierz: (wariant: WariantPrzekroju) => void;
  zajete: boolean;
}) {
  if (dane.status !== 'OK') {
    return (
      <p className="mvd-kabel-nn-info" data-testid="mvd-kabel-nn-warianty-odmowa">
        {dane.reason_pl ?? T.odmowa}
      </p>
    );
  }
  if (dane.warianty.length <= 1) {
    return <p className="mvd-kabel-nn-info">{T.brakWariantow}</p>;
  }
  const swz = 'kabel_nn.samoczynne_wylaczenie';
  return (
    <ul className="mvd-kabel-nn-lista" data-testid="mvd-kabel-nn-warianty">
      {dane.warianty.map((w) => {
        const przekroczenia = liczbaPrzekroczen(w);
        const kSwz = w.kryteria.find((k) => k.kryterium_id === swz);
        const rekomendowany = dane.rekomendacja === w.catalog_item_id;
        return (
          <li
            key={w.catalog_item_id}
            className="mvd-kabel-nn-wariant"
            data-testid={`mvd-kabel-nn-wariant-${slug(w.catalog_item_id)}`}
            data-wariant={w.catalog_item_id}
            data-biezacy={w.biezacy ? 'true' : undefined}
            data-rekomendowany={rekomendowany ? 'true' : undefined}
          >
            <div className="mvd-kabel-nn-kryterium-glowa">
              <span className="mvd-kabel-nn-wariant-nazwa">{w.nazwa}</span>
              {w.biezacy ? null : (
                <button
                  type="button"
                  className="mvd-btn"
                  data-testid={`mvd-kabel-nn-wybierz-${slug(w.catalog_item_id)}`}
                  disabled={zajete}
                  onClick={() => onWybierz(w)}
                >
                  {T.wybierz}
                </button>
              )}
            </div>
            {w.biezacy ? <div className="mvd-kabel-nn-znacznik">{T.biezacy}</div> : null}
            {rekomendowany ? <div className="mvd-kabel-nn-znacznik">{T.rekomendowany}</div> : null}
            <dl className="mvd-kabel-nn-parametry">
              <div className="mvd-kabel-nn-parametr">
                <dt>{T.kolumnaIz}</dt>
                <dd className="mvd-num">{liczbaPl(w.iz_prime_a, 'A')}</dd>
              </div>
              <div className="mvd-kabel-nn-parametr">
                <dt>{T.kolumnaDu}</dt>
                <dd className="mvd-num">{liczbaPl(w.du_konca_procent, '%')}</dd>
              </div>
              <div className="mvd-kabel-nn-parametr">
                <dt>{T.kolumnaStraty}</dt>
                <dd className="mvd-num">{liczbaPl(w.straty_w, 'W')}</dd>
              </div>
              <div className="mvd-kabel-nn-parametr">
                <dt>{T.kolumnaIk1}</dt>
                <dd className="mvd-num">{liczbaPl(w.ik1_min_a, 'A')}</dd>
              </div>
              <div className="mvd-kabel-nn-parametr">
                <dt>{T.kolumnaSwz}</dt>
                <dd>
                  {kSwz ? (
                    <OcenaTechniczna tekst={kSwz.ocena_techniczna_pl} semantyka={kSwz.ocena_semantyka} />
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
            <OcenaTechniczna
              tekst={
                przekroczenia > 0
                  ? T.przekroczenia(przekroczenia)
                  : w.nieobliczone.length > 0
                    ? T.nieobliczone(w.nieobliczone.length)
                    : T.bezPrzekroczen
              }
              semantyka={przekroczenia > 0 ? 'negatywna' : w.nieobliczone.length > 0 ? 'neutralna' : 'pozytywna'}
            />
          </li>
        );
      })}
    </ul>
  );
}

interface ZmianaWielkosci {
  readonly kod: string;
  readonly nazwa: string;
  readonly przed: string;
  readonly po: string;
}

/** Skutek zmiany: wielkości i oceny, których wartość się zmieniła (obie z backendu). */
export function skutekZmiany(przed: ObliczeniaKablaOk, po: ObliczeniaKablaOk): ZmianaWielkosci[] {
  const zmiany: ZmianaWielkosci[] = [];
  const poWielkosci = new Map(po.wielkosci.map((w) => [w.kod, w]));
  for (const w of przed.wielkosci) {
    const nowa = poWielkosci.get(w.kod);
    if (!nowa) continue;
    const a = liczbaPl(w.wartosc, w.jednostka);
    const b = liczbaPl(nowa.wartosc, nowa.jednostka);
    if (a !== b) zmiany.push({ kod: w.kod, nazwa: w.nazwa_pl, przed: a, po: b });
  }
  const poKryteria = new Map(po.kryteria.map((k) => [k.kryterium_id, k]));
  for (const k of przed.kryteria) {
    const nowe = poKryteria.get(k.kryterium_id);
    if (!nowe || nowe.ocena_techniczna_pl === k.ocena_techniczna_pl) continue;
    zmiany.push({
      kod: k.kryterium_id,
      nazwa: k.rekord.kryterium.opis_pl,
      przed: k.ocena_techniczna_pl,
      po: nowe.ocena_techniczna_pl,
    });
  }
  if (przed.kabel.typ_nazwa !== po.kabel.typ_nazwa) {
    zmiany.unshift({
      kod: 'typ',
      nazwa: T.typKabla,
      przed: przed.kabel.typ_nazwa ?? T.bezTypu,
      po: po.kabel.typ_nazwa ?? T.bezTypu,
    });
  }
  return zmiany;
}

function AkcjaBiegu({ rodzaj }: { rodzaj: 'LOAD_FLOW' | 'SC_3F' }) {
  const akcja = useAkcjaUruchomObliczenie(rodzaj);
  return (
    <button
      type="button"
      className="mvd-btn mvd-btn-primary"
      title={akcja.opis}
      data-testid={`mvd-kabel-nn-uruchom-${rodzaj}`}
      disabled={akcja.wToku}
      onClick={akcja.onKlik}
    >
      {akcja.etykieta}
    </button>
  );
}

export function SekcjaKablaNn({ cableRef, trybEkspercki }: SekcjaKablaNnProps) {
  const caseId = useAppStateStore((s) => s.activeCaseId);
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const rewizja = useSnapshotStore((s) => s.rewizjaBiezacegoModelu ?? 0);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);

  const [stan, setStan] = useState<Stan<ObliczeniaKabla>>({ rodzaj: 'ladowanie' });
  const [warianty, setWarianty] = useState<Stan<WariantyPrzekroju> | null>(null);
  const [dowod, setDowod] = useState<Stan<DowodObwoduNn> | null>(null);
  const [przedZmiana, setPrzedZmiana] = useState<ObliczeniaKablaOk | null>(null);
  const [zmiany, setZmiany] = useState<ZmianaWielkosci[] | null>(null);
  const [zajete, setZajete] = useState(false);
  const [bladOperacji, setBladOperacji] = useState<string | null>(null);

  // Nowy kabel = czysty stan sekcji (warianty, dowód i skutek dotyczą wskazanego odcinka).
  useEffect(() => {
    setWarianty(null);
    setDowod(null);
    setPrzedZmiana(null);
    setZmiany(null);
    setBladOperacji(null);
  }, [cableRef, caseId]);

  useEffect(() => {
    if (!caseId) return;
    const kontroler = new AbortController();
    setStan((poprzedni) => (poprzedni.rodzaj === 'gotowe' ? poprzedni : { rodzaj: 'ladowanie' }));
    pobierzObliczeniaKablaNn(caseId, cableRef, kontroler.signal)
      .then((dane) => setStan({ rodzaj: 'gotowe', dane }))
      .catch((err: unknown) => {
        if (kontroler.signal.aborted) return;
        setStan({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : T.bladOdczytu });
      });
    return () => kontroler.abort();
  }, [caseId, cableRef, rewizja, activeRunId]);

  // Porównanie wariantów liczy się przy otwarciu i na nowo po każdej zmianie modelu albo biegu
  // (wybór wariantu, warunki ułożenia) — tabela zawsze opisuje BIEŻĄCY model; poprzednia
  // tabela zostaje widoczna do nadejścia nowej (bez migotania).
  const otwarteWarianty = warianty !== null;
  useEffect(() => {
    if (!otwarteWarianty || !caseId) return;
    const kontroler = new AbortController();
    pobierzWariantyPrzekroju(caseId, cableRef, kontroler.signal)
      .then((dane) => setWarianty({ rodzaj: 'gotowe', dane }))
      .catch((err: unknown) => {
        if (kontroler.signal.aborted) return;
        setWarianty({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : T.bladOdczytu });
      });
    return () => kontroler.abort();
  }, [otwarteWarianty, caseId, cableRef, rewizja, activeRunId]);

  // Skutek zmiany: po nadejściu obliczeń NOWEGO modelu porównaj z migawką sprzed operacji.
  useEffect(() => {
    if (!przedZmiana || stan.rodzaj !== 'gotowe' || !czyObliczeniaOk(stan.dane)) return;
    if (stan.dane.audyt.rewizja_modelu === przedZmiana.audyt.rewizja_modelu) return;
    setZmiany(skutekZmiany(przedZmiana, stan.dane));
    setPrzedZmiana(null);
  }, [przedZmiana, stan]);

  const wykonaj = useCallback(
    async (operacja: string, payload: Record<string, unknown>) => {
      if (!caseId) return;
      if (stan.rodzaj === 'gotowe' && czyObliczeniaOk(stan.dane)) setPrzedZmiana(stan.dane);
      setZmiany(null);
      setZajete(true);
      setBladOperacji(null);
      try {
        const odpowiedz = await executeDomainOperation(caseId, operacja, payload);
        if (!odpowiedz || odpowiedz.error) {
          setPrzedZmiana(null);
          setBladOperacji(odpowiedz?.error ?? T.bladOperacji);
        }
      } finally {
        setZajete(false);
      }
    },
    [caseId, executeDomainOperation, stan],
  );

  const zapiszWarunki = useCallback(
    (warunki: WarunkiUlozenia | 'warunki_katalogowe') =>
      wykonaj('set_nn_cable_laying_conditions', {
        segment_ref: cableRef,
        cable_laying_conditions: warunki,
      }),
    [cableRef, wykonaj],
  );

  const wybierzWariant = useCallback(
    (wariant: WariantPrzekroju) =>
      void wykonaj('assign_catalog_to_element', {
        element_ref: cableRef,
        catalog_binding: wariant.catalog_binding,
        source_mode: 'KATALOG',
      }),
    [cableRef, wykonaj],
  );

  const pokazDowod = useCallback(() => {
    if (!caseId) return;
    if (dowod !== null) {
      setDowod(null);
      return;
    }
    setDowod({ rodzaj: 'ladowanie' });
    pobierzDowodObwoduNn(caseId, cableRef)
      .then((dane) => setDowod({ rodzaj: 'gotowe', dane }))
      .catch((err: unknown) =>
        setDowod({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : T.bladOdczytu }),
      );
  }, [caseId, cableRef, dowod]);

  // Dowód otwarty przy zmianie modelu opisywałby stary model — zamykamy go.
  useEffect(() => {
    setDowod(null);
  }, [rewizja, activeRunId]);

  const audyt = useMemo(() => {
    if (stan.rodzaj !== 'gotowe' || !czyObliczeniaOk(stan.dane)) return [];
    const a = stan.dane.audyt;
    return [
      { etykieta: T.audytRewizja, wartosc: a.rewizja_modelu },
      { etykieta: T.audytBiegRozplywu, wartosc: a.bieg_bazowy_rozplywu ?? T.brakBiegu },
      { etykieta: T.audytBiegZwarcia, wartosc: a.bieg_bazowy_zwarcia ?? T.brakBiegu },
      { etykieta: T.audytWersja, wartosc: a.wersja_obliczen },
    ];
  }, [stan]);

  if (!caseId) {
    return (
      <section className="mvd-kabel-nn" data-testid="mvd-kabel-nn-bez-przypadku">
        <h4 className="mvd-kabel-nn-tytul">{T.tytul}</h4>
        <p className="mvd-kabel-nn-info">{T.brakPrzypadku}</p>
      </section>
    );
  }
  if (stan.rodzaj === 'ladowanie') {
    return (
      <section className="mvd-kabel-nn" data-testid="mvd-kabel-nn-ladowanie">
        <h4 className="mvd-kabel-nn-tytul">{T.tytul}</h4>
        <p className="mvd-kabel-nn-info">{T.ladowanie}</p>
      </section>
    );
  }
  if (stan.rodzaj === 'blad') {
    return (
      <section className="mvd-kabel-nn" data-testid="mvd-kabel-nn-blad">
        <h4 className="mvd-kabel-nn-tytul">{T.tytul}</h4>
        <p className="mvd-kabel-nn-info">
          {T.bladOdczytu}: {stan.komunikat}
        </p>
      </section>
    );
  }
  const dane = stan.dane;
  if (!czyObliczeniaOk(dane)) {
    return (
      <section className="mvd-kabel-nn" data-testid="mvd-kabel-nn-odmowa">
        <h4 className="mvd-kabel-nn-tytul">{T.tytul}</h4>
        <p className="mvd-kabel-nn-info">
          {T.odmowa}: {dane.reason_pl ?? dane.status}
          {dane.missing_data && dane.missing_data.length > 0 ? ` (${dane.missing_data.join(', ')})` : ''}
        </p>
      </section>
    );
  }

  const { kabel, obwod } = dane;
  return (
    <section className="mvd-kabel-nn" data-testid="mvd-kabel-nn" data-cable-ref={cableRef}>
      <h4 className="mvd-kabel-nn-tytul">{T.tytul}</h4>
      <dl className="mvd-kabel-nn-opis-obiektu">
        <div>
          <dt>{T.typKabla}</dt>
          <dd data-testid="mvd-kabel-nn-typ">{kabel.typ_nazwa ?? T.bezTypu}</dd>
        </div>
        <div>
          <dt>{T.przekroj}</dt>
          <dd className="mvd-num">{liczbaPl(kabel.przekroj_mm2, 'mm²')}</dd>
        </div>
        <div>
          <dt>{T.dlugosc}</dt>
          <dd className="mvd-num">{liczbaPl(kabel.dlugosc_m, 'm')}</dd>
        </div>
        <div>
          <dt>{T.zasilanie}</dt>
          <dd>
            {obwod.transformator_nazwa} · {obwod.stacja_nazwa}
          </dd>
        </div>
        <div>
          <dt>{T.zabezpieczenie}</dt>
          <dd data-testid="mvd-kabel-nn-aparat">
            {obwod.aparat_nazwa
              ? `${obwod.aparat_nazwa}${obwod.aparat_rodzaj_pl ? ` — ${obwod.aparat_rodzaj_pl}` : ''}`
              : T.bezZabezpieczenia}
          </dd>
        </div>
      </dl>

      {dane.brakujace_biegi.length > 0 ? (
        <div className="mvd-kabel-nn-blok mvd-kabel-nn-brak-biegow" data-testid="mvd-kabel-nn-brak-biegow">
          <p className="mvd-kabel-nn-info">{T.brakBiegow}</p>
          <div className="mvd-kabel-nn-przyciski">
            {dane.brakujace_biegi.map((rodzaj) => (
              <AkcjaBiegu key={rodzaj} rodzaj={rodzaj} />
            ))}
          </div>
        </div>
      ) : null}

      {bladOperacji ? (
        <p className="mvd-kabel-nn-info mvd-kabel-nn-blad-operacji" role="alert" data-testid="mvd-kabel-nn-blad-operacji">
          {T.bladOperacji}: {bladOperacji}
        </p>
      ) : null}

      {zmiany !== null ? (
        <section className="mvd-kabel-nn-blok" data-testid="mvd-kabel-nn-skutek">
          <h5 className="mvd-kabel-nn-podtytul">{T.skutekTytul}</h5>
          {zmiany.length === 0 ? (
            <p className="mvd-kabel-nn-info">{T.skutekBezZmian}</p>
          ) : (
            <ul className="mvd-kabel-nn-skutek">
              {zmiany.map((z) => (
                <li key={z.kod} data-testid={`mvd-kabel-nn-skutek-${slug(z.kod)}`}>
                  <span>{z.nazwa}</span>
                  <span className="mvd-num">
                    {z.przed} → {z.po}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <EdycjaWarunkowUlozenia dane={dane} onZapisz={zapiszWarunki} zajete={zajete} />

      <section className="mvd-kabel-nn-blok">
        <h5 className="mvd-kabel-nn-podtytul">{T.wielkosciTytul}</h5>
        <div className="mvd-kabel-nn-przewijanie">
          <table className="mvd-kabel-nn-tabela" data-testid="mvd-kabel-nn-wielkosci">
            <tbody>
              {dane.wielkosci.map((w) => (
                <WierszWielkosci key={w.kod} w={w} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mvd-kabel-nn-blok">
        <h5 className="mvd-kabel-nn-podtytul">{T.kryteriaTytul}</h5>
        <div className="mvd-kabel-nn-przewijanie">
          <ul className="mvd-kabel-nn-lista" data-testid="mvd-kabel-nn-kryteria">
            {dane.kryteria.map((k) => (
              <WierszKryteriumKabla key={k.kryterium_id} k={k} />
            ))}
          </ul>
        </div>
      </section>

      <section className="mvd-kabel-nn-blok">
        <div className="mvd-kabel-nn-przyciski">
          <button
            type="button"
            className="mvd-btn mvd-btn-primary"
            data-testid="mvd-kabel-nn-dobierz"
            aria-expanded={otwarteWarianty}
            onClick={() => setWarianty(otwarteWarianty ? null : { rodzaj: 'ladowanie' })}
          >
            {otwarteWarianty ? T.ukryjWarianty : T.dobierzPrzekroj}
          </button>
          <button
            type="button"
            className="mvd-btn"
            data-testid="mvd-kabel-nn-dowod"
            aria-expanded={dowod !== null}
            onClick={pokazDowod}
          >
            {dowod !== null ? T.dowodUkryj : T.dowodPokaz}
          </button>
        </div>
        {warianty !== null ? (
          <div className="mvd-kabel-nn-warianty" data-testid="mvd-kabel-nn-warianty-blok">
            <h5 className="mvd-kabel-nn-podtytul">{T.wariantyTytul}</h5>
            <p className="mvd-kabel-nn-info">{T.wariantyOpis}</p>
            {warianty.rodzaj === 'ladowanie' ? (
              <p className="mvd-kabel-nn-info">{T.wariantyLadowanie}</p>
            ) : warianty.rodzaj === 'blad' ? (
              <p className="mvd-kabel-nn-info">
                {T.bladOdczytu}: {warianty.komunikat}
              </p>
            ) : (
              <TabelaWariantow dane={warianty.dane} onWybierz={wybierzWariant} zajete={zajete} />
            )}
          </div>
        ) : null}
        {dowod !== null ? (
          <div className="mvd-kabel-nn-dowod" data-testid="mvd-kabel-nn-dowod-blok">
            <h5 className="mvd-kabel-nn-podtytul">{T.dowodTytul}</h5>
            {dowod.rodzaj === 'ladowanie' ? (
              <p className="mvd-kabel-nn-info">{T.dowodLadowanie}</p>
            ) : dowod.rodzaj === 'blad' ? (
              <p className="mvd-kabel-nn-info" data-testid="mvd-kabel-nn-dowod-odmowa">
                {dowod.komunikat}
              </p>
            ) : (
              <>
                <ListaKrokow kroki={dowod.dane.kroki} prefiks="mvd-kabel-nn-dowod" />
                <a
                  className="mvd-btn"
                  data-testid="mvd-kabel-nn-dowod-pakiet"
                  href={adresPakietuDowoduObwoduNn(caseId, cableRef)}
                  download
                >
                  {T.dowodPakiet}
                </a>
              </>
            )}
          </div>
        ) : null}
      </section>

      <InformacjeAudytowe wiersze={audyt} trybEkspercki={trybEkspercki} testid="mvd-kabel-nn-audyt" />
    </section>
  );
}
