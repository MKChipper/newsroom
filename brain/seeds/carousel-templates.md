# Carousel templates and dominant post types

Save into the brain as slug `carousel-templates`, kind `formats`.

This is the locked carousel system for De-Influenced. The goal is repeatable
slide decks that feel like the menopause gold-standard template: buyer-sided,
evidence-led, polished on Instagram, simpler and more native on TikTok.

## Paid Meta ad exception

Paid Instagram and Facebook ads are governed by `meta-ad-gold-standard`, not
this organic carousel template.

Use this file for organic/saveable evidence carousels and TikTok proof
carousels. Use `meta-ad-gold-standard` before creating paid Meta ads.

Paid Meta default:

> recognition -> evidence gap -> app resolution

Paid Meta carousel constraints:

- `1080x1350`, `4:5`.
- Maximum 3 slides.
- Offer-aware and landing-page matched.
- The app/check must be the resolution, not a caption-only afterthought.

## External format check

Checked 2026-06-14.

- Instagram feed/carousel default: `4:5`, `1080x1350`. Keep key cover text and
  logos centred because the profile grid previews around `3:4`.
- TikTok Photo Mode/carousel default: `9:16`, `1080x1920`. Keep critical text
  away from the bottom UI area and right action rail.

Do not mix aspect ratios inside a carousel. Export one deck per platform.

## Dominant carousel post type

The default carousel route is:

> one buyer pain -> one marketing mistake -> one useful evidence check -> one
> receipt/example -> one app or buyer behaviour -> one CTA

The deck should teach a repeatable check, not dump an investigation. If the
idea needs four checks, make four posts.

Best fit:

- "clinically studied" vs product-specific proof
- product + dose + claim checks
- third-party tested / COA confusion
- PubMed-link wallpaper
- label red flags
- ingredient evidence vs product claim
- search-wall/app-resolver pain points

Poor fit:

- dense multi-paper science debates
- anything needing tiny table text
- allegations that need legal nuance on every slide
- stories where the joke only works in voiceover timing

## Instagram: gold-standard evidence carousel

Format: `ig_carousel`  
Canvas: `1080x1350`, `4:5`  
Default length: 6 slides, 5 if simple, 7 if the receipt needs one more beat  
Voice: same Liz voice as the videos; funny, talky, fair, not corporate  
Visuals: polished navy/parchment/orange system, real receipts in clean cards

Slide map:

1. Hook: <= 10 words. Name the buyer problem or contradiction.
2. Swipe reason: the market mistake or missing check.
3. The check: one useful question the buyer can use.
4. Receipt/example: screenshot, label, app screen, paper, or simple number.
5. Meaning: what this does and does not prove.
6. Behaviour/CTA: what to paste, check, save, or comment.

Optional slide 7: fairness caveat or second receipt if the topic is sensitive.

Cover rules:

- No logo-first openings.
- No vague outrage.
- No "supplements are bad" framing.
- Use the strongest plain-language contrast:
  - "Clinically studied ingredient. Not proven product."
  - "Third-party tested. But what was tested?"
  - "The claim is bigger than the study."
  - "Search gives options. Evidence checks claims."

Slide 2 rules:

- Slide 2 earns the swipe. It should say the thing the viewer did not know
  they needed to check.
- Good shapes:
  - "The study may not match the dose."
  - "The paper may test a different outcome."
  - "The badge may not show public results."
  - "The app checks product + dose + claim."

CTA rules:

- For trust/save posts: "Save this before your next supplement shop."
- For conversion posts: "Paste the product, URL, or claim into De-Influenced
  before you buy."
- For comment-led posts: ask one useful question, not engagement bait.

## TikTok: proof carousel / Photo Mode

Format: `tiktok_carousel`  
Canvas: `1080x1920`, `9:16`  
Default length: 5-8 slides  
Voice: direct, mate-who-did-the-homework, very plain  
Visuals: screenshots/images behind, dark readable overlay, one text idea

TikTok carousels are not mini Instagram decks. They should look easier, faster,
and less designed:

- use a real search wall, product page, label, app screen, or simple image
  behind the text when available
- one short headline per slide
- body copy is optional and short
- no tiny citations in the main reading area
- no decorative charts unless the chart is the receipt
- no dense side-by-side comparison unless both sides are readable on a phone

Slide map:

1. Hook image: name the pain in plain language.
2. One check: the exact thing to inspect.
3. Proof: screenshot/card showing why it matters.
4. Translation: what this means in buyer language.
5. Behaviour: paste/check before buying.
6-8. Optional extra receipt, caveat, or comment prompt.

Good TikTok carousel hooks:

- "Menopause supplements are hard to compare."
- "Check this before you buy collagen."
- "Third-party tested sounds reassuring."
- "The front label is not the evidence."
- "PubMed links can be wallpaper."

## Two reusable route variants

### Variant A: Claim check carousel

Use when there is a product claim, label line, ad line, or search result claim.

1. Hook: "The claim is bigger than the study."
2. Mistake: "A study on an ingredient is not proof of this exact product."
3. Check: "Match product + dose + audience + outcome."
4. Receipt: real crop or cited summary.
5. Meaning: fair conclusion, no overclaim.
6. CTA: "Paste the claim before you buy."

### Variant B: App resolver carousel

Use when the source is buyer pain, not a named villain.

1. Pain: "Search gives options."
2. Problem: "Options are not evidence."
3. Check: "Product + dose + claim."
4. App: De-Influenced performs the check.
5. Behaviour: "Paste the product, URL, or claim."
6. CTA: "First analysis free."

## Writer contract

For `ig_carousel` and `tiktok_carousel`, writers must return one section per
slide. The first line of each section is the headline; optional body copy comes
after a line break. Evidence/source cues go in `visualNote` as `source: ...`.

No voice recording is needed. No image generation is needed unless a route
explicitly asks for optional background plates. Real screenshots and app
screens should be supplied or attached; never invented.

## Production contract

Newsroom renders final PNG slides deterministically:

- `ig_carousel` -> polished `4:5` deck
- `tiktok_carousel` -> simple `9:16` proof deck
- each deck gets a contact sheet for Gate 2 review
- Telegram delivery sends the PNG slide set and caption package

Review the deck on a phone-sized preview before approving Gate 2. The first
slide must be readable at arm's length, and slide 2 must create the reason to
swipe.
