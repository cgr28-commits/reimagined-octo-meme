"""Builds proposal mockups of the shared email design system (fictional data only)."""
import base64, html, pathlib, sys

REPO = pathlib.Path("/home/claude/reimagined-octo-meme")
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/home/claude/audit/out")
OUT.mkdir(parents=True, exist_ok=True)
LOGO = "data:image/png;base64," + base64.b64encode((REPO / "public/logo.png").read_bytes()).decode()

NAVY, EMERALD, BG, WHITE = "#071C38", "#2FBF4A", "#F5F7FA", "#FFFFFF"
INK, MUTED, LINE = "#071C38", "#55657A", "#E3E8EF"
SANS = "Manrope,'Helvetica Neue',Helvetica,Arial,sans-serif"
PRICE = "'Cormorant Garamond',Georgia,'Times New Roman',serif"


def shell(preheader, eyebrow, title, body, subject):
    return f"""<!DOCTYPE html>
<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>{html.escape(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  body{{margin:0;padding:0;}} table{{border-collapse:collapse;}} img{{border:0;line-height:100%;}}
  @media only screen and (max-width:480px){{
    .m-pad{{padding-left:20px !important;padding-right:20px !important;}}
    .m-stack{{display:block !important;width:100% !important;}}
    .m-h1{{font-size:22px !important;line-height:30px !important;}}
    .m-btn a{{display:block !important;}}
  }}
  @media (prefers-color-scheme:dark){{
    .d-bg{{background:#0B1524 !important;}} .d-card{{background:#111E31 !important;}}
    .d-ink{{color:#F1F5F9 !important;}} .d-muted{{color:#A9B6C7 !important;}}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:{BG};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{html.escape(preheader)}&#8203;&zwnj;&nbsp;&#8203;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="d-bg" style="background:{BG};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
  <!-- Header -->
  <tr><td align="center" bgcolor="{NAVY}" style="background:{NAVY};border-radius:14px 14px 0 0;padding:28px 32px 26px;" class="m-pad">
    <a href="https://www.myairporttaxini.co.uk/"><img src="{LOGO}" width="132" alt="My Airport Taxi NI" style="display:block;width:132px;height:auto;margin:0 auto;color:#fff;font:700 18px {SANS};"></a>
    <div style="margin-top:18px;font:800 11px/16px {SANS};letter-spacing:2px;text-transform:uppercase;color:{EMERALD};">{eyebrow}</div>
    <h1 class="m-h1" style="margin:6px 0 0;font:800 26px/34px {SANS};color:{WHITE};">{title}</h1>
  </td></tr>
  <!-- Body -->
  <tr><td bgcolor="{WHITE}" class="d-card m-pad" style="background:{WHITE};padding:30px 36px 8px;font:400 15px/24px {SANS};color:{INK};">
{body}
  </td></tr>
  {support()}
  {footer()}
</table>
</td></tr></table>
</body></html>"""


def p(text, mt=0, mb=16):
    return f'<p class="d-ink" style="margin:{mt}px 0 {mb}px;font:400 15px/24px {SANS};color:{INK};">{text}</p>'


def status(kind, label, note):
    colours = {
        "pending": ("#FFF6E5", "#B45309", "#F4C77A"),
        "confirmed": ("#EAF8EE", "#1E7B33", "#A6E0B3"),
        "info": ("#EEF3FA", NAVY, "#C9D6E8"),
    }[kind]
    bg, fg, border = colours
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
<tr><td style="background:{bg};border:1px solid {border};border-radius:10px;padding:14px 16px;">
<div style="font:800 12px/16px {SANS};letter-spacing:1px;text-transform:uppercase;color:{fg};">{label}</div>
<div style="margin-top:4px;font:400 14px/21px {SANS};color:{INK};">{note}</div>
</td></tr></table>"""


def reference(ref, label="Booking reference"):
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>
<td style="border:1px solid {LINE};border-radius:8px;padding:8px 14px;font:600 12px/16px {SANS};color:{MUTED};">{label}&nbsp;&nbsp;<span style="font:800 15px/18px {SANS};letter-spacing:.5px;color:{INK};">{ref}</span></td>
</tr></table>"""


def journey(pickup, dropoff, when):
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px;border:1px solid {LINE};border-radius:12px;">
<tr><td style="padding:18px 20px 6px;">
  <div style="font:800 11px/16px {SANS};letter-spacing:1.5px;text-transform:uppercase;color:{EMERALD};">Your journey</div>
  <div style="margin-top:8px;font:800 18px/26px {SANS};color:{INK};">{when}</div>
</td></tr>
<tr><td style="padding:10px 20px 18px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
   <tr><td width="22" valign="top" style="padding-top:5px;"><div style="width:10px;height:10px;border-radius:5px;background:{EMERALD};"></div></td>
       <td style="padding-bottom:12px;"><div style="font:600 12px/16px {SANS};color:{MUTED};">Pickup</div><div style="font:700 15px/22px {SANS};color:{INK};">{pickup}</div></td></tr>
   <tr><td width="22" valign="top" style="padding-top:5px;"><div style="width:10px;height:10px;border-radius:2px;background:{NAVY};"></div></td>
       <td><div style="font:600 12px/16px {SANS};color:{MUTED};">Drop-off</div><div style="font:700 15px/22px {SANS};color:{INK};">{dropoff}</div></td></tr>
  </table>
</td></tr></table>"""


def rows(items):
    out = []
    for label, value in items:
        if value in (None, ""):
            continue  # components skip empty optional fields
        out.append(f"""<tr><td width="42%" style="padding:11px 0;border-bottom:1px solid {LINE};font:600 13px/20px {SANS};color:{MUTED};">{label}</td>
<td style="padding:11px 0;border-bottom:1px solid {LINE};font:700 14px/20px {SANS};color:{INK};">{value}</td></tr>""")
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 22px;">{"".join(out)}</table>'


def payment(amount, badge, lines, badge_kind="confirmed", label="Fixed fare"):
    bfg, bbg = ("#FFFFFF", EMERALD) if badge_kind == "confirmed" else ("#B45309", "#FFF6E5")
    extra = "".join(f'<div style="font:400 13px/20px {SANS};color:{MUTED};">{l}</div>' for l in lines)
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:{BG};border-radius:12px;">
<tr><td style="padding:18px 20px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td valign="middle"><div style="font:800 11px/16px {SANS};letter-spacing:1.5px;text-transform:uppercase;color:{MUTED};">{label}</div>
   <div class="matni-price" style="font:700 34px/40px {PRICE};color:{INK};">{amount}</div></td>
  <td align="right" valign="middle"><span style="display:inline-block;background:{bbg};color:{bfg};border-radius:20px;padding:6px 12px;font:800 11px/14px {SANS};letter-spacing:1px;text-transform:uppercase;">{badge}</span></td>
 </tr></table>
 <div style="margin-top:6px;">{extra}</div>
</td></tr></table>"""


def button(label, href="#"):
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" class="m-btn" style="margin:4px 0 26px;" width="100%"><tr>
<td align="center" bgcolor="{EMERALD}" style="border-radius:10px;background:{EMERALD};">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{href}" style="height:50px;v-text-anchor:middle;width:520px;" arcsize="20%" fillcolor="{EMERALD}" stroke="f"><center style="color:#ffffff;font:bold 16px Arial;">{label}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="{href}" style="display:block;padding:15px 24px;font:800 16px/20px {SANS};color:{WHITE};text-decoration:none;border-radius:10px;">{label}</a><!--<![endif]-->
</td></tr></table>"""


def notice(title, text, accent=NAVY):
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>
<td style="border-left:4px solid {accent};background:#F8FAFC;border-radius:0 10px 10px 0;padding:14px 18px;">
<div style="font:800 14px/20px {SANS};color:{INK};">{title}</div>
<div style="margin-top:4px;font:400 14px/22px {SANS};color:{INK};">{text}</div></td></tr></table>"""


def support():
    return f"""<tr><td bgcolor="{WHITE}" class="d-card m-pad" style="background:{WHITE};padding:0 36px 30px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid {LINE};"><tr><td style="padding-top:20px;">
<div style="font:800 14px/20px {SANS};color:{INK};">Need help?</div>
<div style="margin-top:4px;font:400 14px/22px {SANS};color:{MUTED};">Reply to this email, call <a href="tel:+442896022952" style="color:{INK};font-weight:700;">028 9602 2952</a> or message us on <a href="https://www.myairporttaxini.co.uk/contact/" style="color:{INK};font-weight:700;">WhatsApp @belfasttaxi</a>.</div>
</td></tr></table></td></tr>"""


def footer():
    return f"""<tr><td bgcolor="{NAVY}" align="center" class="m-pad" style="background:{NAVY};border-radius:0 0 14px 14px;padding:24px 32px;">
<div style="font:800 14px/20px {SANS};color:{WHITE};">My Airport Taxi NI</div>
<div style="margin-top:6px;font:400 13px/21px {SANS};color:#B7C4D6;">
<a href="https://www.myairporttaxini.co.uk" style="color:#FFFFFF;text-decoration:none;">myairporttaxini.co.uk</a> &nbsp;·&nbsp;
<a href="tel:+442896022952" style="color:#FFFFFF;text-decoration:none;">028 9602 2952</a> &nbsp;·&nbsp;
<a href="mailto:bookings@myairporttaxini.co.uk" style="color:#FFFFFF;text-decoration:none;">bookings@myairporttaxini.co.uk</a></div>
<div style="margin-top:10px;font:400 12px/18px {SANS};color:#8FA1B8;">
<a href="https://www.myairporttaxini.co.uk/terms/" style="color:#8FA1B8;">Terms &amp; Conditions</a> &nbsp;·&nbsp;
<a href="https://www.myairporttaxini.co.uk/cancellation/" style="color:#8FA1B8;">Cancellation Policy</a> &nbsp;·&nbsp;
<a href="https://www.myairporttaxini.co.uk/privacy/" style="color:#8FA1B8;">Privacy Policy</a></div>
</td></tr>"""


emails = {}

emails["booking-request-received"] = shell(
    "We've received your request — your transfer is not confirmed yet.",
    "Booking request", "Booking Request Received",
    p("Hi Alex,") + p("Thanks for your booking request.") +
    status("pending", "Awaiting confirmation — not yet confirmed",
           "Your booking request has been received and is awaiting confirmation. Your transfer is not yet confirmed. Your transfer is confirmed once you receive your booking confirmation email — please check your inbox, including your spam or junk folder.") +
    reference("SN-4821", "Request reference") +
    journey("249 Rashee Road, Ballyclare", "Belfast International Airport (BFS)", "Tue 1 September 2026 · 10:00") +
    rows([("Passengers", "2"), ("Suitcases", "2"), ("Vehicle", "Saloon"), ("Flight number", None)]) +
    payment("£45.00", "Not charged", ["No payment has been taken."], "pending", "Quoted price"),
    "Booking Request Received")

emails["booking-confirmation"] = shell(
    "Your airport transfer is confirmed. Booking MAT-7Q2K.",
    "Invoice &amp; booking confirmation", "Your transfer is confirmed",
    p("Hi Alex,") +
    status("confirmed", "Booking confirmed",
           "Your card payment has been received. Please keep this email as your invoice.") +
    reference("MAT-7Q2K") +
    journey("249 Rashee Road, Ballyclare", "Belfast International Airport (BFS)", "Tue 1 September 2026 · 10:00") +
    rows([("Name", "Alex Example"), ("Mobile", "07700 900123"), ("Flight number", "EZY123"),
          ("Passengers", "2"), ("Suitcases", "2"), ("Vehicle", "Estate"),
          ("Airport access", "Express Drop-Off — included")]) +
    payment("£45.00", "Paid in full", ["Paid by card · 28 Aug 2026", "Fixed price for your journey."]) +
    button("Manage your booking") +
    notice("Cancellation policy",
           "Cancel at least 24 hours before pickup for a 100% refund of the amount paid. Cancellations under 24 hours are non-refundable. "
           "<a href='#' style='color:#071C38;font-weight:700;'>Full policy</a>"),
    "Invoice & booking confirmed — MAT-7Q2K")

emails["meet-greet-collection"] = shell(
    "Your driver will be inside Arrivals holding a name board with your name.",
    "Meet &amp; Greet · Dublin Airport T1", "Your driver will meet you inside Arrivals",
    p("Hi Alex,") +
    p("Your airport collection with My Airport Taxi NI is coming up today.") +
    reference("MAT-7Q2K") +
    rows([("Airport", "Dublin Airport"), ("Pickup time", "2:35 PM"), ("Collection option", "Meet &amp; Greet"), ("Flight number", "FR812")]) +
    notice("Where to go",
           "After collecting your baggage, go through to the arrivals hall. Your driver will be waiting there with a name board showing your name, and will help you with your luggage.", EMERALD) +
    notice("If you can't see your driver",
           "You don't need to go anywhere else or contact us when you land. We monitor your flight, so your driver will be in arrivals waiting for you.") +
    button("Message us on WhatsApp"),
    "Important information about your airport collection")

emails["driver-details"] = shell(
    "Your driver for Tue 1 Sep at 10:00 is Chris.",
    "Driver details", "Meet your driver",
    p("Hi Alex,") +
    p("Your driver for this journey has been confirmed.") +
    reference("MAT-7Q2K") +
    rows([("Driver", "Chris"), ("Driver mobile", "07700 900456"), ("Vehicle registration", "CR66 ***"),
          ("Pickup", "249 Rashee Road, Ballyclare"), ("Date &amp; time", "Tue 1 September 2026 · 10:00")]),
    "Your driver details — Tue 1 Sep 10:00 — My Airport Taxi NI")

for name, doc in emails.items():
    (OUT / f"{name}.html").write_text(doc)
print("wrote", len(emails), "to", OUT)
