from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DELIVERABLES = PROJECT_ROOT / "deliverables"


def validate_zip_xml(path: Path, required: set[str]) -> list[str]:
    assert path.exists() and path.stat().st_size > 1000, path
    with zipfile.ZipFile(path) as archive:
        bad = archive.testzip()
        assert bad is None, f"Corrupt member in {path.name}: {bad}"
        names = set(archive.namelist())
        missing = required - names
        assert not missing, f"Missing from {path.name}: {sorted(missing)}"
        for name in names:
            if name.endswith((".xml", ".rels")):
                ElementTree.fromstring(archive.read(name))
        return sorted(names)


def main() -> int:
    output = json.loads((PROJECT_ROOT / "data" / "model_output.json").read_text(encoding="utf-8"))
    assert output["dcf"]["enterprise_value"] > 0
    assert output["dcf"]["value_per_share"] > 0
    assert output["deal"]["offer_price"] > 228.76
    assert len(output["deal"]["scenarios"]) == 3
    assert all(item["accretion_dilution"] < 0 for item in output["deal"]["scenarios"])
    assert output["deal"]["break_even_pct_revenue"] > 0.04

    xlsx = DELIVERABLES / "tata_consumer_mrs_bectors_model.xlsx"
    xlsx_names = validate_zip_xml(
        xlsx,
        {"[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet7.xml"},
    )
    with zipfile.ZipFile(xlsx) as archive:
        formulas = sum(archive.read(name).count(b"<f>") for name in xlsx_names if name.startswith("xl/worksheets/"))
        workbook = archive.read("xl/workbook.xml").decode("utf-8")
    assert formulas >= 20, f"Expected formula-driven workbook, found {formulas} formulas"
    for sheet in ("DCF", "Comparable Companies", "Deal Model", "Sensitivity", "Sources"):
        assert sheet in workbook

    pptx = DELIVERABLES / "tata_consumer_mrs_bectors_pitchbook.pptx"
    pptx_names = validate_zip_xml(
        pptx,
        {"[Content_Types].xml", "ppt/presentation.xml", "ppt/slides/slide1.xml", "ppt/slides/slide8.xml", "ppt/theme/theme1.xml"},
    )
    assert len([name for name in pptx_names if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)]) == 8

    for pdf_name, expected_pages in (("tata_consumer_mrs_bectors_pitchbook.pdf", 8), ("executive_summary.pdf", 1)):
        path = DELIVERABLES / pdf_name
        content = path.read_bytes()
        assert content.startswith(b"%PDF-1.4") and content.endswith(b"%%EOF\n")
        pages = len(re.findall(rb"/Type /Page\b", content))
        assert pages == expected_pages, f"{pdf_name}: expected {expected_pages} pages, found {pages}"

    print(f"Validated {len(xlsx_names)} XLSX members, 8 PPTX slides, 9 PDF pages, and {formulas} workbook formulas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
