# Research — effective learning with interactive digital artifacts

Produced 2026-08-23 by a background research agent for the Plantifile spec revision (plan artifacts as teaching/learning experiences). Companion to `RESEARCH.md` (stack facts); this file covers learning science, accessibility, and engagement ethics.

Every claim is labeled:

- **[SOURCED]** — stated in the cited primary source (peer-reviewed paper, meta-analysis, standard, or official regulator/W3C document).
- **[INFERENCE]** — design reasoning that follows from sourced findings but was not itself tested.
- **[RECOMMENDATION]** — a product decision this note argues for; reasonable people could choose otherwise.

Effect sizes below are Cohen's d or Hedges' g on learning outcomes unless noted. Rule of thumb: 0.2 small, 0.5 medium, 0.8 large — but educational field studies rarely exceed 0.5, so treat ~0.4–0.5 from meta-analyses as strong.

---

## 1. Verified findings

### 1.1 Retrieval practice (the testing effect)

- **[SOURCED]** Practice testing beats restudying and all other comparison conditions for retention. Meta-analysis of 217 studies: g = 0.51 overall vs. all comparisons ([Adesope, Trevisan & Sundararajan 2017, *Rev. Educ. Res.* 87(3):659–701, doi:10.3102/0034654316689306](https://doi.org/10.3102/0034654316689306)).
- **[SOURCED]** Independent meta-analysis of 61 experiments converges: testing vs. restudy d ≈ 0.50; effect is *larger* at longer retention intervals (days/weeks) than minutes/hours ([Rowland 2014, *Psych. Bull.* 140(6):1432–1463, doi:10.1037/a0037559](https://doi.org/10.1037/a0037559)).
- **[SOURCED]** Feedback roughly doubles the testing benefit: tests with feedback d = 0.73 vs. 0.39 without (Rowland 2014, above).
- **[SOURCED]** Recall-format questions (free/cued recall) produce larger benefits than recognition-format (multiple choice), consistent with an effortful-processing account (Rowland 2014, above).
- **[SOURCED]** Even *failed* retrieval helps: asking questions before the learner has studied the material ("pretesting") improves later memory versus spending the same time studying, across 5 experiments ([Richland, Kornell & Kao 2009, *J. Exp. Psych.: Applied* 15(3):243–257, doi:10.1037/a0016496](https://doi.org/10.1037/a0016496)).
- **[SOURCED]** In a systematic 10-technique review, practice testing and distributed practice are the only two techniques rated "high utility"; highlighting, rereading, and summarization rate low ([Dunlosky et al. 2013, *Psych. Sci. Public Interest* 14(1):4–58, doi:10.1177/1529100612453266](https://doi.org/10.1177/1529100612453266)).

### 1.2 Spacing (distributed practice)

- **[SOURCED]** Spaced study beats massed study; meta-analysis of 839 assessments in 317 experiments. Optimal gap between study episodes scales with the desired retention interval — longer retention goals need longer gaps ([Cepeda, Pashler, Vul, Wixted & Rohrer 2006, *Psych. Bull.* 132(3):354–380, doi:10.1037/0033-2909.132.3.354](https://doi.org/10.1037/0033-2909.132.3.354)).

### 1.3 Worked examples & cognitive load

- **[SOURCED]** Cognitive load theory origin: problem solving by means–ends search imposes heavy load that competes with schema acquisition; reducing extraneous load improves learning ([Sweller 1988, *Cognitive Science* 12(2):257–285, doi:10.1207/s15516709cog1202_4](https://doi.org/10.1207/s15516709cog1202_4)).
- **[SOURCED]** Studying worked examples outperforms equivalent-time problem solving for novices (algebra; the original "worked example effect") ([Sweller & Cooper 1985, *Cognition and Instruction* 2(1):59–89, doi:10.1207/s1532690xci0201_3](https://doi.org/10.1207/s1532690xci0201_3)).
- **[SOURCED]** Modern meta-analysis (55 studies, 181 effects, mathematics): worked examples g = 0.48. Surprising moderator: pairing worked examples with self-explanation *prompts* produced lower performance than worked examples alone in this corpus ([Barbieri, Miller-Cotto, Clerjuste & Chawla 2023, *Educ. Psych. Rev.* 35:11, doi:10.1007/s10648-023-09745-1](https://doi.org/10.1007/s10648-023-09745-1)).
- **[SOURCED]** Yet inducing self-explanation is effective on average across domains (64 studies, g ≈ 0.55) ([Bisra, Liu, Nesbit, Salimi & Winne 2018, *Educ. Psych. Rev.* 30:703–725, doi:10.1007/s10648-018-9434-x](https://doi.org/10.1007/s10648-018-9434-x)). **[INFERENCE]** The Barbieri result is a time-cost/interference effect specific to stacking prompts on already-effective examples, not evidence self-explanation is harmful; treat "explain it yourself" and "here is a worked example" as alternative moves, not a mandatory pair.
- **[SOURCED]** Expertise reversal: instructional supports that help novices (worked examples, integrated guidance) become redundant and can *hurt* experienced learners; guidance should fade as knowledge grows ([Kalyuga, Ayres, Chandler & Sweller 2003, *Educational Psychologist* 38(1):23–31, doi:10.1207/S15326985EP3801_4](https://doi.org/10.1207/S15326985EP3801_4)).

### 1.4 Feedback

- **[SOURCED]** Feedback is powerful but heterogeneous, not uniformly good: across 607 effect sizes, average d = 0.41, yet **over one third of feedback interventions decreased performance** — especially feedback directing attention to the self (praise/ego) rather than the task ([Kluger & DeNisi 1996, *Psych. Bull.* 119(2):254–284, doi:10.1037/0033-2909.119.2.254](https://doi.org/10.1037/0033-2909.119.2.254)).
- **[SOURCED]** Updated meta-analysis (435 studies, 994 effects, N > 61,000): overall d = 0.48; impact rises with *information content* — high-information feedback (task, gap, next step) outperforms mere corrective feedback, which outperforms bare reinforcement/punishment ([Wisniewski, Zierer & Hattie 2020, *Front. Psychol.* 10:3087, doi:10.3389/fpsyg.2019.03087](https://doi.org/10.3389/fpsyg.2019.03087)). The framework of feed-up/feed-back/feed-forward at task, process, self-regulation levels: [Hattie & Timperley 2007, *Rev. Educ. Res.* 77(1):81–112, doi:10.3102/003465430298487](https://doi.org/10.3102/003465430298487).
- **[SOURCED]** In computer-based environments specifically: elaborated feedback (explanation) d = 0.49 vs. knowledge-of-correct-response 0.32 vs. bare right/wrong verification 0.05; elaboration matters most for higher-order outcomes ([Van der Kleij, Feskens & Eggen 2015, *Rev. Educ. Res.* 85(4):475–511, doi:10.3102/0034654314564881](https://doi.org/10.3102/0034654314564881)).

### 1.5 Multimedia & interaction design

- **[SOURCED]** Segmenting effect: people learn better when multimedia is presented in meaningful, coherent **learner-paced segments** rather than one continuous unit; meta-analysis of 56 investigations, small-to-medium effects on retention and transfer ([Rey et al. 2019, *Educ. Psych. Rev.* 31:389–419, doi:10.1007/s10648-018-9456-4](https://doi.org/10.1007/s10648-018-9456-4)).
- **[SOURCED]** Even a minimal "continue" click that lets learners pace segments improves transfer versus the identical continuous presentation ([Mayer & Chandler 2001, *J. Educ. Psych.* 93(2):390–397, doi:10.1037/0022-0663.93.2.390](https://psycnet.apa.org/doi/10.1037/0022-0663.93.2.390)).
- **[SOURCED]** Seductive details effect: interesting-but-irrelevant additions (decorative anecdotes, gratuitous graphics/animation) *reduce* retention (small–medium) and transfer (medium); meta-analysis ([Rey 2012, *Educ. Res. Rev.* 7(3):216–237, doi:10.1016/j.edurev.2012.05.003](https://doi.org/10.1016/j.edurev.2012.05.003)).
- **[SOURCED]** An overview-of-reviews of multimedia design principles (meta-meta-analysis) confirms the coherence/segmenting family of principles generalizes across media ([Noetel et al. 2022, *Rev. Educ. Res.* 92(3), doi:10.3102/00346543211052329](https://doi.org/10.3102/00346543211052329)).
- **[SOURCED]** Generative learning: activities that make the learner produce something — summarizing in their own words, mapping, drawing, self-testing, self-explaining, teaching — reliably outperform passive receipt across the eight strategies reviewed ([Fiorella & Mayer 2016, *Educ. Psych. Rev.* 28:717–741, doi:10.1007/s10648-015-9348-9](https://doi.org/10.1007/s10648-015-9348-9)).

### 1.6 Learner control

- **[SOURCED]** Giving learners control over sequence/pace/content in educational technology has a **near-zero average effect** on outcomes (g = 0.05, 18 studies, 29 effects) ([Karich, Burns & Maki 2014, *Rev. Educ. Res.* 84(3):392–410, doi:10.3102/0034654314526064](https://doi.org/10.3102/0034654314526064)).
- **[INFERENCE]** Reconciling 1.5 with 1.6: *pacing* control over pre-segmented, well-structured content helps (Rey 2019; Mayer & Chandler 2001); *navigational/curricular* control ("choose your own path") does not help on average and offloads sequencing decisions onto the person least equipped to make them. Give control of tempo, not of curriculum.

### 1.7 Gamification & extrinsic reward

- **[SOURCED]** Gamification meta-analysis: small positive effects on cognitive (g = 0.49), motivational (0.36), and behavioral (0.25) outcomes — but only the cognitive effect survives a high-rigor subsplit; motivational/behavioral effects are unstable ([Sailer & Homner 2020, *Educ. Psych. Rev.* 32:77–112, doi:10.1007/s10648-019-09498-w](https://doi.org/10.1007/s10648-019-09498-w)).
- **[SOURCED]** Longitudinal classroom experiment: badges + leaderboards + competition *decreased* intrinsic motivation, satisfaction, and empowerment over a semester, and lower intrinsic motivation mediated lower exam scores ([Hanus & Fox 2015, *Computers & Education* 80:152–161, doi:10.1016/j.compedu.2014.08.019](https://doi.org/10.1016/j.compedu.2014.08.019)).
- **[SOURCED]** Undermining effect: across 128 experiments, expected, tangible, engagement/completion/performance-contingent rewards significantly reduce free-choice intrinsic motivation; unexpected rewards and non-controlling verbal feedback do not ([Deci, Koestner & Ryan 1999, *Psych. Bull.* 125(6):627–668, doi:10.1037/0033-2909.125.6.627](https://doi.org/10.1037/0033-2909.125.6.627)).

---

## 2. Limitations and uncertainty

- Most retrieval/spacing/worked-example evidence comes from verbal recall and STEM problem-solving in lab or classroom settings, over minutes-to-weeks retention. Transfer to "an agent teaching a professional a plan/codebase" is **[INFERENCE]** — plausible (mechanisms are domain-general) but not directly measured.
- Meta-analytic means hide heterogeneity: Kluger & DeNisi's one-third-negative finding and Sailer & Homner's rigor subsplit both show that *implementation details determine sign*, not just magnitude. Any "X works, d = 0.5" claim in this note licenses a well-implemented X, not X-shaped decoration.
- The Barbieri 2023 self-explanation-prompt moderator conflicts in direction with Bisra 2018; the field has not resolved when prompts pay for their time cost. Treat prompt-stacking as unsettled.
- Learner-control research (Karich 2014) has few studies (18) and predates modern adaptive systems; the near-zero mean is a caution, not a prohibition.
- ADHD findings (§4) describe group-level tendencies with substantial within-group variance; none support inferring any individual user's diagnosis or needs from behavior. ADHD presentations differ (inattentive/hyperactive/combined) and co-occur with other conditions.
- No cited study evaluates AI-*authored* teaching material. Everything here is evidence about design features, applied by analogy. **[INFERENCE]** flag inherited by the whole spec.

---

## 3. Implications for Plantifile artifact design

These map findings onto an agent-authored, deterministic-to-lint, browser + plain-text plan grammar. All **[RECOMMENDATION]** unless cited.

1. **Question blocks, not quiz theater.** A first-class `question`/`check` block (prompt, expected answer, explanation) is the single highest-leverage teaching feature: retrieval practice with elaborated feedback is the best-evidenced combination in this note (Adesope 2017; Rowland 2014; Van der Kleij 2015). Answer + explanation must live *in the artifact* (agent-authored, reviewable), revealed on demand — not generated at render time — so lint stays deterministic and plain-text/agent readers see the same content.
2. **Prefer recall over recognition where format allows.** Free-response "explain/predict before revealing" beats multiple choice (Rowland 2014). In a static artifact this is a reveal/disclosure interaction, which degrades gracefully to a spoiler convention in plain text.
3. **Pretest hooks are cheap and safe.** A plan section may open with a prediction prompt ("Before reading: what breaks if X?") — beneficial even when the learner answers wrong (Richland 2009), and it is pure content, no runtime.
4. **Worked examples with fading.** For procedural content, the artifact should show a fully worked instance first, then a partially completed one, then a bare exercise (Sweller & Cooper 1985; Kalyuga 2003). Encode as an authoring pattern/lint hint, not new syntax. Do not force a self-explanation prompt onto every example (Barbieri 2023).
5. **Segment, learner-paced.** Grammar already forces block structure; the renderer should present teaching sequences as discrete learner-advanced steps rather than a wall (Rey 2019; Mayer & Chandler 2001). Pacing control: yes. Free-order navigation as the *default* reading mode: no strong evidence it helps (Karich 2014) — keep the author's sequence primary, allow skipping without ceremony.
6. **Coherence over charm.** No decorative animation, mascots, tangential "fun facts," or ambient motion in teaching blocks — seductive details measurably reduce learning (Rey 2012). Interest should come from relevance and challenge, not ornament.
7. **Feedback is information, addressed to the task.** Any evaluative output (check results, agent review of a learner's answer) states: what was expected, the gap, the next step (Hattie & Timperley 2007; Wisniewski 2020). Never praise-only, never person-directed ("you're a natural") — that is the profile that backfires (Kluger & DeNisi 1996).
8. **Generative slots.** Blocks that ask the learner to produce — summarize this section, sketch the data flow, teach it back to the agent — exploit the strongest generative strategies (Fiorella & Mayer 2016) and fit the product's agent pull-back loop: the learner's artifact-embedded answers are text an agent can read and respond to.
9. **Spacing belongs to the loop, not the file.** A static artifact can't schedule reviews, but the spec can define a `review`/`revisit` metadata affordance (concepts worth re-testing, suggested interval) that agents honor across sessions (Cepeda 2006). Keep it advisory metadata; no runtime.
10. **Expertise dial.** Artifacts should declare intended prior-knowledge level per section (or offer collapse-by-default of novice scaffolding) so experienced readers aren't forced through redundant guidance (Kalyuga 2003).

---

## 4. ADHD and accessibility constraints

Framing rule: design for attention-variability as a spectrum; never diagnose, segment, or address users by presumed condition. ADHD is heterogeneous — the dual-pathway model shows distinct cognitive (executive/inhibitory) and motivational (delay-aversion) routes to the same behavior ([Sonuga-Barke 2002, *Behav. Brain Res.* 130(1–2):29–36, doi:10.1016/S0166-4328(01)00432-6](https://doi.org/10.1016/S0166-4328(01)00432-6)).

- **[SOURCED]** Reward/motivation pathway differences: adults with ADHD showed reduced dopamine markers in the reward pathway, associated with motivation deficits — supporting *shorter feedback loops and more immediate relevance*, not louder stimulation ([Volkow et al. 2011, *Mol. Psychiatry* 16:1147–1154, doi:10.1038/mp.2010.97](https://doi.org/10.1038/mp.2010.97)).
- **[SOURCED]** Delay aversion: preference for immediate over delayed reward is a core motivational feature in many with ADHD (Sonuga-Barke 2002, above). **[INFERENCE]** Teaching artifacts should surface payoff early (why this matters, quick first win) and keep check-answer loops immediate.
- **[SOURCED]** Hyperfocus: adults with ADHD symptoms report more frequent and deeper episodes of prolonged, absorbed attention on engaging tasks ([Hupfeld, Abagis & Shah 2019, *ADHD Atten. Def. Hyp. Disord.* 11:191–208, doi:10.1007/s12402-018-0272-y](https://doi.org/10.1007/s12402-018-0272-y)). **[INFERENCE]** Attention is not simply "deficient"; the artifact's job is easy re-entry after attention lapses and no punishment for over- or under-engagement.
- **[SOURCED]** W3C COGA guidance ([*Making Content Usable for People with Cognitive and Learning Disabilities*, W3C Working Group Note, 29 Apr 2021](https://www.w3.org/TR/coga-usable/)) — supplemental to WCAG, directly covers attention/executive-function needs:
  - State the purpose of each page/section so users who lose focus can re-orient.
  - Present media in small chunks of understandable content.
  - Clear, logical heading structure as signposts for regaining context after distraction.
  - Minimize distractions and interruptions; avoid high-arousal pages with moving text and animated images.
- **[SOURCED]** WCAG 2.2 hard requirements relevant here ([W3C Recommendation, 2023](https://www.w3.org/TR/WCAG22/)): 2.2.1 Timing Adjustable (no essential time limits), 2.2.2 Pause/Stop/Hide for moving or auto-updating content, 2.4.6 descriptive headings/labels, 3.2.3 consistent navigation; 2.3.3 (AAA) allows disabling interaction-triggered animation. Honor [`prefers-reduced-motion`](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion) (CSS Media Queries 5).
- **[RECOMMENDATION]** Concretely for Plantifiles: no timers or streaks anywhere; progress state is resumable and loss-proof; every teaching block is completable in one short sitting and independently re-enterable; section headers restate context ("You are verifying step 3 of the migration"); all motion is opt-in and reduced-motion-respecting; nothing in the artifact ever *requires* the interactive layer — plain text remains complete (this is also what keeps it agent-readable).

---

## 5. Ethical engagement constraints

- **[SOURCED]** Dark-pattern taxonomy — nagging, obstruction, sneaking, interface interference, forced action — defines the design space to prohibit ([Gray et al. 2018, CHI '18, doi:10.1145/3173574.3174108](https://doi.org/10.1145/3173574.3174108)).
- **[SOURCED]** These patterns are widespread and operate by exploiting cognitive biases at scale (1,818 instances across 11K sites) ([Mathur et al. 2019, *PACM HCI* 3(CSCW):81, doi:10.1145/3359183](https://doi.org/10.1145/3359183)); the FTC treats manipulative engagement design as an enforcement matter ([FTC staff report, *Bringing Dark Patterns to Light*, Sept 2022](https://www.ftc.gov/reports/bringing-dark-patterns-light)).
- **[SOURCED]** Engagement mechanics can be anti-educational: contingent extrinsic rewards undermine intrinsic motivation (Deci 1999, §1.7); leaderboards/badges reduced motivation and grades over a semester (Hanus & Fox 2015, §1.7).
- **[RECOMMENDATION]** Hard prohibitions for the spec and renderer:
  - No streaks, daily goals, countdowns, or loss-framed progress ("don't break your chain").
  - No competitive comparison (leaderboards, percentile shaming).
  - No variable-ratio reward mechanics or celebration animations contingent on continued use.
  - No nagging re-engagement (notifications, "come back" prompts) and no obstruction of leaving/skipping.
  - Progress indicators are allowed as *information* (what's done, what remains) — informational feedback does not undermine motivation the way controlling rewards do (Deci 1999).
  - Engagement metric for the product is *completion of learner-declared goals and correctness on checks*, never time-on-artifact.

---

## 6. Anti-patterns for AI-authored teaching material

Distilled; each traces to §1–§5 evidence.

| Anti-pattern | Why it fails | Source |
|---|---|---|
| Re-presenting content and calling it review ("as a reminder…") | Restudy is the weakest condition; retrieval beats it | Adesope 2017; Rowland 2014; Dunlosky 2013 |
| Quiz with right/wrong only, no explanation | Verification-only feedback ≈ zero effect (0.05) | Van der Kleij 2015 |
| Praise-centric feedback ("Great job!") | Self-directed feedback is the profile that *reduces* performance | Kluger & DeNisi 1996 |
| Fun facts, jokes, decorative motion inside instruction | Seductive details cut retention and transfer | Rey 2012 |
| One long unsegmented explanation | Segmenting effect; attention re-entry needs | Rey 2019; W3C COGA 2021 |
| Forcing novices to problem-solve cold | Worked-example effect | Sweller & Cooper 1985; Barbieri 2023 |
| Forcing experts through novice scaffolding | Expertise reversal | Kalyuga 2003 |
| Mandatory self-explanation prompt on every example | Direction of effect unsettled; time cost | Barbieri 2023 vs. Bisra 2018 |
| Free-form "explore anywhere" navigation as pedagogy | Learner control g ≈ 0.05 | Karich 2014 |
| Badges/points/streaks to drive study | Undermines intrinsic motivation; unstable benefits | Deci 1999; Hanus & Fox 2015; Sailer & Homner 2020 |
| Timers, expiring content, urgency | Fails WCAG 2.2.1; dark-pattern adjacent | W3C WCAG 2.2; FTC 2022 |
| Interactive-only content (breaks in plain text) | Excludes agent pull-back and non-visual users | [INFERENCE] from product contract + WCAG robustness |

---

## 7. Evidence → requirement table

| # | Evidence (source) | Spec requirement (proposed) | Confidence |
|---|---|---|---|
| R1 | Retrieval > restudy, g ≈ 0.5 (Adesope 2017; Rowland 2014) | First-class check/question block with agent-authored answer + explanation, hidden-until-attempt in browser, spoiler-convention in plain text | High |
| R2 | Feedback doubles testing gains (Rowland 2014); elaborated ≫ verification (Van der Kleij 2015) | Question blocks REQUIRE an explanation field; lint error if right/wrong only | High |
| R3 | Pretesting helps even when wrong (Richland 2009) | Optional prediction-prompt affordance at section start; no grading | Medium-high |
| R4 | Worked-example effect + fading (Sweller & Cooper 1985; Kalyuga 2003; Barbieri 2023) | Authoring pattern: full example → faded example → exercise; expertise/collapse metadata per section | High for novices |
| R5 | Segmenting, learner-paced (Rey 2019; Mayer & Chandler 2001) | Teaching sequences render as discrete learner-advanced steps; author order primary | High |
| R6 | Seductive details harm (Rey 2012); COGA distraction guidance | Lint/style rule: no decorative media or ambient motion in teaching blocks | High |
| R7 | Generative strategies work (Fiorella & Mayer 2016) | "Produce" blocks (summarize/teach-back/sketch) whose learner output is stored in-artifact for agent review | Medium-high |
| R8 | Spacing (Cepeda 2006) | Advisory `review` metadata (concepts + suggested revisit) consumed by agents across sessions | Medium |
| R9 | Learner control ≈ 0 (Karich 2014) | Control tempo, not curriculum: skipping allowed, no branching-path pedagogy in v1 | Medium |
| R10 | Reward undermining (Deci 1999; Hanus & Fox 2015) | Prohibit streaks/badges/leaderboards/variable rewards; progress shown as neutral information only | High |
| R11 | COGA + WCAG 2.2 + reduced-motion (W3C) | No time limits; pause/stop/hide any motion; purpose-stating headers; small chunks; resumable state; `prefers-reduced-motion` honored | High (normative) |
| R12 | Dark-pattern taxonomies (Gray 2018; Mathur 2019; FTC 2022) | Spec-level prohibition list (nagging, obstruction, sneaking, interference, forced action) as acceptance criteria for renderer features | High (normative) |
| R13 | ADHD delay aversion / reward pathway (Sonuga-Barke 2002; Volkow 2011); hyperfocus (Hupfeld 2019) | Immediate check feedback; early payoff framing; frictionless re-entry after lapse; never punish absence | Medium (group-level → design analogy) |

---

## 8. Annotated source list

Peer-reviewed meta-analyses / systematic reviews (strongest tier):
- Adesope, Trevisan & Sundararajan 2017 — 217-study meta of practice testing. doi:10.3102/0034654316689306
- Rowland 2014 — 61-experiment meta, testing vs. restudy; feedback & format moderators. doi:10.1037/a0037559
- Cepeda et al. 2006 — 839-assessment meta of distributed practice. doi:10.1037/0033-2909.132.3.354
- Dunlosky et al. 2013 — 10-technique utility review. doi:10.1177/1529100612453266
- Barbieri et al. 2023 — worked-examples meta (math), g = 0.48; self-explanation-prompt caveat. doi:10.1007/s10648-023-09745-1
- Bisra et al. 2018 — self-explanation meta, 64 studies. doi:10.1007/s10648-018-9434-x
- Kluger & DeNisi 1996 — 607-effect feedback meta; >⅓ negative. doi:10.1037/0033-2909.119.2.254
- Wisniewski, Zierer & Hattie 2020 — 435-study feedback meta; information content moderator. doi:10.3389/fpsyg.2019.03087
- Van der Kleij et al. 2015 — computer-based feedback meta; EF > KCR > KR. doi:10.3102/0034654314564881
- Rey 2012 — seductive-details meta. doi:10.1016/j.edurev.2012.05.003
- Rey et al. 2019 — segmenting meta, 56 investigations. doi:10.1007/s10648-018-9456-4
- Noetel et al. 2022 — multimedia design overview of reviews. doi:10.3102/00346543211052329
- Karich, Burns & Maki 2014 — learner-control meta, g = 0.05. doi:10.3102/0034654314526064
- Sailer & Homner 2020 — gamification meta; rigor subsplit. doi:10.1007/s10648-019-09498-w
- Deci, Koestner & Ryan 1999 — 128-experiment meta, reward undermining. doi:10.1037/0033-2909.125.6.627

Original experiments / theory (context for the metas):
- Sweller 1988 — cognitive load theory. doi:10.1207/s15516709cog1202_4
- Sweller & Cooper 1985 — worked-example effect. doi:10.1207/s1532690xci0201_3
- Kalyuga et al. 2003 — expertise reversal. doi:10.1207/S15326985EP3801_4
- Mayer & Chandler 2001 — minimal pacing interaction improves transfer. doi:10.1037/0022-0663.93.2.390
- Richland, Kornell & Kao 2009 — pretesting effect. doi:10.1037/a0016496
- Hattie & Timperley 2007 — feedback model (feed-up/back/forward). doi:10.3102/003465430298487
- Fiorella & Mayer 2016 — eight generative strategies. doi:10.1007/s10648-015-9348-9
- Hanus & Fox 2015 — longitudinal gamification backfire. doi:10.1016/j.compedu.2014.08.019

ADHD (group-level clinical/cognitive science; do not use to infer individuals):
- Sonuga-Barke 2002 — dual-pathway model, delay aversion. doi:10.1016/S0166-4328(01)00432-6
- Volkow et al. 2011 — dopamine reward pathway & motivation in adult ADHD. doi:10.1038/mp.2010.97
- Hupfeld, Abagis & Shah 2019 — hyperfocus in adult ADHD. doi:10.1007/s12402-018-0272-y

Standards & official guidance (normative tier):
- W3C, *Making Content Usable for People with Cognitive and Learning Disabilities*, WG Note, 2021-04-29 — https://www.w3.org/TR/coga-usable/
- W3C, *WCAG 2.2*, Recommendation, 2023 — https://www.w3.org/TR/WCAG22/
- W3C, *Media Queries Level 5* (`prefers-reduced-motion`) — https://www.w3.org/TR/mediaqueries-5/
- FTC staff report, *Bringing Dark Patterns to Light*, 2022-09-15 — https://www.ftc.gov/reports/bringing-dark-patterns-light

HCI research on manipulation (empirical tier):
- Gray et al. 2018 — dark-pattern taxonomy. doi:10.1145/3173574.3174108
- Mathur et al. 2019 — dark patterns at scale, 11K sites. doi:10.1145/3359183
