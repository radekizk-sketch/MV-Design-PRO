/*
 * RegulacjaOze — trzecia podzakładka okna „Rozpływ mocy" (karta W3-H, badanie
 * śladu WHITE BOX „Q wstrzyknięte w biegu vs prawo Q(U)/cosφ(P)" — wariant B,
 * ZERO FABRYKACJI). Karta kazała zbadać, czy ślad realnego przebiegu (dowolny
 * z trzech solverów: Newton-Raphson, Gauss-Seidel, fast-decoupled) niesie per
 * generator: tryb regulacji, wstrzykniętą moc bierną, napięcie w punkcie pracy,
 * limit Q i flagę osiągnięcia ograniczenia.
 *
 * WYNIK BADANIA (meldunek karty W3-H, tabela per tryb z dowodem z realnych
 * przebiegów testowych): kontrakt konsumowany przez ten ekran —
 * `PowerFlowResultV1` (`ui/power-flow-results/types.ts`, ten sam co
 * `TabelaSzyn`/`TabelaGalezi`) — niesie WYŁĄCZNIE zagregowane wielkości szyny
 * (`bus_results[].q_injected_mvar`), nigdy per-generator. Głębiej: solver
 * Newtona-Raphsona (WYŁĄCZNIE on, nie GS/FD) przy `trace_level="full"` liczy
 * WEWNĘTRZNIE rekord `inverter_sources` (tryb, Q wstrzyknięte, `q_volt_var_pu`
 * dla Q(U)) — ale tor kanoniczny biegów (`enm/canonical_analysis.py::
 * _execute_power_flow`, JEDYNY tor produkcyjny) odrzuca ten rekord PRZED
 * zapisaniem przebiegu: ani `raw_result`, ani `white_box_trace`, ani
 * `power_flow_trace` go nie niosą — potwierdzone biegiem przez
 * `enm.canonical_analysis.execute_run` w meldunku karty. LIMIT Q i FLAGA
 * OSIĄGNIĘCIA OGRANICZENIA nie istnieją NIGDZIE w śladzie — nawet w
 * wewnętrznym rekordzie solvera Newtona (potwierdzone: Q(U) nasycone do
 * granicy `qu_q_max_pu` zwraca dokładnie tę liczbę, bez żadnej flagi „to jest
 * granica").
 *
 * DECYZJA (wariant B karty W3-H): ZERO FABRYKACJI. Ekran NIE liczy trybu/Q/
 * limitu z nastaw modelu (to byłaby fizyka w UI — zakazana), NIE udaje danych
 * z przebiegu, których przebieg nie niesie. Pokazuje uczciwy stan zerowy z
 * nazwanym powodem i odesłaniem do decyzji właściciela OD-15 (mapa
 * `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §7) — zamiast wykresu, do
 * którego dziś nie ma pokrycia w kontrakcie.
 *
 * Read-only; zero fizyki, zero mutacji, zero wołań API z tego pliku — jak
 * `TabelaSzyn`/`TabelaGalezi` (reużyty `useWynikRozplywu`).
 */

import './rozplyw.css';
import { ROZPLYW_STRINGS } from './strings';
import { useWynikRozplywu } from './adapters/rozplywAdapter';

export function RegulacjaOze() {
  const { wynik } = useWynikRozplywu();

  if (!wynik) {
    return (
      <div className="mvd-wyn" data-testid="mvd-rozplyw-regulacja-oze">
        <div className="mvd-rozplyw-pusty">
          <p className="mvd-rozplyw-pusty-title">{ROZPLYW_STRINGS.brakWyniku}</p>
          <p className="mvd-rozplyw-pusty-desc">{ROZPLYW_STRINGS.brakWynikuOpis}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mvd-wyn" data-testid="mvd-rozplyw-regulacja-oze">
      <div
        className="mvd-rozplyw-pusty"
        data-testid="mvd-rozplyw-regulacja-oze-niedostepne"
      >
        <p className="mvd-rozplyw-pusty-title">{ROZPLYW_STRINGS.regulacjaOzeTytul}</p>
        <p className="mvd-rozplyw-pusty-desc">{ROZPLYW_STRINGS.regulacjaOzeOpis}</p>
        <p className="mvd-rozplyw-pusty-desc">{ROZPLYW_STRINGS.regulacjaOzeOpisUzupelnienie}</p>
        <p
          className="mvd-rozplyw-pusty-desc"
          data-testid="mvd-rozplyw-regulacja-oze-od15"
        >
          {ROZPLYW_STRINGS.regulacjaOzeDecyzja}
        </p>
      </div>
    </div>
  );
}
