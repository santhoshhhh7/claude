# Methodology

## Scope

The case tests whether Tata Consumer Products should hypothetically acquire 100% of Mrs. Bectors Food Specialities at a 20% premium to the target's 27 November 2026 share price.

## DCF

The model forecasts five years from FY2026 revenue. For each year:

```text
Revenue = Prior-year revenue × (1 + growth)
EBITDA = Revenue × EBITDA margin
Depreciation = Revenue × depreciation percentage
EBIT = EBITDA − depreciation
NOPAT = EBIT × (1 − tax rate)
Free cash flow = NOPAT + depreciation − capital expenditure − change in working capital
```

Terminal value uses the Gordon Growth method:

```text
Terminal value = FY2031 free cash flow × (1 + terminal growth) ÷ (WACC − terminal growth)
```

Enterprise value is the present value of forecast free cash flow plus the present value of terminal value. Equity value adds cash and subtracts debt.

## Comparable companies

The model applies the median peer EV/EBITDA multiple to Mrs. Bectors' FY2026 EBITDA, then adds cash and subtracts debt. The selected peer multiples are illustrative training inputs and are editable in the workbook.

## Offer and transaction value

```text
Offer price = Unaffected price × (1 + premium)
Equity purchase price = Offer price × diluted shares outstanding
Transaction enterprise value = Equity purchase price + debt − cash
```

## Accretion and dilution

The model assumes no new shares are issued because funding is 50% acquirer cash and 50% new debt.

```text
After-tax interest = New debt × interest rate × (1 − tax rate)
After-tax synergy = Revenue synergy × (1 − tax rate)
Combined PAT = Acquirer PAT + Target PAT + after-tax synergy − after-tax interest
Combined EPS = Combined PAT ÷ acquirer shares
Accretion / dilution = Combined EPS ÷ acquirer standalone EPS − 1
```

The model excludes purchase-accounting amortization, transaction fees, integration costs, foregone interest on cash, refinancing of existing debt, and tax attributes. These exclusions make the output a screening analysis rather than a full merger model.

## Decision rule

The recommendation is conditional:

- Do not proceed when the offer exceeds both principal valuation references and all modeled synergy scenarios remain dilutive.
- Reconsider only at a lower price, with a different funding mix, or with independently validated recurring synergies sufficient to reach breakeven.
