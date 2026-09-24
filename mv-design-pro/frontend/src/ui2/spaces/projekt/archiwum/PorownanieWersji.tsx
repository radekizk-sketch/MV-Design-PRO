/*
 * Sekcja „Porównaj wersje" okna archiwum projektu. Dwie drogi do TEGO SAMEGO
 * wyniku backendu (`domain.archive_diff.compare_archives`):
 *  - dwa pliki paczki (A — wcześniejsza, B — późniejsza) → POST /api/archives/diff,
 *  - otwarty projekt (A) i inny projekt z serwera (B) → POST /api/archives/diff/projects/{a}/{b}.
 *
 * Wynik pokazuje części archiwum i elementy po NAZWACH nadanych przez
 * projektanta i etykietach PL rodzaju (`element_name`, `element_type_label_pl`,
 * `section_label_pl` z backendu); identyfikator pojawia się tylko, gdy element
 * nazwy nie niesie. Wartości pól-odwołań (szyna przyłączenia, odcinki magistrali)
 * też po nazwach — `old_value_pl`/`new_value_pl` z backendu, surowe tylko bez nich.
 * Błąd archiwum to zdanie backendu z nazwanym plikiem (A/B)
 * i ścieżką pola. ZERO porównywania po stronie ekranu.
 */

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';

import { listProjects, type Project } from '../../../../ui/projects/api';
import {
  porownajArchiwa,
  porownajProjekty,
  type RoznicaElementu,
  type RoznicaSekcji,
  type StatusRoznicy,
  type WynikPorownania,
} from './api';
import { ARCHIWUM_STRINGS as T, formatujWartoscPola, jestPlikiemArchiwum } from './strings';
import { Wiersz } from './wspolne';

const ETYKIETA_STATUSU: Record<Exclude<StatusRoznicy, 'IDENTICAL'>, string> = {
  ADDED: T.statusDodany,
  REMOVED: T.statusUsuniety,
  MODIFIED: T.statusZmieniony,
};

function etykietaStatusu(status: StatusRoznicy): string {
  return status === 'IDENTICAL' ? T.wynikBezZmian : ETYKIETA_STATUSU[status];
}

/**
 * Podpis elementu: nazwa nadana przez projektanta; bez nazwy — identyfikator, ale
 * tylko gdy niesie informację ponad rodzaj (obiekt porównywany pole po polu, np.
 * nagłówek modelu, ma identyfikator równy rodzajowi — wtedy wystarcza etykieta PL).
 */
function podpisElementu(roznica: RoznicaElementu): string | null {
  if (roznica.element_name) return roznica.element_name;
  return roznica.element_id !== roznica.element_type ? roznica.element_id : null;
}

/** Jeden element różnicy: status, rodzaj, podpis (`podpisElementu`), zmiany pól. */
function ElementRoznicy({ roznica }: { roznica: RoznicaElementu }) {
  const podpis = podpisElementu(roznica);
  return (
    <li className="mvd-arch-el" data-status={roznica.status} data-testid="mvd-arch-por-element">
      <div className="mvd-arch-el-naglowek">
        <span className="mvd-arch-el-status">{etykietaStatusu(roznica.status)}</span>
        <span className="mvd-arch-el-typ">{roznica.element_type_label_pl}</span>
        {podpis ? <strong className="mvd-arch-el-nazwa">{podpis}</strong> : null}
      </div>
      {roznica.field_changes.length > 0 ? (
        <table className="mvd-arch-el-pola">
          <tbody>
            {roznica.field_changes.map((zmiana) => (
              <tr key={zmiana.field_name}>
                <th scope="row">{zmiana.label_pl}</th>
                <td className="mvd-num">
                  {formatujWartoscPola(zmiana.old_value_pl ?? zmiana.old_value)}
                </td>
                <td aria-hidden="true">→</td>
                <td className="mvd-num">
                  {formatujWartoscPola(zmiana.new_value_pl ?? zmiana.new_value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </li>
  );
}

/** Część archiwum ze zmianami. */
function SekcjaRoznic({ sekcja }: { sekcja: RoznicaSekcji }) {
  return (
    <section className="mvd-arch-por-sekcja" data-testid={`mvd-arch-por-sekcja-${sekcja.section_name}`}>
      <h5>{sekcja.section_label_pl}</h5>
      {sekcja.element_diffs.length === 0 ? (
        <p className="mvd-arch-opis">{T.wynikSekcjaBezRozbicia}</p>
      ) : (
        <ul className="mvd-arch-el-lista">
          {sekcja.element_diffs.map((roznica) => (
            <ElementRoznicy key={`${roznica.element_type}:${roznica.element_id}`} roznica={roznica} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Wynik porównania — werdykt, liczniki, części zmienione i lista części bez zmian. */
export function WynikPorownaniaWidok({ wynik }: { wynik: WynikPorownania }) {
  if (wynik.overall_status === 'IDENTICAL') {
    return (
      <div className="mvd-arch-raport" data-wariant="ok" data-testid="mvd-arch-por-wynik">
        <span className="mvd-arch-meta-k">{T.wynikTytul}</span>
        <p className="mvd-arch-werdykt" role="status">
          {T.wynikIdentyczne}
        </p>
      </div>
    );
  }
  const zmienione = wynik.section_diffs.filter((s) => s.status !== 'IDENTICAL');
  const bezZmian = wynik.section_diffs.filter((s) => s.status === 'IDENTICAL');
  const p = wynik.summary;
  return (
    <div className="mvd-arch-raport" data-wariant="warn" data-testid="mvd-arch-por-wynik">
      <span className="mvd-arch-meta-k">{T.wynikTytul}</span>
      <p className="mvd-arch-werdykt" role="status">
        {T.wynikRoznice}
      </p>
      <div className="mvd-arch-kv-siatka">
        <Wiersz
          etykieta={T.wynikSekcjeZmienione}
          wartosc={`${p.sections_modified} / ${p.sections_total}`}
        />
        <Wiersz etykieta={T.wynikDodane} wartosc={String(p.total_elements_added)} />
        <Wiersz etykieta={T.wynikUsuniete} wartosc={String(p.total_elements_removed)} />
        <Wiersz etykieta={T.wynikZmienione} wartosc={String(p.total_elements_modified)} />
      </div>
      {zmienione.map((sekcja) => (
        <SekcjaRoznic key={sekcja.section_name} sekcja={sekcja} />
      ))}
      {bezZmian.length > 0 ? (
        <p className="mvd-arch-opis" data-testid="mvd-arch-por-bez-zmian">
          {T.wynikBezZmian}: {bezZmian.map((s) => s.section_label_pl).join(', ')}
        </p>
      ) : null}
    </div>
  );
}

export interface PorownanieWersjiProps {
  readonly activeProjectId: string | null;
}

export function PorownanieWersji({ activeProjectId }: PorownanieWersjiProps) {
  const [plikA, setPlikA] = useState<File | null>(null);
  const [plikB, setPlikB] = useState<File | null>(null);
  const [projekty, setProjekty] = useState<readonly Project[] | null>(null);
  const [projektB, setProjektB] = useState('');
  const [wToku, setWToku] = useState(false);
  const [wynik, setWynik] = useState<WynikPorownania | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  // Lista projektów do porównania z otwartym — ładowana na żądanie projektanta
  // (nie przy każdym otwarciu okna archiwum); zmiana otwartego projektu ją unieważnia.
  const [listaWToku, setListaWToku] = useState(false);
  useEffect(() => {
    setProjekty(null);
    setProjektB('');
  }, [activeProjectId]);

  const zaladujProjekty = useCallback(async () => {
    if (!activeProjectId) return;
    setListaWToku(true);
    setBlad(null);
    try {
      const lista = await listProjects();
      setProjekty(lista.filter((p) => p.id !== activeProjectId));
    } catch (err: unknown) {
      setBlad(err instanceof Error ? err.message : T.porownanieListaBlad);
    } finally {
      setListaWToku(false);
    }
  }, [activeProjectId]);

  const wybierz = useCallback(
    (ustaw: (plik: File | null) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      const wybrany = event.target.files?.[0] ?? null;
      setWynik(null);
      setBlad(null);
      if (wybrany && !jestPlikiemArchiwum(wybrany.name)) {
        ustaw(null);
        setBlad(T.importZlyFormat);
        return;
      }
      ustaw(wybrany);
    },
    [],
  );

  const uruchom = useCallback(async (porownanie: () => Promise<WynikPorownania>) => {
    setWToku(true);
    setBlad(null);
    setWynik(null);
    try {
      setWynik(await porownanie());
    } catch (err: unknown) {
      setBlad(err instanceof Error ? err.message : T.porownanieBlad);
    } finally {
      setWToku(false);
    }
  }, []);

  return (
    <section className="mvd-arch-sekcja" aria-label={T.porownanieEyebrow}>
      <span className="mvd-arch-lbl">{T.porownanieEyebrow}</span>
      <p className="mvd-arch-opis">{T.porownanieOpis}</p>

      <div className="mvd-arch-dwa-pola">
        <label className="mvd-arch-pole">
          <span className="mvd-arch-pole-etyk">{T.porownaniePlikA}</span>
          <input
            type="file"
            accept=".zip,.mvdp.zip"
            onChange={wybierz(setPlikA)}
            data-testid="mvd-arch-por-plik-a"
          />
        </label>
        <label className="mvd-arch-pole">
          <span className="mvd-arch-pole-etyk">{T.porownaniePlikB}</span>
          <input
            type="file"
            accept=".zip,.mvdp.zip"
            onChange={wybierz(setPlikB)}
            data-testid="mvd-arch-por-plik-b"
          />
        </label>
      </div>
      <div className="mvd-arch-akcje">
        <button
          type="button"
          className="mvd-btn mvd-btn-primary"
          onClick={() => {
            if (plikA && plikB) void uruchom(() => porownajArchiwa(plikA, plikB));
          }}
          disabled={!plikA || !plikB || wToku}
          data-testid="mvd-arch-por-pliki"
        >
          {wToku ? T.porownanieWToku : T.porownanieAkcjaPliki}
        </button>
      </div>

      {activeProjectId && projekty === null ? (
        <div className="mvd-arch-akcje">
          <button
            type="button"
            className="mvd-btn"
            onClick={() => void zaladujProjekty()}
            disabled={listaWToku}
            data-testid="mvd-arch-por-zaladuj"
          >
            {T.porownanieZaladujProjekty}
          </button>
        </div>
      ) : null}
      {activeProjectId && projekty ? (
        projekty.length === 0 ? (
          <p className="mvd-arch-opis" data-testid="mvd-arch-por-brak-projektow">
            {T.porownanieProjektBrak}
          </p>
        ) : (
          <>
            <label className="mvd-arch-pole">
              <span className="mvd-arch-pole-etyk">{T.porownanieProjektInny}</span>
              <select
                value={projektB}
                onChange={(e) => {
                  setProjektB(e.target.value);
                  setWynik(null);
                  setBlad(null);
                }}
                data-testid="mvd-arch-por-projekt"
              >
                <option value="">{T.porownanieProjektWybierz}</option>
                {projekty.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mvd-arch-akcje">
              <button
                type="button"
                className="mvd-btn"
                onClick={() => {
                  if (projektB) void uruchom(() => porownajProjekty(activeProjectId, projektB));
                }}
                disabled={!projektB || wToku}
                data-testid="mvd-arch-por-projekty"
              >
                {wToku ? T.porownanieWToku : T.porownanieAkcjaProjekty}
              </button>
            </div>
          </>
        )
      ) : null}

      {blad && (
        <p className="mvd-arch-blad" role="alert" data-testid="mvd-arch-por-blad">
          {blad}
        </p>
      )}
      {wynik && <WynikPorownaniaWidok wynik={wynik} />}
    </section>
  );
}
