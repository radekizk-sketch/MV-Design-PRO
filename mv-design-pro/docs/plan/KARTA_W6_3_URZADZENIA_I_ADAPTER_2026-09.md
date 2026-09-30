# Karta W6-3 — URZĄDZENIA DYNAMICZNE + ADAPTER: rdzeń dynamiki na ścieżce użytkownika

**Status:** karta architekta, 2026-09-18 · **Baza pomiaru:** drzewo `07d93d01`
**Miejsce w misji:** `docs/plan/MISJA_DOMKNIECIA_PRODUKTU_2026-09.md`, wycinek W6 (czas i dynamika);
poprzedniki: W6-1 (kontrakty czasu, `dfa2ba96`), W6-2 (rdzeń DAE, `8d795200`).
**Bramki właściciela:** B-01 — rdzenie FROZEN `network_model/solvers/*` (rozpływ, zwarcia,
zabezpieczenia) i profile YAML NC RfG pozostają NIETKNIĘTE; nowy kod wchodzi wyłącznie do
`network_model/solvers/dynamika/**` (pakiet W6-2, poza zbiorem FROZEN) i do warstw wyższych.
B-02 — werdykt wizualny ekranu wystawia właściciel.

---

## §0. Rozstrzygnięcia architekta (wiążące dla wykonawców — nie do renegocjacji w karcie)

1. **Rdzeń istnieje, ścieżki nie ma.** Pomiar: `network_model/solvers/dynamika/**` to 3 448 wierszy
   kodu + 131 funkcji testowych, a JEDYNY punkt wejścia biegu (`enm/canonical_analysis.py::
   _execute_dynamika_rms`, wiersz 1729) **odmawia zawsze** kodem `KOD_RDZEN_DYNAMIKI_NIEDOSTEPNY`.
   To defekt klasy „backend bez toku pracy" z mapy domknięcia. W6-3 zamienia odmowę na bieg.
2. **Ekran „stabilność" pyta dziś o wynik, nie o daną.** `_execute_dynamic_stability` (wiersz 1591)
   przyjmuje `pre_fault_angle_deg`, `during_fault_angle_deg`, `post_fault_angle_deg`,
   `post_fault_voltage_pu`, `post_fault_frequency_pu` **jako wejście od użytkownika** i liczy z nich
   wyłącznie ocenę progową. Kąt mocy w trakcie i po zwarciu jest WYNIKIEM całkowania — projektant go
   nie zna. To defekt klasy „UI bez zdolności": powierzchnia istnieje, zdolności nie ma.
   Docelowo JEDNA trasa: `dynamika_rms` liczy przebieg, a `application/stability/dynamic_stability.py`
   (247 wierszy, sama interpretacja — progi + etykiety PL, ZERO fizyki) zostaje jako ocena NAD wynikiem
   biegu. Kasacja trasy „kąty od użytkownika" idzie procedurą kasacji, nie po cichu.
3. **Trzeci rdzeń RMS.** `network_model/solvers/stability_rms/**` (603 wiersze) nie ma konsumenta
   produkcyjnego poza metadanymi (`api/catalog.py`, `catalog/der_dynamic/**`). Kandydat na kasację,
   ale leży w `solvers/**` → **bramka B-01**: wykonawca ODCINA import metadanych i **nie kasuje**;
   wniosek o kasację trafia do właściciela jako pozycja OD w mapie domknięcia.
4. **Rodziny urządzeń są już zdefiniowane po stronie ENM** (`enm/dynamika_modele.py`, W6-1):
   `MaszynaSynchroniczna` (6. rząd + AVR + GOV + PSS), `PrzeksztaltnikGFL`, `PrzeksztaltnikGFM`,
   `Magazyn`, `TurbinaWiatrowa` (IEC 61400-27-1 typ 1–4). Rdzeń umie dziś TYLKO maszynę klasyczną,
   szynę sztywną i urządzenie odłączone. **Zakres urządzeń wyprowadzamy z kontraktu ENM, nie z wygody
   solvera** — każda rodzina obecna w `ParametryDynamiczne` musi mieć implementację albo NAZWANĄ
   odmowę; cicha degradacja do maszyny klasycznej jest zakazana (fabrykacja).
5. **Punkt pracy pochodzi z rozpływu, nigdy z domysłu.** `PunktPracy` (napięcia węzłowe + moce źródeł)
   bierzemy z biegu rozpływu na TEJ SAMEJ migawce efektywnej — nie z płaskiego startu i nie z wartości
   znamionowych. Brak rozpływu = nazwana odmowa gotowości, nie start od 1,0 p.u.
6. **Zero fizyki poza `solvers/**`.** Adapter SKŁADA wejście i MAPUJE wynik; nie liczy nic, co ma
   jednostkę fizyczną poza algebrą wielkości pochodnych z `network_model/pochodne/**`. Pilnuje
   `backend_no_physics_guard`.
7. **Determinizm.** Ta sama piątka odcisków (`TozsamoscBiegu`) ⇒ ten sam wynik co do bitu po
   kwantyzacji DT-11. Test determinizmu jest częścią DoD każdej sub-karty, nie dodatkiem.

---

## §1. Inwentarz klasy PRZED pracą (pomiar 2026-09-18, drzewo `07d93d01`)

| Element | Ścieżka | Pomiar | Rola w W6-3 |
|---|---|---|---|
| Rdzeń DAE | `network_model/solvers/dynamika/**` | 3 448 w. + 131 testów | konsument nowych urządzeń |
| Urządzenia rdzenia | `…/dynamika/urzadzenia/` | `maszyna_klasyczna` 244 w., `szyna_sztywna` 131 w., `odlaczone` 99 w. | wzorzec implementacji |
| Kontrakt ENM | `enm/dynamika_modele.py` | 5 rodzin, walidacje krzyżowe, zero `default=` | źródło zakresu urządzeń |
| Kontrakt scenariusza | `enm/scenariusze.py::ScenariuszDynamiczny` | horyzont, krok wyjścia, zdarzenia | wejście harmonogramu |
| Kontrakt wyniku | `application/contracts/resultset_dynamic_v1.py` | kanały, zdarzenia wykonane, właściwości biegu, tożsamość, metryki, stopień dowodowy | wyjście adaptera |
| Wejście biegu | `enm/canonical_analysis.py::_execute_dynamika_rms` | 15 w., odmawia zawsze | miejsce wpięcia |
| Gotowość | `application/calculation_readiness/service.py::_check_dynamika_rms` | istnieje (W6-1) | rozszerzenie o punkt pracy |
| Trasa równoległa | `_execute_dynamic_stability` + `application/stability/**` | kąty od użytkownika + ocena progowa | konwergencja (§0 p. 2) |
| Trzeci rdzeń | `network_model/solvers/stability_rms/**` | 603 w., konsument = metadane | odcięcie importu, B-01 |
| Ekran | `ui2/wyniki/stabilnosc/**` | formularz scenariusza + wykres przebiegu | powierzchnia wyniku |
| Typy FE | `frontend/src/types/enm.ts` (453–690) | lustro 1:1 rodzin | bez zmian kontraktu |

---

## §2. Sub-karta W6-3A — URZĄDZENIA (rdzeń)

**Cel:** każda rodzina `ParametryDynamiczne` ma model w `solvers/dynamika/urzadzenia/` albo nazwaną
odmowę. Implementacja idzie dokładnie za kontraktem ENM — pole po polu, bez wybierania „ważniejszych".

Zakres (KOMPLET, nie wybór):
- `maszyna_synchroniczna.py` — model 6. rzędu (osie d/q, reaktancje przejściowe i podprzejściowe,
  stałe czasowe z kontraktu), regulator napięcia, regulator obrotów, stabilizator systemowy;
- `przeksztaltnik_gfl.py` — pętla synchronizacji, ogranicznik prądu z priorytetem składowej
  **z katalogu** (A-9: priorytet NIGDY wybierany w kodzie);
- `przeksztaltnik_gfm.py` — statyzm / maszyna wirtualna, impedancja wirtualna;
- `magazyn.py` — stan naładowania + przekształtnik (jedna baza mocy), ograniczenia ładowania
  i rozładowania z kontraktu;
- `turbina_wiatrowa.py` — typy 1–4, dwumasowość, crowbar (tylko typ 3), przekształtnik (typ 3/4).

**Dowody (bramka odbioru — wyrocznie ANALITYCZNE, nie „wygląda sensownie"):**
każda rodzina ma co najmniej jedną własność zamkniętą w postaci analitycznej, sprawdzoną liczbowo:
równowaga w punkcie pracy (pochodne stanu = 0 z tolerancją), zgodność małosygnałowa (wartości własne
linearyzacji vs częstotliwość z przebiegu), zachowanie ograniczeń (prąd/moc/SOC nie wychodzą poza
zakres w żadnym kroku), reakcja na skok zgodna ze znakiem i rzędem wielkości wyprowadzonym z
parametrów. Do tego **iniekcja czerwieni**: celowe przestawienie znaku / pominięcie członu MUSI
wywalić test — deklaracja bez testu jest fałszywą pewnością (KLASA NIE INSTANCJA p. 4).

**Granice:** wyłącznie `solvers/dynamika/**`; granica importów pakietu (`dynamika_granica_importow_guard`)
bez zmian; zero edycji rdzeni FROZEN.

---

## §3. Sub-karta W6-3B — ADAPTER (ścieżka biegu)

**Cel:** `dynamika_rms` kończy się WYNIKIEM, nie odmową.

Zakres:
1. Złożenie `WejscieDynamiki` z migawki efektywnej (`apply_scenario`) — węzły, gałęzie (model pi
   z przekładnią zespoloną), odsprzęgi, odbiory, urządzenia z `Generator.dynamika`.
2. `PunktPracy` z biegu rozpływu na TEJ SAMEJ migawce (§0 p. 5) — brak rozpływu = nazwana odmowa.
3. `ScenariuszDynamiczny` → `HarmonogramDynamiki` (pięć rodzajów zdarzeń rdzenia; rodzaj spoza
   zbioru = nazwana odmowa, nigdy ciche pominięcie).
4. `NastawySolvera` z opcji biegu — zero domyślek liczbowych w adapterze.
5. Wynik → `ResultSetDynamicV1` przez `ladunek_resultset_dynamic_v1`, z tożsamością biegu i stopniem
   dowodowym z `solver_input/provenance.py` (parametry z profilu typowego normy ⇒ `DECLARATION`,
   nigdy `VALIDATED_SIMULATION` z automatu).
6. Rozszerzenie `_check_dynamika_rms` o warunek punktu pracy i o rodziny urządzeń bez implementacji.

**Dowody:** bieg end-to-end na sieci z rejestru wzorcowego (`tests/golden/registry.py`) —
od migawki do `ResultSetDynamicV1`; test determinizmu (ta sama piątka odcisków ⇒ ten sam wynik);
test odmowy dla każdego braku (rozpływ, rodzaj zdarzenia, rodzina urządzenia, nastawy);
parytet kontraktu API (snapshot OpenAPI bez dryfu poza polami addytywnymi).

---

## §4. Sub-karta W6-3C — POWIERZCHNIA I KONWERGENCJA

**Cel:** jedna trasa stabilności na ekranie; kąt mocy przestaje być pytaniem do użytkownika.

Zakres:
1. Ekran `ui2/wyniki/stabilnosc` czyta przebieg z biegu `dynamika_rms` (kanały + metryki + zdarzenia
   wykonane), a ocenę progową pokazuje jako interpretację NAD wynikiem, z jawną proweniencją progów.
2. Formularz scenariusza pyta o to, co projektant ZNA (miejsce i czas zwarcia, czas wyłączenia,
   horyzont, krok wyjścia), nie o kąty.
3. Kasacja trasy „kąty od użytkownika" procedurą kasacji: pomiar konsumentów PRZED, odcięcie,
   bramka wskrzeszenia z self-testami i czerwoną iniekcją, wpis w evidence.
4. Odcięcie importu metadanych `stability_rms` (§0 p. 3) — bez kasacji pakietu, z wnioskiem OD.

**Bramka:** B-02 — zrzuty obu motywów dla właściciela; werdykt wizualny NIE jest samocertyfikowany.

---

## §5. Definicja ukończenia (wspólna)

Pełna regresja backendu (`-m "not pandapower and not andes"`), wyrocznie pandapower i ANDES, komplet
guardów `guardy_z_ci.py` + testy własne guardów, mypy, vitest pełny, e2e na realnym backendzie,
snapshot OpenAPI bez dryfu, determinizm potwierdzony pomiarem. Kontrakty FROZEN nietknięte.
Meldunek zawiera inwentarz klasy, pomiary PRZED/PO i JAWNIE nazwany dług, którego karta nie zamyka.
