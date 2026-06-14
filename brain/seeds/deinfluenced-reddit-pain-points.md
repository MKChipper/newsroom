# De-Influenced Reddit pain-point intelligence

Save into the brain as slug `deinfluenced-reddit-pain-points`, kind `audience`.

This seed tells the story desk how to use Reddit/comment intelligence for De-Influenced. Its job is not to create broad supplement-industry summaries. Its job is to find the consumer problem behind the comment, then turn that into a post angle that points back to the app behaviour: **check the claim before you buy the supplement**.

## Prime directive: Reddit is signal, not subject

Do not make posts about Reddit comments. Use Reddit comments to discover what
buyers are stuck on, what language they use, and where the app can help.

The post should normally be about one of these:

- the pain point the comments reveal
- the buyer behaviour De-Influenced wants to teach
- the label, claim, evidence, dose, COA, or product-page receipt that solves
  the confusion
- the app workflow that turns confusion into a checkable answer

Reddit can be mentioned lightly as the discovery source, e.g. "women keep
asking..." or "this question keeps coming up", but the post must not become
"here are Reddit comments about supplements."

Examples:

- If many comments say menopause supplements are confusing, the post is not
  "Reddit is confused about menopause supplements." The post is: "You should
  not have to decode menopause supplement claims while you are already
  exhausted," then show how to check the claim before buying.
- If many comments ask whether a label is trustworthy, the post is not "people
  are talking about labels." The post is: "How to read a supplement label when
  the front sounds scientific," then teach the label-reading behaviour: claim,
  ingredient form, dose, study fit, testing proof.
- If many comments ask "has anyone tried this?", the post is not an anecdote
  roundup. The post is: "If your research starts with stranger anecdotes, the
  product has already put you in the trust gap."

## Active source set

Weekly Reddit/comment monitoring should focus on these three high-volume communities for now:

1. `r/Menopause` — priority audience; emotional decision fatigue, vulnerability, symptom-driven purchase pressure.
2. `r/Perimenopause` — priority audience; uncertainty, trial-and-error, “what is happening to me?” and “what should I try?” language.
3. `r/Supplements` — evidence/testing/dose/COA/product-specific trust language.

Do not expand into more subreddits until these three stop producing useful signals. Extra subreddits add noise before they add insight.

Optional/later sources: Mumsnet menopause boards, Menopause Matters, HealthUnlocked menopause communities, Trustpilot reviews for supplement brands. HealthUnlocked health-related content should be paraphrased rather than quoted verbatim.

## Current data baseline

From the 2026-06-13 Apify Reddit comment scrape:

| Source | Raw items | Pain-point matches | Role |
|---|---:|---:|---|
| r/Menopause | 1,366 | 485 | priority audience language |
| r/Perimenopause | 1,018 | 292 | priority audience uncertainty language |
| r/Supplements | 1,017 | 185 | evidence/testing/product trust language |
| **Total** | **3,401** | **962** | enough for hook mining and weekly ideation |

Local source files live under:

- `/Users/lizw/de-influenced-studio/reddit-intel/`
- report: `/Users/lizw/de-influenced-studio/reddit-intel/reports/2026-06-13-reddit-comment-brain.md`
- raw signals: `/Users/lizw/de-influenced-studio/reddit-intel/raw/2026-06-13-141130-pain-point-signals.json`

## Core interpretation rule

Do not report “people are talking about collagen/magnesium/HRT/supplements.” Translate the source into the consumer problem.

Bad:

> People are discussing brain fog supplements.

Good:

> Women with brain fog are exhausted from trial and error, and supplement marketing offers certainty they cannot easily verify.

Bad:

> People are discussing third-party testing.

Good:

> Buyers want testing reassurance, but they do not know whether the badge, COA, batch, or lab result actually proves the product in their basket is clean.

Use this hierarchy:

1. Consumer pain point
2. Emotional trigger
3. Buyer moment
4. De-Influenced app angle
5. Post hook
6. Evidence/receipt/source
7. Product/theme/brand

## Main pain-point clusters

### 1. “I’m exhausted from guessing”

Audience: menopause/perimenopause.

Consumer problem: women are already dealing with hot flushes, sleep disruption, weight change, brain fog, mood shifts, work pressure and medical uncertainty. Supplement marketing adds another thing to decode.

Language signals:

- “trial and error”
- “trying to claw our way back”
- “completely depleted”
- “ill-equipped to navigate”
- “brain fog”
- “night sweats”
- “weight gain”

De-Influenced angle:

> You should not have to become a supplement researcher while you are already exhausted.

Good routes from `posting-formats`:

- `app resolver reel`
- `informational HyperFrames video`
- `performance hook plus receipts` if Liz can use a self-shot opener
- serious Reel/TikTok talking head

Avoid: mocking the buyer, implying menopause symptoms are not real, or making the post anti-HRT/anti-treatment.

### 2. “I can’t tell if the evidence applies to this exact product”

Audience: all supplement buyers; very strong app fit.

Consumer problem: people see studies, doses, ingredients and “clinically proven” language, but cannot tell whether the evidence maps to the actual product, dose, audience or claim.

Language signals:

- dose / dosage
- study / studies / research / evidence
- ingredient
- clinically proven / clinical
- underdosed
- proprietary blend / blend
- “no studies to actually back it up”

De-Influenced angle:

> Ingredient evidence is not product proof.

Good routes from `posting-formats`:

- `ingredient explainer carousel`
- `claim-vs-paper video`
- `dose-gap product audit`
- `study context video`

### 3. “I don’t know what’s actually in it or whether it’s safe”

Audience: all supplement buyers.

Consumer problem: testing language reassures people, but COAs, third-party testing, batch testing and certification claims are hard for normal buyers to interpret.

Language signals:

- COA / certificate of analysis
- third-party tested
- lab report
- heavy metals
- lead / cadmium / arsenic / mercury
- NSF / USP / GMP
- recall / contamination / purity

Useful consumer language from the scrape:

> “Looks like it's more important than ever to get your COAs for supplements you buy.”

> “A CoA posted on the seller's website is not even worth the paper it's printed on…”

> “There is nothing stopping the seller from sending a real high quality sample for testing and then selling you bunk stuff.”

De-Influenced angle:

> Testing claims need context: who tested, what batch, what result, and can the buyer see it?

Good routes from `posting-formats`:

- `screenshot-stitch satire` if there is a named product/testing receipt
- `industry news brief` if the story is testing/regulatory news
- `ingredient explainer carousel`
- `informational HyperFrames video`

### 4. “Has anyone tried this?” / “Is it worth it?”

Audience: all supplement buyers; very useful for Instagram commenting and Facebook groups.

Consumer problem: buyers ask strangers for anecdotes because the market has not given them trustworthy, product-specific evidence.

Language signals:

- “has anyone tried”
- “worth it”
- “did it actually help”
- “confused”
- “what to believe”
- TikTok / Instagram / influencer

De-Influenced angle:

> If your research starts with stranger anecdotes, you are in the trust gap. Check the claim before you buy.

Good routes from `posting-formats`:

- short HyperFrames text video
- Instagram comment-bank response
- Facebook group reply draft
- low-friction Reel/TikTok talking head

### 5. “I bought the expensive thing and couldn’t tell if it worked”

Audience: all supplement buyers; high emotional value.

Consumer problem: people keep buying because the outcome is vague and the claim is hard to test personally.

Language signals:

- expensive / overpriced
- waste of money
- did nothing / didn’t work / no difference
- “why I dropped it” tracking
- scam / snake oil (do not use “scam” publicly unless legally safe)

De-Influenced angle:

> The most expensive supplement is the one you keep buying because you are not sure if it is working.

Good routes from `posting-formats`:

- `informational HyperFrames video`
- `ingredient explainer carousel`
- `dose-gap product audit` when a specific product is named

### 6. “Menopause marketing knows when I’m vulnerable”

Audience: menopause/perimenopause.

Consumer problem: symptom desperation makes broad “calm/sleep/weight/hormone balance” bundles feel more compelling than the evidence may justify.

De-Influenced angle:

> The customer is not gullible. The marketing is arriving at an emotionally loaded moment.

Good routes:

- serious/personal Reel
- performance hook plus receipts
- carousel if the post compares claim wording to evidence

Avoid: shaming women for wanting relief. Criticise the marketing gap, not the desire for help.

## Hook bank

Use these as starting points. Adapt them to the exact source/receipt and do not overuse them unchanged.

### Menopause/perimenopause hooks

- “You’re already exhausted. You shouldn’t also have to decode supplement marketing.”
- “Perimenopause is already trial and error. Your supplements shouldn’t be another blind experiment.”
- “Brain fog is real. That doesn’t mean every brain-fog supplement has real evidence.”
- “When you’re desperate for sleep, ‘natural’ can sound like proof. It isn’t.”
- “The problem isn’t that women don’t research menopause products. It’s that the marketing makes weak evidence look certain.”
- “If a menopause supplement promises clarity, sleep, calm and weight support all at once, check the claim before you believe the bundle.”
- “Menopause makes you vulnerable. Some supplement ads are built for that exact moment.”

### General supplement hooks

- “Clinically studied ingredient. Not clinically proven product. Big difference.”
- “A study on an ingredient is not proof that the supplement in your basket works.”
- “If the dose is hidden in a blend, what exactly are you paying for?”
- “Third-party tested sounds reassuring. Until you ask: tested by who, for what, and where are the results?”
- “A lab report is not a vibe. If a brand mentions testing, ask to see the evidence.”
- “A COA can prove a batch was tested. It doesn’t automatically prove the bottle in your basket is clean.”
- “If your research starts with ‘has anyone tried this?’, you’re already in the trust gap.”
- “The most expensive supplement is the one you keep buying because you’re not sure if it’s working.”
- “A supplement label is a promise. The evidence is the receipt.”
- “‘Worth it?’ is the question brands hope you ask other customers instead of asking for evidence.”
- “Instagram made it look clean. Reddit found the lab-report questions.”
- “If a brand needs a badge, a buzzword and a blend to explain why it works, slow down.”

## Mapping pain points to posting formats

Use `posting-formats` to choose the route.

| Pain point | Best route | Why |
|---|---|---|
| exhausted from guessing | `app resolver reel`, `informational HyperFrames video`, or `performance hook plus receipts` | human pain first; show the app reducing the decision burden |
| ingredient evidence vs product proof | `ingredient explainer carousel`, `claim-vs-paper video`, `dose-gap product audit` | needs step-by-step evidence fit |
| COA/testing uncertainty | `screenshot-stitch satire` if a named receipt exists; otherwise serious explainer | receipt-led trust issue |
| “has anyone tried this?” | `app resolver reel`, short HyperFrames video, Instagram comment-bank, FB reply | trust-gap language is simple and reusable |
| expensive / did nothing | HyperFrames text video or product audit | emotional but needs care to avoid overclaiming |
| menopause vulnerability | `app resolver reel`, serious Reel, or performance hook plus receipts | must be warm, buyer-sided, and app-relevant |

## First production batch recommendation

Prioritise these five because they are app-relevant and reusable:

1. **Clinically studied ingredient. Not clinically proven product. Big difference.**  
   Route: `ingredient explainer carousel`.  
   CTA: “Paste the product or claim into De-Influenced. Your first analysis is free.”

2. **You’re already exhausted. You shouldn’t also have to decode supplement marketing.**  
   Route: `app resolver reel`.  
   CTA: “Before you buy the next menopause supplement, check the claim.”

3. **Third-party tested sounds reassuring. Until you ask: tested by who, for what, and where are the results?**  
   Route: `informational HyperFrames video` or `screenshot-stitch satire` if a named product receipt is available.

4. **If your research starts with ‘has anyone tried this?’, you’re already in the trust gap.**  
   Route: short video plus Instagram comment-bank.

5. **The most expensive supplement is the one you keep buying because you’re not sure if it’s working.**  
   Route: short video or carousel.

## Instagram comment-bank patterns

Use these under adjacent wellness-scepticism, supplement critique, menopause claim, or influencer-hype posts. Do not spam “use our app”; be useful first and let the profile do the conversion.

### Clinically studied wording

> The awkward bit is that “clinically studied” often means an ingredient has been studied somewhere — not that this exact product, dose, or audience was properly tested. That gap is where a lot of supplement marketing lives.

### Has anyone tried this?

> I always think “has anyone tried this?” is the trust gap showing. If the claim was clear and product-specific, people wouldn’t have to rely so heavily on stranger anecdotes before buying.

### Testing / COA

> “Third-party tested” sounds reassuring, but the useful questions are: who tested it, what batch, what did they test for, and can customers actually see the result?

### Menopause vulnerability

> Menopause marketing is tricky because the symptoms are real and people are genuinely desperate for relief. That’s exactly why the evidence standard should be higher, not fuzzier.

## Facebook group reply patterns

Use only where helpful; avoid direct promotion unless invited.

### Product/claim question

> One thing I’d check before buying is whether the claim is about the actual product or just one ingredient inside it. Brands often lean on ingredient studies even when the final product/dose hasn’t been tested for the thing being promised.

### Menopause supplement question

> I’d separate two things: the symptom being real, and the supplement’s claim being proven. A lot of menopause products blur those together — they talk to a very real problem, but the evidence may only support a much narrower claim.

### Testing question

> If testing is part of the sales pitch, I’d want to know whether there’s a public COA/assay, which batch it covers, and whether it tested for actives, contaminants, or both.

## App CTA rules

Current offer: first analysis is free.

Good CTAs:

- “Check the claim before you buy.”
- “Paste the product or claim into De-Influenced.”
- “Your first analysis is free.”
- “Ignore the ad. Check the claim.”

Avoid stale offer language such as “3 free reports” unless the product actually offers that again.

## Legal / tone guardrails

Follow `legal-phrasing` and `voice-corpus`.

- Mock the marketing move, not the buyer.
- Do not call named brands scams unless a regulator/court finding supports the specific language.
- Named product claims need receipts.
- If there is no named product receipt, keep the post general and consumer-protective.
- No medical advice. Do not tell people to start/stop HRT, supplements, medications, or treatment.
- For menopause content, acknowledge the real symptom burden before critiquing the marketing.

## What to avoid

- Broad “supplement industry bad” essays.
- Turning Reddit into a trend report without a buyer pain point.
- Over-routing everything into satire.
- Decorative AI images where receipts/screenshots would be more trustworthy.
- Expanding the scrape to too many communities before these three are fully exploited.
- Hooks that do not connect back to the app behaviour.

## Integration note

When Newsroom ingests a Reddit-derived idea, store it as a content opportunity with:

- source: `reddit-pain-point`
- subreddit/source URL
- pain point
- consumer language
- emotional trigger
- buyer moment
- app angle
- educational behaviour to teach, e.g. label reading, dose checking, claim vs
  study fit, COA interpretation, product page evidence audit
- proposed hook
- route from `posting-formats`
- asset needs: `agent_can_create`, `needs_liz_assets`, or `mixed`
- CTA
- status

A useful idea is not “a topic people mentioned.” A useful idea is a buyer problem that De-Influenced can help resolve.
