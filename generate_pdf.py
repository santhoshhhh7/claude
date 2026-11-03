"""Generate customer_psychology.pdf using only the Python standard library."""

# Helvetica glyph widths (per 1000 units) for ASCII 32..126
_W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
      556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
      1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
      667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
      333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
      556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]

PAGE_W, PAGE_H = 612, 792  # US Letter
MARGIN = 64
TEXT_W = PAGE_W - 2 * MARGIN
BULLET = "\u2022"  # encodes to 0x95 in WinAnsi/cp1252

TEAL = (0.05, 0.42, 0.45)
DARK = (0.12, 0.12, 0.14)
GREY = (0.40, 0.40, 0.45)


def text_width(s, size, bold=False):
    total = 0
    for ch in s:
        o = ord(ch)
        total += _W[o - 32] if 32 <= o <= 126 else 350
    return total * size / 1000 * (1.06 if bold else 1.0)


def wrap(text, size, width, bold=False):
    lines, cur = [], ""
    for word in text.split():
        trial = word if not cur else cur + " " + word
        if text_width(trial, size, bold) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def esc(s):
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


class Doc:
    def __init__(self):
        self.pages = []
        self.new_page()

    def new_page(self):
        self.ops = []
        self.pages.append(self.ops)
        self.y = PAGE_H - MARGIN

    def ensure(self, h):
        if self.y - h < MARGIN + 20:
            self.new_page()

    def text(self, x, y, s, size, bold=False, color=DARK):
        font = "F2" if bold else "F1"
        r, g, b = color
        self.ops.append(f"BT {r} {g} {b} rg /{font} {size} Tf {x:.2f} {y:.2f} Td ({esc(s)}) Tj ET")

    def rect(self, x, y, w, h, color):
        r, g, b = color
        self.ops.append(f"{r} {g} {b} rg {x} {y} {w} {h} re f")

    def title_page(self, title, subtitle, blurb):
        self.rect(0, PAGE_H - 330, PAGE_W, 330, TEAL)
        y = PAGE_H - 170
        for line in wrap(title, 34, TEXT_W, True):
            self.text(MARGIN, y, line, 34, True, (1, 1, 1))
            y -= 42
        self.text(MARGIN, y - 6, subtitle, 15, False, (0.85, 0.95, 0.95))
        y = PAGE_H - 400
        for line in wrap(blurb, 12, TEXT_W):
            self.text(MARGIN, y, line, 12, False, GREY)
            y -= 18
        self.new_page()

    def h1(self, s):
        self.ensure(70)
        self.y -= 14
        self.text(MARGIN, self.y, s, 20, True, TEAL)
        self.y -= 10
        self.rect(MARGIN, self.y, TEXT_W, 1.2, TEAL)
        self.y -= 22

    def h2(self, s):
        self.ensure(40)
        self.y -= 4
        self.text(MARGIN, self.y, s, 13, True, DARK)
        self.y -= 18

    def para(self, s, size=10.5, lead=15):
        for line in wrap(s, size, TEXT_W):
            self.ensure(lead)
            self.text(MARGIN, self.y, line, size)
            self.y -= lead
        self.y -= 6

    def bullets(self, items, size=10.5, lead=15):
        indent = 16
        for item in items:
            label, _, body = item.partition(": ") if ": " in item else ("", "", item)
            first_prefix = f"{label}: " if label else ""
            words_text = first_prefix + body
            lines = wrap(words_text, size, TEXT_W - indent, bold=False)
            self.ensure(lead * min(len(lines), 2))
            self.text(MARGIN + 4, self.y, BULLET, size, False, TEAL)
            for i, line in enumerate(lines):
                self.ensure(lead)
                x = MARGIN + indent
                if i == 0 and label and line.startswith(first_prefix):
                    self.text(x, self.y, first_prefix, size, True)
                    rest = line[len(first_prefix):]
                    self.text(x + text_width(first_prefix, size, True), self.y, rest, size)
                else:
                    self.text(x, self.y, line, size)
                self.y -= lead
            self.y -= 3
        self.y -= 6

    def save(self, path):
        objs = []

        def add(b):
            objs.append(b)
            return len(objs)

        f1 = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        f2 = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        pages_id = len(objs) + 1 + 2 * len(self.pages)
        kids = []
        total = len(self.pages)
        for n, ops in enumerate(self.pages, 1):
            body = list(ops)
            if n > 1:  # footer on content pages
                footer = f"Customer Psychology  |  Page {n} of {total}"
                body.append(f"BT {GREY[0]} {GREY[1]} {GREY[2]} rg /F1 8.5 Tf "
                            f"{PAGE_W - MARGIN - text_width(footer, 8.5):.2f} 36 Td ({esc(footer)}) Tj ET")
            stream = "\n".join(body).encode("cp1252")
            cid = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
            pid = add((f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] "
                       f"/Resources << /Font << /F1 {f1} 0 R /F2 {f2} 0 R >> >> "
                       f"/Contents {cid} 0 R >>").encode())
            kids.append(pid)
        add((f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {total} >>").encode())
        cat = add(f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode())
        info = add(b"<< /Title (Customer Psychology: A Practical Guide) /Author (Kiro) >>")

        out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = []
        for i, o in enumerate(objs, 1):
            offsets.append(len(out))
            out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
        xref = len(out)
        out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
        for off in offsets:
            out += f"{off:010d} 00000 n \n".encode()
        out += (f"trailer\n<< /Size {len(objs) + 1} /Root {cat} 0 R /Info {info} 0 R >>\n"
                f"startxref\n{xref}\n%%EOF\n").encode()
        with open(path, "wb") as fh:
            fh.write(out)


def build():
    d = Doc()
    d.title_page(
        "Customer Psychology",
        "A Practical Guide to Why People Buy",
        "This guide covers the mental shortcuts, emotions, and social forces that shape how "
        "customers notice, evaluate, buy, and stay loyal to products and services. Each section "
        "pairs the underlying idea with concrete ways to apply it responsibly.",
    )

    d.h1("1. What Is Customer Psychology?")
    d.para("Customer psychology is the study of how people think, feel, and behave when they choose "
           "products and services. It draws on behavioral economics, social psychology, and "
           "neuroscience. Its central finding is that buyers are not purely rational: most decisions "
           "are made quickly, emotionally, and with limited attention, then justified with logic afterwards.")
    d.h2("Two systems of thinking")
    d.para("Psychologist Daniel Kahneman describes two modes of thought that both influence buying:")
    d.bullets([
        "System 1: fast, automatic, emotional, and driven by habits and first impressions. Most "
        "everyday purchases happen here.",
        "System 2: slow, deliberate, and analytical. It engages for expensive, risky, or unfamiliar "
        "purchases, but it tires easily and often just approves what System 1 already prefers.",
    ])
    d.para("Good customer experiences make the System 1 path feel easy and safe, and give System 2 "
           "the facts it needs when it does switch on.")

    d.h1("2. Core Principles of Persuasion")
    d.para("Robert Cialdini's research identified seven principles that consistently increase the "
           "likelihood that people say yes.")
    d.bullets([
        "Reciprocity: people feel obliged to return a favor. Free samples, useful content, and "
        "generous trials create goodwill that customers want to repay.",
        "Commitment and consistency: once people take a small step, they like to act consistently "
        "with it. A free account or a saved wishlist makes a later purchase more likely.",
        "Social proof: when unsure, people copy others. Reviews, ratings, customer counts, and "
        "testimonials reduce perceived risk.",
        "Authority: people trust credible experts. Certifications, expert endorsements, and media "
        "mentions signal quality.",
        "Liking: people buy from those they like and relate to. Friendly tone, shared values, and "
        "relatable stories build connection.",
        "Scarcity: limited availability raises perceived value. Genuine limited stock or time-bound "
        "offers prompt action.",
        "Unity: a sense of shared identity, such as being part of a community or group, strengthens "
        "trust and loyalty.",
    ])

    d.h1("3. Cognitive Biases That Shape Buying")
    d.bullets([
        "Anchoring: the first number seen sets the reference point. Showing a premium option first "
        "makes mid-tier prices feel reasonable.",
        "Loss aversion: losses feel about twice as painful as equal gains feel good. Framing like "
        "\"Don't lose your progress\" often beats \"Save your progress.\"",
        "Decoy effect: adding a clearly inferior third option makes one of the others look like the "
        "obvious best choice.",
        "Choice overload: too many options cause anxiety and delay. Curated selections and clear "
        "recommendations raise conversion.",
        "Endowment effect: people value things more once they feel they own them. Free trials and "
        "personalization build this sense of ownership.",
        "Framing effect: the same fact lands differently depending on wording. \"95% fat free\" "
        "sounds better than \"5% fat.\"",
        "Peak-end rule: people judge an experience by its most intense moment and its ending. A smooth "
        "checkout and a thoughtful follow-up shape memory of the whole journey.",
        "Bandwagon effect: popularity signals such as \"bestseller\" or \"trending\" pull people "
        "toward the crowd's choice.",
        "Zero-price effect: \"free\" triggers a disproportionate response compared with even a very "
        "low price.",
    ])

    d.h1("4. Emotions and Motivation")
    d.para("Emotion drives attention, memory, and action. Customers rarely buy a product for its own "
           "sake; they buy the outcome or feeling it delivers.")
    d.h2("Key emotional drivers")
    d.bullets([
        "Security: avoiding risk, loss, or embarrassment (insurance, warranties, trusted brands).",
        "Belonging: fitting in with or being admired by a group (fashion, communities, memberships).",
        "Achievement: progress, status, and self-improvement (courses, fitness, premium tiers).",
        "Pleasure: comfort, fun, and sensory enjoyment (food, travel, entertainment).",
        "Control: saving time, reducing hassle, and feeling in charge (automation, convenience).",
    ])
    d.h2("Maslow's hierarchy applied")
    d.para("Products map to different levels of need: physiological and safety needs (food, housing, "
           "security), social needs (connection, community), esteem needs (status, recognition), and "
           "self-actualization (growth, creativity). Messaging works best when it speaks to the level "
           "the customer is actually trying to satisfy.")
    d.h2("Jobs to be done")
    d.para("Customers \"hire\" a product to make progress in a specific situation. Ask what job the "
           "customer is trying to get done, including its functional, emotional, and social sides, "
           "rather than only who the customer is demographically.")

    d.h1("5. Psychology Across the Customer Journey")
    d.bullets([
        "Awareness: attention is scarce. Novelty, relevance, and emotional hooks help a brand get noticed.",
        "Consideration: customers compare options and look for reassurance. Social proof, clear "
        "comparisons, and expert content reduce uncertainty.",
        "Decision: friction and doubt kill sales. Simple checkout, guarantees, transparent pricing, "
        "and clear calls to action help customers commit.",
        "Post-purchase: buyer's remorse is common. Confirmation emails, onboarding, and quick wins "
        "reassure customers they chose well.",
        "Loyalty and advocacy: consistent experiences, rewards, recognition, and community turn "
        "customers into repeat buyers and promoters.",
    ])

    d.h1("6. Pricing Psychology")
    d.bullets([
        "Charm pricing: prices ending in 9 or 99 feel noticeably lower because people read left to right.",
        "Price anchoring: showing the original price next to a sale price frames the deal as a gain.",
        "Tiered pricing: three options (good, better, best) steer most buyers to the middle.",
        "Bundling: grouping items hides individual costs and increases perceived value.",
        "Pain of paying: subscriptions, saved cards, and one-click buying reduce the felt cost of a purchase.",
        "Relative value: \"Less than a coffee a day\" reframes a price against a familiar small expense.",
    ])

    d.h1("7. Building Trust")
    d.para("Trust is the foundation of every purchase, especially online where customers cannot touch "
           "the product or meet the seller.")
    d.bullets([
        "Transparency: clear pricing, honest descriptions, and no hidden fees.",
        "Risk reversal: free returns, money-back guarantees, and free trials.",
        "Consistency: the same quality and tone at every touchpoint.",
        "Responsiveness: fast, human support when something goes wrong.",
        "Proof: real reviews (including imperfect ones), case studies, and security badges.",
    ])

    d.h1("8. Ethics: Persuasion vs. Manipulation")
    d.para("These principles are powerful, and misuse damages trust, invites regulation, and drives "
           "customers away. Persuasion helps people make choices that serve them; manipulation "
           "exploits weaknesses against their interests.")
    d.h2("Avoid dark patterns")
    d.bullets([
        "Fake scarcity or countdown timers that reset.",
        "Hidden costs revealed only at checkout.",
        "Confirmshaming, such as \"No thanks, I don't like saving money.\"",
        "Subscriptions that are easy to start but hard to cancel.",
        "Fake reviews or invented social proof.",
    ])
    d.para("A useful test: would you be comfortable if the customer could see exactly how and why the "
           "experience was designed this way?")

    d.h1("9. Practical Checklist")
    d.bullets([
        "Do we understand the job the customer is hiring us to do?",
        "Is the main benefit framed around the customer's outcome, not our features?",
        "Have we reduced choices and friction at the point of decision?",
        "Do we show credible social proof and authority signals?",
        "Is pricing clear, anchored, and free of surprises?",
        "Have we reversed risk with guarantees or trials?",
        "Is the ending of the experience (checkout, delivery, follow-up) memorable for the right reasons?",
        "Would every tactic we use pass the transparency test?",
    ])

    d.h1("Further Reading")
    d.bullets([
        "Robert Cialdini, Influence: The Psychology of Persuasion.",
        "Daniel Kahneman, Thinking, Fast and Slow.",
        "Dan Ariely, Predictably Irrational.",
        "Richard Thaler and Cass Sunstein, Nudge.",
        "Clayton Christensen et al., Competing Against Luck (Jobs to Be Done).",
    ])
    d.save("customer_psychology.pdf")


if __name__ == "__main__":
    build()
