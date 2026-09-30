/*
 * Sekcja „Modele dynamiczne źródeł" ekranu dynamiki (karta AB-P1 §0.3) — cel akcji
 * naprawczej kanonu `der.dynamika_missing` (nawigacja `{tab: 'dynamika', focus:
 * 'dynamic_model_ref'}`). Dla każdego wytwórcy: stan modelu dynamicznego z backendu
 * (`application/dynamika/gotowosc.py`), pochodzenie parametrów, powód odmowy i wybór
 * profilu katalogowego ZGODNEGO z rodzajem wytwórcy (lista z backendu).
 *
 * Wiązanie idzie kanoniczną operacją domenową `set_der_catalog_bindings` przez magazyn
 * migawki — backend materializuje z profilu kopię `Generator.dynamika` (jedna funkcja
 * `enm.dynamika_z_katalogu.materializuj_dynamike`). Brak ręcznego edytora parametrów:
 * interfejs nie tworzy ani nie zmienia żadnej liczby modelu.
 */

import { useState } from 'react';

import { formatGeneratorTypeLabelPl } from '../../../ui/shared/generatorTypeLabels';
import { etykietaZeSlownika } from '../wzorzec/slownikWyliczen';
import type { ZrodloDynamiki } from './model';
import { DYNAMIKA_STRINGS as T } from './strings';

export interface SekcjaModeliZrodelProps {
  readonly zrodla: readonly ZrodloDynamiki[];
  /** Wytwórca wskazany deep-linkiem akcji naprawczej (fokus wiersza). */
  readonly wskazanyRef: string | null;
  readonly zapisywanyRef: string | null;
  readonly onPowiaz: (generatorRef: string, profileId: string | null) => void;
  readonly onPokazNaSchemacie: (generatorRef: string, nazwa: string) => void;
}

function stanPl(stan: ZrodloDynamiki['stan']): string {
  switch (stan) {
    case 'z_katalogu':
      return T.stanZKatalogu;
    case 'wlasny':
      return T.stanWlasny;
    case 'brak':
      return T.stanBrak;
    case 'odmowa':
      return T.stanOdmowa;
    case 'nieaktualna':
      return T.stanNieaktualna;
  }
}

function WierszZrodla({
  zrodlo,
  wskazany,
  zapisywany,
  onPowiaz,
  onPokazNaSchemacie,
}: {
  zrodlo: ZrodloDynamiki;
  wskazany: boolean;
  zapisywany: boolean;
  onPowiaz: SekcjaModeliZrodelProps['onPowiaz'];
  onPokazNaSchemacie: SekcjaModeliZrodelProps['onPokazNaSchemacie'];
}) {
  const [wybor, setWybor] = useState<string>(zrodlo.wiazanie ?? zrodlo.profil_typu ?? '');
  const wymagaAkcji = zrodlo.akcja_naprawcza !== null;
  const pochodzenie = zrodlo.zrodlo_proweniencji
    ? etykietaZeSlownika(T.zrodloProweniencji, zrodlo.zrodlo_proweniencji)
      + (zrodlo.odniesienie_proweniencji ? ` — ${zrodlo.odniesienie_proweniencji}` : '')
    : '—';
  return (
    <tr
      ref={(wiersz) => {
        // Fokus akcji naprawczej: wiersz wskazanego wytwórcy w polu widzenia.
        if (wiersz && wskazany) wiersz.scrollIntoView?.({ block: 'center' });
      }}
      data-testid={`mvd-dynamika-zrodlo-${zrodlo.ref_id}`}
      data-stan={zrodlo.stan}
      data-wskazany={wskazany ? 'tak' : undefined}
      className={wskazany ? 'mvd-dynamika-wiersz-wskazany' : undefined}
    >
      <td>
        <button
          type="button"
          className="mvd-dynamika-link"
          onClick={() => onPokazNaSchemacie(zrodlo.ref_id, zrodlo.nazwa)}
          title={T.pokazNaSchemacie}
        >
          {zrodlo.nazwa}
        </button>
      </td>
      <td>{formatGeneratorTypeLabelPl(zrodlo.gen_type)}</td>
      <td>
        <span className="mvd-dynamika-stan" data-stan={zrodlo.stan}>
          {stanPl(zrodlo.stan)}
        </span>
        {zrodlo.odmowa_komunikat && (
          <div className="mvd-dynamika-powod" data-testid={`mvd-dynamika-zrodlo-${zrodlo.ref_id}-odmowa`}>
            {zrodlo.odmowa_komunikat}
          </div>
        )}
        {wymagaAkcji && zrodlo.akcja_naprawcza && (
          <div className="mvd-dynamika-powod">{zrodlo.akcja_naprawcza.komunikat_pl}</div>
        )}
      </td>
      <td>{pochodzenie}</td>
      <td>
        {zrodlo.profile_zgodne.length === 0 ? (
          <span className="mvd-dynamika-powod">{T.brakProfili}</span>
        ) : (
          <div className="mvd-dynamika-wiazanie">
            <select
              aria-label={`${T.kolWiazanie}: ${zrodlo.nazwa}`}
              data-testid={`mvd-dynamika-zrodlo-${zrodlo.ref_id}-profil`}
              value={wybor}
              disabled={zapisywany}
              onChange={(e) => setWybor(e.target.value)}
            >
              <option value="">{T.wybierzProfil}</option>
              {zrodlo.profile_zgodne.map((p) => (
                <option key={p.profile_id} value={p.profile_id}>
                  {p.nazwa}
                  {p.model_w_rdzeniu ? '' : ` ${T.profilPozaRdzeniem}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="mvd-dynamika-akcja"
              data-testid={`mvd-dynamika-zrodlo-${zrodlo.ref_id}-powiaz`}
              disabled={zapisywany || wybor === '' || (wybor === zrodlo.wiazanie && zrodlo.stan === 'z_katalogu')}
              onClick={() => onPowiaz(zrodlo.ref_id, wybor)}
            >
              {zapisywany ? T.powiazanie : T.powiaz}
            </button>
            {zrodlo.wiazanie !== null && (
              <button
                type="button"
                className="mvd-dynamika-akcja-drugorzedna"
                data-testid={`mvd-dynamika-zrodlo-${zrodlo.ref_id}-odwiaz`}
                disabled={zapisywany}
                onClick={() => onPowiaz(zrodlo.ref_id, null)}
              >
                {T.odwiaz}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function SekcjaModeliZrodel({
  zrodla,
  wskazanyRef,
  zapisywanyRef,
  onPowiaz,
  onPokazNaSchemacie,
}: SekcjaModeliZrodelProps) {
  return (
    <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-zrodla" id="dynamic_model_ref">
      <h4>{T.zrodlaTytul}</h4>
      <p className="mvd-dynamika-opis">{T.zrodlaOpis}</p>
      {zrodla.length === 0 ? (
        <p className="mvd-dynamika-opis">{T.zrodlaBrak}</p>
      ) : (
        <table className="mvd-dynamika-tabela">
          <thead>
            <tr>
              <th>{T.kolZrodlo}</th>
              <th>{T.kolRodzaj}</th>
              <th>{T.kolStan}</th>
              <th>{T.kolPochodzenie}</th>
              <th>{T.kolWiazanie}</th>
            </tr>
          </thead>
          <tbody>
            {zrodla.map((zrodlo) => (
              <WierszZrodla
                key={`${zrodlo.ref_id}|${zrodlo.wiazanie ?? ''}|${zrodlo.stan}`}
                zrodlo={zrodlo}
                wskazany={zrodlo.ref_id === wskazanyRef}
                zapisywany={zrodlo.ref_id === zapisywanyRef}
                onPowiaz={onPowiaz}
                onPokazNaSchemacie={onPokazNaSchemacie}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
