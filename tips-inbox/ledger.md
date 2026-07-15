# Industry-scan ledger

State file for the `weekly-industry-scan` scheduled task. The scan reads this
file first on every run: `last_run` bounds the search window, and the signal
log below is the dedup memory — a signal already listed here must NOT be
surfaced again unless there is a genuinely new development (new ruling, new
data, new brand response), in which case it is filed as a follow-up and marked
as such.

Format rules (machine-read, keep exact):
- `last_run:` line holds the ISO date of the most recent completed scan.
- One signal per line: `- YYYY-MM-DD | slug | primary-url | one-line summary`
- Never delete lines. Append only. Lines older than 120 days may be pruned by
  the scan to keep the file small.

last_run: 2026-07-15

## Surfaced signals

- 2026-07-15 | cap-hair-loss-no-evidence-shedding | https://www.asa.org.uk/news/keep-your-ads-a-cut-above-the-rest-advertising-products-and-services-for-hair-loss.html | CAP guidance (9 Jul) states neither ASA nor CAP have seen evidence any product can treat chronic telogen effluvium (hair shedding); lists five recurring evidence failures. FILED.
- 2026-07-15 | asa-kind-patches-glp1-patch | https://www.asa.org.uk/rulings/kind-patches-ltd-a26-1333913-kind-patches-ltd.html | ASA upheld 2 issues: "GLP-1 Patch" supplement ruled medicinal by presentation without authorisation, and ad targeting breastfeeding mothers ruled irresponsible/harmful gender stereotype. Second upheld ruling since 4 Feb 2026. FILED.
- 2026-07-15 | elysium-basis-menopause-pilot | https://nutraceuticalbusinessreview.com/elysium-health-basis-reduced-menopause-symptoms-oestrogen | Elysium Basis "50%+ reduction in hot flushes/bloating/poor sleep in 7 days" rests on open-label pilot, n=40 (32 symptomatic), no placebo arm, co-authored by company's VP Scientific Affairs. FILED.
- 2026-07-15 | perimenopause-uncertainty-no-biomarker | https://www.news-medical.net/news/20260715/Lack-of-awareness-and-healthcare-barriers-fuel-perimenopause-uncertainty.aspx | Menopause journal study, 7,600+ US women 35+: 34% unsure of reproductive stage (42% at ages 40-44); no biomarker exists to confirm perimenopause. FILED.
- 2026-07-15 | nourished-creatine-gummies-efsa | https://www.nutraingredients.com/Article/2026/07/10/nourisheds-creatine-range-targets-muscle-and-mind/ | Nourished launches creatine gummies £17.99/90 gummies (30-day supply), 1 g per gummy, with cognition SKU — against EFSA's Dec 2024 rejection of the creatine cognition claim. FILED.
- 2026-07-15 | asa-morrisons-clinic-pom | https://www.asa.org.uk/rulings/phlo-technologies-ltd-a26-1328311-phlo-technologies-ltd.html | ASA upheld: Morrisons Clinic/Phlo Facebook ad (£79/mo vs "market average £103") promoted POMs to public via landing pages naming Mounjaro and Wegovy. 8th related ruling since Jul 2025. FILED.
- 2026-07-15 | collagen-rct-29-men | https://www.nutraingredients.com/Article/2026/07/08/collagen-peptide-supplements-may-boost-resistance-training-response-rct/ | Frontiers in Physiology RCT: 29 healthy men, 15 g/day collagen peptide, 12 weeks resistance training, muscle-biopsy endpoint — category marketed to women at 2.5-10 g/day. FILED.
- 2026-07-15 | akkermansia-rct-glp1-extension | https://www.nutraingredients.com/Article/2026/07/09/pasteurized-akkermansia-muciniphila-may-help-maintain-weight-loss-after-dieting/ | Nature Medicine RCT n=90 (80 completed): 1.2 kg regain vs 3.2 kg placebo over 24 weeks. Primary endpoint evidenced; the marketed post-GLP-1 use is not yet studied. FILED.
- 2026-07-15 | eggshell-ovomet-43-claims | https://www.nutraingredients.com/Article/2026/07/13/can-an-eggshell-based-ingredient-bolster-nearly-four-dozen-structure-function-claims/ | Ovomet/Ovoderm: compositionally identical ingredients sold under two names, 43+ structure-function claims on 16 studies; skin RCT n=100 women 25-60, 600 mg/day, 12 weeks.
- 2026-07-15 | beneo-fibre-dose-gap | https://nutraceuticalbusinessreview.com/fibermaxxing-2-0-shifts-the-focus-from-quantity-to | BENEO copy: chicory root fibre supports on-pack gut claims at 0.75 g/serving while stating proven prebiotic effect from 3 g/day — a 4x gap inside one document. Grade C supplier copy.
- 2026-07-15 | cap-hangover-brand-name-claim | https://www.asa.org.uk/news/wishful-drinking-hangover-cures-and-the-code.html | CAP guidance: hangovers are adverse medical conditions; brand names and hashtags count as medicinal claims. ASA ruled "Hangcure" was itself a prohibited claim.
- 2026-07-15 | probiotic-phytonutrient-zonulin | https://www.nutraingredients.com/Article/2026/07/09/probioticphytonutrient-blends-may-improve-gut-function/ | Nutrients RCT n=60 (20/arm), 8 weeks: SCFAs up, zonulin only "slightly reduced" and mainly in higher-BMI subgroup; all endpoints surrogate markers in healthy adults.
- 2026-07-15 | acp-supplement-regulation-paper | https://news.bloomberglaw.com/health-law-and-business/physicians-press-fda-for-stronger-dietary-supplements-regulation | ACP position paper in Annals of Internal Medicine (doi 10.7326/ANNALS-26-01119) urges FDA overhaul; cites as many as 100,000 supplement products. US-only.
- 2026-07-15 | probiotic-uv-skin-mouse | https://www.nutraingredients.com/Article/2026/07/14/can-probiotics-protect-against-uv-induced-skin-aging-through-the-gut-skin-axis/ | AceBiome-run study of own strain ABF21013 in cells and UVB-irradiated hairless mice, 12 weeks; article states human clinical research still needed. Beauty-from-within claims on preclinical data.
- 2026-07-15 | eu-novel-food-937-days | https://www.nutraingredients.com/Article/2026/07/13/eu-novel-food-approval-delays-threaten-europes-food-innovation/ | EU novel food: ~300 applications 2018-2024, 937-day average to EFSA opinion, 2.7 information requests each, yet 86.8% receive a positive opinion.
- 2026-07-15 | studysetgo-trials-investors | https://www.nutraingredients.com/Article/2026/07/14/matchmaking-platform-connects-investors-with-nutrition-companies/ | UK platform matching investors to nutrition companies buying clinical trials; decentralised model targets 6-9 months vs 2-3 years. Context for the coming wave of "clinically studied" badges.
- 2026-07-15 | ehpm-summit-eu-max-levels | https://www.nutraingredients.com/Article/2026/07/09/all-change-regulatory-updates-from-the-ehpms-food-supplement-summit/ | EHPM summit: EU Maximum Permitted Levels consultation Q3 2026, draft Q1 2028; PA limits 400 ppb rising to 700/1,000 ug/kg; EHPM influencer guidance warns against guaranteeing efficacy.
- 2026-07-15 | solabia-mibelle-beauty-skus | https://www.nutraingredients.com/Article/2026/07/14/solabia-completes-mibelle-biochemistry-takeover/ | Solabia closes Mibelle Biochemistry takeover (value not stated); Euromonitor: 20% of newly launched supplement SKUs globally carried a beauty claim over the last two years.
- 2026-07-15 | dakg-biological-age-reversal | https://www.nutraingredients.com/Article/2026/07/13/science-shorts-spotlight-on-probiotic-phytonutrient-blend-dakg-iron-and-more/ | Aging Cell study of 84 supplements vs biological age: cross-sectional association significant, longitudinal analysis non-significant, but framed as "biological age reversal". Weak on window test — underlying coverage 1 Jul.
- 2026-07-15 | asa-organised-nutrition-informal | https://www.asa.org.uk/codes-and-rulings/rulings.html | ASA informally resolved case, Organised Nutrition Ltd, 1 complaint. No published detail. Logged only so a future scan can spot a pattern.

## Checked and rejected this run (do not re-surface without a new peg)

- dermatology-times-hair-growth-nutrafol | https://www.dermatologytimes.com/view/clinical-study-shows-positive-results-of-nutraceutical-supplement-to-promote-hair-growth | Metadata says 2026-07-15 but the article is from July 2022 (syndicated copy carries body dateline "July 15, 2022"). CMS artefact. If it recirculates as new, the four-year-old provenance is the story.
- fish-oil-alzheimers-trial | https://www.diabetes.co.uk/news/2026/jul/fish-oil-supplements-failed-to-protect-memory-in-alzheimers-risk-trial.html | 6 Jul 2026, two days out of window. n=365, aged 55-80, 2 years high-dose DHA; CSF DHA +17% at 6 months, no memory benefit vs placebo. Best evidence story in circulation — needs a fresh in-window peg.
- open-label-placebo-memory | https://www.diabetes.co.uk/news/2026/jul/placebo-pills-improved-memory-and-movement-even-when-people-knew-they-were-fake.html | 7 Jul 2026, one day out.
- asa-menopause-supplement-sweep | https://www.nutraingredients.com/Article/2026/03/26/asa-puts-menopause-claims-back-under-scrutiny-after-ai-review/ | 25-26 Mar 2026. Strongest story in the targeting beat but ~4 months old; a "still on the shelves?" follow-up needs fresh reporting.

