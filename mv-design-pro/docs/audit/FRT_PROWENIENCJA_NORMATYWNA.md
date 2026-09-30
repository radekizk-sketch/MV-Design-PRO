# Obwiednie FRT — dochodzenie proweniencji normatywnej (OD-33)

**Zlecenie:** decyzja właściciela OD-33 po zamrożeniu zdolności docelowej: *„DO NOT choose one of
the existing two envelopes merely because it already exists. First establish the normative
provenance."* Dokument ustala, **co jest w repozytorium**, a nie **co jest normatywnie poprawne** —
tego drugiego nie da się ustalić bez dokumentu źródłowego, którego repozytorium nie niesie.

**Baza:** HEAD `cb2cb93e`.

---

## 1. KOREKTA wcześniejszego meldunku

W meldunku do znaleziska N-8 napisałem, że w repozytorium są **dwie** sprzeczne obwiednie FRT.
**To było niepełne.** Są **trzy** reprezentacje, a ta, którą nazwałem „backendową", **nie jest**
tą, z której korzysta produkcyjna ocena FRT.

---

## 2. Inwentarz — trzy reprezentacje, trzy różne zbiory liczb

| | **R1 — rejestr profili operatorskich** | **R2 — stała w torze legacy** | **R3 — kopia we froncie** |
|---|---|---|---|
| Miejsce | `backend/src/catalog/profiles/nc_rfg/{pse,pge,energa,enea,tauron}.yaml`, pole `voltage_levels.lvrt/.hvrt` | `backend/src/application/stability/voltage_trajectory.py:129-139` (`NC_RFG_LVRT_ENVELOPE`) | `frontend/src/ui/network-build/station-der/frtEnvelopeValidator.ts:52-65` (`STANDARD_LVRT_PSE`) |
| Model danych | `NcRfgRideThroughPoint` + `NcRfgVoltageLevels` (`loader.py:44-51`) | `FrtEnvelopePoint` (dataclass lokalny) | interfejs TypeScript lokalny |
| Konsumenci produkcyjni | **TAK** — `network_model/solvers/ncrfg_ptpiree/engine.py:637`, `application/analyses/frt_trajektorie.py:217`, `application/analyses/frt_sekwencja.py:164`, `api/ncrfg_ptpiree_tests.py:44` | jeden: legacy `_execute_dynamic_stability` (przez `generate_voltage_trajectory`) | **ŻADEN** — importuje ją wyłącznie jej własny test |
| LVRT | `(0,00; 0,05) (0,15; 0,05) (0,70; 0,50) (1,50; 0,85) (3,00; 0,90)` | `(0; 0,00) (0,15; 0,00) (0,15001; 0,30) (0,70; 0,70) (1,50; 0,85) (3,00; 0,90) (60; 0,90)` | `(0; 0,05) (0,15; 0,05) (0,50; 0,30) (3,0; 0,85) (60; 0,95)` |
| HVRT | `(0,00; 1,30) (0,10; 1,25) (0,50; 1,20) (1,00; 1,15) (60,00; 1,10)` (PSE; profile OSD bez punktu 0,50) | `voltage_pu_max` w tych samych punktach co LVRT | `(0; 1,30) (0,1; 1,30) (0,5; 1,20) (60; 1,10)` |
| Interpolacja | po stronie domeny (`ncrfg_ptpiree/engine.py`) | brak (używana jako dane, nie do oceny) | **własna** (`interpolateEnvelope`, `:67`) — ocena kryterium w warstwie prezentacji |

**Rozbieżności są merytoryczne, nie kosmetyczne.** Przykład: przy `t = 0,7 s` R1 wymaga
`U ≥ 0,50 pu`, R2 wymaga `U ≥ 0,70 pu`, a R3 (po interpolacji między 0,50 s i 3,0 s) daje
`≈ 0,34 pu`. Ten sam przebieg dostałby trzy różne werdykty.

---

## 3. Czego repozytorium NIE niesie — i to jest sedno OD-33

Rejestr profili (R1) ma **strukturę** stosowalności, ale nie ma **identyfikacji dokumentu**:

| Element wymagany przez właściciela | Stan w R1 | Uwaga |
|---|---|---|
| jurysdykcja / operator | **JEST** — `operator_id`, `operator_name_pl` | pięć profili: PSE + cztery OSD |
| poziom napięciowy stosowalności | **JEST** — `voltage_level_pl` (opisowy) | tekst, nie predykat — nie da się z niego bramkować |
| dokument źródłowy | **BRAK** | komentarz nagłówkowy mówi „Bazuje na: IRiESD … + NC RfG", bez tytułu, numeru i artykułu/załącznika |
| wersja / data dokumentu | **CZĘŚCIOWO** — `last_revision: "2024-Q4"` | to znacznik rewizji pliku, nie wydanie dokumentu |
| stosowalność wg typu modułu wytwórczego | **BRAK dla obwiedni** | `module_types` A/B/C/D istnieje i `classify_module` działa (`loader.py:80-93`); `p_recovery_after_fault.required_for_modules` używa typów — **ale `voltage_levels` NIE jest różnicowane po typie**, choć wymagania FRT wg NC RfG są zależne od typu |
| parametryzacja | **BRAK** | obwiednia jest listą punktów, bez parametrów, z których punkty by wynikały |
| proweniencja pozycji | **BRAK** | nie ma pola „skąd ta liczba" |

**Dodatkowa obserwacja, która sama w sobie jest sygnałem:** wszystkie pięć profili (operator
przesyłowy i cztery różne OSD) ma **identyczną krzywą LVRT**. Pięć niezależnych instrukcji ruchu
dających co do punktu tę samą krzywą jest możliwe, ale wymaga potwierdzenia dokumentem —
inaczej bardziej prawdopodobne jest, że jedna krzywa została skopiowana pięć razy.

---

## 4. Rozstrzygnięcie proponowane (do decyzji właściciela)

**Kanoniczne źródło prawdy = R1 (rejestr profili operatorskich), rozszerzony o proweniencję.**
Uzasadnienie: R1 jako jedyne ma już strukturę stosowalności, loader, konsumentów produkcyjnych i
mechanizm wersjonowania — reużycie zamiast trzeciego równoległego rozwiązania.

Rozszerzenie wymagane PRZED uznaniem R1 za normatywne:

1. `dokument_zrodlowy`: tytuł, wydawca, numer/wydanie, data obowiązywania,
2. `zakres_stosowania`: typ modułu wytwórczego (A/B/C/D), poziom napięciowy jako predykat, rodzaj
   przyłączenia,
3. obwiednia **per typ modułu**, a nie jedna na profil,
4. `proweniencja` per krzywa: skąd pochodzą punkty (przepisane z tabeli / wyprowadzone z parametrów
   / przyjęte),
5. jawna wersja profilu w wyniku biegu — badanie ma być odtwarzalne co do wydania wymagań.

**Do czasu ustalenia proweniencji: żadna z trzech reprezentacji nie jest oznaczana jako
normatywnie poprawna.** Ocena FRT pozostaje przy R1, bo to ona jest w torze produkcyjnym, ale
**bez** przypisania jej statusu „zgodne z normą" — z widocznym stanem „podstawa normatywna
niepotwierdzona".

---

## 5. Co wolno zrobić od razu, a czego nie

| Czynność | Wolno? | Warunek |
|---|---|---|
| Kasacja R3 (martwa kopia frontowa + jej test) | **TAK**, ale wg warunków właściciela | (1) dowód, że jest martwa — wykonany: jedyny importer to własny test; (2) zachowanie wartościowego przypadku regresji — przypadki interpolacji i granic przenieść do testów oceny po stronie domeny; (3) zapis rozbieżności jako dowodu — ten dokument; (4) **kasacja NIE oznacza uznania R1 ani R2 za poprawne** |
| Kasacja R2 | **NIE teraz** | R2 zasila legacy „szereg czasowy" toru progowego; jego los to OD-29, a nie ta karta |
| Wybór jednej z trzech krzywych jako „prawidłowej" | **NIE** | dopóki nie ma dokumentu źródłowego |
| Ocena FRT na rzeczywistym przebiegu RMS | **NIE teraz** | wymaga `U(t)` z biegu czasowego oraz jednej obwiedni — fala W6-D |
