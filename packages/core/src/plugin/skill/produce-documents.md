---
name: produce-documents
description: Use when producing or converting a document deliverable — Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF, CSV, or Markdown — or when reading text and tables out of PDFs, Word files, or spreadsheets. Covers which tool to reach for, how to check what is installed, and the conversion routes between formats.
---

# Producing document deliverables

Finished work goes in `deliverables/` at the top of the workspace. Scripts and
intermediate files go in `.cowork/` so they stay out of the person's way.

Never show the person the script or the command. They asked for a document.

## First: find out what is installed

Do this once per workspace and remember the answer. Run the checks together:

```bash
python3 -c "import docx, openpyxl, pptx, pandas; print('py-office ok')" 2>&1 | tail -1
python3 -c "import pypdf; print('pypdf ok')" 2>&1 | tail -1
command -v pandoc libreoffice soffice pdftotext 2>&1
```

If a Python library is missing, install it into a workspace-local virtual
environment rather than the system Python:

```bash
python3 -m venv .cowork/venv
.cowork/venv/bin/pip install --quiet python-docx openpyxl python-pptx pandas pypdf
```

Then use `.cowork/venv/bin/python` for every script. If installation is not
possible (no network, no Python), fall back to the format table below and tell
the person plainly which format you produced instead and why.

## Choosing the format

| The person asked for                                  | Produce |
| ----------------------------------------------------- | ------- |
| a report, a memo, a letter, "a document"              | `.docx` |
| notes, an outline, something to paste elsewhere       | `.md`   |
| a table, a budget, a list of records, "a spreadsheet" | `.xlsx` |
| data for another program to read                      | `.csv`  |
| slides, a deck                                        | `.pptx` |
| something to send, sign, or print                     | `.pdf`  |

When in doubt for prose, write `.docx`. When in doubt for data, write `.xlsx`.

Always write the file, then open it back up and check it — row counts, section
headings, no empty cells where numbers should be.

## Writing files

### Word (.docx) — `python-docx`

```python
from docx import Document
from docx.shared import Pt

doc = Document()
doc.add_heading("Q3 Summary", level=0)
doc.add_paragraph("Revenue grew 12% quarter over quarter.")
doc.add_heading("Detail", level=1)

table = doc.add_table(rows=1, cols=2)
table.style = "Light Grid Accent 1"
head = table.rows[0].cells
head[0].text, head[1].text = "Region", "Revenue"
for region, revenue in rows:
    cells = table.add_row().cells
    cells[0].text = region
    cells[1].text = f"{revenue:,.0f}"

doc.save("deliverables/Q3 Summary.docx")
```

Use real heading levels rather than bold paragraphs — it gives the person a
navigable document. Set `doc.styles["Normal"].font.size = Pt(11)` if the default
looks cramped.

### Excel (.xlsx) — `openpyxl`

```python
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = "Summary"
ws.append(["Region", "Revenue", "Change"])
for cell in ws[1]:
    cell.font = Font(bold=True)
for row in rows:
    ws.append(row)

ws.freeze_panes = "A2"
for i, width in enumerate(widths, start=1):
    ws.column_dimensions[get_column_letter(i)].width = width
for cell in ws["B"][1:]:
    cell.number_format = "#,##0"

wb.save("deliverables/Regional Revenue.xlsx")
```

Header row bold, panes frozen, columns wide enough to read, numbers formatted.
A spreadsheet nobody can read at a glance is not finished work.

For a dataframe you already have, `df.to_excel(path, index=False)` via pandas is
fine — then reopen with openpyxl to widen columns and bold the header.

### PowerPoint (.pptx) — `python-pptx`

```python
from pptx import Presentation

prs = Presentation()
slide = prs.slides.add_slide(prs.slide_layouts[1])
slide.shapes.title.text = "Q3 Results"
slide.placeholders[1].text_frame.text = "Revenue grew 12%"
prs.save("deliverables/Q3 Results.pptx")
```

### Markdown (.md) and CSV

Write these with the normal write tool — no library needed. For CSV use
Python's `csv` module or `df.to_csv(path, index=False)` so quoting and commas
inside fields are handled correctly. Never build a CSV by joining strings.

## Reading files

- **PDF** — the read tool handles PDFs directly; just read the file. For a
  long PDF where you only need the text, `pdftotext -layout in.pdf -` or
  `pypdf` is faster and cheaper. If a PDF is a scan with no text layer, say so
  rather than guessing at its contents.
- **Word** — `python-docx`: `"\n".join(p.text for p in Document(path).paragraphs)`.
  Tables live in `doc.tables`, not in `paragraphs`.
- **Excel** — `openpyxl.load_workbook(path, data_only=True)`. `data_only=True`
  matters: without it you get formulas instead of values.
- **CSV** — `pandas.read_csv`. Check the delimiter and encoding if it looks
  wrong; European exports are often `;` separated and `latin-1` encoded.
- **PowerPoint** — `python-pptx`, walking `slide.shapes` for those with a
  `text_frame`.

## Converting between formats

Prefer, in order: pandoc for text-shaped documents, LibreOffice for anything
Office-shaped, then a Python round trip.

```bash
# markdown -> docx / pdf   (pandoc; add --toc for long reports)
pandoc report.md -o "deliverables/Report.docx"
pandoc report.md -o "deliverables/Report.pdf"

# docx -> pdf, xlsx -> pdf, pptx -> pdf   (LibreOffice, headless)
soffice --headless --convert-to pdf --outdir deliverables "deliverables/Report.docx"

# docx -> markdown  (for reading or editing prose)
pandoc "input.docx" -t gfm -o .cowork/input.md

# xlsx -> csv
soffice --headless --convert-to csv --outdir .cowork "input.xlsx"
```

LibreOffice writes the output next to `--outdir` using the input's base name;
rename afterwards if the person expects a particular filename. Its first run can
take several seconds — that is normal, not a hang.

If neither pandoc nor LibreOffice is available and the person needs a PDF, build
the `.docx` and say plainly that PDF conversion is not available on this machine.

## Naming and placement

- Title case, spaces allowed: `deliverables/Q3 Summary Report.docx`.
- No version suffixes, no timestamps, no underscores-with-dates. If the person
  wants a revision, ask or overwrite with their say-so.
- One deliverable per request unless they asked for a set.
- Never write a script, a log, or a temporary extract into `deliverables/`.
