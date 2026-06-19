import ast
import html
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
XML = ROOT / "spec-extract" / "xml"


def xml_lines(path):
    tree = ET.parse(path)
    rows = []
    for page in tree.findall(".//page"):
        pno = int(page.attrib["number"])
        by_top = {}
        for text in page.findall("text"):
            top = int(text.attrib["top"])
            left = int(text.attrib["left"])
            raw = "".join(text.itertext())
            by_top.setdefault(top, []).append((left, raw))
        for top in sorted(by_top):
            line = "".join(html.unescape(x[1]) for x in sorted(by_top[top]))
            rows.append((pno, top, line))
    return rows


def collect_array(lines, marker):
    start = next(i for i, (_, _, line) in enumerate(lines) if marker in line)
    out = []
    for _, _, line in lines[start + 1:]:
        if line.strip() == "];":
            break
        if line.strip().startswith("//"):
            continue
        if line.strip().startswith("["):
            out.append(line.strip().rstrip(","))
    return out


def parse_js_array(line):
    # XML text gives valid JS-ish single-quoted arrays. Python can parse after
    # normalizing a few characters that only appear outside string delimiters.
    normalized = line.replace("true", "True").replace("false", "False")
    try:
        return ast.literal_eval(normalized)
    except Exception as exc:
        raise ValueError(f"Could not parse: {line}") from exc


def main():
    v2 = xml_lines(XML / "v2.xml")
    v3 = xml_lines(XML / "v3.xml")
    arrays = {
        "base_glossary": [parse_js_array(x) for x in collect_array(v2, "const GLOSSARY")],
        "new_glossary": [parse_js_array(x) for x in collect_array(v3, "const NEW_GLOSSARY_TERMS")],
        "base_reading": [parse_js_array(x) for x in collect_array(v2, "const READING")],
        "new_reading": [parse_js_array(x) for x in collect_array(v3, "const NEW_READING")],
    }
    out = ROOT / "spec-extract" / "extracted_arrays.json"
    out.write_text(json.dumps(arrays, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: len(v) for k, v in arrays.items()}, indent=2))


if __name__ == "__main__":
    main()
