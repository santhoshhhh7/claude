from __future__ import annotations

import json
import math
import textwrap
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from model import PROJECT_ROOT, calculate_model, load_assumptions

DELIVERABLES = PROJECT_ROOT / "deliverables"


def col_letter(number: int) -> str:
    result = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def xml_text(value: object) -> str:
    return escape(str(value), {'"': '&quot;', "'": '&apos;'})


def xlsx_cell(ref: str, value: object = "", style: int = 0, formula: str | None = None, cached: float | None = None) -> str:
    style_attr = f' s="{style}"' if style else ""
    if formula is not None:
        cached_value = "" if cached is None else f"<v>{cached:.10g}</v>"
        return f'<c r="{ref}"{style_attr}><f>{xml_text(formula)}</f>{cached_value}</c>'
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f'<c r="{ref}"{style_attr}><v>{value}</v></c>'
    return f'<c r="{ref}" t="inlineStr"{style_attr}><is><t>{xml_text(value)}</t></is></c>'


def sheet_xml(rows: list[list[dict]], widths: list[float] | None = None, merges: list[str] | None = None) -> str:
    row_xml = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for col_index, cell in enumerate(row, start=1):
            if cell is None:
                continue
            cells.append(
                xlsx_cell(
                    f"{col_letter(col_index)}{row_index}",
                    cell.get("value", ""),
                    cell.get("style", 0),
                    cell.get("formula"),
                    cell.get("cached"),
                )
            )
        height = ' ht="28" customHeight="1"' if row_index == 1 else ""
        row_xml.append(f'<row r="{row_index}"{height}>{"".join(cells)}</row>')
    columns = ""
    if widths:
        columns = "<cols>" + "".join(
            f'<col min="{index}" max="{index}" width="{width}" customWidth="1"/>'
            for index, width in enumerate(widths, start=1)
        ) + "</cols>"
    merge_xml = ""
    if merges:
        merge_xml = f'<mergeCells count="{len(merges)}">' + "".join(
            f'<mergeCell ref="{item}"/>' for item in merges
        ) + "</mergeCells>"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        f'{columns}<sheetData>{"".join(row_xml)}</sheetData>{merge_xml}'
        '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'
        '</worksheet>'
    )


def styles_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="₹#,##0.0;[Red]-₹#,##0.0"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="0.00x"/></numFmts>
<fonts count="4">
<font><sz val="10"/><name val="Aptos"/></font>
<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font>
<font><b/><color rgb="FF1F4E78"/><sz val="11"/><name val="Aptos"/></font>
<font><color rgb="FF0000FF"/><sz val="10"/><name val="Aptos"/></font>
</fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFD9D9D9"/></left><right style="thin"><color rgb="FFD9D9D9"/></right><top style="thin"><color rgb="FFD9D9D9"/></top><bottom style="thin"><color rgb="FFD9D9D9"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="2" fillId="4" borderId="1" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>'''


def c(value: object = "", style: int = 0, formula: str | None = None, cached: float | None = None) -> dict:
    return {"value": value, "style": style, "formula": formula, "cached": cached}


def build_workbook(data: dict, model: dict, output: Path) -> None:
    historical = data["historical"]
    market = data["market_inputs"]
    dcf = model["dcf"]
    deal = model["deal"]

    sheets: list[tuple[str, str]] = []
    cover = [
        [c(data["project"]["title"], 1)],
        [c("Educational investment-banking case study", 2)],
        [c("Valuation date"), c(data["project"]["valuation_date"], 2)],
        [c("Currency"), c(data["project"]["currency"], 2)],
        [c("Recommendation"), c(model["recommendation"], 9)],
        [c("Important"), c(data["project"]["disclaimer"], 2)],
        [c("Input convention"), c("Blue cells are assumptions; green cells are key outputs.")],
    ]
    sheets.append(("Cover", sheet_xml(cover, [24, 90], ["A1:B1"])))

    hist_rows = [[c("Historical financial performance", 1)]]
    hist_rows.append([c("Company / Metric", 2), c("FY2024", 1), c("FY2025", 1), c("FY2026", 1)])
    for company_label, key in (("Tata Consumer", "tata_consumer"), ("Mrs. Bectors", "mrs_bectors")):
        hist_rows.append([c(company_label, 2)])
        for label, metric in (("Revenue", "revenue"), ("EBITDA", "ebitda"), ("EBITDA margin", "margin"), ("PAT", "pat")):
            row = [c(label)]
            for year in ("FY2024", "FY2025", "FY2026"):
                item = historical[key][year]
                value = item["ebitda"] / item["revenue"] if metric == "margin" else item[metric]
                row.append(c(value, 6 if metric == "margin" else 4))
            hist_rows.append(row)
    sheets.append(("Historical Financials", sheet_xml(hist_rows, [26, 16, 16, 16], ["A1:D1"])))

    dcf_rows = [[c("Mrs. Bectors discounted cash flow", 1)]]
    dcf_rows += [
        [c("Assumption", 2), c("Value", 1)],
        [c("Base revenue"), c(historical["mrs_bectors"]["FY2026"]["revenue"], 3)],
        [c("Tax rate"), c(market["tax_rate"], 5)],
        [c("WACC"), c(data["dcf"]["wacc"], 5)],
        [c("Terminal growth"), c(data["dcf"]["terminal_growth"], 5)],
        [c("Depreciation / revenue"), c(data["dcf"]["depreciation_pct_revenue"], 5)],
        [c("Capex / revenue"), c(data["dcf"]["capex_pct_revenue"], 5)],
        [c("Change NWC / incremental revenue"), c(data["dcf"]["change_nwc_pct_incremental_revenue"], 5)],
        [],
        [c("Forecast", 2)] + [c(item["year"], 1) for item in dcf["forecast"]],
        [c("Revenue growth")] + [c(item["growth"], 5) for item in dcf["forecast"]],
    ]
    cached_rows = {
        "Revenue": [item["revenue"] for item in dcf["forecast"]],
        "EBITDA margin": [item["ebitda_margin"] for item in dcf["forecast"]],
        "EBITDA": [item["ebitda"] for item in dcf["forecast"]],
        "Depreciation": [item["depreciation"] for item in dcf["forecast"]],
        "EBIT": [item["ebit"] for item in dcf["forecast"]],
        "NOPAT": [item["nopat"] for item in dcf["forecast"]],
        "Capex": [item["capex"] for item in dcf["forecast"]],
        "Change in NWC": [item["change_nwc"] for item in dcf["forecast"]],
        "Free cash flow": [item["free_cash_flow"] for item in dcf["forecast"]],
        "Discount factor": [item["discount_factor"] for item in dcf["forecast"]],
        "PV of FCF": [item["pv_fcf"] for item in dcf["forecast"]],
    }
    start_row = len(dcf_rows) + 1
    for label, values in cached_rows.items():
        row_number = len(dcf_rows) + 1
        row = [c(label)]
        for index, value in enumerate(values, start=2):
            column = col_letter(index)
            prior_column = col_letter(index - 1)
            if label == "Revenue":
                formula = f"$B$3*(1+B12)" if index == 2 else f"{prior_column}{row_number}*(1+{column}$12)"
            elif label == "EBITDA margin":
                formula = None
            elif label == "EBITDA":
                formula = f"{column}{start_row}*{column}{start_row + 1}"
            elif label == "Depreciation":
                formula = f"{column}{start_row}*$B$7"
            elif label == "EBIT":
                formula = f"{column}{start_row + 2}-{column}{start_row + 3}"
            elif label == "NOPAT":
                formula = f"{column}{start_row + 4}*(1-$B$4)"
            elif label == "Capex":
                formula = f"{column}{start_row}*$B$8"
            elif label == "Change in NWC":
                base = "$B$3" if index == 2 else f"{prior_column}{start_row}"
                formula = f"({column}{start_row}-{base})*$B$9"
            elif label == "Free cash flow":
                formula = f"{column}{start_row + 5}+{column}{start_row + 3}-{column}{start_row + 6}-{column}{start_row + 7}"
            elif label == "Discount factor":
                formula = f"1/(1+$B$5)^{index - 1}"
            else:
                formula = f"{column}{start_row + 8}*{column}{start_row + 9}"
            style = 5 if label == "EBITDA margin" else 6 if label == "Discount factor" else 4
            row.append(c(value, style if formula is None else style, formula=formula, cached=value) if formula else c(value, 5))
        dcf_rows.append(row)
    dcf_rows += [
        [],
        [c("DCF outputs", 2), c("Value", 1)],
        [c("PV of forecast FCF"), c(dcf["pv_forecast"], 9, formula=f"SUM(B{start_row + 10}:F{start_row + 10})", cached=dcf["pv_forecast"])],
        [c("PV of terminal value"), c(dcf["pv_terminal"], 9)],
        [c("Enterprise value"), c(dcf["enterprise_value"], 9)],
        [c("Equity value"), c(dcf["equity_value"], 9)],
        [c("Value per share"), c(dcf["value_per_share"], 9)],
    ]
    sheets.append(("DCF", sheet_xml(dcf_rows, [30, 16, 16, 16, 16, 16], ["A1:F1"])))

    comp_rows = [[c("Comparable-company valuation", 1)], [c("Company", 2), c("EV / EBITDA", 1)]]
    for item in data["comps"]:
        comp_rows.append([c(item["company"]), c(item["ev_ebitda"], 7)])
    comp_rows += [
        [c("Median multiple", 2), c(model["comps"]["median_multiple"], 8)],
        [c("Target FY2026 EBITDA"), c(historical["mrs_bectors"]["FY2026"]["ebitda"], 4)],
        [c("Implied enterprise value"), c(model["comps"]["enterprise_value"], 9)],
        [c("Implied equity value"), c(model["comps"]["equity_value"], 9)],
        [c("Implied value per share"), c(model["comps"]["value_per_share"], 9)],
        [c("Note"), c("Peer multiples are illustrative training inputs and must be refreshed before real use.")],
    ]
    sheets.append(("Comparable Companies", sheet_xml(comp_rows, [36, 20], ["A1:B1"])))

    deal_rows = [[c("Deal model and EPS impact", 1)], [c("Transaction assumption", 2), c("Value", 1)]]
    deal_rows += [
        [c("Unaffected target share price"), c(market["target_share_price"], 3)],
        [c("Offer premium"), c(market["offer_premium"], 5)],
        [c("Offer price"), c(deal["offer_price"], 9, formula="B3*(1+B4)", cached=deal["offer_price"])],
        [c("Target shares (crore)"), c(market["target_shares_crore"], 3)],
        [c("Equity purchase price"), c(deal["equity_purchase_price"], 9, formula="B5*B6", cached=deal["equity_purchase_price"])],
        [c("Transaction enterprise value"), c(deal["transaction_enterprise_value"], 9)],
        [c("Cash funding"), c(deal["cash_funding"], 4)],
        [c("New debt funding"), c(deal["debt_funding"], 4)],
        [c("New debt interest rate"), c(market["new_debt_interest_rate"], 5)],
        [c("Acquirer standalone EPS"), c(deal["standalone_eps"], 9)],
        [],
        [c("Scenario", 2), c("Synergy % revenue", 1), c("Pretax synergy", 1), c("Combined PAT", 1), c("Combined EPS", 1), c("Accretion / dilution", 1)],
    ]
    for scenario in deal["scenarios"]:
        deal_rows.append([
            c(scenario["name"]), c(scenario["synergy_pct_revenue"], 5), c(scenario["pretax_synergy"], 4),
            c(scenario["combined_pat"], 4), c(scenario["combined_eps"], 4), c(scenario["accretion_dilution"], 6)
        ])
    deal_rows += [
        [],
        [c("Breakeven pretax synergy"), c(deal["break_even_pretax_synergy"], 9)],
        [c("Breakeven synergy / target revenue"), c(deal["break_even_pct_revenue"], 6)],
        [c("Recommendation"), c(model["recommendation"], 2)],
    ]
    sheets.append(("Deal Model", sheet_xml(deal_rows, [32, 20, 20, 20, 18, 24], ["A1:F1"])))

    sensitivity = model["sensitivity"]
    sensitivity_rows = [[c("DCF value per share sensitivity", 1)]]
    sensitivity_rows.append([c("WACC / Terminal growth", 2)] + [c(rate, 1) for rate in sensitivity["terminal_growth_rates"]])
    for row in sensitivity["rows"]:
        sensitivity_rows.append([c(row["wacc"], 5)] + [c(value, 4) for value in row["values"]])
    sensitivity_rows += [[], [c("Offer price"), c(deal["offer_price"], 9)], [c("Current target price"), c(market["target_share_price"], 4)]]
    sheets.append(("Sensitivity", sheet_xml(sensitivity_rows, [26, 16, 16, 16, 16, 16], ["A1:F1"])))

    source_rows = [[c("Source register", 1)], [c("Category", 2), c("Description", 1)]]
    source_rows += [
        [c("Historical financials"), c("Company annual reports and published FY2024-FY2026 results; see docs/SOURCES.md")],
        [c("Market price"), c("Mrs. Bectors closing price on 27 Nov 2026; see docs/SOURCES.md")],
        [c("Assumptions"), c("Blue model inputs are analyst assumptions, not sourced facts")],
        [c("Limitations"), c("No purchase accounting, transaction fees, integration costs or cash opportunity cost")],
        [c("Disclaimer"), c(data["project"]["disclaimer"])],
    ]
    sheets.append(("Sources", sheet_xml(source_rows, [26, 100], ["A1:B1"])))

    content_types = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">', '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>', '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>', '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>']
    for index in range(1, len(sheets) + 1):
        content_types.append(f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
    content_types.append('</Types>')
    workbook_sheets = "".join(f'<sheet name="{xml_text(name)}" sheetId="{index}" r:id="rId{index}"/>' for index, (name, _) in enumerate(sheets, start=1))
    workbook = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>{workbook_sheets}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>'''
    workbook_rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
    for index in range(1, len(sheets) + 1):
        workbook_rels.append(f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>')
    workbook_rels.append(f'<Relationship Id="rId{len(sheets)+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'''

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "".join(content_types))
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", "".join(workbook_rels))
        archive.writestr("xl/styles.xml", styles_xml())
        for index, (_, xml) in enumerate(sheets, start=1):
            archive.writestr(f"xl/worksheets/sheet{index}.xml", xml)


def ppt_text_box(shape_id: int, name: str, x: int, y: int, cx: int, cy: int, text: str, size: int = 1800, bold: bool = False, color: str = "17365D", fill: str | None = None) -> str:
    paragraphs = []
    for line in text.split("\n"):
        run_props = f'<a:rPr lang="en-IN" sz="{size}" b="{1 if bold else 0}"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill></a:rPr>'
        paragraphs.append(f'<a:p><a:r>{run_props}<a:t>{xml_text(line)}</a:t></a:r><a:endParaRPr lang="en-IN" sz="{size}"/></a:p>')
    fill_xml = '<a:noFill/>' if fill is None else f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>'
    return f'''<p:sp><p:nvSpPr><p:cNvPr id="{shape_id}" name="{xml_text(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>{fill_xml}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="90000" rIns="90000" tIns="50000" bIns="50000"/><a:lstStyle/>{''.join(paragraphs)}</p:txBody></p:sp>'''


def slide_xml(title: str, subtitle: str, blocks: list[tuple[str, str]], footer: str, slide_number: int) -> str:
    shapes = [ppt_text_box(2, "Title", 450000, 250000, 11200000, 650000, title, 2700, True, "FFFFFF", "17365D")]
    shapes.append(ppt_text_box(3, "Subtitle", 500000, 950000, 11000000, 450000, subtitle, 1300, False, "666666"))
    if blocks:
        width = 11000000 // len(blocks)
        for index, (heading, body) in enumerate(blocks):
            x = 500000 + index * width
            shapes.append(ppt_text_box(4 + index * 2, heading, x, 1550000, width - 140000, 500000, heading, 1750, True, "17365D", "D9EAF7"))
            shapes.append(ppt_text_box(5 + index * 2, f"{heading} body", x, 2100000, width - 140000, 3900000, body, 1450, False, "333333", "F7F9FB"))
    shapes.append(ppt_text_box(50, "Footer", 500000, 6500000, 11000000, 300000, f"{footer}  |  {slide_number}", 900, False, "777777"))
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>{''.join(shapes)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'''


def slide_content(data: dict, model: dict) -> list[tuple[str, str, list[tuple[str, str]]]]:
    market = data["market_inputs"]
    dcf = model["dcf"]
    comps = model["comps"]
    deal = model["deal"]
    scenarios = deal["scenarios"]
    return [
        ("Hypothetical M&A transaction", "Tata Consumer Products / Mrs. Bectors Food Specialities", [("Transaction", f"100% acquisition\nOffer price: INR {deal['offer_price']:.2f}/share\nPremium: {market['offer_premium']:.0%}\nEquity value: INR {deal['equity_purchase_price']:,.0f} cr"), ("Recommendation", "Do not proceed at the modeled price and funding mix.\n\nEducational case study; not an announced deal.")]),
        ("Strategic rationale", "Potential portfolio and distribution fit", [("Portfolio", "Adds Cremica biscuits and English Oven bakery products.\n\nExpands premium packaged-food exposure."), ("Distribution", "Potential access to Tata Consumer's national retail footprint and channel capabilities."), ("Execution", "Value depends on integration, recurring synergies and disciplined purchase price.")]),
        ("Company profiles", "FY2026 consolidated financial snapshot", [("Tata Consumer", f"Revenue: INR 20,290 cr\nEBITDA: INR 2,815 cr\nPAT: INR 1,547 cr\nEBITDA margin: {2815/20290:.1%}"), ("Mrs. Bectors", f"Revenue: INR 2,043.6 cr\nEBITDA: INR 257.7 cr\nPAT: INR 140.9 cr\nEBITDA margin: {257.7/2043.6:.1%}")]),
        ("Historical performance", "Three-year operating trend", [("Tata Consumer", "Revenue FY24-FY26:\n15,206 → 17,618 → 20,290\n\nEBITDA:\n2,323 → 2,502 → 2,815"), ("Mrs. Bectors", "Revenue FY24-FY26:\n1,643 → 1,873.9 → 2,043.6\n\nEBITDA:\n242.5 → 251.5 → 257.7"), ("Observation", "Both companies grew revenue. Mrs. Bectors' EBITDA margin compressed from the FY2024 level.")]),
        ("Valuation", "DCF and comparable-company reference ranges", [("DCF", f"Enterprise value: INR {dcf['enterprise_value']:,.0f} cr\nEquity value: INR {dcf['equity_value']:,.0f} cr\nValue/share: INR {dcf['value_per_share']:.2f}"), ("Comparable companies", f"Median EV/EBITDA: {comps['median_multiple']:.1f}x\nEquity value: INR {comps['equity_value']:,.0f} cr\nValue/share: INR {comps['value_per_share']:.2f}"), ("Offer", f"Current price: INR {market['target_share_price']:.2f}\nOffer price: INR {deal['offer_price']:.2f}\nOffer exceeds both modeled references.")]),
        ("Deal structure", "Illustrative funding and purchase price", [("Purchase price", f"Equity purchase price: INR {deal['equity_purchase_price']:,.0f} cr\nTransaction EV: INR {deal['transaction_enterprise_value']:,.0f} cr"), ("Funding", f"Cash: INR {deal['cash_funding']:,.0f} cr\nNew debt: INR {deal['debt_funding']:,.0f} cr\nInterest rate: {market['new_debt_interest_rate']:.1%}"), ("Limitations", "Excludes fees, integration costs, purchase accounting and foregone interest on cash.")]),
        ("EPS impact", "Low, base and high recurring synergy cases", [(s["name"], f"Synergy: {s['synergy_pct_revenue']:.1%} of revenue\nCombined EPS: INR {s['combined_eps']:.2f}\nAccretion/(dilution): {s['accretion_dilution']:.1%}") for s in scenarios]),
        ("Recommendation and risks", "Conditional investment-banking conclusion", [("Recommendation", "Do not proceed at a 20% premium under 50% debt funding.\n\nRenegotiate price or validate synergies above breakeven."), ("Breakeven", f"Required pretax synergy: INR {deal['break_even_pretax_synergy']:.0f} cr\nEquivalent to {deal['break_even_pct_revenue']:.1%} of target revenue."), ("Key risks", "Integration and brand execution\nCommodity inflation\nLeverage and interest cost\nUnverified synergy timing")]),
    ]


def build_pptx(data: dict, model: dict, output: Path) -> None:
    slides = slide_content(data, model)
    overrides = "".join(f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' for i in range(1, len(slides)+1))
    content_types = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>{overrides}</Types>'''
    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'''
    slide_ids = "".join(f'<p:sldId id="{255+i}" r:id="rId{i+1}"/>' for i in range(1, len(slides)+1))
    presentation = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>{slide_ids}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'''
    pres_rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>']
    for i in range(1, len(slides)+1):
        pres_rels.append(f'<Relationship Id="rId{i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>')
    pres_rels.append('</Relationships>')
    layout = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'''
    master = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>'''
    theme = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="M&amp;A Theme"><a:themeElements><a:clrScheme name="M&amp;A"><a:dk1><a:srgbClr val="17365D"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="333333"/></a:dk2><a:lt2><a:srgbClr val="F7F9FB"/></a:lt2><a:accent1><a:srgbClr val="1F4E78"/></a:accent1><a:accent2><a:srgbClr val="70AD47"/></a:accent2><a:accent3><a:srgbClr val="ED7D31"/></a:accent3><a:accent4><a:srgbClr val="A5A5A5"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="FFC000"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Aptos"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="M&amp;A"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>'''
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("ppt/presentation.xml", presentation)
        archive.writestr("ppt/_rels/presentation.xml.rels", "".join(pres_rels))
        archive.writestr("ppt/slideMasters/slideMaster1.xml", master)
        archive.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>')
        archive.writestr("ppt/slideLayouts/slideLayout1.xml", layout)
        archive.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>')
        archive.writestr("ppt/theme/theme1.xml", theme)
        for index, (title, subtitle, blocks) in enumerate(slides, start=1):
            archive.writestr(f"ppt/slides/slide{index}.xml", slide_xml(title, subtitle, blocks, "Hypothetical educational case study — not investment advice", index))
            archive.writestr(f"ppt/slides/_rels/slide{index}.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>')


def pdf_escape(text: str) -> str:
    return text.encode("cp1252", "replace").decode("cp1252").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf_pages(pages: list[tuple[str, str, list[tuple[str, str]]]], output: Path, landscape: bool = True) -> None:
    width, height = (960, 540) if landscape else (612, 792)
    objects: list[bytes] = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    page_ids = []
    streams = []
    for page_index, (title, subtitle, blocks) in enumerate(pages, start=1):
        commands = ["0.09 0.21 0.36 rg", f"0 {height-75} {width} 75 re f", "1 1 1 rg", "BT /F2 24 Tf 34 TL", f"40 {height-48} Td ({pdf_escape(title)}) Tj ET", "0.35 0.35 0.35 rg", "BT /F1 11 Tf", f"40 {height-96} Td ({pdf_escape(subtitle)}) Tj ET"]
        block_width = (width - 80) / max(1, len(blocks))
        for block_index, (heading, body) in enumerate(blocks):
            x = 40 + block_index * block_width
            commands += ["0.85 0.92 0.97 rg", f"{x} {height-160} {block_width-12} 34 re f", "0.09 0.21 0.36 rg", "BT /F2 14 Tf", f"{x+10} {height-140} Td ({pdf_escape(heading)}) Tj ET", "0.97 0.98 0.99 rg", f"{x} 65 {block_width-12} {height-235} re f"]
            y = height - 190
            for paragraph in body.split("\n"):
                lines = textwrap.wrap(paragraph, width=max(24, int((block_width-35)/7))) or [""]
                for line in lines:
                    commands += ["0.18 0.18 0.18 rg", "BT /F1 11 Tf", f"{x+10} {y} Td ({pdf_escape(line)}) Tj ET"]
                    y -= 17
                y -= 5
        commands += ["0.45 0.45 0.45 rg", "BT /F1 8 Tf", f"40 28 Td (Hypothetical educational case study - not investment advice | {page_index}) Tj ET"]
        streams.append("\n".join(commands).encode("cp1252", "replace"))
    page_count = len(pages)
    pages_obj = f"<< /Type /Pages /Kids [{' '.join(f'{3+i*2} 0 R' for i in range(page_count))}] /Count {page_count} >>".encode()
    objects.append(pages_obj)
    for index, stream in enumerate(streams):
        content_id = 4 + index * 2
        page_ids.append(3 + index * 2)
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Resources << /Font << /F1 {3+page_count*2} 0 R /F2 {4+page_count*2} 0 R >> >> /Contents {content_id} 0 R >>".encode())
        objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("wb") as handle:
        handle.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for object_id, obj in enumerate(objects, start=1):
            offsets.append(handle.tell())
            handle.write(f"{object_id} 0 obj\n".encode() + obj + b"\nendobj\n")
        xref = handle.tell()
        handle.write(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
        for offset in offsets[1:]:
            handle.write(f"{offset:010d} 00000 n \n".encode())
        handle.write(f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())


def build_executive_summary(data: dict, model: dict, output: Path) -> None:
    deal = model["deal"]
    blocks = [
        ("Transaction", f"100% hypothetical acquisition at INR {deal['offer_price']:.2f} per share, funded 50% with cash and 50% with new debt."),
        ("Valuation", f"DCF: INR {model['dcf']['value_per_share']:.2f}/share. Comparable companies: INR {model['comps']['value_per_share']:.2f}/share. Modeled offer: INR {deal['offer_price']:.2f}/share."),
        ("EPS impact", "All three modeled synergy cases remain dilutive. Breakeven recurring pretax synergy is approximately " + f"{deal['break_even_pct_revenue']:.1%} of FY2026 target revenue."),
        ("Recommendation", model["recommendation"]),
    ]
    build_pdf_pages([("Executive summary", "Tata Consumer Products / Mrs. Bectors Food Specialities", blocks)], output, landscape=True)


def main() -> int:
    DELIVERABLES.mkdir(parents=True, exist_ok=True)
    data = load_assumptions()
    model = calculate_model(data)
    (PROJECT_ROOT / "data" / "model_output.json").write_text(json.dumps(model, indent=2), encoding="utf-8")
    build_workbook(data, model, DELIVERABLES / "tata_consumer_mrs_bectors_model.xlsx")
    build_pptx(data, model, DELIVERABLES / "tata_consumer_mrs_bectors_pitchbook.pptx")
    build_pdf_pages(slide_content(data, model), DELIVERABLES / "tata_consumer_mrs_bectors_pitchbook.pdf")
    build_executive_summary(data, model, DELIVERABLES / "executive_summary.pdf")
    print("Generated valuation model, pitchbook PPTX/PDF, and executive summary PDF")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
