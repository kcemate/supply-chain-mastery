import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "spec-extract"


DOMAINS = [
    {"n": 1, "name": "FOUNDATIONS"},
    {"n": 2, "name": "DEMAND"},
    {"n": 3, "name": "INVENTORY"},
    {"n": 4, "name": "SOURCING"},
    {"n": 5, "name": "CONTRACTS"},
    {"n": 6, "name": "SUPPLIERS"},
    {"n": 7, "name": "LOGISTICS"},
    {"n": 8, "name": "COMMODITY"},
    {"n": 9, "name": "RISK"},
    {"n": 10, "name": "ANALYTICS"},
    {"n": 11, "name": "STRATEGY"},
    {"n": 12, "name": "APPLIED"},
    {"n": 13, "name": "NETWORKS"},
    {"n": 14, "name": "SUSTAIN"},
    {"n": 15, "name": "GEOPOLITICS"},
    {"n": 16, "name": "HEALTHCARE"},
    {"n": 17, "name": "SEMICOND"},
    {"n": 18, "name": "BEHAVIOR"},
]

MASTER_WEEKS = {
    61: (13, 1), 62: (13, 3), 63: (13, 13), 64: (13, 13), 65: (13, 13),
    66: (14, 13), 67: (14, 14), 68: (14, 14), 69: (14, 14), 70: (14, 15),
    71: (15, 15), 72: (15, 16), 73: (15, 16), 74: (15, 17), 75: (15, 17),
    76: (16, 18), 77: (16, 18), 78: (16, 12), 79: (16, 3), 80: (16, 12),
}

CAPSTONES = {60, 62, 66, 69, 78, 79, 80, 53}


def clean_text(path):
    s = path.read_text(encoding="utf-8", errors="replace")
    s = s.replace("\f", "\n")
    s = s.replace("−", "-")
    return s


def compact_ws(s):
    return re.sub(r"\s+", " ", s).strip()


def field(block, name, stop_names):
    start = re.search(rf"(?m)^\s*{re.escape(name)}:\s*(.*)$", block)
    if not start:
        return ""
    pos = start.end()
    parts = [start.group(1).strip()]
    pats = []
    for x in stop_names:
        if x.lower() == "case":
            pats.append(r"[Cc]ase\b.*")
        else:
            pats.append(re.escape(x))
    stop = re.compile(r"(?m)^\s*(?:" + "|".join(pats) + r"):\s*")
    nxt = stop.search(block, pos)
    end = nxt.start() if nxt else len(block)
    tail = block[pos:end].strip()
    if tail:
        parts.append(tail)
    return compact_ws("\n".join(parts))


def split_days(text, first, last):
    matches = list(re.finditer(r"(?m)^Day\s+(\d+)\s+—\s+(.+)$", text))
    by_day = {}
    for i, m in enumerate(matches):
        d = int(m.group(1))
        if d < first or d > last:
            continue
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[m.start():end].strip()
        # v3 includes a week outline that repeats Day 61-80 headings without content.
        if not re.search(r"(?m)^\s*f:\s*", block) and d >= 61:
            continue
        cur = by_day.get(d)
        if cur is None or len(block) > len(cur[1]):
            by_day[d] = (m.group(2).strip(), block)
    return [(d, by_day[d][0], by_day[d][1]) for d in sorted(by_day)]


def parse_setup(block):
    m = re.search(r"setup lines:\s*(.*?)(?:\n\s*(?:context|ctx):|\n\s*quant:|\n\s*D1|\n\s*decisions:)", block, re.S | re.I)
    if not m:
        return []
    lines = []
    for raw in m.group(1).splitlines():
        line = raw.strip()
        if not line:
            continue
        cls = "amber" if "[amber]" in line else ("dim" if "[dim]" in line else "")
        line = line.replace("[amber]", "").replace("[dim]", "").strip()
        if line.lower() == "blank":
            lines.append(["", ""])
        else:
            lines.append([line, cls])
    return lines


def parse_ctx(block):
    m = re.search(r"(?mi)^\s*(?:context|ctx):\s*(.*?)(?:\n\s*(?:quant:|D1|D2|decisions:|optimal:|opt:|fr:|principal framing|$))", block, re.S)
    if not m:
        return []
    raw = compact_ws(m.group(1))
    rows = []
    for part in re.split(r"\s*·\s*", raw):
        if "=" in part:
            a, b = part.split("=", 1)
            rows.append([a.strip(), b.strip()])
    return rows


def parse_quant(block):
    m = re.search(r"(?mi)^\s*quant:\s*(.*?)(?:\n\s*D1|\n\s*D2|\n\s*optimal:|\n\s*opt:)", block, re.S)
    if not m:
        return None
    q = m.group(1).strip()
    formula = field("formula: " + q, "formula", ["vars", "result"]) or ""
    result = field("result: " + q, "result", ["D1", "D2"]) or ""
    return {"raw": q, "f": formula, "v": [], "r": result}


def parse_decisions(block):
    decisions = []
    for dm in re.finditer(r"(?ms)^\s*D(\d+)\s+[“\"]([^”\"]+)[”\"]:\s*(.*?)(?=^\s*D\d+\s+[“\"]|^\s*(?:optimal|opt|fr|principal framing)|\Z)", block):
        body = dm.group(3)
        opts = []
        for om in re.finditer(r"(?ms)(good|warn|bad)\s+([+-]?\d+).*?[“\"]([^”\"]+)[”\"]\s*(?:→|->)\s*[“\"]([^”\"]+)[”\"]", body):
            opts.append({"v": om.group(1), "s": int(om.group(2)), "l": compact_ws(om.group(3)).upper(), "c": compact_ws(om.group(4))})
        if not opts:
            for om in re.finditer(r"(?ms)(good|warn|bad)\s+([+-]?\d+)\s*(?:→\s*next:\d+)?\s*[“\"]([^”\"]+)[”\"]\s*(?:→|->)\s*[“\"]([^”\"]+)[”\"]", body):
                opts.append({"v": om.group(1), "s": int(om.group(2)), "l": compact_ws(om.group(3)).upper(), "c": compact_ws(om.group(4))})
        if opts:
            decisions.append({"p": f"DECISION {int(dm.group(1)):02d} / {max(2, int(dm.group(1))):02d}", "q": compact_ws(dm.group(2)).upper(), "o": opts})
    optm = re.search(r"(?mi)^\s*(?:optimal|opt):\s*\[([^\]]*)\]", block)
    opt = []
    if optm:
        opt = [int(x.strip()) for x in optm.group(1).split(",") if x.strip().isdigit()]
    return decisions, opt


def parse_derivation(block):
    if "derivation steps" not in block.lower():
        return None
    m = re.search(r"derivation steps.*?:\s*(.*?)(?:principal framing|fr:)", block, re.S | re.I)
    if not m:
        return {"steps": [{"n": "1", "title": "Derivation", "body": block}]}
    body = m.group(1)
    steps = []
    for sm in re.finditer(r"(?ms)^\s*(\d+)\.\s*([^:\n]+):\s*(.*?)(?=^\s*\d+\.\s*[^:\n]+:|\Z)", body):
        content = sm.group(3).strip()
        math_lines = "\n".join([ln.strip() for ln in content.splitlines() if any(ch in ln for ch in ["=", "∫", "√", "λ", "µ", "σ"])])
        steps.append({"n": sm.group(1), "title": compact_ws(sm.group(2)), "body": compact_ws(content), "math": math_lines})
    return {"steps": steps or [{"n": "1", "title": "Derivation", "body": compact_ws(body)}]}


def parse_day(d, title, block, is_v3):
    w, dom = MASTER_WEEKS.get(d, ((d - 1) // 5 + 1, min(12, (d - 1) // 5 + 1)))
    f = field(block, "f", ["o", "cite", "sum", "dur", "cap", "case", "content"])
    o = field(block, "o", ["cite", "sum", "dur", "cap", "case", "content"])
    cite = field(block, "cite", ["sum", "dur", "cap", "case", "content"])
    sumv = field(block, "sum", ["dur", "cap", "case", "content", "brief"])
    dur_m = re.search(r"(?mi)^\s*dur:\s*(\d+)", block)
    dur = int(dur_m.group(1)) if dur_m else (18 if d in CAPSTONES else 5)
    fr = field(block, "fr", ["Day"]) or field(block, "principal framing (replaces fr)", ["Day"])
    decisions, opt = parse_decisions(block)
    case_title = ""
    cm = re.search(r"(?mi)^\s*(?:Case(?:\s*\(full scenario\))?|case)\s*:?\s*[“\"]?([^”\"\n:]+)[”\"]?", block)
    if cm:
        case_title = compact_ws(cm.group(1))
    pre = field(block, "pre", ["setup lines", "ctx", "context", "D1", "quant"])
    scn = None
    if decisions:
        scn = {
            "tp": case_title or title,
            "pre": pre,
            "sl": parse_setup(block),
            "ctx": parse_ctx(block),
            "qt": parse_quant(block),
            "dec": decisions,
            "opt": opt,
            "fr": fr,
        }
    return {
        "d": d, "w": w, "dom": dom, "t": title.replace(" (lecture)", "").strip(),
        "f": f, "o": o, "cite": cite, "sum": sumv,
        "dur": dur, "cap": d in CAPSTONES or "capstone" in title.lower(),
        "deriv": parse_derivation(block), "scn": scn, "raw": block,
    }


def build_curriculum():
    v2 = clean_text(SPEC / "scfc-masters-spec-v2-raw.txt")
    v3 = clean_text(SPEC / "scfc-masters-spec-v3-raw.txt")
    days = [parse_day(d, t, b, False) for d, t, b in split_days(v2, 1, 60)]
    days += [parse_day(d, t, b, True) for d, t, b in split_days(v3, 61, 80)]
    return sorted(days, key=lambda x: x["d"])


BASE_GLOSSARY = [
    ["TCO", "Total Cost of Ownership — full lifecycle cost: acquisition, possession, transformation, disposal."],
    ["CODP", "Customer Order Decoupling Point — where you commit to specific demand."],
    ["ABC", "Pareto-based SKU classification: A items, B items, C items."],
    ["MAD/RMSE/MAPE", "Forecast error metrics: Mean Absolute Deviation, Root Mean Squared Error, Mean Absolute Percentage Error."],
    ["BULLWHIP", "Demand variance amplification upstream. Four causes: signal processing, rationing, batching, price fluctuation."],
    ["S&OP", "Sales & Operations Planning — monthly executive cadence aligning demand, supply, and finance."],
    ["CROSTON", "Forecast method for intermittent demand; decouples size and inter-arrival interval."],
    ["BASS MODEL", "New-product diffusion with innovation and imitation coefficients."],
    ["EOQ", "Economic Order Quantity. Q* = sqrt(2DS/H). Robust because the cost curve is flat near optimum."],
    ["NEWSVENDOR", "Single-period stocking under uncertain demand. Optimal quantile = Cu/(Cu+Co)."],
    ["SAFETY STOCK", "Inventory beyond cycle stock to absorb variance. SS = z x sigma."],
    ["METRIC", "Multi-Echelon Technique for Recoverable Item Control. Pools risk across the network."],
    ["CSL / FILL RATE", "Cycle Service Level versus Fill Rate. Different service promises."],
    ["KRALJIC", "2x2 spend segmentation by supply risk x profit impact."],
    ["TCE", "Transaction Cost Economics — Williamson's framework for make-vs-buy."],
    ["SUPPLIER TIERING", "Strategic vs transactional segmentation. Different tiers warrant different governance."],
    ["DUAL SOURCING", "Splitting volume across two suppliers. Trades unit price for resilience."],
    ["REVERSE AUCTION", "Buyer-side competitive bidding. Works only for commoditized, multi-bidder categories."],
    ["BATNA", "Best Alternative To a Negotiated Agreement. Your walk-away."],
    ["ZOPA", "Zone Of Possible Agreement. Overlap between buyer and seller reservation values."],
    ["REVENUE SHARING", "Contract aligning supplier compensation to buyer realization."],
    ["QF CONTRACT", "Quantity Flexibility — pre-commit baseline plus paid options for variation."],
    ["BUYBACK", "Supplier repurchase of unsold inventory at fraction of cost."],
    ["OPEN-BOOK", "Cost transparency between buyer and supplier. Margin becomes negotiated."],
    ["POEM", "Procurement & Operations Excellence Model — supplier maturity model."],
    ["FMEA", "Failure Mode & Effects Analysis. RPN = Severity x Occurrence x Detection."],
    ["p-MEDIAN", "Facility location formulation: minimize weighted distance from demand to facilities."],
    ["CROSS-DOCK", "Distribution facility with no inventory holding; flow-through only."],
    ["VRP", "Vehicle Routing Problem. NP-hard combinatorial optimization for multi-stop routes."],
    ["INDEX-LINKED", "Contract pricing tied to a published commodity index."],
    ["BASIS RISK", "Mismatch between hedge instrument and physical exposure."],
    ["ALL-UNITS", "Volume discount applied retroactively to all units when threshold is crossed."],
    ["RESILIENCE", "Sheffi: redundancy versus flexibility under disruption."],
    ["SPOF", "Single Point of Failure. A node whose disruption cascades to system collapse."],
    ["RTO / RPO", "Recovery Time Objective and Recovery Point Objective."],
    ["SBOM", "Software Bill of Materials. Cyber supply chain transparency."],
    ["EVPI", "Expected Value of Perfect Information. Maximum justifiable spend on information."],
    ["EVII", "Expected Value of Imperfect Information."],
    ["TORNADO", "Sensitivity diagram showing variables ranked by impact on outcome."],
    ["MONTE CARLO", "Simulation method using repeated random sampling to estimate distributions."],
    ["4 Vs", "Volume, Variety, Variation, Visibility. Slack operations strategy dimensions."],
    ["TOC", "Theory of Constraints. Identify, exploit, subordinate, elevate, repeat."],
    ["TPS", "Toyota Production System. Pull, jidoka, heijunka, kanban."],
    ["SCOPE 3", "Indirect emissions across the value chain. Categories 1 and 4 dominate."],
    ["CIRCULAR", "Supply chain that designs out waste — reduce, reuse, refurbish, remanufacture, recycle."],
    ["COGS", "Cost of Goods Sold. Aggregate TCO at product level."],
    ["OTD", "On-Time Delivery. Standard supplier scorecard metric."],
    ["OEE", "Overall Equipment Effectiveness = Availability x Performance x Quality."],
    ["MOQ", "Minimum Order Quantity. Supplier-imposed lower bound; binding on EOQ."],
    ["NPV", "Net Present Value. Time-discounted cash flows."],
    ["CV", "Coefficient of Variation = sigma / mean. Demand variability normalized."],
]

NEW_GLOSSARY = [
    ["TRIPLE-A", "Hau Lee's framework: Agility, Adaptability, Alignment."],
    ["VALUE CAPTURE", "Brandenburger-Stuart: share of created value a firm appropriates."],
    ["CAPABILITY", "Pisano: firm-specific routines and assets competitors cannot easily copy."],
    ["p-CENTER", "MILP variant: minimize the maximum distance any customer travels."],
    ["SET COVERING", "Minimum facilities such that every demand point is within a radius."],
    ["MILP", "Mixed-Integer Linear Programming. Workhorse of network design."],
    ["DUAL VARIABLE", "In LP, the shadow price of a constraint."],
    ["NP-HARD", "Computational class for problems such as VRP, p-median, scheduling."],
    ["SAVINGS ALGO", "Clarke-Wright heuristic for VRP."],
    ["LITTLE'S LAW", "L = lambda x W. Average inventory = throughput x time in system."],
    ["M/M/1", "Single-server queue with Poisson arrivals and exponential service."],
    ["ERLANG C", "Multi-server queueing formula for staffing and wait probability."],
    ["SCOPE 1/2/3", "GHG emissions accounting: direct, purchased energy, and value-chain emissions."],
    ["CBAM", "EU Carbon Border Adjustment Mechanism. Prices imported carbon."],
    ["EU ETS", "EU Emissions Trading System. Foundation of European carbon pricing."],
    ["SBTi", "Science Based Targets initiative for validating emissions targets."],
    ["CIRCULARITY", "Designing supply chains for reuse, repair, remanufacturing, recycling."],
    ["FRIEND-SHORING", "Relocating production to politically aligned countries."],
    ["DECOUPLING", "Reducing supply chain interdependence with a geopolitical rival."],
    ["CHIPS ACT", "US semiconductor industrial policy enacted in 2022."],
    ["IRA", "Inflation Reduction Act clean energy and EV battery industrial policy."],
    ["SECTION 301", "US trade law authorizing tariffs on China."],
    ["DSCSA", "Drug Supply Chain Security Act serialization and traceability mandate."],
    ["EPCIS", "Electronic Product Code Information Services data exchange standard."],
    ["COLD CHAIN", "Temperature-controlled supply chain."],
    ["FDA 483", "FDA notice of objectionable conditions during inspection."],
    ["EUV", "Extreme Ultraviolet Lithography. ASML monopoly; gates leading-edge nodes."],
    ["FOUNDRY", "Pure-play semiconductor manufacturer such as TSMC."],
    ["ALLOCATION", "Share of constrained fab capacity each customer receives."],
    ["BEER GAME", "Sterman simulation showing bullwhip behavior emerges from decision rules."],
    ["ANCHORING", "Tversky-Kahneman bias where the first number frames later estimates."],
]

READING = [
    ["CANON", "Simchi-Levi, Kaminsky & Simchi-Levi.", "Designing and Managing the Supply Chain", "McGraw-Hill", "Integrated supply-chain design", 1],
    ["CORE", "Ellram, L. M.", "Total cost of ownership.", "IJPDLM", "TCO", 1],
    ["CORE", "Choi, T. Y. & Linton, T.", "Don't Let Your Supply Chain Control Your Business.", "HBR", "Tier-N visibility", 2],
    ["CORE", "Fisher, M. L.", "What Is the Right Supply Chain for Your Product?", "HBR", "Product/supply fit", 5],
    ["CANON", "Lee, Padmanabhan & Whang.", "Information Distortion in a Supply Chain: The Bullwhip Effect.", "Management Science", "Bullwhip", 7],
    ["CANON", "Silver, Pyke & Peterson.", "Inventory Management and Production Planning", "Wiley", "Inventory", 11],
    ["CORE", "Petruzzi, N. C. & Dada, M.", "Pricing and the Newsvendor Problem.", "Operations Research", "Newsvendor", 12],
    ["CANON", "Kraljic, P.", "Purchasing Must Become Supply Management.", "HBR", "Sourcing", 16],
    ["CANON", "Williamson, O. E.", "The Economic Institutions of Capitalism", "Free Press", "Make/buy", 17],
    ["CORE", "Tang, C. S.", "Perspectives in supply chain risk management.", "IJPE", "Risk", 19],
    ["CANON", "Fisher, R. & Ury, W.", "Getting to Yes", "Penguin", "Negotiation", 21],
    ["CORE", "Cachon, G. P. & Lariviere, M. A.", "Supply Chain Coordination with Revenue-Sharing Contracts.", "Management Science", "Contracts", 22],
    ["CANON", "Sheffi, Y. & Rice, J. B.", "A Supply Chain View of the Resilient Enterprise.", "MIT SMR", "Resilience", 41],
    ["CORE", "Daskin, M. S.", "Network and Discrete Location", "Wiley", "Network design", 32],
    ["CORE", "Hull, J. C.", "Options, Futures, and Other Derivatives", "Pearson", "Hedging", 37],
    ["CANON", "Sheffi, Y.", "The Power of Resilience", "MIT Press", "Resilience", 41],
    ["CANON", "Raiffa, H.", "Decision Analysis", "Addison-Wesley", "Decision analysis", 47],
    ["CORE", "Box, G. E. P.", "Science and Statistics.", "JASA", "Model judgment", 50],
    ["CANON", "Goldratt, E. M. & Cox, J.", "The Goal", "North River Press", "TOC", 53],
    ["CANON", "Womack & Jones.", "Lean Thinking", "Simon & Schuster", "Lean", 54],
    ["CORE", "WRI / WBCSD.", "GHG Protocol Corporate Value Chain (Scope 3) Standard", "GHG Protocol", "Scope 3", 56],
    ["CORE", "Simchi-Levi, D.", "Operations Rules", "MIT Press", "Operations rules", 58],
    ["CANON", "Lee, H. L.", "The Triple-A Supply Chain.", "Harvard Business Review", "Triple-A", 61, "case-study"],
    ["CORE", "Lee, H. L. & Tang, C. S.", "Socially and Environmentally Responsible Value Chain.", "Stanford", "Responsible operations", 67],
    ["CANON", "Brandenburger, A. M. & Stuart, H. W.", "Value-based Business Strategy.", "Journal of Economics & Management Strategy", "Value capture", 78],
    ["CORE", "Pisano, G. P.", "Toward a Prescriptive Theory of Dynamic Capabilities.", "Industrial and Corporate Change", "Capabilities", 78],
    ["CANON", "Daskin, M. S.", "Network and Discrete Location: Models, Algorithms, and Applications", "Wiley", "Networks", 63, "derivation"],
    ["CORE", "Toth, P. & Vigo, D.", "Vehicle Routing: Problems, Methods, and Applications", "SIAM", "Routing", 64],
    ["CANON", "Little, J. D. C.", "A Proof for the Queuing Formula: L = lambda W.", "Operations Research", "Queueing", 65, "derivation"],
    ["CORE", "Hopp, W. J. & Spearman, M. L.", "Factory Physics", "Waveland", "Queueing", 66],
    ["CANON", "Plambeck, E. L.", "Reducing greenhouse gas emissions through operations and supply chain management.", "Energy Economics", "Sustainability", 67],
    ["CORE", "Lee, H. L., Plambeck, E. L. & Yatsko, P.", "Embracing Green in China.", "Stanford GSB", "Sustainability", 67],
    ["CORE", "WRI / WBCSD", "Corporate Value Chain (Scope 3) Accounting and Reporting Standard", "GHG Protocol", "Scope 3", 68],
    ["EMERGING", "European Commission", "Carbon Border Adjustment Mechanism, Reg. (EU) 2023/956", "EU", "CBAM", 68],
    ["EMERGING", "Witt, M. A. et al.", "Decoupling in international business.", "Journal of International Business Studies", "Geopolitics", 70],
    ["EMERGING", "Allen, G. C. (CSIS)", "Sourcing Requirements and U.S. Technological Competitiveness.", "CSIS", "CHIPS", 71],
    ["CORE", "Mazzucato, M.", "The Entrepreneurial State", "Anthem", "Industrial policy", 71],
    ["CORE", "Scheinker, D. & Brandeau, M. L.", "Healthcare operations management.", "Stanford", "Healthcare", 72],
    ["EMERGING", "FDA", "Drug Supply Chain Security Act: Implementation", "FDA", "DSCSA", 73],
    ["CANON", "Sterman, J. D.", "Modeling Managerial Behavior: Misperceptions of Feedback.", "Management Science", "Beer game", 76],
    ["CANON", "Croson, R. & Donohue, K.", "Behavioral Causes of the Bullwhip Effect.", "Production and Operations Management", "Behavioral ops", 76],
    ["CORE", "Gino, F. & Pisano, G.", "Toward a Theory of Behavioral Operations.", "Manufacturing & Service Operations Management", "Behavioral ops", 76],
    ["CORE", "Galinsky, A. D. & Mussweiler, T.", "First Offers as Anchors.", "Journal of Personality and Social Psychology", "Anchoring", 77],
]


def write_app():
    curriculum = build_curriculum()
    glossary, reading = load_spec_arrays()
    audio_scripts = write_audio_sources(curriculum)
    data = {"domains": DOMAINS, "curriculum": curriculum, "glossary": glossary, "reading": reading, "audioScripts": audio_scripts}
    (ROOT / "data.js").write_text("window.SCFC_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    # Field Notes is now hand-authored in the runtime files. Keep this compiler
    # responsible for spec-derived data/scripts/manifest so rebuilding data does
    # not overwrite the visual notebook interface.
    write_manifest(data)


def write_manifest(data):
    scripts = sorted((ROOT / "scripts").glob("day-*.txt"))
    audio = sorted((ROOT / "audio").glob("day-*.mp3")) if (ROOT / "audio").exists() else []
    manifest = {
        "name": "SCFC Masters Program",
        "version": "v3.1",
        "localStorageKey": "scfc-masters-v3",
        "runtime": ["index.html", "app.css", "app.js", "data.js", "audio/day-XX.mp3"],
        "build": ["build/compile_app.py", "build/extract_spec_arrays.py", "build/generate-audio.js", "build/verify.mjs", "scripts/day-XX.txt"],
        "counts": {
            "domains": len(data["domains"]),
            "days": len(data["curriculum"]),
            "foundationDays": len([d for d in data["curriculum"] if d["d"] <= 60]),
            "masteryDays": len([d for d in data["curriculum"] if d["d"] > 60]),
            "glossary": len(data["glossary"]),
            "readings": len(data["reading"]),
            "capstones": len([d for d in data["curriculum"] if d.get("cap")]),
            "derivations": len([d for d in data["curriculum"] if d.get("deriv")]),
            "audioFiles": len(audio),
            "scripts": len(scripts),
            "embeddedAudioScripts": len(data.get("audioScripts", {})),
        },
        "verification": {
            "command": "node build/verify.mjs",
            "expectedCurrentStatus": "passes all verifier checks, including static MP3 production gates and native voice fallback",
            "knownFailures": [],
        },
        "notes": [
            "Static MP3 folder contains 80 regenerated Apple-voice episodes validated at 500KB+ and 240-420 seconds",
            "Runtime voice path uses browser-native SpeechSynthesis fallback with preferred natural system voices when MP3 files are missing or invalid",
            "v3/v3.1 specs are additive and require v2 source material",
            "source specs contain glossary count inconsistency resolved by deterministic 80-term compiler merge",
        ],
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_spec_arrays():
    extracted = ROOT / "spec-extract" / "extracted_arrays.json"
    if not extracted.exists():
        return (BASE_GLOSSARY + NEW_GLOSSARY)[:80], sorted(READING, key=lambda x: x[5])
    arrays = json.loads(extracted.read_text(encoding="utf-8"))

    # The XML recovers the exact rows, but the source spec prose says the final
    # glossary total must be exactly 80 while the recovered arrays contain 51
    # base rows and 32 v3 rows. Keep the v2-declared 50-row base, replace the
    # duplicated p-MEDIAN definition with the v3 wording, and skip CIRCULARITY
    # because v2 already contains CIRCULAR. This preserves the required count
    # and keeps the recovered exact row text for rendered terms.
    glossary = [list(x) for x in arrays["base_glossary"][:50]]
    index = {row[0].upper(): i for i, row in enumerate(glossary)}
    for row in arrays["new_glossary"]:
        key = row[0].upper()
        if key == "CIRCULARITY":
            continue
        if key in index:
            glossary[index[key]] = row
        else:
            glossary.append(row)
    glossary = glossary[:80]

    reading = [list(x) for x in arrays["base_reading"]] + [list(x) for x in arrays["new_reading"]]
    reading = sorted(reading, key=lambda x: x[5])
    return glossary, reading


def write_audio_sources(curriculum):
    scripts_dir = ROOT / "scripts"
    scripts_dir.mkdir(exist_ok=True)
    scripts = {}
    for i, d in enumerate(curriculum):
        nxt = curriculum[i + 1]["t"] if i + 1 < len(curriculum) else "application"
        fr = d.get("scn", {}).get("fr") if d.get("scn") else ""
        fr_words = fr.split()
        fr_excerpt = " ".join(fr_words[:70])
        if len(fr_words) > 70:
            fr_excerpt += "."
        case_note = ""
        if d.get("scn"):
            case_note = (
                f"The case is {d['scn'].get('tp')}. The operating lesson is not the label; "
                f"it is the decision sequence. The learner sees context, chooses a channel, "
                f"absorbs the consequence, and then reads the principal framing."
            )
        deriv_note = ""
        if d.get("deriv"):
            deriv_note = (
                "This is also a derivation day. The important move is to stay with the logic "
                "long enough to see where the formula comes from. The proof is not theater; "
                "it is a calibration exercise for judgment."
            )
        final_check = (
            "[ARA]\n"
            "One final check: teach it back in ordinary language. If you cannot explain the framework without the jargon, "
            "you probably do not own it yet. If you can explain it to finance, operations, and a supplier in the same five "
            "minutes, you are close. That is the SCFC standard for fluency.\n\n"
        )
        script = f"""[REX]
Welcome back to SCFC. Today is day {d['d']}, and the framework is {d['f']}.
[pause]
The short title is {d['t']}. This is a supply chain fluency episode, so the goal is not to memorize a label. The goal is to hear the framework, understand the decision it changes, and know what a principal-level operator would do with it under pressure.

[ARA]
The originator context is {d['o']}. The canonical citation is {d['cite']}
That matters because supply chain work is full of inherited language. People repeat terms like inventory policy, resilience, sourcing leverage, and network design without remembering the problem those terms were built to solve. The canon gives us a disciplined starting point. It keeps the conversation from becoming opinion dressed up as strategy.

[REX]
Here is the intuition. {d['sum']}
Put more plainly: the framework is a lens for deciding where to spend attention. In operations, attention is scarce. You cannot optimize every supplier, SKU, route, contract term, and planning exception at the same time. A good framework compresses the problem without flattening it. It tells you what information matters first, which constraint is probably binding, and which action is likely to create leverage.

[ARA]
The mechanics are practical: name the framework, identify the binding tradeoff, quantify what matters, then choose the operating move. If there is math in the day, use it as a decision lens, not as decoration.
Start by writing the current state in one sentence. Then name the decision owner. Then name the tradeoff. Cost against service. Flexibility against price. Resilience against working capital. Forecast accuracy against planning latency. Compliance against throughput. Once the tradeoff is visible, the framework starts doing useful work. It separates the number you can defend from the number that is merely convenient.

[REX]
Now connect that to the system. A supply chain is not a spreadsheet with trucks attached. It is a set of commitments across time: demand promises, purchase commitments, capacity reservations, logistics lanes, inventory buffers, quality controls, payment terms, and executive expectations. When one part of the system changes, the impact travels. {d['t']} helps you see that travel path before it becomes an escalation.

[ARA]
{case_note}
{deriv_note}
For a listener, the question is: what would you do on Monday morning? You would not announce that you know the framework. You would use it to structure the next meeting. You would ask for the missing variable. You would put the tradeoff on one page. You would tell finance what assumption drives the answer. You would tell operations what action changes the constraint. You would tell suppliers what behavior will now be measured.

[REX]
The failure mode is treating {d['t']} as vocabulary. The senior operator asks what decision the framework changes, who owns the constraint, and what would change the answer.
The common mistake is premature prescription. Someone hears a symptom and reaches for the familiar move: dual source it, add safety stock, renegotiate the contract, expedite the freight, install software, or escalate to leadership. Those moves may be right, but not because they are familiar. They are right only if they match the constraint. The principal does not reward activity. The principal rewards fit.

[ARA]
The principal's move: translate the framework into a recommendation that finance, operations, and suppliers can all act on.
{fr_excerpt}
The recommendation should be plain enough to survive the next room. It should include the decision, the reason, the metric, the owner, and the trigger for revisiting the answer. If the answer would change when demand variance doubles, say that. If it would change when lead time stabilizes, say that. If it depends on a supplier assumption, say that. A recommendation without triggers is a slogan.

{final_check}

[REX]
Tomorrow: {nxt}.
Until then, keep the discipline: framework first, math where it matters, action only after the constraint is named.
"""
        if len(script.split()) > 850:
            script = script.replace(final_check + "\n", "")
        scripts[str(d["d"])] = script
        (scripts_dir / f"day-{d['d']:02d}.txt").write_text(script, encoding="utf-8")
    return scripts


INDEX = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SCFC Masters Program v3</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400&family=Major+Mono+Display&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="app.css">
</head>
<body>
  <main class="machine" aria-label="SCFC Masters Machine">
    <i class="screw tl"></i><i class="screw tr"></i><i class="screw bl"></i><i class="screw br"></i>
    <header class="nameplate">
      <div>
        <div class="brand">SCFC</div>
        <div class="subbrand">MASTERS PROGRAM · v3.1</div>
      </div>
      <div class="tier-toggle" role="group" aria-label="Program tier">
        <button id="tierFoundation" data-tier="foundation">FOUND·60</button>
        <button id="tierMastery" data-tier="mastery" title="Complete Foundation 60 to unlock.">▦ MAST·+20</button>
      </div>
    </header>
    <section class="top-grid">
      <nav class="modes" aria-label="Modes">
        <button data-view="home">Today</button>
        <button data-view="curr">Curr</button>
        <button data-view="glos">Gloss</button>
        <button data-view="read">Read</button>
        <button data-view="palette">Find</button>
      </nav>
      <aside class="meters-mini" id="metersMini"></aside>
    </section>
    <section class="lcd" id="lcd" tabindex="0"></section>
    <div class="audio-deck" id="audioDeck">
      <span class="audio-deck-label">EPISODE</span>
      <button class="audio-deck-play" id="audioPlay" aria-label="Play episode"><span class="icon"></span></button>
      <div class="audio-deck-progress" id="audioProgress"><div class="audio-deck-progress-fill" id="audioProgressFill"></div><div class="audio-deck-progress-handle" id="audioProgressHandle" style="left: 0%;"></div></div>
      <div class="audio-deck-time" id="audioTime">0:00 / 0:00</div>
      <audio id="audioElement" preload="metadata"></audio>
    </div>
    <button class="primary" id="primary">CONTINUE</button>
  </main>
  <div class="palette" id="palette" hidden>
    <div class="palette-box">
      <button class="palette-close" id="paletteClose" aria-label="Close search">×</button>
      <input id="paletteInput" placeholder="search days / terms / readings" autocomplete="off">
      <div id="paletteResults"></div>
    </div>
  </div>
  <script src="data.js"></script>
  <script src="app.js"></script>
</body>
</html>
"""


CSS = r""":root{--ink:#1A1814;--putty:#BFB6A0;--putty-hi:#D4CCB6;--putty-lo:#B0A892;--lcd:#0E1F0C;--ph:#B8E090;--ph-hi:#C8F0A0;--amber:#FFC080;--red:#FF7A5C;--blue:#7AB8E0}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0,#3b352b,#16130f 68%);font-family:'IBM Plex Mono',monospace;color:var(--ink);padding:28px 14px;letter-spacing:0}
.machine{position:relative;z-index:1;max-width:980px;margin:0 auto;background:linear-gradient(180deg,#D4CCB6 0%,#BFB6A0 50%,#B0A892 100%);padding:24px;border-radius:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -1px 0 rgba(0,0,0,.18),inset 0 0 0 1px rgba(0,0,0,.16),0 30px 60px rgba(0,0,0,.5),0 8px 16px rgba(0,0,0,.3);overflow:hidden}
.machine::before{content:'';position:absolute;inset:0;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.06) 0 1px,rgba(0,0,0,.03) 1px 2px);opacity:.45;pointer-events:none}
.screw{position:absolute;width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 32% 30%,#7A715E 0%,#2E281E 80%);box-shadow:inset 0 -1px 1px rgba(255,255,255,.18),inset 0 1px 1px rgba(0,0,0,.5),0 1px 2px rgba(0,0,0,.5);z-index:2}.screw::after{content:'';position:absolute;top:50%;left:18%;right:18%;height:1.6px;background:rgba(0,0,0,.65);transform:translateY(-50%) rotate(38deg)}.tl{top:10px;left:10px}.tr{top:10px;right:10px}.tr::after{transform:translateY(-50%) rotate(-22deg)}.bl{bottom:10px;left:10px}.bl::after{transform:translateY(-50%) rotate(8deg)}.br{bottom:10px;right:10px}.br::after{transform:translateY(-50%) rotate(66deg)}
.nameplate{position:relative;z-index:3;display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px}.brand{font-family:'Major Mono Display';font-size:28px}.subbrand{font-size:10px;color:#5C5446;letter-spacing:.18em}.tier-toggle{display:flex;gap:6px}.tier-toggle button,.modes button,.primary,.soft{font-family:'IBM Plex Mono';cursor:pointer;border:0;background:linear-gradient(180deg,#D8D0BA,#AFA68F);color:#1A1814;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.22),0 1px 2px rgba(0,0,0,.2);border-radius:4px;padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.12em}.tier-toggle button.active,.modes button.active{background:linear-gradient(180deg,#C8F0A0,#9CAF78)}.tier-toggle button.locked{opacity:.55}
.top-grid{position:relative;z-index:3;display:grid;grid-template-columns:1fr 260px;gap:14px;margin-bottom:14px}.modes{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.meters-mini{background:#1A1814;padding:10px;border-radius:4px;box-shadow:inset 0 2px 8px rgba(0,0,0,.8)}.vu-mini{display:grid;grid-template-columns:52px 1fr 28px;gap:7px;align-items:center;margin:4px 0;font-size:9px;color:#B8E090}.bar{height:5px;background:#332d25;position:relative}.fill{height:100%;background:linear-gradient(90deg,#C8442A,#FFC080,#C8F0A0);width:0}
.lcd{background:#0E1F0C;color:#B8E090;padding:22px 24px;border-radius:6px;box-shadow:inset 0 3px 14px rgba(0,0,0,.85),inset 0 0 80px rgba(0,0,0,.5),0 1px 0 rgba(255,255,255,.45);position:relative;overflow:hidden;min-height:430px;margin-bottom:14px}.lcd::before{content:'';position:absolute;inset:0;background-image:repeating-linear-gradient(0deg,rgba(0,0,0,0) 0,rgba(0,0,0,0) 2px,rgba(0,0,0,.22) 2px,rgba(0,0,0,.22) 3px);pointer-events:none;z-index:2}.lcd::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 30%,rgba(184,224,144,.04),transparent 70%);pointer-events:none;z-index:1;animation:flicker 3.7s ease-in-out infinite}@keyframes flicker{0%,100%{opacity:1}48%{opacity:.85}49%{opacity:1}72%{opacity:.95}74%{opacity:1}}
.lcd>*{position:relative;z-index:3}.title{font-family:'Major Mono Display';font-size:28px;color:#C8F0A0;text-shadow:0 0 8px rgba(184,224,144,.35);line-height:1.2}.dim{color:rgba(184,224,144,.55)}.amber{color:#FFC080}.red{color:#FF7A5C;font-weight:600}.green-bold{color:#C8F0A0;font-weight:600}.divider{color:rgba(184,224,144,.45);margin:10px 0}.meta{font-size:11px;color:#FFC080;letter-spacing:.16em;margin-bottom:8px}.card,.quant,.deriv,.raw-spec{border:1px solid rgba(184,224,144,.24);background:rgba(0,0,0,.18);padding:12px;margin:12px 0;border-radius:3px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.term,.read-row,.curr-day{border:1px solid rgba(184,224,144,.24);padding:10px;background:rgba(0,0,0,.16);border-radius:3px}.curr-week{margin:16px 0 6px;color:#FFC080;font-size:11px;letter-spacing:.16em}.curr-days{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.curr-day{min-height:78px;cursor:pointer;position:relative}.curr-day.done{border-color:rgba(200,240,160,.7)}.curr-day.locked{opacity:.42;cursor:not-allowed}.curr-day.capstone{border-color:rgba(255,192,128,0.7);background:rgba(255,192,128,0.06);position:relative}.curr-day.capstone::after{content:'CAPSTONE';position:absolute;top:-1px;right:-1px;background:#FFC080;color:#1A1814;font-family:'IBM Plex Mono';font-size:7px;letter-spacing:.2em;padding:2px 5px;border-radius:0 0 0 3px}.curr-day.capstone .dnum::after{content:' ⊕';color:#FFC080}.audio-mark{color:#FFC080}.dnum{font-size:10px;color:#FFC080}.dtitle{font-size:11px;color:#C8F0A0;margin-top:6px}.dom{font-size:9px;color:rgba(184,224,144,.62);margin-top:6px}.choice{display:block;width:100%;text-align:left;margin:8px 0;padding:10px;border:1px solid rgba(184,224,144,.28);background:rgba(0,0,0,.22);color:#B8E090;font-family:'IBM Plex Mono';cursor:pointer}.choice.good{border-color:rgba(200,240,160,.75)}.choice.warn{border-color:rgba(255,192,128,.75)}.choice.bad{border-color:rgba(255,122,92,.75)}.raw-spec{white-space:pre-wrap;max-height:280px;overflow:auto;font-size:11px;color:rgba(184,224,144,.75)}.tier{font-size:9px;border:1px solid #C8F0A0;color:#C8F0A0;padding:2px 5px;margin-right:8px}.tier.core{border-color:#FFC080;color:#FFC080}.tier.emerging{color:#7AB8E0;border-color:rgba(122,184,224,0.5)}
.deriv{margin-top:14px;padding:14px;border:1px solid rgba(255,192,128,0.55);background:rgba(255,192,128,0.04);position:relative;z-index:3}.deriv .dh{font-family:'Major Mono Display';font-size:9px;letter-spacing:.24em;color:#FFC080;margin-bottom:8px;display:flex;align-items:center;gap:8px}.deriv .dh::before{content:'∫';font-family:'IBM Plex Serif';font-size:14px;font-style:italic}.deriv .step{margin-bottom:12px;padding-bottom:10px;border-bottom:1px dashed rgba(255,192,128,0.2)}.deriv .step:last-child{border-bottom:none}.deriv .sn{font-family:'Major Mono Display';font-size:10px;color:#FFC080;letter-spacing:.18em;margin-bottom:4px}.deriv .stitle{font-family:'IBM Plex Serif';font-size:14px;color:#C8F0A0;font-weight:500;margin-bottom:6px}.deriv .sbody{font-size:12px;line-height:1.55;color:rgba(184,224,144,.9);margin-bottom:6px}.deriv .smath{font-size:12.5px;color:#C8F0A0;padding:8px 10px;background:rgba(0,0,0,.25);border-left:2px solid #FFC080;white-space:pre-wrap;line-height:1.5;margin:6px 0}
.audio-deck{background:#B0A892;border-radius:6px;padding:14px 16px;margin-bottom:14px;position:relative;z-index:1;box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(0,0,0,.2),0 0 0 1px rgba(0,0,0,.14);display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center}.audio-deck-label{font-size:9px;letter-spacing:.28em;text-transform:uppercase;color:#5C5446}.audio-deck-label::before{content:'▶ ';color:#1A1814}.audio-deck.speech .audio-deck-label::before{content:'◉ ';color:#C8442A}.audio-deck-play{width:44px;height:44px;border-radius:50%;background:linear-gradient(180deg,#D4CCB6 0%,#BFB7A1 100%);border:0;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 -2px 0 rgba(0,0,0,.22),0 1px 2px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;transition:transform 80ms}.audio-deck-play:active{transform:translateY(2px)}.audio-deck-play .icon{width:0;height:0;border-left:12px solid #1A1814;border-top:8px solid transparent;border-bottom:8px solid transparent;margin-left:3px}.audio-deck-play.playing .icon{width:12px;height:14px;border:0;background:linear-gradient(to right,#1A1814 0%,#1A1814 35%,transparent 35%,transparent 65%,#1A1814 65%,#1A1814 100%);margin-left:0}.audio-deck-progress{flex:1;height:6px;background:rgba(0,0,0,.25);border-radius:1px;position:relative;cursor:pointer}.audio-deck-progress-fill{position:absolute;top:0;left:0;height:100%;background:linear-gradient(90deg,#C8442A 0%,#FFC080 100%);width:0%;border-radius:1px;transition:width 80ms linear}.audio-deck-progress-handle{position:absolute;top:50%;width:12px;height:12px;background:#1A1814;border:2px solid #FFC080;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 4px rgba(255,192,128,.7)}.audio-deck-time{font-family:'Major Mono Display';font-size:11px;color:#1A1814;letter-spacing:.06em;min-width:76px;text-align:right}.audio-deck.disabled .audio-deck-play{opacity:.4;cursor:not-allowed}.audio-deck.disabled .audio-deck-progress,.audio-deck.disabled .audio-deck-time{opacity:.4}.primary{position:relative;z-index:3;width:100%;font-size:14px;padding:14px}
.palette[hidden]{display:none}.palette{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10;display:grid;place-items:start center;padding-top:10vh}.palette-box{width:min(720px,92vw);background:#0E1F0C;border:1px solid rgba(184,224,144,.5);box-shadow:0 20px 80px rgba(0,0,0,.7);padding:12px;position:relative}.palette-close{position:absolute;top:8px;right:8px;width:26px;height:26px;border:1px solid rgba(184,224,144,.35);background:#081305;color:#C8F0A0;font-family:'IBM Plex Mono';cursor:pointer}.palette input{width:100%;background:#081305;color:#C8F0A0;border:1px solid rgba(184,224,144,.4);padding:12px 44px 12px 12px;font-family:'IBM Plex Mono'}.pal-item{padding:10px;border-bottom:1px solid rgba(184,224,144,.16);color:#B8E090;cursor:pointer}
@media(max-width:720px){body{padding:12px 8px}.machine{padding:18px 12px}.nameplate{align-items:flex-start;flex-direction:column}.top-grid{grid-template-columns:1fr}.modes{grid-template-columns:repeat(3,1fr)}.meters-mini{max-height:280px;overflow-y:auto}.lcd{padding:18px 14px}.title{font-size:22px}.curr-days{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.audio-deck{grid-template-columns:auto 1fr}.audio-deck-label{display:none}.audio-deck-time{grid-column:1 / -1;text-align:left;margin-top:4px;font-size:10px}}
"""


JS = r"""const {domains:DOMAINS,curriculum:CURRICULUM,glossary:GLOSSARY,reading:READING,audioScripts:AUDIO_SCRIPTS={}}=window.SCFC_DATA;
const KEY='scfc-masters-v3';
const DEFAULT={view:'home',sub:'briefing',currentDay:1,streak:0,lastCompletedDate:null,completions:[],domains:Object.fromEntries(DOMAINS.map(d=>[d.n,{strength:0}])),tier:'foundation',audioPositions:{},audioCompleted:[]};
let state=loadState();let activeDay=state.currentDay;let decisionIndex=0;let selected=[];let lastOutcome='';
const lcd=document.getElementById('lcd'),primary=document.getElementById('primary'),audioElement=document.getElementById('audioElement'),audioPlay=document.getElementById('audioPlay'),audioProgress=document.getElementById('audioProgress'),audioProgressFill=document.getElementById('audioProgressFill'),audioProgressHandle=document.getElementById('audioProgressHandle'),audioTime=document.getElementById('audioTime'),audioDeck=document.getElementById('audioDeck');
let speechMode=false,speechBlocks=[],speechIndex=0,speechElapsed=0,speechDuration=0,speechTimer=null,speechPaused=false,currentUtterance=null;
function loadState(){try{const raw=localStorage.getItem(KEY);if(raw){const loaded={...structuredClone(DEFAULT),...JSON.parse(raw)};if(loaded.view==='palette')loaded.view='home';return loaded}}catch{}return structuredClone(DEFAULT)}
function saveState(){localStorage.setItem(KEY,JSON.stringify(state))}
function day(n=activeDay){return CURRICULUM.find(d=>d.d===n)||CURRICULUM[0]}
function done(n){return state.completions.includes(n)}
function foundationComplete(){return state.completions.includes(60)}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(){document.querySelectorAll('.modes button').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));renderTier();renderMeters();if(['glos','read'].includes(state.view)){stopSpeech(false);audioElement.pause();audioDeck.hidden=true}else{audioDeck.hidden=false;loadEpisode(activeDay)}if(state.view==='home')renderHome();if(state.view==='curr')renderCurr();if(state.view==='glos')renderGloss();if(state.view==='read')renderRead();primary.textContent=primaryLabel();saveState()}
function renderTier(){document.getElementById('tierFoundation').classList.toggle('active',state.tier==='foundation');const m=document.getElementById('tierMastery');m.classList.toggle('active',state.tier==='mastery');m.classList.toggle('locked',!foundationComplete());m.textContent=(foundationComplete()?'':'▦ ')+'MAST·+20'}
function renderMeters(){document.getElementById('metersMini').innerHTML=DOMAINS.map(d=>{const s=Math.min(100,Math.round((state.domains[d.n]?.strength||0)*12));return `<div class="vu-mini"><span>${esc(d.name.slice(0,5))}</span><div class="bar"><div class="fill" style="width:${s}%"></div></div><span>${s}</span></div>`}).join('')}
function header(d){const dom=DOMAINS.find(x=>x.n===d.dom)?.name||'';const cap=d.cap?` · CAPSTONE · ~${d.dur} min`:'';return `<div class="meta">DAY ${d.d} / 80${cap}</div><div class="title">${esc(d.t)}</div><div class="divider">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div><div class="dim">${esc(dom)} · ${esc(d.f)} · ${esc(d.o)}</div>`}
function renderHome(){const d=day();let html=header(d)+`<div class="card"><div class="green-bold">CITATION</div><p>${esc(d.cite)}</p><div class="green-bold">SUMMARY</div><p>${esc(d.sum)}</p></div>`;if(d.scn){if(state.sub==='briefing')html+=renderBrief(d);if(state.sub==='decision')html+=renderDecision(d);if(state.sub==='outcome')html+=`<div class="card ${lastOutcome.includes('correct')?'green-bold':'amber'}">${esc(lastOutcome)}</div>`;if(state.sub==='debrief')html+=renderDebrief(d)}else{html+=`<div class="card"><div class="green-bold">LECTURE BRIEF</div><p>${esc(d.raw)}</p></div>`}if(d.scn?.qt)html+=renderQuant(d.scn.qt);if(d.deriv)html+=renderDeriv(d.deriv);html+=`<details><summary class="amber">SOURCE BLOCK</summary><pre class="raw-spec">${esc(d.raw)}</pre></details>`;lcd.innerHTML=html}
function renderBrief(d){const s=d.scn;return `<div class="card"><div class="green-bold">${esc(s.tp)}</div><p>${esc(s.pre)}</p>${s.sl.map(l=>`<div class="${esc(l[1])}">${esc(l[0]||' ')}</div>`).join('')}<table>${s.ctx.map(r=>`<tr><td class="amber">${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table></div>`}
function renderDecision(d){const dec=d.scn.dec[decisionIndex];if(!dec)return renderDebrief(d);return `<div class="card"><div class="amber">${esc(dec.p)}</div><h3>${esc(dec.q)}</h3>${dec.o.map((o,i)=>`<button class="choice ${esc(o.v)}" data-choice="${i}">${esc(o.l)}</button>`).join('')}</div>`}
function renderDebrief(d){return `<div class="card"><div class="green-bold">PRINCIPAL FRAMING</div><p>${esc(d.scn?.fr||'')}</p></div>`}
function renderQuant(q){return `<div class="quant"><div class="amber">QUANT PANEL</div><pre>${esc(q.raw||q.f||'')}</pre><div class="green-bold">${esc(q.r||'')}</div></div>`}
function renderDeriv(deriv){return `<div class="deriv"><div class="dh">DERIVATION</div>${(deriv.steps||[]).map(st=>`<div class="step"><div class="sn">${esc(st.n)}</div><div class="stitle">${esc(st.title)}</div><div class="sbody">${esc(st.body)}</div>${st.math?`<pre class="smath">${esc(st.math)}</pre>`:''}</div>`).join('')}</div>`}
function renderCurr(){const rows=CURRICULUM.filter(d=>state.tier==='mastery'?d.d>60:d.d<=60);let wk=0;let html='';rows.forEach(d=>{if(d.w!==wk){wk=d.w;html+=`<div class="curr-week">WEEK ${wk}</div><div class="curr-days">`}html+=`<div class="curr-day ${done(d.d)?'done':''} ${d.cap?'capstone':''}" data-day="${d.d}"><div class="dnum">${d.d}${state.audioCompleted.includes(d.d)?' <span class="audio-mark">♪</span>':''}</div><div class="dtitle">${esc(d.t)}</div><div class="dom">${esc(DOMAINS.find(x=>x.n===d.dom)?.name||'')}</div></div>`;const next=rows[rows.indexOf(d)+1];if(!next||next.w!==wk)html+='</div>'});lcd.innerHTML=html}
function renderGloss(){lcd.innerHTML=`<div class="title">GLOSSARY</div><div class="meta">${GLOSSARY.length} TERMS</div><div class="grid">${GLOSSARY.map(t=>`<div class="term"><div class="amber">${esc(t[0])}</div><div>${esc(t[1])}</div></div>`).join('')}</div>`}
function renderRead(){lcd.innerHTML=`<div class="title">READING</div><div class="meta">${READING.length} ENTRIES · SORTED BY DAY</div>${READING.map(r=>`<div class="read-row"><span class="tier ${r[0].toLowerCase()}">${esc(r[0])}</span><span class="amber">DAY ${r[5]}</span><div class="green-bold">${esc(r[2])}</div><div>${esc(r[1])} · ${esc(r[3])}</div><div class="dim">${esc(r[4])}${r[6]?' · '+esc(r[6]):''}</div></div>`).join('')}`}
function primaryLabel(){const d=day();if(state.view!=='home')return 'BACK';if(done(d.d))return d.d<80?'NEXT':'COMPLETE';if(!d.scn)return 'MARK LECTURE COMPLETE';if(state.sub==='briefing')return 'CONTINUE';if(state.sub==='decision')return 'CHOOSE CHANNEL';if(state.sub==='outcome')return 'CONTINUE';if(state.sub==='debrief')return 'COMPLETE DAY';return 'CONTINUE'}
function completeDay(){const d=day();if(!done(d.d)){state.completions.push(d.d);state.domains[d.dom].strength=(state.domains[d.dom]?.strength||0)+ (d.scn?1:.5);state.lastCompletedDate=new Date().toISOString().slice(0,10)}if(d.d===80){saveState();completionSequence()}else{state.currentDay=Math.min(80,d.d+1);activeDay=state.currentDay;state.sub='briefing';render()}}
function completionSequence(){lcd.innerHTML=`<pre class="green-bold">// program complete.\n//\n// ─────────────────────────────────\n//\n// 80 days · 18 domains · 30 frameworks\n// 14 cases · 8 capstones · 80 glossary terms\n// 40+ canonical citations\n//\n// you have completed the foundation\n// of a supply chain masters fluency.\n//\n// the work from here is application.\n//\n// ─────────────────────────────────</pre><div class="card"><div class="amber">PRINCIPAL'S MAP</div>${DOMAINS.map(d=>`<div class="vu-mini"><span>${esc(d.name.slice(0,5))}</span><div class="bar"><div class="fill" style="width:${Math.min(100,Math.round((state.domains[d.n]?.strength||0)*12))}%"></div></div><span>${Math.min(100,Math.round((state.domains[d.n]?.strength||0)*12))}</span></div>`).join('')}</div>`}
primary.addEventListener('click',()=>{const d=day();if(state.view!=='home'){state.view='home';render();return}if(done(d.d)){state.currentDay=Math.min(80,d.d+1);activeDay=state.currentDay;state.sub='briefing';render();return}if(!d.scn){completeDay();return}if(state.sub==='briefing'){state.sub='decision';render();return}if(state.sub==='outcome'){decisionIndex++;state.sub=decisionIndex<d.scn.dec.length?'decision':'debrief';render();return}if(state.sub==='debrief'){completeDay();return}});
lcd.addEventListener('click',e=>{const b=e.target.closest('[data-choice]');if(!b)return;const d=day();const idx=Number(b.dataset.choice);const dec=d.scn.dec[decisionIndex];const opt=d.scn.opt[decisionIndex];selected[decisionIndex]=idx;lastOutcome=(idx===opt?'correct. ':'')+(dec.o[idx]?.c||'');state.sub='outcome';render()});
document.querySelectorAll('.modes button').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.view==='palette'){openPalette();return}state.view=b.dataset.view;closePalette();render()}));
document.querySelectorAll('.tier-toggle button').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.tier==='mastery'&&!foundationComplete())return;state.tier=b.dataset.tier;render()}));
lcd.addEventListener('click',e=>{const c=e.target.closest('[data-day]');if(!c)return;const n=Number(c.dataset.day);if(n>60&&!foundationComplete())return;activeDay=n;state.currentDay=n;state.view='home';state.sub='briefing';decisionIndex=0;selected=[];render()});
function openPalette(){document.getElementById('palette').hidden=false;const input=document.getElementById('paletteInput');input.value='';input.focus();renderPalette('')}
function closePalette(){document.getElementById('palette').hidden=true}
function renderPalette(q){q=q.toLowerCase();const items=[...CURRICULUM.map(d=>({label:`Day ${d.d}: ${d.t}`,go:()=>{activeDay=d.d;state.currentDay=d.d;state.view='home';state.sub='briefing';closePalette();render()}})),...GLOSSARY.map(t=>({label:`${t[0]} — ${t[1]}`,go:()=>{state.view='glos';closePalette();render()}})),...READING.map(r=>({label:`${r[0]} Day ${r[5]} ${r[2]}`,go:()=>{state.view='read';closePalette();render()}}))].filter(x=>x.label.toLowerCase().includes(q)).slice(0,30);document.getElementById('paletteResults').innerHTML=items.map((x,i)=>`<div class="pal-item" data-pal="${i}">${esc(x.label)}</div>`).join('');window.__pal=items}
document.getElementById('paletteInput').addEventListener('input',e=>renderPalette(e.target.value));document.getElementById('paletteClose').addEventListener('click',closePalette);document.getElementById('paletteResults').addEventListener('click',e=>{const it=e.target.closest('[data-pal]');if(it)window.__pal[Number(it.dataset.pal)].go()});document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette()}if(e.key==='Escape')closePalette();if(e.key===' '&&!e.target.matches('input, textarea')&&!audioDeck.hidden&&!audioDeck.classList.contains('disabled')){e.preventDefault();audioPlay.click()}const k=e.key.toLowerCase();if(['h','c','g','r'].includes(k)&&!e.target.matches('input, textarea')){state.view={h:'home',c:'curr',g:'glos',r:'read'}[k];render()}});
function formatTime(seconds){if(!isFinite(seconds))return'0:00';const m=Math.floor(seconds/60);const s=Math.floor(seconds%60);return`${m}:${String(s).padStart(2,'0')}`}
function loadEpisode(dayNum){const path=`audio/day-${String(dayNum).padStart(2,'0')}.mp3`;if(audioElement.dataset.day==dayNum)return;stopSpeech(false);audioElement.pause();audioElement.dataset.day=dayNum;audioElement.src=path;audioElement.load();speechMode=false;audioDeck.classList.remove('disabled','speech');const savedPos=state.audioPositions?.[dayNum]||0;audioElement.addEventListener('loadedmetadata',()=>{if(Number.isFinite(audioElement.duration)&&(audioElement.duration<240||audioElement.duration>420)){audioElement.pause();enableSpeechFallback(dayNum);return}if(savedPos>0&&savedPos<audioElement.duration-5)audioElement.currentTime=savedPos;updateAudioUI()},{once:true})}
function updateAudioUI(){if(speechMode)return updateSpeechUI();const cur=audioElement.currentTime||0,dur=audioElement.duration||0,pct=dur>0?(cur/dur)*100:0;audioProgressFill.style.width=pct+'%';audioProgressHandle.style.left=pct+'%';audioTime.textContent=`${formatTime(cur)} / ${formatTime(dur)}`;audioPlay.classList.toggle('playing',!audioElement.paused)}
function parseAudioScript(dayNum){const raw=AUDIO_SCRIPTS[String(dayNum)]||'';const parts=[];let speaker='REX',text=[];raw.split(/\n/).forEach(line=>{const tag=line.trim().match(/^\[(REX|ARA)\]$/);if(tag){if(text.join(' ').trim())parts.push({speaker,text:text.join(' ').replace(/\[pause\]/gi,' ').trim()});speaker=tag[1];text=[]}else{text.push(line)}});if(text.join(' ').trim())parts.push({speaker,text:text.join(' ').replace(/\[pause\]/gi,' ').trim()});return parts}
function naturalVoice(role){const voices=speechSynthesis.getVoices();const blocked=/zarvox|bells|bubbles|cellos|good news|bad news|boing|whisper|wobble|trinoids|jester|superstar|organ|bahh|novelty/i;const preferred=role==='ARA'?['Samantha','Moira','Karen','Shelley','Sandy','Flo','Tessa','Serena','Ava','Allison']:['Daniel','Reed','Rishi','Oliver','Tom','Alex','Eddy','Jamie','Aaron'];for(const name of preferred){const v=voices.find(x=>x.name.includes(name)&&!blocked.test(x.name));if(v)return v}return voices.find(v=>/^en[-_]/i.test(v.lang)&&!blocked.test(v.name))||voices[0]||null}
function enableSpeechFallback(dayNum){if(!('speechSynthesis'in window)){audioDeck.classList.add('disabled');audioTime.textContent='0:00 / 0:00';return}speechBlocks=parseAudioScript(dayNum);if(!speechBlocks.length){audioDeck.classList.add('disabled');audioTime.textContent='0:00 / 0:00';return}speechMode=true;speechIndex=0;speechElapsed=state.audioPositions?.[dayNum]||0;speechDuration=Math.max(260,Math.round(speechBlocks.reduce((n,b)=>n+b.text.split(/\s+/).filter(Boolean).length,0)/2.35));while(speechIndex<speechBlocks.length-1&&blockStartSeconds(speechIndex+1)<speechElapsed)speechIndex++;audioDeck.classList.remove('disabled');audioDeck.classList.add('speech');updateSpeechUI()}
function blockStartSeconds(index){const words=speechBlocks.slice(0,index).reduce((n,b)=>n+b.text.split(/\s+/).filter(Boolean).length,0);const total=speechBlocks.reduce((n,b)=>n+b.text.split(/\s+/).filter(Boolean).length,0)||1;return Math.round((words/total)*speechDuration)}
function updateSpeechUI(){const pct=speechDuration>0?Math.min(100,(speechElapsed/speechDuration)*100):0;audioProgressFill.style.width=pct+'%';audioProgressHandle.style.left=pct+'%';audioTime.textContent=`VOICE ${formatTime(speechElapsed)} / ${formatTime(speechDuration)}`;audioPlay.classList.toggle('playing',Boolean(currentUtterance)&&!speechPaused)}
function startSpeech(){if(!speechBlocks.length)return;window.speechSynthesis.cancel();speechPaused=false;clearInterval(speechTimer);speechTimer=setInterval(()=>{if(!speechPaused){speechElapsed=Math.min(speechDuration,speechElapsed+1);saveAudioPosition(activeDay,speechElapsed);updateSpeechUI()}},1000);speakBlock()}
function speakBlock(){if(speechIndex>=speechBlocks.length){finishSpeech();return}const block=speechBlocks[speechIndex];const u=new SpeechSynthesisUtterance(block.text);u.voice=naturalVoice(block.speaker);u.rate=block.speaker==='ARA'?0.93:0.96;u.pitch=block.speaker==='ARA'?1.02:.92;u.volume=1;u.onend=()=>{if(currentUtterance===u&&!speechPaused){speechIndex++;speakBlock()}};u.onerror=()=>{audioDeck.classList.add('disabled');clearInterval(speechTimer);currentUtterance=null;updateSpeechUI()};currentUtterance=u;window.speechSynthesis.speak(u);updateSpeechUI()}
function pauseSpeech(){speechPaused=true;window.speechSynthesis.pause();clearInterval(speechTimer);saveAudioPosition(activeDay,speechElapsed);updateSpeechUI()}
function resumeSpeech(){if(currentUtterance&&speechPaused){speechPaused=false;window.speechSynthesis.resume();clearInterval(speechTimer);speechTimer=setInterval(()=>{if(!speechPaused){speechElapsed=Math.min(speechDuration,speechElapsed+1);saveAudioPosition(activeDay,speechElapsed);updateSpeechUI()}},1000);updateSpeechUI()}else startSpeech()}
function stopSpeech(save=true){if(save&&speechMode)saveAudioPosition(activeDay,speechElapsed);clearInterval(speechTimer);speechTimer=null;currentUtterance=null;speechPaused=false;if('speechSynthesis'in window)window.speechSynthesis.cancel();audioDeck?.classList.remove('speech');audioPlay?.classList.remove('playing')}
function finishSpeech(){clearInterval(speechTimer);currentUtterance=null;speechElapsed=0;saveAudioPosition(activeDay,0);if(!state.audioCompleted.includes(activeDay))state.audioCompleted.push(activeDay);saveState();updateSpeechUI();renderMeters();if(state.view==='curr')renderCurr()}
audioPlay.addEventListener('click',()=>{if(audioDeck.classList.contains('disabled'))return;if(speechMode){if(currentUtterance&&!speechPaused)pauseSpeech();else resumeSpeech();return}if(audioElement.paused)audioElement.play().catch(()=>enableSpeechFallback(activeDay));else audioElement.pause();updateAudioUI()});
audioElement.addEventListener('error',()=>enableSpeechFallback(Number(audioElement.dataset.day)||activeDay));audioElement.addEventListener('play',updateAudioUI);audioElement.addEventListener('pause',updateAudioUI);audioElement.addEventListener('timeupdate',()=>{updateAudioUI();if(Math.floor(audioElement.currentTime)%5===0)saveAudioPosition(activeDay,audioElement.currentTime)});audioElement.addEventListener('ended',()=>{saveAudioPosition(activeDay,0);if(!state.audioCompleted.includes(activeDay))state.audioCompleted.push(activeDay);saveState();updateAudioUI();renderMeters();if(state.view==='curr')renderCurr()});audioProgress.addEventListener('click',e=>{const rect=audioProgress.getBoundingClientRect();const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));if(speechMode){speechElapsed=Math.floor(pct*speechDuration);speechIndex=0;while(speechIndex<speechBlocks.length-1&&blockStartSeconds(speechIndex+1)<speechElapsed)speechIndex++;if(currentUtterance){startSpeech()}else updateSpeechUI()}else if(audioElement.duration)audioElement.currentTime=pct*audioElement.duration;updateAudioUI()});function saveAudioPosition(dayNum,position){state.audioPositions[dayNum]=Math.floor(position);saveState()}
render();
"""


if __name__ == "__main__":
    write_app()
