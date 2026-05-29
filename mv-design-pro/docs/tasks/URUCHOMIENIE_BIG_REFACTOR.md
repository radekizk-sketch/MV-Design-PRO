# 🚀 URUCHOMIENIE — BIG REFACTOR, TRYB AUTONOMICZNY (Opus 4.8, pełna moc)

**Ranga:** directive nadrzędny nad ZADANIE · **Tryb:** autonomiczny, bez pytań, bez raportowania-i-czekania · **Data:** 2026-05-29
**Czytaj NAJPIERW:** `STAN_REPO.md` → potem ten directive → kanon `PROMPT_...` jako definicja „done" → `ORKIESTRACJA_AGENTOW.md` dla zadań masowych.

---

## 1. CEL (jeden, mierzalny)

Doprowadzić MV-DESIGN-PRO do stanu, w którym **wszystkie kryteria K-01…K-30 i J-01…J-05 są spełnione z dowodem**, cały rzeczywisty dług (D-01…D-14) domknięty wg ZASADY NR 1, a SLD osiąga próg ≥ 8/10 (§7.3) — bez wprowadzenia drugiej prawdy, z zachowaniem zamrożonego rdzenia i 100% polskiej warstwy użytkowej.

## 2. MANDAT AUTONOMICZNY (działaj, nie pytaj)

Na **torze backendowym i integralności wartości** (wszystko, co ma obiektywne kryterium: testy, sanity-bounds, walidacja wobec referencji):
- **Działaj do końca bez zatrzymań.** Nie pytaj o rzeczy rozstrzygnięte w kanonie/rejestrze (a rozstrzygnięte jest niemal wszystko — §6). Nie raportuj-i-czekaj między krokami. Nie produkuj półproduktu.
- **Big refactor dozwolony** w obszarach niezamrożonych: warstwa interpretacji wyników, frontend (usuwanie drugiej prawdy), testy, sanity-bounds, nowe solvery.
- **Użyj pełnej mocy orkiestracji** (`ORKIESTRACJA_AGENTOW.md`): `/effort ultracode` lub `workflow` dla zadań masowych/równoległych (audyt, walidacja wielu solverów, dług wielopozycyjny); swarm subagentów wg §3 z barierami B-01…B-05. Recenzja adwersarialna PRZED scaleniem (B-04).
- **Pętla jakości sam-na-sam:** implementuj → testuj → sanity-bounds → recenzent-norm → scal. Iteruj aż kryterium spełnione, nie aż „wygląda gotowo".

## 3. DWA TWARDE PRZYSTANKI (jedyne miejsca, gdzie się zatrzymujesz)

1. **WERDYKT WIZUALNY SLD (B-02).** Możesz zbudować layout, porty, klikalność, tryb prezentacyjny i WYPRODUKOWAĆ zrzuty — ale oceny „≥8/10 / PASS" NIE wystawiasz sam. Doprowadź SLD do stanu gotowego do oceny, zrób zrzuty, ZATRZYMAJ się i przedstaw je właścicielowi. Powód: samocertyfikacja jakości wizualnej to błąd, z którego wziął się werdykt „1/10" po wcześniejszym „klasa industrialna".
2. **EDYCJA ZAMROŻONEGO RDZENIA (B-01).** Frozen solvery (`short_circuit_iec60909.py` i in. FROZEN), model ENM (`enm/models.py`), kontrakty API solverów — NIE dotykasz bez jawnej zgody. Jeśli zadanie tego wymaga, zatrzymaj się i zgłoś. Interpretacja wyników i front są wolne; rdzeń nie.

Poza tymi dwoma — nie zatrzymuj się.

## 4. SEKWENCJA WYKONANIA

**TOR A — autonomiczny do końca (backend, testowalny, bez gate'u):**
1. **D-14 — sanity-bounds (K-08, NAJWYŻSZY).** Bariery absurdu do `_reliability`, `_opf_loss_lcc`, `_uncertainty`; napraw `_benchmark_validation` (walidacja wobec referencji, NIE hardcoded literałów — to cichy fałsz K-09); per-poziom-napięcia absurdity-guard dla Ik'' (DEF-01). Pełne testy + determinizm.
2. **D-13 — usuń drugą prawdę z frontu (Z15).** Przenieś liczenie krzywych IEC/IEEE + koordynacji z `ProtectionCurvesEditor.tsx` do backendu; usuń dobór trafo `powerKw/0.9` z `AddDerWizard.tsx:505`. Front czyta, nie liczy.
3. **K-04** — walidacja 23 progów V12.6 testami dedykowanymi.
4. **Dług funkcjonalny (§8C):** D-04 ZIP → D-03 stabilność impedancyjna/SSCI (SCR done) → D-01 Arc Flash → D-02 CIM/CGMES → D-05 IEC 61850/WLS → D-06 dobory fizyczne. Każdy: solver + kontrakt + White Box + testy + sanity-bounds + integracja.
5. **Porządki:** D-10 (wygaszenie legacy `DYNAMIC_TEST_IDS`), D-11 (decyzja zakresowa TT/IT).

**TOR B — równoległy, z gate'em wizualnym (SLD):**
6. **V-06** (tani): podłącz istniejący chrome prezentacyjny (ramka/metryczka/skala/legenda) w `SldCanvasV2`.
7. **Silnik layoutu drzewiastego + zakotwiczenie portów (V-07)** wg `SLD_GEOMETRY_CONTRACT_V1.md` (`LayoutEngine.layout(snapshot, mode) → LayoutResult`, adapter rysuje port→port, koniec slotów). Generator: `add_converter_source` der=0 + branch≈1.
8. Klikalność (V-08 — w większości zrobiona), wszystkie łańcuchy OZE (V-10), na substracie ≥50 stacji.
9. **→ ZRZUTY → STOP → werdykt właściciela** (próg §7.3, 11 warunków, ≥8/10). Tryb geo odłożony (D-12).

Tor A i B mogą iść równolegle (różne obszary kodu). Tor A nie czeka na gate Toru B.

## 5. DEFINICJA „DONE" (obiektywna — nie do sfałszowania)

Pozycja domknięta wyłącznie, gdy: solver liczy + test jednostkowy zielony + sanity-bounds trzyma + White Box obecny + wynik ma pochodzenie danych + zintegrowane z API/UI + guardy PASS. Dla SLD dodatkowo: werdykt wizualny właściciela ≥ 8/10. Po każdej domkniętej pozycji → wpis do `STAN_REPO.md` (co, dowód, pozostały dług). „Renderuje się / testy zielone / wygląda gotowo" NIE są dowodem ukończenia.

## 6. REJESTR USTALEŃ ZAMROŻONYCH (nic nie zapomnieć)

**Proces:** (1) repo > specy > rejestr (§5.0), nie przebudowuj działającego V12.6 z „no_module"; (2) 4 warstwy: PROMPT/STAN_REPO/ZADANIE/ORKIESTRACJA; (3) ZASADA NR 1 = zero długu, pełne wdrożenie, zero zaślepek; (4) ZASADA NR 2 = werdykt wizualny właściciela, nie samocertyfikacja; (5) zakaz drugiej prawdy (Z15) — jedna prawda ENM, UI czyta; (6) 100% polska warstwa użytkowa, symbole IEC 60617; (7) hierarchia pochodzenia danych, pakiet OSD bez wartości oszacowanych/domyślnych; (8) White Box obowiązkowy; (9) frozen solvery/ENM/API nietykalne (B-01); (10) K-01…K-30 + J-01…J-05.

**Stan:** (11) repo na V12.6, ~5249 testów zielonych; (12) dług realny D-01…D-14 (Arc Flash, CIM/CGMES, SCR✔/impedancja+SSCI, ZIP, IEC61850/WLS, dobory fizyczne, legacy, geo odłożony, druga prawda front, sanity-bounds); (13) K-04/K-08 (wiarygodność wartości) > brakujące moduły.

**SLD:** (14) V-01…V-10 blokujące, próg §7.3 = 11 warunków ≥8/10; (15) V-07 = defekt renderu, nie modelu (ENM ma porty), naprawa w adapterze; (16) substrate ≥50 stacji obowiązkowy (V-09); (17) layout drzewiasty + porty równolegle przez wspólny kontrakt geometrii; (18) przełączalny topologiczny↔geo, geo odłożony (D-12, brak współrzędnych → CGMES po D-02); (19) V-05/V-08 ADDRESSED, V-06/V-07 OPEN.

**Orkiestracja:** (20) dynamic workflows / ultracode / swarm (zweryfikowane, research preview); (21) bariery B-01…B-05; (22) swarm przeorganizował priorytety: D-14 aktywny najwyższy (backend, bez gate'u), SLD tor równoległy z gate'em.

## 7. KLAUZULA ANTY-FAŁSZ (to czyni „pełną moc" prawdziwą)

Raportuj uczciwie: co domknięto z dowodem, co częściowe, czego nie dało się zrobić i dlaczego. Korekta w obie strony — jeśli coś okaże się już zrobione (jak V-08), powiedz to; jeśli „zielone" jest fałszywe (jak `_benchmark_validation`), zgłoś. Nigdy nie zawyżaj. Pełna moc Opus 4.8 to przepustowość bez pytań tam, gdzie kryterium jest obiektywne — NIE prawo do deklarowania ukończenia bez dowodu. Swarm na zaślepkach to 100× dług, nie postęp.

---

**START:** Tor A od D-14 (sanity-bounds), natychmiast, autonomicznie, z orkiestracją gdzie zasadne. Tor B równolegle od V-06. Zatrzymaj się tylko na dwóch twardych przystankach (§3). Działaj.

*Directive efemeryczny. Po wykonaniu zarchiwizować; trwały ślad = `STAN_REPO.md` + dowody. Nadrzędne pozostają ZASADA NR 1, ZASADA NR 2, zakaz drugiej prawdy.*
