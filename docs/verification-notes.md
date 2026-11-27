# Independent Statistics Canada spot-checks

Worksheet and retrieval notes (with UTC timestamps) live in the orchestrator log at `/workspace/canada-civ-runs/verification.md`. This page records the integrator’s confirmation of those checks.

All 14 original Milestone 1 worksheet values match official Statistics Canada tables retrieved on 2026-11-27 (UTC). The integrator independently re-downloaded the official CSVs for tables 17-10-0005-01, 17-10-0148-01, 36-10-0468-01, and 36-10-0711-01 and confirmed:

- Canada and the sampled province/territory populations (Ontario, Quebec, British Columbia, Alberta, Newfoundland and Labrador, Yukon, Northwest Territories, Nunavut) equal the July 1, 2025 estimates in 17-10-0005-01 (total gender, all ages).
- Toronto (7,108,874), Montréal (4,597,837), and Vancouver (3,088,036) equal the July 1, 2025 CMA estimates in 17-10-0148-01 (2021 CMA boundaries; GEO labels such as “Toronto (CMA), Ontario”).
- Canada GDP 2022 is 2,674,953 million current CAD at basic prices (36-10-0468-01). Toronto, Montréal, Vancouver, and Calgary CMA GDP for 2022 match the same table (2011 CMA geography).
- Ontario GDP 2021 is 903,203.1 million current CAD at basic prices, all industries [T001] (36-10-0711-01).

Additional checks recorded by the verification workstream (Census Profile SDMX CSV, not re-fetched by the integrator):

- Iqaluit CSD population 8,612 (July 2025, 17-10-0155-01) and Census 2021 count 7,429.
- Unemployment rates in the JSON (for example Toronto CMA 13.3%, Canada 10.3%) match 2021 Census Profile characteristic 2230, not the current Labour Force Survey. The City View workforce tab states this caveat.
- All 41 official 2021 CMA codes are present; the atlas also includes two selected CAs plus Iqaluit as a territorial capital.

Population estimates, Census counts, Census unemployment, and GDP use different years and geographies and should not be reconciled into a single total. No mismatches were found among the recorded comparisons. Application JSON was not changed to force a match.

## Milestone 2 additions

Census economy fields wired in Milestone 2 (employed, characteristic 2225; median tenant shelter costs, 1480; rent burden, 1478) were independently checked against the Census Profile SDMX CSV API on 2026-11-27. Toronto CMA employed 2,903,480, shelter cost $1,540, and rent burden 40.5%, and the Canada totals, all match. Unemployment is unchanged (2021 Census characteristic 2230). GDP per person shown in City View is official 2022 GDP divided by the July 2025 population estimate, with both vintages labelled; it is not a single official StatCan ratio series. Retrieval notes: `/workspace/canada-civ-runs/verification.md`.
