# Kontrakt domeny EAZ, danych i świeżości — rozszerzenie ADR-022

**Ten dokument opisuje projektowany kontrakt logiczny, nie twierdzi, że wszystkie pola już istnieją.** Opus mapuje na aktualny ENM, \`EffectiveNetworkSnapshot\`, typowany rezultat backendowy i katalog. Nie tworzyć dodatkowego \`ProtectionModel\` poza warstwą ASSET ENM; API ewoluować addytywnie i wersjonować.

## D01 — obiekt zabezpieczeń i połączenia

Łańcuch domenowy, obowiązkowy dla oceny:

\`NetworkElement/Field\` → \`Switchgear/CircuitBreaker\` → \`CtCore/VtWinding\` → \`ProtectionDevice (IED)\` → \`ProtectionFunction\` → \`SettingGroup\` → \`Logic/Interlock\` → \`TripMatrix\` → \`Actuator Breaker\` → \`ProtectionZone\`.

Kontrakty:

- **Pole/urządzenie:** stabilne ID ENM, stacja, sekcja, napięcie, terminale i kierunek referencyjny, rzeczywista topologia fizyczna; źródła OZE mają osobny typ generatora i punkt przyłączenia.
- **IED:** ID, producent, rzeczywisty typ/model, wersja produktu/oprogramowania jeśli znana, katalog i wersja danych, lista możliwych i aktywnych funkcji; bez fikcyjnych marek lub nastaw.
- **CT:** rzeczywiste urządzenie, rdzenie I…N, ratio pierw./wt., klasa, VA, Rct/Vk/ALF jeżeli istnieją, biegunowość P1/P2 i S1/S2, zacisk, obciążenie wtórne, źródło sygnału do IED. **Jedno CT pola**, bez „punkt pomiarowy” jako drugi CT.
- **VT:** rzeczywiste urządzenie i uzwojenia, napięcia pierw./wt., grupa połączeń/otwarty trójkąt gdy istnieje, źródło \(3U_0\), polaryzacja i faza, połączenie z funkcją.
- **Function:** ANSI 50/51, 50N/51N, 67/67N, 21, 87T, 50BF, 27/59/59N, 81U/O/R, admitancyjne G/B/Y, 46/49 oraz inne tylko, gdy ma odpowiedni model i katalog; jednoznaczne wejścia/wyjścia, stopnie, kierunek i warunki blokad.
- **SettingGroup:** 1…4 wg wspieranych przez IED grup, granice i krok każdego parametru, jednostka, aktywność, domyślne/edytowane/zapisane, rewizja, autor i czas modyfikacji.
- **TripMatrix:** funkcja/stopień → sygnał → aparat(-y), zwłoka, blokada, CBF, logika pomocnicza; usterka lub nieznany element wyłączenia skutkuje odmową deklaracji poprawnego wyłączenia.
- **Zone:** elementy/gałęzie chronione, zasięg, kierunek, pary podrzędne/nadrzędne, drogi zasilania w danej konfiguracji, właściciel funkcji.

## D02 — nastawy i wersjonowanie

Stan edycji UI: \`zapisane\`, \`robocze\`, \`zmienione\`, \`błędne\`, \`ocena robocza\`, \`ocena zapisanych\`. Nastawy robocze są osobnym roboczym szkicem / deltą, NIE mutują bez zatwierdzenia assetu. Po zapisie odnotować wersję, zmienić rewizję nastaw i unieważnić tylko zależne wyniki ochrony; nie unieważniać rozpływu od czystej zmiany nastaw.

Scenariusz wybiera grupę nastaw lub aplikuje jawnie wersjonowany override; grupy w ENM pozostają kanoniczne. Interfejs pokazuje aktywną grupę **dla danego scenariusza** i informuje, skąd wynika wybór grupy.

\`Zakresy nastaw\` pochodzą z rzeczywistego katalogu IED i wariantu firmware: min, max, step, unit, allowed curve enum, profile conditional. Bez podstawy katalogowej funkcję oznaczyć jako \`do skonfigurowania/niezweryfikowane\`, a nie przyjąć z losowych limitów.

Konwersja pierw./wt. z rzeczywistego CT/VT (każdy próg reprezentowany bez utraty precyzji) oraz wpisywanie procentów tylko dla parametrów mających taki kontrakt. Ostrzeżenia o przekroczeniu zakreślone zanim użytkownik zapisze; brak ukrytej automatycznej zmiany nastaw.

## D03 — dowód obliczeniowy (proponowany kształt logiczny)

Wynik zawiera jawne:
- \`project_id, model_revision, effective_snapshot_id, case_id, case_revision, run_id, settings_revision, group_id, computed_at\`;
- \`fault_id, fault_type, fault_location_id, phase, max_min, fault_impedance, duration, network_topology_id, selected_sources\`;
- \`element_id, ied_id, function_id, ct_id, ct_core_id, vt_id, vt_winding_id, breaker_id\`;
- \`I_fault_at_location\` **osobno** od \`I_CT_complex\` / \`I_CT_magnitude\` dla KAŻDEGO przekaźnika/stopnia, z fazą i jednostką;
- \`U_CT/VT or U0/3U0/I0/3I0\`, konwencją kierunków, \`R/X, Z0, Y0\` gdy dotyczą;
- \`pickup_state, blocking_state, start_time, relay_time, breaker_time, total_clearing_time, operation_sequence\`;
- \`required_margin, measured_margin, safety_margin, criterion_source, assessed_scope, status\`;
- \`data_provenance\` (OSD, katalog, użytkownik, wynik obliczeń, przyjęta norma) i \`validation_findings\` o kodzie, obiekcie, wartości i akcji.

To **wymagane pola semantyczne**, nie propozycja drugiego JSONa równoległego wobec istniejącego API. Najpierw przeprowadzić mapowanie na bieżące DTO; addytywny \`ProtectionAssessmentResultV...\` tylko gdy obecny DTO nie potrafi tych semantyk.

## D04 — podwójna tożsamość: węzeł i CT

Wynik dla zwarcia w węźle \`S1.04\`: \(I_k''\) w miejscu zwarcia i \(I_{CT}\) zabezpieczenia pola S1, osobno \(I_{CT}\) pola GPZ. Te wielkości mogą być różne w układzie z OZE. **Nie przechowywać jednego \`evaluation_current\` jako zastępnika obu.** Wynik zawiera dwa fizyczne prądy i parę dwóch czasów wyznaczonych dla swoich prądów.

Wynik bez fazora ma status \`brak danych kierunkowych\` dla 67N, a nie wyliczony z modułu prądu.

## D05 — statusy oceny (nie angielskie teksty dla użytkownika)

Semantyka wewnętrzna: \`SPELNIONE_W_ZAKRESIE\`, \`NARUSZENIE\`, \`NIE_OCENIONO\`, \`BRAK_DANYCH\`, \`NIE_DOTYCZY\`, \`WYNIK_NIEAKTUALNY\`, \`NASTAWY_ROBOCZE\`, \`ODRZUCONE_ZASTOSOWANIE\`. Nazwy tekstowe w UI wyłącznie polskie.

**Zakres werdyktu:** pojedynczy punkt zwarcia / zbiór punktów / zakres prądu / zbiór konfiguracji. Werdykt o pojedynczym punkcie nie nadaje ocenie „selektywność sieci spełniona”.

## D06 — integracja z inspektorem, SLD i raportami

Jeden dispatcher przejścia do SLD, nie nowa ścieżka. Wybranie \`IED/funkcja\` w liście → istniejący element pola → właściwa projekcja SN → wyróżnienie aparatu → panel inspektora z tym samym IED i przekładnikami → powrót z zachowaniem grupy, filtrów, zakresu prądów i selekcji wykresu. Zmiana nastaw w karcie inspektora i na stanowisku musi dotyczyć tego samego assetu.

Pochodzenie każdego wyniku musi być możliwe do zacytowania w PDF/DOCX; eksport wykresów SVG/PDF w sposób przewidziany przez repo, wraz z datą, rev, modelami, źródłem kryterium, aktywnymi stopniami i nazwami.

## D07 — dane dostępne a brak

Przykłady dokładnych komunikatów:
- \`Nie określono prądu widzianego przez CT pola GPZ 1.1 dla zwarcia S1.04 — brak oceny selektywności pary.\`
- \`Brak powiązania funkcji 50 z wyłącznikiem Q0 w polu SN 2 — nie wyznaczono czasu wyłączenia.\`
- \`Nie określono połączenia uzwojenia napięciowego dla 67N — brak kąta polaryzacji.\`
- \`Brak minimalnego prądu zwarciowego na końcu strefy — nie oceniono czułości 51.\`
- \`Brak danych katalogowych zakresu nastaw przekaźnika [IED] — zapis nie został zweryfikowany.\`
- \`Wynik odnosi się do rewizji 16, a model ma rewizję 17.\`

Przy \`nie dotyczy\` nie używać czerwonego ostrzeżenia. Każda odmowa ma kod i identyfikator obiektu.
