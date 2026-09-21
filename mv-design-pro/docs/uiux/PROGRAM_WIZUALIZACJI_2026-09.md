# PROGRAM WIZUALIZACJI INŻYNIERSKIEJ — MV-DESIGN-PRO (2026-09)

**Status:** PROPOZYCJA (podrzędna wobec kanonu V12.xx, `docs/system/SPEC_*`, `PROGRAM_UIUX_2026-07.md`)
**Data:** 2026-09-21
**Zakres:** animacje, wykresy interaktywne i ulepszenia wizualne — całość warstwy prezentacji jako JEDEN system.
**Dokumenty powiązane:**
- `docs/uiux/PROGRAM_UIUX_2026-07.md` — program nadrzędny (fazy U0–U5)
- `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` — inwentarz funkcji (wiążący)
- `docs/uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md` — wspólna selekcja, kontrakt świeżości
- `docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md` — granica „zero fizyki w UI" (guard `ui_no_physics_guard.py`)
- `docs/plan/PLAN_SLD_REWORK.md`, `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` — SLD

---

## 0. Diagnoza stanu — POMIAR, nie wrażenie (2026-09-21)

Rozpoznanie wykonane na HEAD (`7e84753a`). Liczby i ścieżki są zmierzone, nie przypomniane.

| Fakt | Dowód |
|------|-------|
| Recharts użyty w **21 plikach**; **każdy** wykres z `isAnimationActive={false}` | `grep -rl recharts src` · `grep -rn isAnimationActive` |
| **Zero animacji w całym froncie**: brak `@keyframes`, brak `animation:` w jakimkolwiek `.css` | `grep -rn "@keyframes\|animation:" --include=*.css src` → pusty |
| **Brak `prefers-reduced-motion`** w całym repo | `grep -rn prefers-reduced-motion src` → pusty |
| Tokeny powłoki: **69 kluczy `--mvd-*`**, dwa motywy z parytetem kluczy, **zero tokenów ruchu** | `ui2/theme/tokens.css` |
| Wzorzec ekranu ma gotowy **slot `wykres`** | `ui2/wyniki/wzorzec/EkranAnalizy.tsx` |
| Szyna zdarzeń z `ZdarzenieSelekcja` **istnieje i działa** | `ui2/events/bus.ts`, `events/types.ts` |
| Na 21 ekranów wyników wykres ma **5** (zwarcia, OLTC, rozpływ, stabilność + OZE) | `ls ui2/wyniki/*/Wykres*.tsx` |

### 0.1. DŁUG WYKRYTY PRZY ROZPOZNANIU (ZASADA NR 1 — do domknięcia)

**Kontrakt animacji istnieje end-to-end i jest MARTWY.** Pełny łańcuch:

```
domain/result_set.py: OverlayElement.animation_token: str | None
  → ui/sld-overlay/overlayTypes.ts:50         animation_token
  → LoadFlowOverlayAdapter.ts:214             'pulse' gdy hasFlow
  → ShortCircuitFlowOverlayAdapter.ts:176     'pulse'
  → ZeroSequenceOverlayAdapter.ts:76-77       'flow_forward' / 'flow_reverse'
  → OverlayEngine.ts:51                       animationClass = ANIMATION_TOKEN_MAP[token]
  → overlayTypes.ts:226                       { pulse: 'sld-overlay-anim-pulse', blink: 'sld-overlay-anim-blink' }
  → ??? KONIEC ŁAŃCUCHA
```

Dwa niezależne przerwania:
1. Klasy `sld-overlay-anim-pulse` i `sld-overlay-anim-blink` **nie istnieją w żadnym pliku CSS**.
2. Pole `animationClass` **nie jest konsumowane przez żaden renderer** — jedyne wystąpienia poza `OverlayEngine.ts` to deklaracja typu i testy.

Efekt: adaptery liczą tokeny, testy sprawdzają, że je liczą (`LoadFlowOverlayAdapter.test.ts:282`,
`ShortCircuitFlowOverlayAdapter.test.ts:69`), a użytkownik **nie widzi nic**. To wzorcowa
„funkcja istniejąca tylko w testach, niewpięta w ścieżkę użytkownika" — dokładnie ta definicja
długu, którą ZASADA NR 1 zakazuje. Program poniżej zaczyna się od zamknięcia tego łańcucha,
bo cała warstwa ruchu na SLD stoi na tym kontrakcie.

---

## 1. Teza projektowa — TRZY PRAWA RUCHU

MV-DESIGN-PRO to narzędzie **projektowe i dowodowe**, nie pulpit SCADA. Ruch, który nie niesie
wielkości, kosztuje: łamie determinizm, psuje zrzuty do bramki B-02, destabilizuje CI i odbiera
uwagę tam, gdzie liczy się liczba. Dlatego ruch dopuszczamy wyłącznie pod trzema prawami.

**PRAWO 1 — Ruch koduje wielkość.** Każda animacja odwzorowuje wielkość *fizyczną*
(kierunek i natężenie przepływu, propagacja prądu zwarciowego, kolejność zadziałań, czas
w trajektorii) albo *epistemiczną* (wynik nieaktualny, trwa przeliczanie, co się zmieniło
między wariantami). Ruch ozdobny — przejścia paneli, „oddychające" przyciski, efekty wejścia
kart — jest **zakazany**. Kryterium przyjęcia: *czy z ruchu da się odczytać wartość lub znak?*
Nie → ruchu nie ma.

**PRAWO 2 — Ruch jest zamrażalny, a stan zamrożony jest kanoniczny.** Każdy widok ma
statyczny render bit-identyczny przy tych samych danych. Ruch znika w trzech sytuacjach
i to jest inwariant CI: eksport (PDF/DOCX/PNG), zrzut do odbioru wizualnego, oraz
`prefers-reduced-motion: reduce`. Wykresy Recharts **zachowują `isAnimationActive={false}`**
— to nie jest regres, tylko świadomy fundament determinizmu; ruch żyje na SLD i w jawnie
uruchamianych odtwarzaczach, nie w słupkach.

**PRAWO 3 — O ruchu decyduje backend, UI wykonuje.** Ruch jest wynikiem oceny stanu, a ocena
stanu to warstwa analizy (`overlay_no_physics_guard.py`, `ui_no_physics_guard.py`).
UI dostaje **token + znormalizowane tempo**, nie surowe amperów. Tempo policzone w UI z prądu
i obciążalności byłoby fizyką w prezentacji i słusznie padłoby na guardzie.

---

## 2. Fundament systemowy — pięć warstw, wspólnych dla wszystkich okien

### W1. Tokeny ruchu (`ui2/theme/tokens.css`)

Parytet motywów jak dla kolorów — ten sam zbiór kluczy w `light_technical` i `dark_scada`:

```
--mvd-motion-flow-period:   1400ms   /* okres przesuwu kreski przepływu przy tempie 1,0 */
--mvd-motion-pulse-period:   900ms   /* puls miejsca zwarcia / elementu krytycznego      */
--mvd-motion-transition:     220ms   /* zmiana stanu overlay (A→B, świeżość)             */
--mvd-motion-wavefront:      700ms   /* jednorazowa propagacja (zwarcie, kaskada)        */
--mvd-motion-ease:           cubic-bezier(0.4, 0.0, 0.2, 1)
--mvd-motion-scale:          1       /* 0 = ruch wyłączony (eksport, reduce-motion)      */
```

Wszystkie animacje mnożą czas przez `--mvd-motion-scale`. Jedna zmienna wyłącza ruch w całej
aplikacji — to jest mechanizm zamrożenia z PRAWA 2, nie „opcja w ustawieniach".

### W2. Ożywienie kontraktu `animation_token` (domknięcie długu z §0.1)

Rozszerzenie słownika tokenów — addytywne, `exclude_none`, FROZEN nietknięty:

| Token | Znaczenie | Wielkość kodowana |
|-------|-----------|-------------------|
| `flow_forward` / `flow_reverse` | kierunek mocy czynnej w gałęzi | znak P |
| `pulse` | miejsce zwarcia / element przekroczony | — (wyróżnienie) |
| `blink` | naruszenie krytyczne wymagające decyzji | — |
| `wavefront` | jednorazowa propagacja od źródeł do miejsca zwarcia | kolejność topologiczna |
| `fade_stale` | wynik nieaktualny wobec rewizji modelu | stan epistemiczny |

Plus **jedno addytywne pole**: `animation_rate: float | None` ∈ ⟨0,1⟩ — znormalizowane tempo
policzone **w backendzie** (np. I/I_th dla gałęzi). UI mnoży okres przez `1/rate`. Bez tego
pola ruch byłby binarny („płynie / nie płynie") i tracił połowę wartości: inżynier ma widzieć
nie tylko *dokąd*, ale i *jak mocno*.

Domknięcie łańcucha: klasy CSS + konsumpcja `animationClass` w rendererze SLD v3
(`ui/sld/v3/canvas/overlay.ts`), test wpięcia w ścieżkę użytkownika (nie w adapter).

### W3. Kursor sprzężony — JEDNA selekcja w całym systemie

Najwyższa wartość systemowa całego programu, a infrastruktura **już istnieje**
(`ui2/events/bus.ts`, `ZdarzenieSelekcja`). Zasada: wybór `element_ref` w dowolnym miejscu
podświetla ten sam obiekt **wszędzie naraz**:

- wiersz w tabeli wyników ⇄ symbol na SLD ⇄ punkt na wykresie profilu ⇄ krzywa na wykresie t–I
  ⇄ węzeł w drzewie topologii ⇄ krok w dowodzie,
- najechanie kursorem na punkt wykresu → miękkie podświetlenie na schemacie (bez przewijania),
- kliknięcie → twarda selekcja + przewinięcie kadru (`viewAnchor.ts` już to potrafi).

To zamienia zbiór osobnych okien w jedno narzędzie. Inżynier przestaje „szukać, gdzie to jest
na schemacie" — a to jest koszt poznawczy ponoszony dziś przy każdym wyniku.

### W4. Wspólny moduł wykresów (`ui2/wykresy/`)

Dziś każdy `Wykres*Chart.tsx` powtarza konfigurację osi, dymek i legendę. Jeden moduł:
- skale: liniowa, **logarytmiczna dekadowa** (t–I, impedancja widmowa), jednostkowa (pu),
  czasowa (trajektorie), zespolona (płaszczyzna λ, Nyquist),
- dymek w jednym stylu (`mvd-wyn-wykres-dymek` — już jest w `rozplyw`), zawsze z jednostką,
- pasma normatywne jako wypełnienie (±5% U_n wg PN-EN 50160, CTI ≥ 0,3 s, ξ ≥ 5%, |r_N| ≤ 3),
- legenda semantyczna z tokenów `--mvd-*` — **zero hex** (spójne z regułą overlay),
- eksport: każdy wykres oddaje ten sam SVG do PDF i do zrzutu.

Konsekwencja: nowy wykres to ~80 linii, nie ~450 (dziś `TimeCurrentChart.tsx` = 457 linii).

### W5. Zamrożenie do eksportu i dostępność

`data-motion="off"` na korzeniu aplikacji podczas eksportu/zrzutu ustawia `--mvd-motion-scale: 0`.
Media query `prefers-reduced-motion: reduce` robi to samo trwale. Guard CI: żaden plik CSS nie
definiuje `animation`/`transition` poza blokiem respektującym `--mvd-motion-scale`.

---

## 3. Katalog wizualizacji — okno po oknie

Priorytety: **P0** = dane gotowe w kontrakcie, zero pracy backendu; **P1** = ruch na SLD
(po domknięciu W2); **P2** = wymaga addytywnego pola API; **P3** = wymaga nowego solvera.

### 3.1. P0 — pięć ekranów z gotowymi danymi i ZEREM wykresów

Największy stosunek wartości do kosztu w całym programie. Backend już liczy komplet.

#### (1) SSCI — diagram Nyquista + charakterystyka Bodego · `ui2/wyniki/ssci/`
**Dane — komplet, nic nie trzeba dopisywać:** `NyquistPoint(f_hz, mag, phase_deg,
distance_to_minus_one)`, `CrossoverPoint(f_hz, phase_l_deg, phase_margin_deg)`,
`encirclement_count`, `negative_resistance_present/f_hz`
(`analysis/ssci_stability/models.py`).
**Co:** (a) krzywa L(jω) w płaszczyźnie zespolonej z punktem −1, okręgiem jednostkowym i
markerem punktu najbliższego −1; (b) Bode: |L|(f) log-log + ∠L(f), z pionowym pasmem
rezonansu i obszarem ujemnej rezystancji.
**Dlaczego:** kryterium impedancyjne stabilności falownik–sieć (Sun 2011 / Wen 2016) jest
kryterium **geometrycznym** — liczba okrążeń punktu −1 i margines fazy są nieczytelne w tabeli
i oczywiste na wykresie. Ekran dziś podaje werdykt i liczby, ale nie pokazuje *dlaczego*;
inżynier nie widzi, przy jakiej częstotliwości układ zbliża się do niestabilności ani jak
daleko jest margines. To jedyna analiza w repo, w której brak wykresu wprost unieważnia
wartość wyniku.

#### (2) Estymacja stanu — rezydua znormalizowane + test χ² · `ui2/wyniki/estymacja/`
**Dane — komplet:** `normalized_residuals[]`, `residual_r[]`, `chi_square_value`,
`chi_square_threshold`, `largest_normalized_residual`, `chi_square_flag`
(`estymacja/api.ts:129-172`).
**Co:** wykres słupkowy r_N per pomiar z progiem 3,0 jako linią, pomiar o największym |r_N|
wyróżniony i klikalny (→ kursor sprzężony W3 prowadzi do elementu na SLD); obok termometr
J(x̂) względem χ²_{m−n,α}.
**Dlaczego:** detekcja złych danych jest testem o dwóch poziomach — globalnym (χ²) i lokalnym
(LNR). Tabela mówi „są złe dane"; wykres mówi **który pomiar** je psuje. Bez tego wynik
estymacji jest diagnozą bez wskazania pacjenta.

#### (3) Wrażliwość — wykres tornado · `ui2/wyniki/wrazliwosc/`
**Dane — komplet:** `SensitivityEntry(base_margin, minus/plus: {delta_pct, delta_margin,
decision})`, `SensitivityDriver(score, direction)` (`analysis/sensitivity/models.py`).
**Co:** poziome słupki dwustronne wokół osi „margines bazowy", sortowane po |Δmargin|;
połówka kolorowana wg `decision` (PASS/FAIL po perturbacji); kliknięcie parametru → jego
wartość w modelu.
**Dlaczego:** tornado jest kanoniczną formą analizy wrażliwości, bo odpowiada na pytanie
projektowe, nie obliczeniowe: *który parametr trzyma ten projekt przy życiu*. Prowadzi wprost
do decyzji zakupowej (przekrój kabla vs. nastawa zabezpieczenia vs. moc transformatora).
Tabela tych samych liczb wymaga ręcznego sortowania w głowie.

#### (4) Kontyngencje — macierz N-1 · `ui2/wyniki/kontyngencje/`
**Dane — komplet:** `dotkliwosc{odbiory_bez_zasilania, moc_odciazona_mw, przeciazenia,
naruszenia_napiecia, kryteria_pominiete}` per pozycja (`kontyngencje/model.ts`).
**Co:** heatmapa — wiersz = element wyłączony, kolumna = kryterium, nasycenie = dotkliwość;
ranking najcięższych po prawej; kliknięcie wiersza przełącza SLD w stan po wyłączeniu
(overlay `VARIANT_DELTA` **już istnieje** w kontrakcie).
**Dlaczego:** N-1 to analiza o strukturze macierzowej; lista pozycji gubi to, co najważniejsze
— *skupiska*. Heatmapa natychmiast pokazuje, że jeden element odpowiada za trzy kryteria naraz
albo że cała gałąź magistrali ma ten sam wzór awarii. To jest standard narzędzi przesyłowych
i przenosi się 1:1 na SN z rezerwą pierścieniową.

#### (5) Składowe symetryczne — wykres wskazowy · `ui2/wyniki/skladowe/`
**Dane:** składowe z solvera; ekran renderuje dziś wyłącznie KaTeX (`MathBlock`) i tabelę.
**Co:** diagram fazorowy — wektory U₁, U₂, U₀ oraz U_a, U_b, U_c we wspólnym układzie, z kątami;
współczynnik asymetrii u₂ = |U₂|/|U₁|·100% na tle progu PN-EN 50160 (≤ 2%).
**Dlaczego:** składowe symetryczne to transformacja **geometryczna** (Fortescue). Liczby
zespolone w tabeli wymagają od inżyniera odtworzenia obrazu w wyobraźni; wykres wskazowy jest
tym obrazem. Przy zwarciach niesymetrycznych i asymetrii obciążeń to najszybsza droga do
zrozumienia, co się dzieje w sieci.

### 3.2. P1 — ruch na SLD (rdzeń produktu, po domknięciu W2)

#### (6) Kierunek i natężenie przepływu mocy
**Co:** przesuw kreski (dash-offset) wzdłuż gałęzi; kierunek = `flow_forward`/`flow_reverse`
(znak P), tempo = `animation_rate` (I/I_th z backendu). Grubość obrysu ∝ wykorzystanie.
**Dlaczego — najwyższa wartość inżynierska ruchu w całym systemie:** w sieci SN z OZE
**przepływ zwrotny** jest zjawiskiem decydującym o nastawach zabezpieczeń kierunkowych,
o wzroście napięcia w punkcie przyłączenia i o doborze przekładni. Dziś inżynier czyta znak P
w tabeli gałęzi. Po zmianie widzi go na schemacie, dla całej sieci naraz, bez czytania.
Adapter **już wystawia** właściwe tokeny (`ZeroSequenceOverlayAdapter.ts:76-77`) — brakuje
wyłącznie renderu.

#### (7) Propagacja zwarcia — wavefront wkładów prądowych
**Co:** jednorazowa animacja 700 ms uruchamiana kliknięciem „Pokaż na schemacie"
(`ui2/wyniki/zwarcia/pokazNaSchemacie.ts` — punkt wpięcia istnieje): fala biegnie od źródeł do
miejsca zwarcia, strzałki wkładów o grubości ∝ I_k″ udziału (komponent
`FaultContributionArrow.tsx` **już istnieje**), miejsce zwarcia pulsuje.
**Dlaczego:** IEC 60909 daje prąd wypadkowy, ale decyzja projektowa zależy od **struktury
wkładów** — ile daje sieć zasilająca, ile silniki (zanikający udział w I_b), ile falowniki
(ograniczone ~1,1–1,2 I_n). Animacja pokazuje tę strukturę w jednym geście; tabela wymaga
zestawiania kolumn.

#### (8) Świeżość jako ruch (`fade_stale`)
**Co:** overlay wyniku nieaktualnego wobec rewizji modelu traci nasycenie i zyskuje wolną,
niskokontrastową pulsację; w trakcie przeliczania — pasek postępu w miejscu wyniku.
**Dlaczego:** to ruch kodujący stan **epistemiczny** (PRAWO 1). Najkosztowniejszy błąd w
narzędziu projektowym to podjęcie decyzji na nieaktualnym wyniku. `FreshnessBadge` istnieje,
ale jest statyczną plakietką w nagłówku — a wynik ogląda się na schemacie.

#### (9) Przejście wariantów A/B
**Co:** przełączenie wariantu przechodzi przez 220 ms morfing overlay zamiast skoku
(`sldDeltaOverlay` już jest); elementy, które się **nie zmieniły**, zostają statyczne.
**Dlaczego:** porównanie wariantów to pytanie „co się zmieniło". Skok wymaga zapamiętania
obrazu przed; płynne przejście sam różnicę pokazuje — ruch jest tu operatorem różnicowym.

#### (10) Ruch świadomy LOD
**Co:** animacja wyłącznie dla elementów w kadrze i powyżej progu LOD; poniżej — statyczne
groty kierunku.
**Dlaczego:** bez tego schemat GPZ z kilkuset polami zamienia się w migotanie, a wydajność
kanwy (`buildScene.ts`, 8416 linii; `SldCanvasV3.tsx`, 3668) leci. Polityka LOD i ciągłość
ścieżki prądowej (`lodContinuity.ts`) już istnieją — ruch musi je respektować, nie omijać.

### 3.3. P2 — wymaga addytywnego pola w API (solver już liczy)

#### (11) Stabilność — płaszczyzna zespolona wartości własnych · `ui2/wyniki/stabilnosc/`
**Stan:** solver zwraca `EigenvaluePoint(real, imag, damping_ratio, natural_frequency_hz)`
(`stability_rms/contracts.py:93`), ale **żaden endpoint API tego nie wystawia** —
`grep -rn eigenvalue api/` jest pusty. Wymaga addytywnego pola (FROZEN nietknięty).
**Co:** λ = σ ± jω w płaszczyźnie zespolonej; promienie stałego tłumienia ξ = −σ/|λ|
(linia ξ = 5% jako granica akceptacji), okręgi stałej ω_n; mod najsłabiej tłumiony wyróżniony.
**Dlaczego:** analiza małosygnałowa ma sens wyłącznie w tej reprezentacji. Położenie modu
mówi jednocześnie o stabilności (σ < 0), jakości tłumienia (ξ) i naturze zjawiska: 0,1–2 Hz to
mody elektromechaniczne, 2–15 Hz to dynamika regulatorów falowników. Z tabeli liczb zespolonych
nie odczyta tego nikt.

#### (12) Odtwarzacz czasu sprzężony ze schematem (trajektorie RMS / FRT)
**Stan:** `TrajectorySample(time_s, voltage_pu, active_power_mw, reactive_power_mvar,
rotor_angle_rad, speed_pu)` — komplet. `WykresPrzebieguChart.tsx` rysuje przebiegi; brak
wspólnego kursora i sprzężenia ze schematem.
**Co:** jeden kursor czasowy na wszystkich panelach (U, P, Q, δ, ω) + suwak; przesuwanie suwaka
aktualizuje overlay napięć na SLD dla chwili t.
**Dlaczego:** zakłócenie jest zjawiskiem **czasowo-przestrzennym**. Wykres pokazuje czas,
schemat przestrzeń; sprzężenie daje jedno, spójne zjawisko — i natychmiast odpowiada, które
węzły zapadają najgłębiej i w której chwili. Dla FRT (`oze/frt/WykresTrajektoriiChart.tsx`)
to samo narzędzie pokazuje wejście trajektorii w obszar obowiązku utrzymania pracy.

#### (13) Profil napięcia wzdłuż odległości elektrycznej · `ui2/wyniki/rozplyw/`
**Stan:** `ProfilNapiecChart.tsx` ma oś X = nazwa szyny (kategoria).
**Co:** oś X = długość trasy [km] od GPZ (albo skumulowany moduł impedancji |Z| [Ω]);
odgałęzienia jako osobne serie; pasmo ±5% U_n jako wypełnienie. Wymaga addytywnego pola
`feeder_path` w wyniku — **ścieżkę wyznacza backend** (topologia to nie prezentacja).
**Co daje:** spadek napięcia staje się **nachyleniem**, a nie skokiem między kategoriami.
Inżynier widzi, który odcinek „zjada" napięcie i czy problem leży w przekroju, długości czy
w obciążeniu na końcu magistrali. To jest kanoniczny wykres projektanta sieci rozdzielczej.

#### (14) Korytarz selektywności na wykresie t–I · `ui2/wyniki/koordynacja/`
**Stan:** ekran mostkuje do `ui/protection-coordination/ProtectionCoordinationPage`,
krzywe rysuje `TimeCurrentChart.tsx` (log-log, markery prądów zwarciowych).
**Co:** (a) wypełniony obszar między krzywą nadrzędną a podrzędną, kolorowany wg Δt(I), z
czerwienią tam, gdzie Δt < CTI (0,3 s dla przekaźników cyfrowych); (b) pionowe linie I_k″max
(początek strefy) i I_k″min (koniec strefy, 2F) wyznaczające „okno pracy"; (c) przeciąganie
nastaw TMS/I_s — **z przeliczeniem w solverze `protection_iec60255`** (debounce), nigdy w UI.
**Dlaczego:** selektywność jest własnością **przedziału prądowego**, nie punktu. Dziś inżynier
porównuje dwie krzywe okiem i szacuje odstęp — korytarz pokazuje wprost, w którym przedziale
selektywność pęka. Punkt (c) jest zarazem granicą architektoniczną: wzór IDMT
t = k·TMS/((I/I_s)^α − 1) w UI padłby na `ui_no_physics_guard` i **słusznie** — dlatego suwak
odpytuje solver, a UI rysuje zwróconą krzywą.

### 3.4. P3 — wymaga nowego solvera (luka merytoryczna, nie wizualna)

#### (15) Obwiednia prądu zwarciowego i(t) · `ui2/wyniki/zwarcia/`
**Stan:** brak. Ekran ma `WykresIkssChart` (słupki I_k″) i `WykresUdzialowChart`.
`grep -rn "envelope" network_model/solvers/` trafia wyłącznie w NC RfG i moduł akademicki.
**Co:** przebieg obwiedni i(t) = składowa okresowa + aperiodyczna, z markerami:
i_p (t = 10 ms), I_b (t_min), I_th, stałą czasową T_a = X/(ωR) i κ = 1,02 + 0,98·e^(−3R/X).
Solver zwraca `envelope_samples` (addytywnie); UI **wyłącznie rysuje** — √2 w prezentacji jest
zakazane wprost przez `ui_no_physics_guard`.
**Dlaczego:** dobór aparatury to porównanie i_p z I_cm i I_th z I_cw√t. Tabela podaje wyniki;
wykres pokazuje **skąd się biorą** — jak składowa DC zanika i dlaczego κ dla danego X/R wypada
tak, a nie inaczej. To jednocześnie najlepszy materiał dowodowy do pakietu SC3F i najmocniejsze
narzędzie dydaktyczne w całym produkcie.

#### (16) Krzywa nosowa P–V / Q–V (continuation power flow)
**Stan:** brak solvera CPF (`grep -rn "continuation\|nose_curve\|loadability"` nie trafia w
żaden solver rozpływu).
**Co:** krzywa |U|(P) do punktu przegięcia, margines obciążalności napięciowej, punkt pracy
na krzywej.
**Dlaczego:** dla sieci SN z dużym udziałem OZE i długimi magistralami zapas do kolapsu
napięciowego jest realnym kryterium przyłączeniowym. To jedyna pozycja w tym programie
wymagająca **nowej fizyki**; podaję ją jako jawnie nazwaną lukę, a nie jako wykres do
narysowania z istniejących danych.

### 3.5. Okna oceny i dowodu

#### (17) Termometr marginesów · `ui2/wyniki/werdykt/`, `jakosc/`, `co-wymaga-uwagi/`
**Co:** jeden widok wszystkich kryteriów jako poziome paski „margines do progu" w jednostkach
znormalizowanych (0 = próg), sortowane po ryzyku; kliknięcie → dowód kryterium.
**Dlaczego:** werdykt PASS/FAIL gubi *zapas*. Projekt z marginesem 1% i z marginesem 40% są
oba „PASS", ale to dwa różne projekty. Pasek przenosi wielkość, której werdykt nie niesie,
i zamienia ocenę binarną w mapę ryzyka. Analiza `sanity_bounds` dostarcza pasm odniesienia.

#### (18) Dowód z podświetleniem podstawienia · `ui2/wyniki/dowod/`, `wzorzec/SladWywodu.tsx`
**Co:** w kroku „wzór → dane → podstawienie → wynik" podświetlany jest symbol aktualnie
podstawiany, z wartością i jednostką w dymku; nawigacja krokami klawiaturą.
**Dlaczego:** WHITE BOX to przewaga tego produktu nad narzędziami komercyjnymi, ale ściana
LaTeX-a jest czytelna dopiero po chwili. Podświetlenie zamienia dowód statyczny w prowadzony —
bez dodawania fizyki, bo dane `{tekst, latex}` przychodzą z backendu gotowe.

#### (19) Mapa procesu E1–E8 jako ścieżka postępu · `ui2/proces/MapaProcesu.tsx`
**Co:** pasek etapów z jawnym stanem bramki, następną najlepszą akcją i przejściem 220 ms po
spełnieniu bramki; etapy niedostępne wyszarzone z podaniem **brakującego warunku**.
**Dlaczego:** E1–E8 to kanon pracy projektanta. Ruch pojawia się tu wyłącznie w momencie
zmiany stanu bramki — czyli koduje zdarzenie, nie zdobi (PRAWO 1).

---

## 4. Ranking wartości inżynierskiej

| # | Pozycja | Wartość | Koszt | Blokada |
|---|---------|---------|-------|---------|
| 1 | W3 Kursor sprzężony (całość) | **najwyższa** | średni | brak — szyna istnieje |
| 2 | (6) Kierunek i natężenie przepływu na SLD | **najwyższa** | niski | W2 (dług §0.1) |
| 3 | (1) SSCI — Nyquist + Bode | bardzo wysoka | niski | brak — dane kompletne |
| 4 | (14) Korytarz selektywności t–I | bardzo wysoka | średni | addytywne pole + solver nastaw |
| 5 | (15) Obwiednia i(t) zwarcia | bardzo wysoka | wysoki | nowy wynik solvera |
| 6 | (3) Tornado wrażliwości | wysoka | niski | brak — dane kompletne |
| 7 | (11) Płaszczyzna λ | wysoka | niski | addytywne pole API |
| 8 | (13) Profil wzdłuż odległości | wysoka | średni | addytywne `feeder_path` |
| 9 | (7) Wavefront wkładów zwarciowych | wysoka | niski | W2 |
| 10 | (2) Rezydua estymacji | wysoka | niski | brak — dane kompletne |
| 11 | (4) Macierz N-1 | wysoka | niski | brak — dane kompletne |
| 12 | (12) Odtwarzacz czasu ⇄ SLD | wysoka | wysoki | addytywne pole + sprzężenie |
| 13 | (17) Termometr marginesów | średnio-wysoka | niski | brak |
| 14 | (5) Wykres wskazowy składowych | średnio-wysoka | niski | brak — dane kompletne |
| 15 | (8) Świeżość jako ruch | średnia | niski | W2 |
| 16 | (16) Krzywa nosowa P–V | wysoka | **bardzo wysoki** | nowy solver CPF |

**Wniosek porządkujący:** pozycje 1, 3, 6, 10, 11, 14 razem dają sześć nowych, mocnych narzędzi
inżynierskich **bez jednej linii fizyki w backendzie** — dane już są policzone i już docierają
do frontu. To jest najtańszy skok jakości w całym programie i naturalna pierwsza fala.

---

## 5. Bramki jakości (bez nich program jest regresem)

1. **Determinizm.** Wykresy zachowują `isAnimationActive={false}`; brak `Math.random`,
   `Date.now`, `crypto.randomUUID` w warstwie wykresów (jak w `sld_determinism_guards.py`).
2. **Zero fizyki w UI.** Każda wielkość pochodzi z solvera/analizy. Tempo animacji, nachylenie
   profilu, czas zadziałania, obwiednia i(t) — wszystko z backendu.
   `ui_no_physics_guard.py` musi zostać zielony bez nowych wpisów na liście wyjątków.
3. **Zero hex.** Kolory wykresów i overlay wyłącznie z tokenów `--mvd-*`, parytet obu motywów.
4. **Zamrażalność.** Każdy nowy widok ma statyczny render i test zrzutu; `--mvd-motion-scale: 0`
   daje wynik bit-identyczny z eksportem.
5. **Dostępność.** `prefers-reduced-motion: reduce` wyłącza ruch; informacja nigdy nie jest
   niesiona **wyłącznie** przez ruch ani wyłącznie przez barwę (kierunek ma też grot, stan ma
   też etykietę).
6. **Werdykt wizualny — właściciel (ZASADA NR 2, bramka B-02).** Żaden z tych ekranów nie jest
   „gotowy", dopóki zrzut żywej aplikacji w obu motywach nie przejdzie oględzin. Agent nie
   certyfikuje jakości wizualnej samodzielnie.

---

## 6. Propozycja kolejności prac

**Fala 0 (domknięcie długu, warunek wstępny):** W1 tokeny ruchu + W2 ożywienie
`animation_token` (klasy CSS, konsumpcja `animationClass` w rendererze v3, test ścieżki
użytkownika) + W5 zamrożenie i `prefers-reduced-motion`.

**Fala 1 (zero pracy backendu):** W4 moduł wykresów, następnie (1) SSCI, (3) tornado,
(2) rezydua, (4) macierz N-1, (5) wykres wskazowy — pięć ekranów przestaje być tabelami.

**Fala 2 (rdzeń produktu):** W3 kursor sprzężony w całym systemie, (6) przepływ na SLD,
(7) wavefront, (8) świeżość, (9) A/B, (10) LOD.

**Fala 3 (addytywne kontrakty):** (11) płaszczyzna λ, (13) profil wzdłuż odległości,
(14) korytarz selektywności, (12) odtwarzacz czasu, (17) termometr, (18) dowód, (19) mapa E1–E8.

**Fala 4 (nowa fizyka):** (15) obwiednia i(t), (16) krzywa nosowa P–V.

Każda fala kończy się pełną regresją warstwy, kompletem guardów, testami determinizmu
i zrzutami do odbioru wizualnego właściciela.
