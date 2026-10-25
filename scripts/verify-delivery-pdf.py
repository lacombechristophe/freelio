"""Inspect the fictitious PDFs emitted by delivery-pdf-native.integration.test.ts.

Offline review tool, separate from the application and CI. Requires pdfplumber,
pypdfium2 and Pillow in the selected Python environment; installs nothing.
Usage: python scripts/verify-delivery-pdf.py <PDF_NATIVE_RECEIPT.json>
"""

import hashlib
import importlib.metadata
import json
import logging
from pathlib import Path
import re
import sys

import pdfplumber
import pypdfium2 as pdfium

logging.getLogger("pdfminer").setLevel(logging.ERROR)
receipt = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
root = Path(receipt["directory"])
files = []
checks = []


def check(name, passed):
    checks.append({"check": name, "passed": bool(passed)})


for artifact in receipt["artifacts"]:
    file = root / artifact["file"]
    check(f"{file.name}: receipt hash", hashlib.sha256(file.read_bytes()).hexdigest() == artifact["sha256"])
    pages = []
    with pdfplumber.open(file) as pdf:
        for page in pdf.pages:
            bounds = {
                "left": min(c["x0"] for c in page.chars),
                "right": max(c["x1"] for c in page.chars),
                "top": min(c["top"] for c in page.chars),
                "bottom": max(c["bottom"] for c in page.chars),
            }
            # Physical print margins, with 2 pt tolerance for font metrics.
            check(f"{file.name}: page {page.page_number} print margins", (
                bounds["left"] >= 15 * 72 / 25.4 - 2
                and bounds["right"] <= page.width - 15 * 72 / 25.4 + 2
                and bounds["top"] >= 12 * 72 / 25.4 - 2
                and bounds["bottom"] <= page.height - 16 * 72 / 25.4 + 2
            ))
            pages.append({"page": page.page_number, "bounds": bounds, "text": page.extract_text() or ""})
    text = "\n".join(page["text"] for page in pages)
    for value in ["Atelier Élodie — Démonstration", "Müller & Fils — Données fictives", "Bâtiment Łódź fictif", "Zoé Łukasz — réception fictive", "0,0001"]:
        check(f"{file.name}: {value}", value in text)
    capture = "signed-multi-page.html" if file.name == "signed-multi-page.pdf" else "signed-capture.html"
    digest = re.search(r'<strong class="digest">([a-f0-9]{64})</strong>', (root / capture).read_text(encoding="utf-8"))
    check(f"{file.name}: captured digest", digest is not None and digest.group(1) in re.sub(r"\s", "", text))
    check(f"{file.name}: no current edited data", not any(value in text for value in ["Identité modifiée", "Client modifié", "Ligne modifiée"]))
    expected_lines = 80 if file.name == "signed-multi-page.pdf" else 1
    labels = re.findall(r"(\d{3}) — Pièce d’essai & raccord <fictif>", text)
    check(f"{file.name}: complete ordered lines without duplicates", labels == [f"{i:03d}" for i in range(1, expected_lines + 1)])
    images = []
    with pdfium.PdfDocument(str(file)) as native:
        for index in range(len(native)):
            page = native[index]
            bitmap = page.render(scale=1.5)
            image = bitmap.to_pil()
            output = root / f"{file.stem}-page-{index + 1}.png"
            image.save(output)
            images.append({"file": output.name, "pixelsSha256": hashlib.sha256(image.tobytes()).hexdigest()})
            image.close()
            bitmap.close()
            page.close()
    files.append({"file": file.name, "sha256": artifact["sha256"], "pages": pages, "images": images})

by_name = {file["file"]: file for file in files}
check("three expected PDFs", set(by_name) == {"signed-original.pdf", "signed-after-edits.pdf", "signed-multi-page.pdf"})
original, edited = by_name.get("signed-original.pdf"), by_name.get("signed-after-edits.pdf")
check("unchanged signed text after edits", original is not None and edited is not None and [p["text"] for p in original["pages"]] == [p["text"] for p in edited["pages"]])
check("unchanged rendered pixels after edits", original is not None and edited is not None and [p["pixelsSha256"] for p in original["images"]] == [p["pixelsSha256"] for p in edited["images"]])
report = {"schema": "freelio.delivery-pdf-inspection.v1", "tools": {name: importlib.metadata.version(name) for name in ["pdfplumber", "pypdfium2", "pillow"]}, "checks": checks, "files": files}
(root / "inspection.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
failed = [item["check"] for item in checks if not item["passed"]]
print(json.dumps({"checks": len(checks), "failed": failed, "report": str(root / "inspection.json")}, ensure_ascii=False))
sys.exit(1 if failed else 0)
