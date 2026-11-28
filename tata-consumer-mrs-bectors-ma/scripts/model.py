from __future__ import annotations

import json
import statistics
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ASSUMPTIONS_PATH = PROJECT_ROOT / "data" / "assumptions.json"


def load_assumptions() -> dict[str, Any]:
    return json.loads(ASSUMPTIONS_PATH.read_text(encoding="utf-8"))


def calculate_dcf(data: dict[str, Any], wacc: float | None = None, terminal_growth: float | None = None) -> dict[str, Any]:
    target = data["historical"]["mrs_bectors"]["FY2026"]
    assumptions = data["dcf"]
    market = data["market_inputs"]
    wacc = assumptions["wacc"] if wacc is None else wacc
    terminal_growth = assumptions["terminal_growth"] if terminal_growth is None else terminal_growth
    if wacc <= terminal_growth:
        raise ValueError("WACC must be greater than terminal growth")

    revenue = target["revenue"]
    forecast = []
    for index, (growth, margin) in enumerate(zip(assumptions["revenue_growth"], assumptions["ebitda_margin"]), start=1):
        prior_revenue = revenue
        revenue *= 1 + growth
        ebitda = revenue * margin
        depreciation = revenue * assumptions["depreciation_pct_revenue"]
        ebit = ebitda - depreciation
        nopat = ebit * (1 - market["tax_rate"])
        capex = revenue * assumptions["capex_pct_revenue"]
        change_nwc = (revenue - prior_revenue) * assumptions["change_nwc_pct_incremental_revenue"]
        free_cash_flow = nopat + depreciation - capex - change_nwc
        discount_factor = 1 / ((1 + wacc) ** index)
        forecast.append(
            {
                "year": f"FY{2026 + index}",
                "growth": growth,
                "revenue": revenue,
                "ebitda_margin": margin,
                "ebitda": ebitda,
                "depreciation": depreciation,
                "ebit": ebit,
                "nopat": nopat,
                "capex": capex,
                "change_nwc": change_nwc,
                "free_cash_flow": free_cash_flow,
                "discount_factor": discount_factor,
                "pv_fcf": free_cash_flow * discount_factor,
            }
        )

    terminal_value = forecast[-1]["free_cash_flow"] * (1 + terminal_growth) / (wacc - terminal_growth)
    pv_terminal = terminal_value * forecast[-1]["discount_factor"]
    pv_forecast = sum(item["pv_fcf"] for item in forecast)
    enterprise_value = pv_forecast + pv_terminal
    equity_value = enterprise_value + market["target_cash"] - market["target_debt"]
    value_per_share = equity_value / market["target_shares_crore"]
    return {
        "forecast": forecast,
        "wacc": wacc,
        "terminal_growth": terminal_growth,
        "terminal_value": terminal_value,
        "pv_terminal": pv_terminal,
        "pv_forecast": pv_forecast,
        "enterprise_value": enterprise_value,
        "equity_value": equity_value,
        "value_per_share": value_per_share,
    }


def calculate_model(data: dict[str, Any]) -> dict[str, Any]:
    market = data["market_inputs"]
    target = data["historical"]["mrs_bectors"]["FY2026"]
    acquirer = data["historical"]["tata_consumer"]["FY2026"]
    dcf = calculate_dcf(data)

    multiples = [company["ev_ebitda"] for company in data["comps"]]
    median_multiple = statistics.median(multiples)
    comps_ev = median_multiple * target["ebitda"]
    comps_equity = comps_ev + market["target_cash"] - market["target_debt"]
    comps_per_share = comps_equity / market["target_shares_crore"]

    offer_price = market["target_share_price"] * (1 + market["offer_premium"])
    equity_purchase_price = offer_price * market["target_shares_crore"]
    transaction_ev = equity_purchase_price + market["target_debt"] - market["target_cash"]
    cash_funding = equity_purchase_price * market["cash_funding_pct"]
    debt_funding = equity_purchase_price * market["debt_funding_pct"]
    after_tax_interest = debt_funding * market["new_debt_interest_rate"] * (1 - market["tax_rate"])
    standalone_eps = acquirer["pat"] / market["acquirer_shares_crore"]

    scenarios = []
    for name, synergy_pct in data["synergy_scenarios"].items():
        pretax_synergy = target["revenue"] * synergy_pct
        after_tax_synergy = pretax_synergy * (1 - market["tax_rate"])
        combined_pat = acquirer["pat"] + target["pat"] + after_tax_synergy - after_tax_interest
        combined_eps = combined_pat / market["acquirer_shares_crore"]
        scenarios.append(
            {
                "name": name,
                "synergy_pct_revenue": synergy_pct,
                "pretax_synergy": pretax_synergy,
                "after_tax_synergy": after_tax_synergy,
                "combined_pat": combined_pat,
                "combined_eps": combined_eps,
                "accretion_dilution": combined_eps / standalone_eps - 1,
            }
        )

    break_even_pretax_synergy = max(
        0.0,
        debt_funding * market["new_debt_interest_rate"] - target["pat"] / (1 - market["tax_rate"]),
    )
    break_even_pct_revenue = break_even_pretax_synergy / target["revenue"]

    sensitivity = []
    for sensitivity_wacc in (0.085, 0.09, 0.095, 0.10, 0.105):
        row = []
        for sensitivity_growth in (0.04, 0.045, 0.05, 0.055, 0.06):
            row.append(calculate_dcf(data, sensitivity_wacc, sensitivity_growth)["value_per_share"])
        sensitivity.append({"wacc": sensitivity_wacc, "values": row})

    recommendation = (
        "Do not proceed at the modeled 20% premium under the assumed funding mix. "
        "Reconsider at a lower price or after validating recurring synergies above breakeven."
    )
    return {
        "dcf": dcf,
        "comps": {
            "median_multiple": median_multiple,
            "enterprise_value": comps_ev,
            "equity_value": comps_equity,
            "value_per_share": comps_per_share,
        },
        "deal": {
            "offer_price": offer_price,
            "equity_purchase_price": equity_purchase_price,
            "transaction_enterprise_value": transaction_ev,
            "cash_funding": cash_funding,
            "debt_funding": debt_funding,
            "after_tax_interest": after_tax_interest,
            "standalone_eps": standalone_eps,
            "scenarios": scenarios,
            "break_even_pretax_synergy": break_even_pretax_synergy,
            "break_even_pct_revenue": break_even_pct_revenue,
        },
        "sensitivity": {
            "terminal_growth_rates": [0.04, 0.045, 0.05, 0.055, 0.06],
            "rows": sensitivity,
        },
        "recommendation": recommendation,
    }


def main() -> int:
    output = calculate_model(load_assumptions())
    path = PROJECT_ROOT / "data" / "model_output.json"
    path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
