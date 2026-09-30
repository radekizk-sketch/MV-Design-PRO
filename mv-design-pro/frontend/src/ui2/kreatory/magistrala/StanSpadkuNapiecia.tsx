/*
 * Stan zerowy spadku napięcia w panelu teorii kreatora magistrali SN (karta
 * W3-J, 2026-09-16). ZASTĘPUJE `WykresSpadku.tsx` (usunięty): dawny komponent
 * rysował SVG z FABRYKOWANĄ krzywą — „spadek poglądowy 4% × (cosφ+sinφ)" bez
 * podstawy fizycznej (R≈X to założenie wymyślone dla ilustracji, nie parametr
 * katalogowy) i limit „0,95 (poglądowo)" bez cytowanej normy — liczone WPROST
 * w UI, wbrew zasadzie zero fizyki w warstwie prezentacji.
 *
 * Kreator buduje odcinek magistrali PRZED zapisem do modelu sieci — nie ma
 * dostępu do wyniku przebiegu rozpływu dla tego (jeszcze niezapisanego)
 * odcinka, więc NIE MA z czego pokazać realnego profilu napięcia. Uczciwy
 * stan: komunikat + akcja „Uruchom rozpływ" z rejestru `akcjeStanuZerowego`
 * (ten sam tor co przycisk „Oblicz" powłoki) — zero liczenia w UI.
 */

import { KreatorInfo } from '../rama';
import { PrzyciskAkcjiStanu, useAkcjaUruchomObliczenie } from '../../wyniki/wzorzec';
import { MAGISTRALA_STRINGS as T } from './strings';

/** Uczciwy stan zerowy spadku napięcia (zamiast fabrykowanej krzywej) —
 * reużywa istniejące komponenty wzorca (`KreatorInfo`, `PrzyciskAkcjiStanu`)
 * zamiast wprowadzać nowe, niestylowane klasy. */
export function StanSpadkuNapiecia() {
  const akcjaRozplyw = useAkcjaUruchomObliczenie('LOAD_FLOW');
  return (
    <div className="mvd-wykres-fig" data-testid="mvd-kreator-magistrala-spadek-stan">
      <KreatorInfo testid="mvd-kreator-magistrala-spadek-stan-opis">
        <strong>{T.spadekNiedostepnyTytul}</strong> {T.spadekNiedostepnyOpis}
      </KreatorInfo>
      <PrzyciskAkcjiStanu akcja={akcjaRozplyw} testid="mvd-kreator-magistrala-spadek-stan" />
    </div>
  );
}
