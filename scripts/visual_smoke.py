"""Live visual smoke: overflow / footer mailbox / clipping / pageerror per page x viewport.

Usage: python scripts/visual_smoke.py [--base-url URL] [--pages /:home,/x/:name]
       [--viewports 1440x900,390x844] [--out DIR] [--shots] [--email ADDR]
Exits 1 if any check fails. Requires: python playwright + a Chrome/Chromium binary.
"""

import argparse
import json
import os
import sys

from playwright.sync_api import sync_playwright

MEASURE = """() => {
  const f = document.querySelector('footer.site-footer');
  const notes = f ? [...f.querySelectorAll('.footer-note')].map(n => ({sw: n.scrollWidth, cw: n.clientWidth})) : [];
  const heads = f ? [...f.querySelectorAll('.footer-group h2')].filter(h => h.offsetParent !== null).map(h => Math.round(h.getBoundingClientRect().top + scrollY)) : [];
  return {
    overflow: document.documentElement.scrollWidth - innerWidth,
    footerHasEmail: f ? f.innerHTML.includes(arguments0) : null,
    bodyMailto: document.querySelector('main') ? document.querySelector('main').innerHTML.split('href="mailto:' + arguments0 + '"').length - 1 : null,
    heads, notes,
    badge: f ? !!f.querySelector('.footer-badges img') : null
  };
}"""


def parse_pairs(spec, sep, cast):
    out = []
    for item in spec.split(","):
        a, b = item.split(sep)
        out.append((a.strip(), cast(b.strip())))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base-url", default="https://shikakucheck.com")
    ap.add_argument("--pages", default="/:home,/about/contact/:contact")
    ap.add_argument("--viewports", default="1440x900,900x900,390x844")
    ap.add_argument("--out", default="var/visual-smoke")
    ap.add_argument("--email", default="contact@shikakucheck.com")
    ap.add_argument("--chrome", default=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    ap.add_argument("--shots", action="store_true")
    args = ap.parse_args()

    pages = parse_pairs(args.pages, ":", str)
    viewports = [(int(w), int(h)) for w, h in parse_pairs(args.viewports, "x", str)]
    os.makedirs(args.out, exist_ok=True)
    measure = MEASURE.replace("arguments0", json.dumps(args.email))

    results = []
    with sync_playwright() as p:
        launch = {"headless": True}
        if os.path.exists(args.chrome):
            launch["executable_path"] = args.chrome
        browser = p.chromium.launch(**launch)
        for width, height in viewports:
            page = browser.new_page(viewport={"width": width, "height": height})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            for path, name in pages:
                page.goto(args.base_url + path, wait_until="networkidle")
                data = page.evaluate(measure)
                clipped = [n for n in data["notes"] if n["sw"] > n["cw"]]
                fails = []
                if data["overflow"] > 0:
                    fails.append("overflow")
                if data["footerHasEmail"]:
                    fails.append("footer-email")
                if clipped:
                    fails.append("footer-note-clipped")
                if errors:
                    fails.append("pageerror")
                data.update(
                    viewport=width, page=name, pageerrors=len(errors),
                    fails=fails, status="FAIL" if fails else "PASS",
                )
                results.append(data)
                if args.shots:
                    f = page.query_selector("footer.site-footer")
                    if f:
                        f.screenshot(path=os.path.join(args.out, f"pw-{name}-{width}.png"))
            page.close()
        browser.close()

    report = os.path.join(args.out, "report.json")
    with open(report, "w", encoding="utf-8") as fh:
        json.dump(results, fh, ensure_ascii=False, indent=1)
    for r in results:
        print(f"{r['status']} {r['page']}@{r['viewport']} overflow={r['overflow']} "
              f"footerEmail={r['footerHasEmail']} bodyMailto={r['bodyMailto']} "
              f"pageerrors={r['pageerrors']} fails={','.join(r['fails']) or '-'}")
    bad = sum(r["status"] == "FAIL" for r in results)
    print(f"{len(results) - bad}/{len(results)} PASS; report={report}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()