"""Port the desktop light-design colour rules to mobile (html.m2, below 1200px).
Takes globals.css from a start line, keeps only colour-type declarations inside
@media (min-width: 1200px) blocks, and re-scopes them."""
import re, sys

src = open(sys.argv[1]).read().split("\n")
start = int(sys.argv[2])
css = "\n".join(src[start - 1:])
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)

COLOR_PROPS = {"color", "background", "background-color", "background-image", "border-color", "border-top-color",
               "border-bottom-color", "border-left-color", "border-right-color", "box-shadow", "fill", "stroke",
               "-webkit-text-fill-color", "outline-color", "text-shadow", "caret-color", "accent-color",
               "backdrop-filter", "-webkit-backdrop-filter", "border", "content"}

def parse(s, i=0):
    """returns list of (prelude, body|list) and end index"""
    items = []; buf = ""; n = len(s)
    while i < n:
        c = s[i]
        if c in "\"'":
            j = i + 1
            while j < n and s[j] != c:
                j += 2 if s[j] == "\\" else 1
            buf += s[i:j + 1]; i = j + 1; continue
        if c == "{":
            pre = buf.strip(); buf = ""
            if pre.startswith("@"):
                inner, i = parse(s, i + 1); items.append((pre, inner))
            else:
                j = i + 1; depth = 1; q = None
                while j < n and depth:
                    ch = s[j]
                    if q:
                        if ch == q: q = None
                    elif ch in "\"'": q = ch
                    elif ch == "{": depth += 1
                    elif ch == "}": depth -= 1
                    j += 1
                items.append((pre, s[i + 1:j - 1])); i = j
            continue
        if c == "}":
            return items, i + 1
        if c == ";" and buf.strip().startswith("@"):
            buf = ""; i += 1; continue
        buf += c; i += 1
    return items, i

def split_decls(body):
    out = []; buf = ""; q = None; par = 0
    for ch in body:
        if q:
            buf += ch
            if ch == q: q = None
            continue
        if ch in "\"'": q = ch
        elif ch == "(": par += 1
        elif ch == ")": par -= 1
        if ch == ";" and par == 0:
            out.append(buf.strip()); buf = ""
        else:
            buf += ch
    if buf.strip(): out.append(buf.strip())
    return out

def split_sel(sel):
    parts = []; buf = ""; par = 0
    for ch in sel:
        if ch == "(": par += 1
        if ch == ")": par -= 1
        if ch == "," and par == 0:
            parts.append(buf.strip()); buf = ""
        else:
            buf += ch
    parts.append(buf.strip()); return [p for p in parts if p]

def colour_only(body):
    keep = []
    for d in split_decls(body):
        if ":" not in d: continue
        prop = d.split(":", 1)[0].strip().lower()
        if prop in COLOR_PROPS:
            if prop == "border" and not re.search(r"#|rgb|hsl|transparent|none", d): continue
            if prop == "background" and re.search(r"url\(", d) and "svg" not in d: continue
            keep.append(d)
    return keep

def scope(sel):
    out = []
    for p in split_sel(sel):
        if p.startswith(":root") or p.startswith("html"):
            continue
        out.append("html.m2 " + p)
    return ", ".join(out)

rules = []
def walk(items, in_desktop=False, layer=None):
    for pre, body in items:
        if isinstance(body, list):
            if pre.startswith("@media"):
                desk = "min-width: 1200px" in pre or "min-width:1200px" in pre
                if desk and "max-" not in pre and "max-height" not in pre:
                    walk(body, True, layer)
            elif pre.startswith("@layer"):
                walk(body, in_desktop, pre)
            elif pre.startswith("@supports"):
                walk(body, in_desktop, layer)
        elif in_desktop and pre and not pre.startswith("@"):
            decls = colour_only(body)
            sel = scope(pre)
            if decls and sel:
                rules.append((layer, sel, decls))

items, _ = parse(css)
walk(items)
outp = ["/* Ported automatically: colour declarations of the desktop light design, re-scoped to mobile (html.m2). */",
        "@media (max-width: 1199.98px) {"]
for layer, sel, decls in rules:
    if layer: continue
    outp.append(f"  {sel} {{ " + "; ".join(decls) + "; }")
outp.append("}")
layered = [r for r in rules if r[0]]
if layered:
    outp.append("@layer base { @media (max-width: 1199.98px) {")
    for layer, sel, decls in layered:
        outp.append(f"  {sel} {{ " + "; ".join(decls) + "; }")
    outp.append("} }")
open(sys.argv[3], "w").write("\n".join(outp) + "\n")
print(len(rules), "rules")
