"""Search / download freely licensed Wikimedia Commons images.

requests.json:
  {"searches": [{"slug": "belfast-market", "q": "Belfast Christmas market"}],
   "files": [{"base": "christmas-belfast-market", "title": "File:...jpg"}]}
searches -> review/candidates/<slug>-<n>.jpg (640px) + review/candidates.json
files    -> public/images/hero/optimized/<base>-{960,1920}.{jpg,webp,avif} + review/credits.json
"""
import io, json, os, re, sys, time, urllib.parse, urllib.request
from PIL import Image

API = "https://commons.wikimedia.org/w/api.php"
UA = "MyAirportTaxiNI-site-build/1.0 (bookings@myairporttaxini.co.uk)"
OK = re.compile(r"^(cc0|public domain|pd|cc by(-sa)? ?[0-9.]*( [a-z]+)?)$", re.I)

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:
            print("retry", url[:120], e); time.sleep(3 * (i + 1))
    raise RuntimeError(url)

def api(**p):
    p.update(format="json", formatversion="2")
    return json.loads(get(API + "?" + urllib.parse.urlencode(p)))

def strip(html):
    return re.sub(r"<[^>]+>", "", html or "").strip()

def info(pages, width):
    out = []
    for pg in pages:
        ii = (pg.get("imageinfo") or [{}])[0]
        md = ii.get("extmetadata", {})
        lic = strip(md.get("LicenseShortName", {}).get("value", ""))
        out.append({
            "title": pg["title"], "w": ii.get("width"), "h": ii.get("height"),
            "license": lic, "licenseUrl": strip(md.get("LicenseUrl", {}).get("value", "")),
            "artist": strip(md.get("Artist", {}).get("value", "")),
            "date": strip(md.get("DateTimeOriginal", {}).get("value", ""))[:20],
            "desc": strip(md.get("ImageDescription", {}).get("value", ""))[:200],
            "page": ii.get("descriptionurl"), "thumb": ii.get("thumburl"), "mime": ii.get("mime"),
            "ok": bool(OK.match(lic.lower().replace("cc-by", "cc by"))) and "nc" not in lic.lower() and "nd" not in lic.lower(),
        })
    return out

def main():
    req = json.load(open(sys.argv[1]))
    os.makedirs("review/candidates", exist_ok=True)
    cands = {}
    for s in req.get("searches", []):
        d = api(action="query", generator="search", gsrsearch=s["q"] + " filetype:bitmap", gsrnamespace=6,
                gsrlimit=s.get("limit", 20), prop="imageinfo", iiprop="url|size|mime|extmetadata", iiurlwidth=640)
        rows = [r for r in info(d.get("query", {}).get("pages", []), 640)
                if r["ok"] and (r["w"] or 0) >= s.get("minw", 1600) and r["mime"] == "image/jpeg"]
        for n, r in enumerate(rows[: s.get("keep", 8)]):
            fn = f"review/candidates/{s['slug']}-{n}.jpg"
            open(fn, "wb").write(get(r["thumb"])); r["file"] = fn
        cands[s["slug"]] = rows[: s.get("keep", 8)]
        time.sleep(1)
    if cands:
        json.dump(cands, open("review/candidates.json", "w"), indent=1)
    credits = {}
    for f in req.get("files", []):
        d = api(action="query", titles=f["title"], prop="imageinfo", iiprop="url|size|mime|extmetadata", iiurlwidth=2400)
        r = info(d["query"]["pages"], 2400)[0]
        assert r["ok"], (f, r["license"])
        im = Image.open(io.BytesIO(get(r["thumb"]))).convert("RGB")
        # crop to 16:9 around focus (fy = vertical focus 0..1)
        W, H = im.size; th = int(W * 9 / 16)
        if th <= H:
            fy = f.get("fy", 0.5); top = int(max(0, min(H - th, fy * H - th / 2)))
            im = im.crop((0, top, W, top + th))
        else:
            tw = int(H * 16 / 9); left = (W - tw) // 2; im = im.crop((left, 0, left + tw, H))
        os.makedirs("public/images/hero/optimized", exist_ok=True)
        for w in (960, 1920):
            x = im.resize((w, int(w * 9 / 16)), Image.LANCZOS)
            b = f"public/images/hero/optimized/{f['base']}-{w}"
            x.save(b + ".jpg", quality=82, optimize=True, progressive=True)
            x.save(b + ".webp", quality=78)
            x.save(b + ".avif", quality=55)
        credits[f["base"]] = {k: r[k] for k in ("title", "artist", "license", "licenseUrl", "page", "w", "h", "desc")}
    if credits:
        json.dump(credits, open("review/credits.json", "w"), indent=1)

main()
