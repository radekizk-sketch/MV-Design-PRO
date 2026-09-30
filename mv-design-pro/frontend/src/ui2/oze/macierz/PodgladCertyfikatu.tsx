/*
 * Podgląd certyfikatu zgodności NC RfG (kontrakt `CertyfikatZgodnosciNcRfgV2` — karta AB-1a
 * Pakiet D2 §5). Certyfikat powstaje WYŁĄCZNIE z zatwierdzonego modelu przypadku; widok
 * renderuje identyfikację (procedura jako obiekt warstwy), sekcje modułów (wiersze, na których
 * stoją rekordy; dowód certyfikatu albo powód odrzucenia; rekordy W z blokami dokumentu),
 * założenia i źródła oraz odciski w informacjach audytowych (tryb ekspercki). Odpowiedź 422
 * z brakami to ekran „czego brakuje do certyfikatu" — rekordy W przez `KartaWerdyktu`.
 * Żadnego werdyktu zbiorczego ani liczników — kontrakt V2 ich nie ma.
 */

import { InformacjeAudytowe } from '../../wyniki/wzorzec/InformacjeAudytowe';
import type { FormatDokumentu } from '../ncrfg/api';
import {
  BrakiDokumentu,
  OpisDokumentuWarstwy,
  SekcjaModuluDokumentu,
} from '../ncrfg/komponenty';
import type { BrakiCertyfikatu, WidokCertyfikatu } from '../ncrfg/typy';
import { MACIERZ_STRINGS } from './strings';

export interface PodgladCertyfikatuProps {
  readonly widok: WidokCertyfikatu | null;
  readonly braki: BrakiCertyfikatu | null;
  readonly blad: string | null;
  readonly ladowanie: boolean;
  readonly plikLadowanie: FormatDokumentu | null;
  readonly trybEkspercki: boolean;
  readonly onPobierz: (format: FormatDokumentu) => void;
  readonly onZamknij: () => void;
}

export function PodgladCertyfikatu({
  widok,
  braki,
  blad,
  ladowanie,
  plikLadowanie,
  trybEkspercki,
  onPobierz,
  onZamknij,
}: PodgladCertyfikatuProps): JSX.Element {
  return (
    <section className="mvd-oze-cert" data-testid="mvd-oze-certyfikat">
      <div className="mvd-oze-cert-head">
        <h4 className="mvd-oze-cert-tytul">{MACIERZ_STRINGS.certyfikatNaglowek}</h4>
        <button
          type="button"
          className="mvd-btn"
          onClick={onZamknij}
          data-testid="mvd-oze-cert-zamknij"
        >
          {MACIERZ_STRINGS.certyfikatZamknij}
        </button>
      </div>

      {ladowanie ? (
        <p data-testid="mvd-oze-cert-ladowanie">{MACIERZ_STRINGS.certyfikatLadowanie}</p>
      ) : null}

      {blad ? (
        <div className="mvd-oze-blad" role="alert" data-testid="mvd-oze-cert-blad">
          {MACIERZ_STRINGS.certyfikatBlad}: {blad}
        </div>
      ) : null}

      {braki ? (
        <div className="mvd-oze-cert-braki" data-testid="mvd-oze-cert-braki">
          <h5>{MACIERZ_STRINGS.certyfikatBrakiTytul}</h5>
          <BrakiDokumentu
            komunikat={braki.komunikat}
            braki={braki.braki}
            zdania={braki.braki_pl}
            pominietePl={braki.pominiete_pl}
            testid="mvd-oze-cert-braki-lista"
          />
        </div>
      ) : null}

      {widok ? (
        <div className="mvd-oze-cert-widok" data-testid="mvd-oze-cert-widok">
          <h5 className="mvd-oze-cert-tytul" data-testid="mvd-oze-cert-tytul-dokumentu">
            {widok.tytul}
          </h5>
          <dl className="mvd-oze-cert-meta">
            <div>
              <dt>{MACIERZ_STRINGS.certyfikatProjekt}</dt>
              <dd>{widok.identyfikacja.projekt}</dd>
            </div>
            {widok.identyfikacja.przypadek ? (
              <div>
                <dt>{MACIERZ_STRINGS.certyfikatPrzypadek}</dt>
                <dd>{widok.identyfikacja.przypadek}</dd>
              </div>
            ) : null}
            <div>
              <dt>{MACIERZ_STRINGS.certyfikatProcedura}</dt>
              <dd>
                <OpisDokumentuWarstwy
                  dokument={widok.identyfikacja.procedura}
                  testid="mvd-oze-cert-procedura"
                />
              </dd>
            </div>
            <div>
              <dt>{MACIERZ_STRINGS.certyfikatNarzedzie}</dt>
              <dd>{widok.identyfikacja.wersja_narzedzia}</dd>
            </div>
          </dl>

          {widok.moduly.map((sekcja) => (
            <SekcjaModuluDokumentu
              key={sekcja.der_ref}
              sekcja={sekcja}
              testid={`mvd-oze-cert-modul-${sekcja.der_ref}`}
            />
          ))}

          <div className="mvd-oze-panel-blok" data-testid="mvd-oze-cert-zalozenia">
            <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.certyfikatZalozenia}</span>
            <ul className="mvd-oze-lista">
              {widok.zalozenia_i_zrodla.map((pozycja, indeks) => (
                <li key={indeks}>{pozycja}</li>
              ))}
            </ul>
          </div>

          <InformacjeAudytowe
            trybEkspercki={trybEkspercki}
            testid="mvd-oze-cert-audyt"
            wiersze={[
              { etykieta: MACIERZ_STRINGS.odciskWejscia, wartosc: widok.odcisk_wejscia_sha256 },
              { etykieta: MACIERZ_STRINGS.odciskWyniku, wartosc: widok.odcisk_wyniku_sha256 },
            ]}
          />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="mvd-btn mvd-btn-glowny"
              onClick={() => onPobierz('docx')}
              disabled={plikLadowanie !== null}
              data-testid="mvd-oze-cert-pobierz-docx"
            >
              {MACIERZ_STRINGS.certyfikatPobierzDocx}
            </button>
            <button
              type="button"
              className="mvd-btn"
              onClick={() => onPobierz('pdf')}
              disabled={plikLadowanie !== null}
              data-testid="mvd-oze-cert-pobierz-pdf"
            >
              {MACIERZ_STRINGS.certyfikatPobierzPdf}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
