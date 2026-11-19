#!/usr/bin/env python3
"""Build: _data/*.json + src/*.html (Jinja2) + img/ + static/ -> dist/

  python3 build.py            # sestaví dist/
  python3 build.py --serve    # + lokální server na http://localhost:8765/<base>

Co dělá sám: WebP + srcset 640/1280/1920, lazy u všech fotek kromě první na stránce, ?v=<hash obsahu> u CSS/JS,
noindex a robots.txt podle site.navrh, JSON-LD LocalBusiness ze site.json, og:image 1200x630, sitemap.xml, 404.html,
.nojekyll (+ CNAME u ostrého webu s doménou). Design si nedědí: styl a šablony píšeš ty.
"""
import datetime
import hashlib
import html
import json
import os
import re
import shutil
import sys

from markupsafe import Markup
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, DATA, IMG, STATIC, DIST, CACHE = (os.path.join(ROOT, p) for p in ("src", "_data", "img", "static", "dist", ".cache/img"))
SIRKY = (640, 960, 1280, 1920)
RASTER = (".jpg", ".jpeg", ".png", ".webp")


class BuildError(Exception):
    pass


def nacti_data():
    d = {}
    for f in sorted(os.listdir(DATA)):
        if f.endswith(".json"):
            with open(os.path.join(DATA, f), encoding="utf-8") as fh:
                d[f[:-5]] = json.load(fh)
    if "site" not in d:
        raise BuildError("chybí _data/site.json")
    return d


class Obrazky:
    """Převod do WebP + generování <img srcset>. Počítá fotky na stránce: první je eager."""

    def __init__(self, base):
        self.base = base
        self.pocet = 0
        self.info = {}
        os.makedirs(CACHE, exist_ok=True)

    def reset(self):
        self.pocet = 0

    def _zpracuj(self, nazev):
        if nazev.startswith("img/"):          # nahrané z adminu: img/uploads/RRRR-MM/x.webp
            nazev = nazev[4:]
        if nazev in self.info:
            return self.info[nazev]
        zdroj = os.path.join(IMG, nazev)
        if not os.path.exists(zdroj):
            raise BuildError(f"obrázek img/{nazev} neexistuje")
        stem, ext = os.path.splitext(nazev)
        stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem)
        cil_dir = os.path.join(DIST, "img")
        os.makedirs(cil_dir, exist_ok=True)
        if ext.lower() not in RASTER:   # svg a ostatní se kopírují beze změny
            shutil.copy(zdroj, os.path.join(cil_dir, os.path.basename(nazev)))
            self.info[nazev] = {"raster": False, "src": f"img/{os.path.basename(nazev)}"}
            return self.info[nazev]
        h = hashlib.sha1(open(zdroj, "rb").read()).hexdigest()[:12]
        im = ImageOps.exif_transpose(Image.open(zdroj))
        im.load()
        w0, h0 = im.size
        sirky = sorted({w for w in SIRKY if w < w0} | {min(w0, SIRKY[-1])})
        varianty = []
        for w in sirky:
            vyska = round(h0 * w / w0)
            cache = os.path.join(CACHE, f"{h}-{w}-q76.webp")
            if not os.path.exists(cache):
                r = im.resize((w, vyska), Image.LANCZOS) if w != w0 else im
                if r.mode not in ("RGB", "RGBA"):
                    r = r.convert("RGBA" if "A" in r.getbands() else "RGB")
                r.save(cache, "WEBP", quality=76, method=6)
            out = f"{stem}-{w}.webp"
            shutil.copy(cache, os.path.join(cil_dir, out))
            varianty.append((w, vyska, f"img/{out}"))
        self.info[nazev] = {"raster": True, "varianty": varianty}
        return self.info[nazev]

    def img(self, nazev, alt=None, sizes="100vw", cls="", eager=None, styl=""):
        if alt is None:
            raise BuildError(f"img('{nazev}'): chybí alt (pro dekorativní fotku alt='')")
        self.pocet += 1
        prvni = (self.pocet == 1) if eager is None else eager
        i = self._zpracuj(nazev)
        a = f' alt="{html.escape(alt, quote=True)}"'
        c = f' class="{cls}"' if cls else ""
        s = f' style="{styl}"' if styl else ""
        if not i["raster"]:
            return Markup(f'<img src="{self.base}{i["src"]}"{a}{c}{s} loading="{"eager" if prvni else "lazy"}" decoding="async">')
        w, h, nejv = i["varianty"][-1][0], i["varianty"][-1][1], i["varianty"][-1][2]
        srcset = ", ".join(f"{self.base}{p} {w_}w" for w_, _, p in i["varianty"])
        nacitani = 'loading="eager" fetchpriority="high"' if prvni else 'loading="lazy"'
        return Markup(f'<img src="{self.base}{nejv}" srcset="{srcset}" sizes="{sizes}" width="{w}" height="{h}"{a}{c}{s} '
                      f'{nacitani} decoding="async">')

    def na_sirku(self, nazev):
        """Fotka na šířku (např. nahraná z administrace) – šablona podle toho upraví rozvržení."""
        i = self._zpracuj(nazev)
        if not i["raster"]:
            return False
        w, h = i["varianty"][-1][0], i["varianty"][-1][1]
        return w > h * 1.1

    def img_url(self, nazev, w=1280):
        i = self._zpracuj(nazev)
        if not i["raster"]:
            return self.base + i["src"]
        best = min(i["varianty"], key=lambda v: abs(v[0] - w))
        return self.base + best[2]

    def og(self, nazev):
        if nazev.startswith("img/"):
            nazev = nazev[4:]
        zdroj = os.path.join(IMG, nazev)
        if not os.path.exists(zdroj):
            return None
        im = ImageOps.fit(ImageOps.exif_transpose(Image.open(zdroj)).convert("RGB"), (1200, 630), Image.LANCZOS)
        im.save(os.path.join(DIST, "og.jpg"), quality=84, optimize=True)
        return "og.jpg"


def hash_souboru(cesta):
    return hashlib.sha1(open(cesta, "rb").read()).hexdigest()[:10]


def cena_cislo(t):
    c = re.sub(r"[^0-9]", "", t or "")
    return int(c) if c else None


def jsonld(site, data=None):
    """Organization + ProfessionalService s nabídkou programů (GEO: AI vyhledávače čtou ceny a rozsah)."""
    k = site.get("kontakt", {})
    a = k.get("adresa", {})
    url = site["url"]
    org_id = url + "#organizace"
    adr = {"@type": "PostalAddress", "streetAddress": a.get("ulice"), "postalCode": a.get("psc"),
           "addressLocality": a.get("mesto"), "addressRegion": a.get("kraj"), "addressCountry": a.get("zeme") or "CZ"}
    adr = {x: v for x, v in adr.items() if v}
    org = {"@type": ["Organization", "ProfessionalService"], "@id": org_id, "name": site["nazev"], "url": url,
           "description": site.get("popis", ""), "image": url + "og.jpg", "address": adr,
           "areaServed": {"@type": "Country", "name": "Česká republika"}, "knowsLanguage": ["cs", "en"]}
    if site.get("logo"): org["logo"] = url + site["logo"]
    if k.get("telefon"): org["telephone"] = "+420 " + k["telefon"]
    if k.get("email"): org["email"] = k["email"]
    if k.get("telefon") or k.get("email"):
        cp = {"@type": "ContactPoint", "contactType": "poptávky programů", "availableLanguage": ["cs", "en"]}
        if k.get("telefon"): cp["telephone"] = "+420 " + k["telefon"]
        if k.get("email"): cp["email"] = k["email"]
        org["contactPoint"] = cp
    if k.get("osoba"):
        org["founder"] = {"@type": "Person", "name": k["osoba"], "jobTitle": k.get("role") or "zakladatelka"}
    if site.get("provozovatel"):
        pr = site["provozovatel"]
        org["parentOrganization"] = {x: v for x, v in {"@type": "Organization", "name": pr.get("nazev"),
                                     "url": pr.get("web"), "taxID": pr.get("ico")}.items() if v}
    if site.get("ico"): org["taxID"] = site["ico"]
    if site.get("sameas"): org["sameAs"] = site["sameas"]
    if site.get("klicova_slova"): org["knowsAbout"] = site["klicova_slova"]
    graf = [org]
    nab = []
    for p in (data or {}).get("programy", []):
        sluzba = {"@type": "Service", "@id": url + "#program-" + p["id"], "name": p["nazev"] + " Experience",
                  "serviceType": "teambuilding a výcvik krizové připravenosti", "provider": {"@id": org_id},
                  "areaServed": "Česká republika",
                  "description": " ".join(x for x in (p.get("perex"), p.get("delka"), p.get("kapacita")) if x)}
        o = {"@type": "Offer", "itemOffered": sluzba, "priceCurrency": "CZK", "url": url + "#programy",
             "priceSpecification": {"@type": "PriceSpecification", "priceCurrency": "CZK",
                                    "valueAddedTaxIncluded": False}}
        c = cena_cislo(p.get("cena"))
        if c:
            o["price"] = c
            o["priceSpecification"]["price"] = c
        nab.append(o)
        r_ = p.get("rocni")
        if r_:
            s2 = {"@type": "Service", "@id": url + "#rocni-spoluprace", "name": r_.get("nazev"),
                  "provider": {"@id": org_id}, "description": r_.get("text")}
            o2 = {"@type": "Offer", "itemOffered": s2, "priceCurrency": "CZK",
                  "priceSpecification": {"@type": "PriceSpecification", "priceCurrency": "CZK",
                                         "valueAddedTaxIncluded": False}}
            c2 = cena_cislo(r_.get("cena"))
            if c2:
                o2["priceSpecification"]["minPrice"] = c2
            nab.append(o2)
    if nab:
        org["hasOfferCatalog"] = {"@type": "OfferCatalog", "name": "Programy Gryfix Experience", "itemListElement": nab}
    graf.append({"@type": "WebSite", "@id": url + "#web", "url": url, "name": site["nazev"], "inLanguage": "cs",
                 "publisher": {"@id": org_id}})
    return json.dumps({"@context": "https://schema.org", "@graph": graf}, ensure_ascii=False).replace("</", "<\\/")


def jsonld_puvodni(site):
    k = site.get("kontakt", {})
    a = k.get("adresa", {})
    j = {"@context": "https://schema.org", "@type": site.get("typ") or "LocalBusiness", "name": site["nazev"],
         "url": site["url"], "description": site.get("popis", "")}
    if k.get("telefon"): j["telephone"] = k["telefon"]
    if k.get("email"): j["email"] = k["email"]
    if any(a.get(x) for x in ("ulice", "psc", "mesto")):
        adr = {"@type": "PostalAddress", "streetAddress": a.get("ulice"), "postalCode": a.get("psc"),
               "addressLocality": a.get("mesto"), "addressCountry": a.get("zeme") or "CZ"}
        j["address"] = {k: v for k, v in adr.items() if v}
    if site.get("oteviraci_doba"): j["openingHours"] = site["oteviraci_doba"]
    if site.get("sameas"): j["sameAs"] = site["sameas"]
    if site.get("cenove_rozpeti"): j["priceRange"] = site["cenove_rozpeti"]
    if site.get("ico"): j["taxID"] = site["ico"]
    if site.get("logo"): j["logo"] = site["url"] + site["logo"]
    j["image"] = site["url"] + "og.jpg"
    return json.dumps(j, ensure_ascii=False).replace("</", "<\\/")


def main():
    data = nacti_data()
    site = data["site"]
    base = site.get("base", "/")
    if not base.startswith("/") or not base.endswith("/"):
        raise BuildError("site.base musí začínat a končit lomítkem (např. /slug/ nebo /)")
    if not site["url"].endswith("/"):
        site["url"] += "/"
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)
    obr = Obrazky(base)

    # statické soubory + hash obsahu pro cache busting
    shutil.copytree(STATIC, DIST, dirs_exist_ok=True)
    hashe = {}

    def asset(p):
        cil = os.path.join(DIST, p)
        if not os.path.exists(cil):
            raise BuildError(f"asset {p} neexistuje (static/{p})")
        if p not in hashe:
            hashe[p] = hash_souboru(cil)
        return f"{base}{p}?v={hashe[p]}"

    og = obr.og(site["og_image"]) if site.get("og_image") else None
    if not og:
        print("VAROVÁNÍ: chybí og_image (site.og_image -> soubor v img/)")
    og_url = site["url"] + og if og else None

    def url(cesta):
        cesta = cesta.strip("/")
        return base + (cesta + "/" if cesta else "")

    env = Environment(loader=FileSystemLoader(SRC), autoescape=select_autoescape(["html"]), undefined=StrictUndefined)
    def nb(t):
        t = str(html.escape(str(t)))
        return Markup(re.sub(r"(^|[\s(])([kvszouaiKVSZOUAI]) ", lambda m: m.group(1) + m.group(2) + "&nbsp;", t))
    def cas(h):
        return f"{int(h)}:{int(round((h % 1) * 60)):02d}"
    env.filters["nb"] = nb
    env.filters["cas"] = cas
    env.globals.update(site=site, data=data, base=base, asset=asset, url=url, img=obr.img, img_url=obr.img_url, na_sirku=obr.na_sirku,
                       og_url=og_url, jsonld=jsonld(site, data), titulek="", popis="", cesta="", noindex=False)
    stranky = []
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".html") or f.startswith("_"):
            continue
        jmeno = f[:-5]
        obr.reset()
        tpl = env.get_template(f)
        kod = tpl.render()
        if jmeno == "404":
            vystup = os.path.join(DIST, "404.html")
        elif jmeno == "index":
            vystup = os.path.join(DIST, "index.html")
            stranky.append("")
        else:
            os.makedirs(os.path.join(DIST, jmeno), exist_ok=True)
            vystup = os.path.join(DIST, jmeno, "index.html")
            stranky.append(jmeno + "/")
        with open(vystup, "w", encoding="utf-8") as fh:
            fh.write(kod)

    # robots, sitemap, CNAME
    navrh = bool(site.get("navrh"))
    with open(os.path.join(DIST, "robots.txt"), "w") as fh:
        if navrh:
            fh.write("User-agent: *\nDisallow: /\n")
        else:
            fh.write(f"User-agent: *\nAllow: /\n\nSitemap: {site['url']}sitemap.xml\n")
    dnes = datetime.date.today().isoformat()
    with open(os.path.join(DIST, "sitemap.xml"), "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for s in stranky:
            fh.write(f"  <url><loc>{site['url']}{s}</loc><lastmod>{dnes}</lastmod></url>\n")
        fh.write("</urlset>\n")
    open(os.path.join(DIST, ".nojekyll"), "w").close()
    if site.get("domena") and not navrh:
        open(os.path.join(DIST, "CNAME"), "w").write(site["domena"] + "\n")

    # administrace (webhunter-admin) – knihovna fotek, nahrané fotky, verze pro hlídání publikace
    adm = os.path.join(ROOT, "admin")
    if os.path.isdir(adm):
        shutil.copytree(adm, os.path.join(DIST, "admin"))
        ix = os.path.join(DIST, "admin", "index.html")
        t = open(ix, encoding="utf-8").read()
        t = t.replace("__V_ACSS__", hash_souboru(os.path.join(adm, "admin.css"))).replace("__V_AJS__", hash_souboru(os.path.join(adm, "admin.js")))
        open(ix, "w", encoding="utf-8").write(t)
        knihovna = []
        for kor, _, soubory in sorted(os.walk(IMG)):
            for f in sorted(soubory):
                if os.path.splitext(f)[1].lower() not in RASTER:
                    continue
                rel = os.path.relpath(os.path.join(kor, f), IMG)
                if rel.startswith("og") or "logo" in rel or "symbol" in rel:
                    continue
                k = "img/" + rel if rel.startswith("uploads/") else rel
                knihovna.append({"k": k, "src": obr.img_url(k, 640)[len(base):]})
        knihovna.sort(key=lambda x: (not x["k"].startswith("img/uploads/"), x["k"]), reverse=False)
        up = [x for x in knihovna if x["k"].startswith("img/")]
        up.sort(key=lambda x: x["k"], reverse=True)
        knihovna = up + [x for x in knihovna if not x["k"].startswith("img/")]
        with open(os.path.join(DIST, "admin", "images.json"), "w", encoding="utf-8") as fh:
            json.dump(knihovna, fh, ensure_ascii=False)
    upl = os.path.join(IMG, "uploads")
    if os.path.isdir(upl):
        shutil.copytree(upl, os.path.join(DIST, "img", "uploads"), dirs_exist_ok=True)
    with open(os.path.join(DIST, "version.json"), "w") as fh:
        json.dump({"sha": os.environ.get("GITHUB_SHA", "local"), "cas": datetime.datetime.now().isoformat(timespec="seconds")}, fh)

    # llms.txt (GEO): stručný strojově čitelný popis pro AI vyhledávače
    if data.get("programy"):
        k = site.get("kontakt", {})
        o = data.get("obsah", {})
        r_ = [f"# {site['nazev']}", "", f"> {site.get('popis', '')}", ""]
        if o.get("uvod"):
            r_ += [re.sub(r"\s+", " ", o["uvod"]), ""]
        r_ += ["## Programy", ""]
        for p in data["programy"]:
            r_.append(f"- {p['nazev']} Experience: {p.get('delka', '')}, {p.get('kapacita', '')}, {p.get('cena', '')} {p.get('dph', '')}. {p.get('perex', '')}".strip())
            if p.get("rocni"):
                rr = p["rocni"]
                r_.append(f"- {rr.get('nazev', '')}: {rr.get('cena', '')}. {rr.get('text', '')}".strip())
        if o.get("okruhy"):
            r_ += ["", "## Vlastní program – okruhy", ""] + [f"- {x if isinstance(x, str) else x.get('n') or x.get('nazev') or ''}" for x in o["okruhy"]]
        if o.get("odbornost"):
            r_ += ["", "## Odbornost", ""] + [f"- {x if isinstance(x, str) else ' – '.join(str(v) for v in x.values())}" for x in o["odbornost"]]
        r_ += ["", "## Kontakt", "", f"- {k.get('osoba', '')}", f"- E-mail: {k.get('email', '')}", f"- Telefon: +420 {k.get('telefon', '')}",
               f"- Místo: {k.get('adresa', {}).get('mesto', '')}, Česká republika", f"- Web: {site['url']}"]
        open(os.path.join(DIST, "llms.txt"), "w", encoding="utf-8").write("\n".join(r_) + "\n")

    print(f"OK: {len(stranky)} stránek, {len(obr.info)} obrázků -> dist/ ({'NÁVRH, noindex' if navrh else 'OSTRÝ WEB, indexovatelný'})")


if __name__ == "__main__":
    try:
        main()
    except BuildError as e:
        sys.exit(f"CHYBA buildu: {e}")
    if "--serve" in sys.argv:
        import functools, http.server, socketserver
        os.chdir(DIST)
        print("http://localhost:8765" + json.load(open(os.path.join(DATA, "site.json")))["base"] + "  (Ctrl+C = konec; base řeš prefixem)")
        socketserver.TCPServer.allow_reuse_address = True
        socketserver.TCPServer(("", 8765), http.server.SimpleHTTPRequestHandler).serve_forever()
