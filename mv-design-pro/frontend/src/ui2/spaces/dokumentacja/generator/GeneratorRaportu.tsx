/**
 * GeneratorRaportu — okno ui2 skladania raportu technicznego (karta KD-4,
 * ZAMKNIECIE luki L-15 inwentarza parytetu mostow).
 *
 * CO ZASTEPUJE. Do tej karty jedynym generatorem byla powierzchnia mostu E-37:
 * hub Dokumentacji tylko do niej prowadzil. Powierzchnia mostu mieszala eksporty
 * z jedenastoetapowa tablica przeplywu i checklista rozdzialow, a jej dwie
 * kontrolki skladu („Zakres obiektowy", „Szczegolowosc") NIE JECHALY DO
 * BACKENDU — zmieniały wyłącznie napis w tabeli etapow. Tutaj kazda kontrolka
 * jest parametrem realnego wywolania eksportu.
 *
 * ZERO FIZYKI, ZERO ARYTMETYKI: ekran wybiera przebieg, sklada parametry i
 * wola koncowki eksportu. Wszystkie liczby (liczba wierszy tabel) pochodza z
 * odpowiedzi backendu.
 */

import { useMemo, useState } from 'react';

import './generator.css';
import { useAppStateStore } from '../../../../ui/app-state';
import {
  exportProofPack,
  exportReport,
  type ProofExportFormat,
  type ReportExportFormat,
} from '../../../../ui/results/reportExportApi';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../shell/useShellStore';
import { useGotowoscDokumentacji, useTabeleWyniku } from './api';
import {
  DOMYSLNY_POZIOM,
  DOMYSLNY_PROFIL,
  DOMYSLNY_ZAKRES,
  POZIOM_OPCJE,
  PROFILE_OPCJE,
  SEKCJA_OPCJE,
  ZAKRES_OPCJE,
  domyslnyPrzebieg,
  etykietaPrzebiegu,
  przebiegiDoRaportu,
  type PoziomSzczegolowosci,
  type ProfilRaportu,
  type SekcjaRaportu,
  type ZakresRaportu,
} from './model';
import { GEN_STRINGS as T } from './strings';

type StanAkcji =
  | { rodzaj: 'bezczynny' }
  | { rodzaj: 'pracuje'; klucz: string }
  | { rodzaj: 'gotowe'; komunikat: string }
  | { rodzaj: 'blad'; komunikat: string };

const FORMATY_RAPORTU: ReadonlyArray<{ format: ReportExportFormat; etykieta: string }> = [
  { format: 'pdf', etykieta: 'PDF' },
  { format: 'docx', etykieta: 'DOCX' },
  { format: 'json', etykieta: 'JSON' },
];

const FORMATY_DOWODU: ReadonlyArray<{ format: ProofExportFormat; etykieta: string }> = [
  { format: 'pdf', etykieta: 'PDF' },
  { format: 'latex', etykieta: 'LaTeX' },
  { format: 'json', etykieta: 'JSON' },
];

export function GeneratorRaportu() {
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const aktywnyRunId = useAppStateStore((s) => s.activeRunId);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);

  const dostepne = useMemo(() => przebiegiDoRaportu(przebiegi), [przebiegi]);
  const [wybranyRun, setWybranyRun] = useState<string | null>(null);
  const runId = wybranyRun ?? domyslnyPrzebieg(dostepne, aktywnyRunId);

  const [profil, setProfil] = useState<ProfilRaportu>(DOMYSLNY_PROFIL);
  const [poziom, setPoziom] = useState<PoziomSzczegolowosci>(DOMYSLNY_POZIOM);
  const [zakres, setZakres] = useState<ZakresRaportu>(DOMYSLNY_ZAKRES);
  const [sekcje, setSekcje] = useState<readonly SekcjaRaportu[]>([]);
  const [tabela, setTabela] = useState<string>('');
  const [doMagazynu, setDoMagazynu] = useState(true);
  const [stan, setStan] = useState<StanAkcji>({ rodzaj: 'bezczynny' });

  const tabeleWyniku = useTabeleWyniku(runId);
  // KOMPLETNOSC-POLA-TR §0 pkt 2: brama dokumentacji wykonawczej. Werdykt
  // pochodzi z backendu (ten sam, którym odmawia eksportu) — ekran go POKAZUJE,
  // niczego nie ocenia sam (zero fizyki i zero oceny modelu w UI).
  const gotowoscPw = useGotowoscDokumentacji(runId);
  const dokumentacjaWykonawczaZablokowana =
    profil === 'wykonawczy' && !gotowoscPw.werdykt.gotowy;

  const przelaczSekcje = (sekcja: SekcjaRaportu) => {
    setSekcje((biezace) =>
      biezace.includes(sekcja)
        ? biezace.filter((s) => s !== sekcja)
        : // Kolejnosc deterministyczna wg kontraktu (nie wg kolejnosci klikania).
          SEKCJA_OPCJE.map((o) => o.wartosc).filter((s) => s === sekcja || biezace.includes(s)),
    );
  };

  const wykonaj = async (klucz: string, akcja: () => Promise<{ ok: boolean; filename?: string; error?: string }>) => {
    setStan({ rodzaj: 'pracuje', klucz });
    const wynik = await akcja();
    if (wynik.ok) {
      setStan({ rodzaj: 'gotowe', komunikat: `${T.sukces}: ${wynik.filename ?? ''}`.trim() });
    } else {
      setStan({ rodzaj: 'blad', komunikat: `${T.blad}. ${wynik.error ?? ''}`.trim() });
    }
  };

  if (dostepne.length === 0 || !runId) {
    return (
      <div className="mvd-gen" data-testid="mvd-generator-raportu">
        <header className="mvd-gen-head">
          <h2>{T.tytul}</h2>
          <p>{T.cel}</p>
        </header>
        <section className="mvd-gen-pusty" data-testid="mvd-generator-pusty">
          <p className="mvd-gen-pusty-txt">{T.przebiegBrak}</p>
          <button type="button" className="mvd-gen-akcja" onClick={() => setActiveSpace('obliczenia')}>
            {T.przebiegBrakAkcja}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="mvd-gen" data-testid="mvd-generator-raportu">
      <header className="mvd-gen-head">
        <h2>{T.tytul}</h2>
        <p>{T.cel}</p>
      </header>

      {/* Krok 1 — z czego */}
      <section className="mvd-gen-sekcja" aria-label={T.przebiegEyebrow}>
        <span className="mvd-gen-lbl">{T.przebiegEyebrow}</span>
        <p className="mvd-gen-opis">{T.przebiegOpis}</p>
        <label className="mvd-gen-pole">
          <span className="mvd-gen-pole-etyk">{T.przebiegEtykieta}</span>
          <select
            data-testid="mvd-generator-przebieg"
            value={runId}
            onChange={(e) => {
              setWybranyRun(e.target.value);
              setTabela('');
              setStan({ rodzaj: 'bezczynny' });
            }}
          >
            {dostepne.map((run) => (
              <option key={run.id} value={run.id}>
                {etykietaPrzebiegu(run)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {/* Krok 2 — sklad dokumentu (kazde pole = parametr eksportu) */}
      <section className="mvd-gen-sekcja" aria-label={T.kompozycjaEyebrow}>
        <span className="mvd-gen-lbl">{T.kompozycjaEyebrow}</span>
        <p className="mvd-gen-opis">{T.kompozycjaOpis}</p>

        <div className="mvd-gen-siatka">
          <label className="mvd-gen-pole">
            <span className="mvd-gen-pole-etyk">{T.profilEtykieta}</span>
            <select
              data-testid="mvd-generator-profil"
              value={profil}
              onChange={(e) => setProfil(e.target.value as ProfilRaportu)}
            >
              {PROFILE_OPCJE.map((o) => (
                <option key={o.wartosc} value={o.wartosc}>
                  {o.etykieta}
                </option>
              ))}
            </select>
          </label>

          <label className="mvd-gen-pole">
            <span className="mvd-gen-pole-etyk">{T.poziomEtykieta}</span>
            <select
              data-testid="mvd-generator-poziom"
              value={poziom}
              onChange={(e) => setPoziom(e.target.value as PoziomSzczegolowosci)}
            >
              {POZIOM_OPCJE.map((o) => (
                <option key={o.wartosc} value={o.wartosc}>
                  {o.etykieta}
                </option>
              ))}
            </select>
          </label>

          <label className="mvd-gen-pole">
            <span className="mvd-gen-pole-etyk">{T.zakresEtykieta}</span>
            <select
              data-testid="mvd-generator-zakres"
              value={zakres}
              onChange={(e) => setZakres(e.target.value as ZakresRaportu)}
            >
              {ZAKRES_OPCJE.map((o) => (
                <option key={o.wartosc} value={o.wartosc}>
                  {o.etykieta}
                </option>
              ))}
            </select>
          </label>

          <label className="mvd-gen-pole">
            <span className="mvd-gen-pole-etyk">{T.tabelaEtykieta}</span>
            <select
              data-testid="mvd-generator-tabela"
              value={tabela}
              onChange={(e) => setTabela(e.target.value)}
            >
              <option value="">{T.tabelaBrak}</option>
              {tabeleWyniku.tabele.map((t) => (
                <option key={t.table_id} value={t.table_id}>
                  {`${t.label_pl} (${t.row_count})`}
                </option>
              ))}
            </select>
            <span className="mvd-gen-uwaga">{T.tabelaUwaga}</span>
          </label>
        </div>

        <fieldset className="mvd-gen-sekcje" data-testid="mvd-generator-sekcje">
          <legend className="mvd-gen-pole-etyk">{T.sekcjeEtykieta}</legend>
          {SEKCJA_OPCJE.map((o) => (
            <label key={o.wartosc} className="mvd-gen-chk">
              <input
                type="checkbox"
                data-testid={`mvd-generator-sekcja-${o.wartosc}`}
                checked={sekcje.includes(o.wartosc)}
                onChange={() => przelaczSekcje(o.wartosc)}
              />
              <span>{o.etykieta}</span>
            </label>
          ))}
          <span className="mvd-gen-uwaga">{T.sekcjeUwaga}</span>
        </fieldset>
      </section>

      {/* Krok 3 — wytworzenie dokumentu */}
      <section className="mvd-gen-sekcja" aria-label={T.eksportEyebrow}>
        <span className="mvd-gen-lbl">{T.eksportEyebrow}</span>

        <label className="mvd-gen-chk mvd-gen-chk--magazyn">
          <input
            type="checkbox"
            data-testid="mvd-generator-magazyn"
            checked={doMagazynu}
            onChange={(e) => setDoMagazynu(e.target.checked)}
          />
          <span>
            {T.zapiszDoMagazynu}
            <span className="mvd-gen-uwaga">{T.zapiszOpis}</span>
          </span>
        </label>

        {dokumentacjaWykonawczaZablokowana && (
          <div className="mvd-gen-grupa" data-testid="mvd-generator-brama-pw">
            <h4>{T.bramaPwTytul}</h4>
            <p className="mvd-gen-opis">{T.bramaPwOpis}</p>
            <ul className="mvd-gen-opis">
              {gotowoscPw.werdykt.blokady.map((blokada) => (
                <li key={`${blokada.code}:${blokada.element_refs.join('|')}`}>
                  {blokada.message_pl}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mvd-gen-grupa">
          <h4>{T.raportGrupa}</h4>
          <div className="mvd-gen-przyciski">
            {FORMATY_RAPORTU.map(({ format, etykieta }) => (
              <button
                key={format}
                type="button"
                className="mvd-gen-akcja"
                data-testid={`mvd-generator-raport-${format}`}
                disabled={stan.rodzaj === 'pracuje' || dokumentacjaWykonawczaZablokowana}
                onClick={() =>
                  void wykonaj(`raport-${format}`, () =>
                    exportReport(runId, format, {
                      zapiszDoMagazynu: doMagazynu,
                      kompozycja: {
                        profile: profil,
                        detailLevel: poziom,
                        scope: zakres,
                        sections: sekcje,
                        focusTable: tabela || null,
                      },
                    }),
                  )
                }
              >
                {stan.rodzaj === 'pracuje' && stan.klucz === `raport-${format}`
                  ? T.pracuje
                  : etykieta}
              </button>
            ))}
          </div>
        </div>

        <div className="mvd-gen-grupa">
          <h4>{T.dowodGrupa}</h4>
          <p className="mvd-gen-opis">{T.dowodOpis}</p>
          <div className="mvd-gen-przyciski">
            {FORMATY_DOWODU.map(({ format, etykieta }) => (
              <button
                key={format}
                type="button"
                className="mvd-gen-akcja mvd-gen-akcja--wtorna"
                data-testid={`mvd-generator-dowod-${format}`}
                disabled={stan.rodzaj === 'pracuje'}
                onClick={() =>
                  void wykonaj(`dowod-${format}`, () =>
                    exportProofPack(runId, format, { zapiszDoMagazynu: doMagazynu }),
                  )
                }
              >
                {stan.rodzaj === 'pracuje' && stan.klucz === `dowod-${format}`
                  ? T.pracuje
                  : etykieta}
              </button>
            ))}
          </div>
        </div>

        {stan.rodzaj === 'gotowe' && (
          <p className="mvd-gen-stan mvd-gen-stan--ok" data-testid="mvd-generator-stan-ok">
            {stan.komunikat}
          </p>
        )}
        {stan.rodzaj === 'blad' && (
          <p className="mvd-gen-stan mvd-gen-stan--blad" data-testid="mvd-generator-stan-blad">
            {stan.komunikat}
          </p>
        )}
      </section>
    </div>
  );
}
