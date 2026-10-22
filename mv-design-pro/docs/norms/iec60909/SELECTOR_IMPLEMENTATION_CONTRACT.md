# Specyfikacja selektora wydań IEC 60909-0 — kontrakt wdrożeniowy

**Status:** projekt zmiany architektury; nie zmienia zamrożonego API wyników; nie udaje zaimplementowanego profilu 2026.

## 1. Stwierdzony stan repozytorium
- `docs/analysis/STUDY_CASE_SYSTEM_CANONICAL.md` (linia 47): dopuszcza obecnie tylko `analysis_settings.standard = IEC_60909`, rozszerzenie wymaga rewizji architektonicznej.
- `backend/src/domain/study_case.py`: istnieje konfiguracja obliczeń z `c_factor_max`, ale nie rejestr wydania normy.
- `backend/src/network_model/solvers/short_circuit_iec60909.py`: istniejący solver, nie weryfikowano pełnej zgodności 2016.
- `backend/src/application/solvers/short_circuit_binding.py`: istniejący adapter, fizyka musi pozostać w solverze.
- `backend/src/enm/mapping.py` (funkcja `_assemble_zero_sequence_y0`): już dodaje `b0_siemens_per_km * length_km` jako bocznik Y0 w modelu pi, bez jawnej decyzji normowej zależnej od edycji.
- `docs/v12xx/KANON_V12_XX.md` sekcje 5, 7, 8.1 i 10: jedno ENM, przypadek, migawka, wyniki, proof i raport; brak prawa do shadow modelu.

## 2. Docelowa obsługa użytkownika
Karta: `Obliczenia zwarciowe`:
- pole `Podstawa obliczeń` z wyborami `IEC 60909-0:2016`, `IEC 60909-0:2026`;
- status każdego wyboru: `Dostępny po walidacji` / `Niezweryfikowany` / `Zablokowany`;
- `Rodzaj zwarcia`: 3F, 2F, 2F+Z, 1F; osobna karta `Analiza ziemnozwarciowa SN` dla izolowanej/kompensowanej;
- `Wariant: największy/najmniejszy prąd`; odpowiednia informacja o temperaturach, tolerancji nN i danych katalogowych;
- przed obliczeniami podsumowanie danych wejściowych i listy warunków gotowości;
- po obliczeniach wynik, dokładna edycja normy, data i wersja implementacji, jawny ślad wartości, odnośniki do wzorów i reguł;
- porównywarka dwóch przypadków na identycznej migawce ENM, bez twierdzenia, że każda odchyłka wynika z normy, jeśli różnią się także dane katalogowe.

## 3. Minimalny kontrakt danych (projekt)
```json
{
  "analysis_type": "SHORT_CIRCUIT",
  "short_circuit_standard_id": "IEC_60909_0_2016",
  "fault_type": "3F",
  "extreme": "MAX",
  "network_snapshot_sha256": "<identyfikator>",
  "catalog_snapshot_sha256": "<identyfikator>",
  "switching_snapshot_sha256": "<identyfikator>",
  "standard_profile_revision": "1.0.0",
  "zero_sequence_capacitance_policy": "NORMATIVE_BY_EDITION",
  "lv_voltage_tolerance_pct": null
}
```
Wszystkie pola podlegają zatwierdzeniu w zgodzie z aktualnymi typami StudyCase i regułami kanonu; to kontrakt logiczny, nie gotowy żądaniowy format istniejącego API. Nie dodawać nowego publicznego endpointu bez wpisu w macierzy lifecycle.

## 4. Sposób podejmowania decyzji
```
study_case -> explicit edition -> edition profile -> checks of applicability and data completeness
           -> solver policy (only numerical solver physics) -> frozen result + trace
           -> evidence/proof/report/export/protection/SLD.
```
- Profil 2026 jest początkowo `BLOCKER`; przycisk wykonania obliczeń zgodnych z 2026 pozostaje niedostępny, dopóki nie przejdzie wymagań i referencji.
- Profil 2016: przed oznaczeniem `zgodny` trzeba przeprowadzić walidację istniejącego kodu; obecność funkcji nie jest dowodem zgodności.
- Nie ma globalnego automatycznego wyboru normy na podstawie daty. Każdy nowy przypadek ma wyraźny wybór.
- W istniejących przypadkach pole wydania nie jest zgadywane. Nierozstrzygnięte przypadki pozostają `WYMAGA_WYBORU`, zachowując archiwalne wyniki jako informacyjne bez nowej deklaracji.
- Zmiana profilu lub jego reguł unieważnia wyniki zależne (proof, SLD overlay, EAZ, aparatura, eksport).
- W przypadku brakującego `b0`, typu uziemienia, współczynnika doziemienia, krzywej producenta albo tolerancji nN wymagane są jawne komunikaty; brak `b0` nigdy nie oznacza zmierzonego `b0=0`.

## 5. Wymagania solvera (nie deklarowane jako bezpośrednie postanowienia normy)
- W każdym przypadku obliczyć prądy fazowe i wkłady gałęziowe ze spójnych wektorów zespolonych oraz topologii; weryfikować KCL dla każdej szyny w tolerancji numerycznej.
- Oddzielić prąd w miejscu zwarcia od prądów dopływających poszczególnymi gałęziami oraz źródłami. Nie dystrybuować `|I_k|` przez proporcje skalarne.
- Spójne bazy per-unit/SI na transformatorach; zaczepy oraz grupy połączeń jawne; 3ZN w składowej zerowej.
- Walidować `Z1/Z2/Z0` oraz `Y0`; nie stosować sztucznych uziemień numerycznych, które zmieniają wyniki fizyczne.
- W przypadku 1F w sieci izolowanej/kompensowanej przejść do odrębnej metody z odrębnym statusem `metoda inżynierska`, nie `IEC 60909-0`.
- Weryfikować MAX/MIN, I''k, ip, Ib, Ith, I²t oraz interpretację dla EAZ i doboru osprzętu oddzielnie.
- Niezmienność danych modelu w solverze i testy deterministyczne.

## 6. Bramki akceptacyjne
1. Zgodność z bieżącym kanonem V12.xx i formalna decyzja o rozszerzeniu `standard`.
2. Macierz postanowień 2016/2026 z konkretną wersją, numerami, wzorami i danymi testowymi, zweryfikowana na podstawie legalnego egzemplarza IEC.
3. Niezależne ręczne wyniki 3F/2F/2F+Z/1F; referencje IEC TR 60909-4:2021, jeżeli poprawnie stosowalne; walidacja danych producentów.
4. Porównanie profili na identycznym modelu; osobna analiza wpływu zmiany edycji i wpływu danych.
5. Testy backend, CI, walidacji kontraktów i Playwright w obu motywach.
6. Dopiero wtedy profil może mieć status `VALIDATED` i być dopuszczony do raportów normowych.

## 7. Role agentów
GPT-6 przygotowuje zbadany projekt, implementację i dowody; Claude Opus 5.5 integruje i scala zweryfikowane prace, nie projektuje od nowa. Wszelkie konflikty ze starszymi wpisami `AGENTS.md` zgłosić do rejestru konfliktów i właściciela kanonu przed kodową zmianą modelu.
