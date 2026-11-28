# Tata Consumer–Mrs. Bectors hypothetical M&A case study

A completed investment-banking project evaluating a **hypothetical 100% acquisition of Mrs. Bectors Food Specialities by Tata Consumer Products**. The project includes a formula-driven Excel valuation model, editable PowerPoint pitchbook, matching PDF pitchbook, executive summary, assumptions, methodology and source register.

> This is an educational case study. It is not an announced transaction, fairness opinion, investment recommendation or investment advice.

## Headline conclusion

The modeled offer is **INR 274.51 per share**, representing a 20% premium to the target's 27 November 2026 share price. The principal valuation references are:

| Method | Implied value per share |
|---|---:|
| DCF | INR 139.18 |
| Median comparable companies | INR 217.47 |
| Modeled offer | INR 274.51 |

All three modeled synergy cases remain dilutive to Tata Consumer EPS:

| Scenario | Synergy as % of target revenue | EPS accretion / (dilution) |
|---|---:|---:|
| Low | 2.0% | (5.2%) |
| Base | 3.0% | (4.2%) |
| High | 4.0% | (3.2%) |

The model estimates EPS breakeven requires recurring pretax synergies equal to approximately **7.3% of FY2026 target revenue**. The recommendation is therefore **not to proceed at the modeled price and funding mix** without a lower purchase price, reduced debt funding or independently validated synergies above breakeven.

## Deliverables

| File | Purpose |
|---|---|
| [`deliverables/tata_consumer_mrs_bectors_model.xlsx`](deliverables/tata_consumer_mrs_bectors_model.xlsx) | Seven-sheet formula-driven valuation and deal model |
| [`deliverables/tata_consumer_mrs_bectors_pitchbook.pptx`](deliverables/tata_consumer_mrs_bectors_pitchbook.pptx) | Editable eight-slide investment-banking pitchbook |
| [`deliverables/tata_consumer_mrs_bectors_pitchbook.pdf`](deliverables/tata_consumer_mrs_bectors_pitchbook.pdf) | Eight-page shareable pitchbook |
| [`deliverables/executive_summary.pdf`](deliverables/executive_summary.pdf) | One-page transaction summary |
| [`docs/EXECUTIVE_SUMMARY.md`](docs/EXECUTIVE_SUMMARY.md) | Reviewable text version of the conclusion |
| [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) | Valuation and accretion/dilution formulas |
| [`docs/SOURCES.md`](docs/SOURCES.md) | Source register and fact/assumption classification |

## Workbook structure

The Excel model contains:

1. **Cover** — scope, date, currency and recommendation.
2. **Historical Financials** — three years of revenue, EBITDA, margin and PAT.
3. **DCF** — five-year forecast, free cash flow, terminal value and equity bridge.
4. **Comparable Companies** — peer multiples and implied value.
5. **Deal Model** — offer premium, funding, synergies and EPS impact.
6. **Sensitivity** — WACC and terminal-growth valuation matrix.
7. **Sources** — data classification and limitations.

Blue cells represent editable assumptions. Green cells highlight key outputs. The workbook includes **53 Excel formulas** and is configured for recalculation when opened.

## Pitchbook structure

The eight slides cover:

1. Transaction overview and recommendation.
2. Strategic rationale.
3. Company profiles.
4. Historical performance.
5. DCF and comparable-company valuation.
6. Purchase price and funding.
7. EPS impact under three synergy cases.
8. Recommendation, breakeven and risks.

## Source highlights

Historical Tata Consumer figures use its [FY2026 integrated report](https://www.tataconsumer.com/iar-2025-26/), [FY2025 results](https://www.tataconsumer.com/news/results-quarter-and-year-ended-31st-march-2025) and [FY2024 results](https://www.tataconsumer.com/news/results-quarter-and-year-ended-31st-march-2024). Mrs. Bectors figures use published FY2025 and FY2026 result summaries listed in [`docs/SOURCES.md`](docs/SOURCES.md). The target's 27 November 2026 share-price reference comes from the [Upstox market page](https://upstox.com/stocks/mrs-bectors-food-spe-ltd-share-price/).

Source descriptions and financial highlights are paraphrased for licensing compliance. See the source register for approximations and assumptions.

## Generate the project

Requires Python 3.11 or later. No third-party packages are required.

```bash
cd tata-consumer-mrs-bectors-ma
python scripts/model.py
python scripts/generate_artifacts.py
python scripts/validate_deliverables.py
```

## Validation performed

The validation script checks:

- DCF and transaction outputs are positive and internally consistent.
- All three synergy scenarios reconcile and remain dilutive.
- XLSX and PPTX are valid ZIP/XML packages.
- The workbook contains the required seven sheets and at least 20 formulas.
- The pitchbook contains exactly eight slides.
- The PDFs contain the expected nine pages in total.
- Every expected artifact exists and is non-empty.

Validated result:

```text
Validated 12 XLSX members, 8 PPTX slides, 9 PDF pages, and 53 workbook formulas
```

## Key limitations

- The transaction is fictional.
- Target cash, debt and acquirer share count contain documented approximations.
- Peer multiples are illustrative training inputs and should be refreshed before use.
- The merger screen excludes purchase-accounting amortization, transaction fees, integration costs and foregone interest on cash.
- Terminal value contributes approximately 83% of modeled DCF enterprise value, making the DCF highly sensitive to WACC and terminal growth.
- The model should not be used for a real transaction or investment decision.

## Resume description

**Hypothetical M&A Valuation and Deal Analysis — Tata Consumer / Mrs. Bectors**

- Built a formula-driven DCF and comparable-company valuation model using three years of publicly available financial results.
- Modeled acquisition premium, cash/debt funding, recurring synergies and EPS accretion/dilution across three scenarios.
- Prepared an eight-slide investment-banking pitchbook presenting strategic rationale, valuation, transaction impact, breakeven synergies and key risks.
