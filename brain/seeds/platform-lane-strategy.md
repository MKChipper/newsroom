# Platform lane strategy and gold-standard formats

Save into the brain as slug `platform-lane-strategy`, kind `formats`.

This is the practical operating layer for Newsroom. It exists to stop every
idea becoming a five-hour edit. For each idea, the story desk must first choose
the cheapest valid production shape, then only escalate to heavier formats when
the evidence or platform job justifies it.

## Current two-week TikTok lane

For the next two weeks, TikTok should stay in one recognisable lane:

> Menopause and supplement claims are confusing, so here is one thing to check
> before you buy.

The subject can vary: menopause, sleep, magnesium, collagen, testing, COAs,
PubMed links, blends, labels, app examples. The method must not vary: identify
one buyer confusion, show one check, land one useful takeaway.

TikTok should not try to be the full investigation, the full carousel, and the
full brand argument in one post. TikTok earns attention by being repeatable and
easy to understand.

## Default routing rule

When a new idea enters from Reddit, a product receipt, industry news, or Liz's
own observation, route it in this order:

1. Can this become a fast TikTok lane check?
2. Is this an app resolver reel: pain point -> proof -> app checks it?
3. Does Instagram need a more saveable explainer from the same insight?
4. Is there a named product receipt strong enough for a satire/receipt audit?
5. Is this important enough to become a hero edit?

Do not start from "what is the most impressive asset?" Start from "what is the
lightest post that serves the audience and the app behaviour?"

## Production tiers

### Tier 1: Fast TikTok lane check

Use when:

- the idea is a buyer pain point
- the answer can be one practical check
- no named product receipt is required
- the goal is consistency, reach, and getting unstuck

Production burden:

- 20-45 seconds
- one spoken point
- no full stitch edit
- no generated decorative imagery
- one simple visual: app screen, label screenshot, text card, product page crop,
  or Liz talking to camera

Asset strategy:

- Prefer `informational_only`, `agent_can_create`, or `mixed`.
- Ask Liz only for a screenshot if the exact product/app/label needs to be
  visible.

Default structure:

1. Hook: name the pain point.
2. Check: show the one thing to inspect.
3. Why it matters: explain the evidence gap plainly.
4. App behaviour: "check the claim before you buy."

Gold-standard example:

- Pain signal: women feel overwhelmed by menopause supplements and conflicting
  claims.
- Post type: TikTok fast lane check.
- Hook: "If menopause supplements feel impossible to compare, check this bit
  first."
- Body: pick one example such as dose, ingredient form, study fit, or testing
  proof. Do not try to teach all four.
- Visual: Liz to camera or app screen. Optional label crop.
- CTA: "Check the claim before you buy. Your first analysis is free."

### Tier 2: Instagram saveable explainer

Use when:

- the idea needs a little more context
- the audience would save or share the explanation
- the post teaches a repeatable buyer behaviour
- the topic is useful even without a named villain

Production burden:

- carousel or HyperFrames explainer
- 5-7 slides or 25-45 seconds
- one idea per slide/beat
- polished, readable, on-brand

Asset strategy:

- Use charts, text, app screens, clean evidence crops, or simple motion.
- Generated images are allowed only when they clarify a concept. They must not
  pretend to be evidence.

Default structure:

1. Slide/beat 1: the buyer problem.
2. Slide/beat 2: the mistake the market encourages.
3. Slide/beat 3: the check.
4. Slide/beat 4: example or receipt.
5. Slide/beat 5: takeaway.
6. Final: app CTA or comment question.

Gold-standard example:

- Pain signal: "clinically studied" language makes people think a product is
  proven.
- Post type: Instagram saveable explainer.
- Hook: "Clinically studied ingredient. Not clinically proven product."
- Body: explain the gap between ingredient evidence, dose, audience, outcome,
  and the exact product claim.
- Visual: simple ladder or checklist: ingredient -> dose -> audience -> outcome
  -> product.
- CTA: "Paste the claim into De-Influenced before you buy."

### Tier 2B: Dominant carousel deck

Use when:

- the idea is best understood by swiping through receipts
- the post teaches one repeatable buyer check
- the topic is useful enough to save or share
- the production should stay lower-friction than a full receipt video

Default Instagram version:

- Platform: Instagram
- Format: `ig_carousel`
- Post type: `gold-standard evidence carousel`
- Canvas: 1080x1350, 4:5
- Length: 5-7 slides
- Structure: buyer pain -> market mistake -> one check -> receipt/example ->
  meaning -> behaviour/CTA
- Visual: polished navy/parchment/orange system, real receipts in clean cards

Default TikTok version:

- Platform: TikTok
- Format: `tiktok_carousel`
- Post type: `TikTok proof carousel`
- Canvas: 1080x1920, 9:16
- Length: 5-8 slides
- Structure: hook image -> one check -> proof screenshot/card -> what it means
  -> what to paste/check before buying
- Visual: simpler, screenshot/image-backed, dark readable overlay, one short
  text idea per slide

Escalation rule:

Do not make the TikTok proof carousel as polished or dense as Instagram. If the
receipt needs dense context, make TikTok a fast lane check and send the fuller
saveable deck to Instagram.

### Tier 2A: App resolver reel

Use when:

- the idea comes from a buyer pain point rather than a single named product
- the pain is decision burden: too many claims, too many products, unclear
  evidence, "has anyone tried this?", labels, testing badges, or search results
- the app can visibly reduce the work with one check
- the CTA is a natural behaviour, not a forced brand line

Production burden:

- 25-40 seconds
- real screenshot/search wall/product page/app recording
- simple HyperFrames motion
- one method card
- app screen before the CTA

Default structure:

1. Pain: name the state the buyer is in.
2. Proof: show the messy environment.
3. Reframe: promises are not evidence.
4. Method: product + dose + claim, or the equivalent check.
5. App resolver: De-Influenced performs the check.
6. CTA: paste/check before buying.

Gold-standard example:

- Pain signal: "I am exhausted from guessing" in menopause/perimenopause.
- Post type: app resolver reel.
- Hook: "You're already exhausted."
- Proof: menopause supplement search wall.
- App job: De-Influenced checks product + dose + claim.
- Visual: real search wall + real app screen recording + branded CTA card.
- CTA: "Paste the product, URL, or claim in before you buy."

Route label:

- `app resolver reel`

Asset strategy:

- Usually `mixed`.
- Ask Liz for the exact app recording or real screenshot if the proof depends
  on reality.
- The agent may create branded cards, crops, highlights, captions, review
  stills, and the final HyperFrames assembly.

### Tier 3: Satirical receipt audit

Use when:

- a named product makes a claim the receipts can test
- the product page, label, study, PubMed link, price, or dose does the joke
- the mismatch is specific and visible
- screenshots are central to credibility

Production burden:

- higher effort
- screenshot-stitch or receipt-led video
- VO with dry, buyer-sided humour
- no generic generated imagery

Asset strategy:

- Route as `needs_liz_assets` or `mixed`.
- Ask for product page screenshots, claim crops, PubMed/link screenshots,
  label screenshots, price crops, or app results.
- The agent may capture URLs if available, but it must not replace receipts
  with invented visuals.

Default structure:

1. Claim on screen.
2. Linked evidence or receipt.
3. The mismatch: dose, population, outcome, product specificity, or claim.
4. Deadpan line that sits directly on the receipt.
5. Fair conclusion.

Gold-standard example:

- Pain signal: a product links to PubMed papers that do not support the claim
  being made.
- Post type: satirical screenshot-stitch.
- Hook: "I read the studies they linked. Bold choice."
- Body: show the claim, show the linked paper, explain the mismatch, then land
  the joke on the evidence.
- Visual: real product page, real PubMed page, real annotation.
- CTA: "Ignore the science wallpaper. Check the claim."

### Tier 4: Hero evidence edit

Use sparingly when:

- the story has unusually strong receipts
- it is likely to become a flagship post
- the subject deserves extra craft because it proves the De-Influenced method
- Liz has the energy/assets to make it properly

Production burden:

- highest effort
- may include stitched screenshots, VO, on-camera opening, captions, app screen,
  and multiple evidence beats
- should not be the default route

Escalation rule:

Only choose this tier if a Tier 1 or Tier 2 version would undersell the receipt.
The app should explicitly tell Liz why the heavier edit is worth it.

## Platform split

The same insight can become TikTok and Instagram content, but the posts should
not be identical.

TikTok:

- one lane for two weeks
- one pain point
- one check
- repeatable opening and structure
- conversational, fast, useful
- judge over days, not immediately

Instagram:

- more saveable and informed
- more context
- better for carousels, HyperFrames explainers, and receipt audits
- can combine serious and semi-satirical formats
- visual polish matters, but the words should still sound like Liz

## How Reddit intelligence should feed this

Reddit is signal, not subject.

When Reddit shows repeated pain about menopause supplements, labels, "has anyone
tried this?", testing, COAs, dose confusion, or expensive products, do not make
the post about Reddit. Turn it into one of these:

- a fast TikTok check
- an Instagram saveable explainer
- a product receipt audit if a named product/claim is available
- an app workflow demonstration

The first decision is always the production tier. The content angle comes after
the tier is chosen.

## Story desk instruction

For every candidate story, include at least one low-friction route unless the
story is legally or evidentially impossible without receipts.

Each route should state:

- tier: 1, 2, 3, or 4
- platform
- post type
- why this format fits
- what Liz must provide
- what the agent can create
- what the first hook could be
- whether it belongs in the current two-week TikTok lane

If the story desk proposes a high-effort route, it must also explain why the
idea should not be a Tier 1 or Tier 2 post instead.

## Starting batch

Start with these before inventing new themes:

1. TikTok fast lane check: "If menopause supplements feel impossible to compare,
   check this bit first."
2. Instagram saveable explainer: "Clinically studied ingredient. Not clinically
   proven product."
3. TikTok fast lane check: "Third-party tested sounds reassuring. Ask these
   three questions."
4. Instagram carousel: "How to read a supplement label when the front sounds
   scientific."
5. App resolver reel: "Search gives options. De-Influenced checks claims."
6. Satirical receipt audit: use the next named product where the PubMed links,
   dose, population, or claim mismatch is visible on screen.

The operating goal is momentum: publish several Tier 1 and Tier 2 posts for
every Tier 3 or Tier 4 post.
