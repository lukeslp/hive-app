/**
 * Shared system-prompt block for tile generation.
 *
 * The two call sites for tile-generation (HexmindApp.tsx local
 * generateNeighbors and useAIGeneration.ts hook generateNeighbors)
 * each have their own context-gathering logic — board awareness,
 * key-theme prioritization, nearby-node context, etc. — which
 * legitimately differs between them. But the BRANCH-SHAPE RULES,
 * the FEW-SHOT EXAMPLES, and the JSON OUTPUT EXAMPLE need to stay
 * identical so the LLM gets the same schema-discipline signal from
 * either path.
 *
 * Pre-extraction the two prompts had drifted: HexmindApp had 4
 * examples + a 6-branch JSON example with 2 asks; the hook had 3
 * examples + a 3-branch JSON example with 1 ask. The model picked
 * up the implicit cue and emitted clarifying-question tiles at
 * different rates depending on which path called it.
 *
 * Now: shape rules + examples + JSON template live HERE; each call
 * site composes its own context-specific blocks around this.
 *
 * Mirrors `BRANCH_SET_SCHEMA` in branchSchema.ts (Gemini's grammar-
 * constrained decoding). Keep these in sync — when one changes,
 * audit the other.
 */

/**
 * The MANDATORY type-distribution rule. Both prompts include this
 * verbatim — it's what stops the LLM from emitting 6 concept tiles
 * in a row (which produces a wall of identical-looking yellow tiles
 * with the lightbulb icon).
 */
export const BRANCH_TYPE_DISTRIBUTION_RULE = `TYPE DISTRIBUTION (REQUIRED): Use at least 3 different types across
the 6 branches. NO MORE than 3 "concept" branches per generation.
Always include at least one "action" plus one "risk" or "question".
Available types: concept, action, technical, question, risk.`;

/**
 * Clarifying-question rules. Includes the user-knowledge gate, the
 * expected frequency hint, and the four contrastive few-shot pairs.
 *
 * Critical: this string is the single source of truth for the
 * "ask vs expand" instruction. Edit ONCE here, not in two prompts.
 */
export const CLARIFICATION_RULES = `CLARIFYING QUESTIONS — when to ASK vs when to EXPAND:
A tile may OPTIONALLY carry a clarifying question that fires when the
user taps it (instead of expanding into 6 sub-branches). Set
shouldAskClarifyingQuestion to true ONLY when downstream branches
would depend on knowledge ONLY THE USER HAS — preferences,
constraints, situation, or goals.

NEVER set it true for facts you could state yourself.

EXPECTED FREQUENCY: For most central ideas, 1–2 of the 6 branches
should set shouldAskClarifyingQuestion to true. Zero is correct only
when the topic is concrete and self-contained (e.g. "photosynthesis").
All-six-true is wrong — most expansions are factual / exploratory.

EXAMPLES:
  Root "cheese" → tile "storage"
    → shouldAskClarifyingQuestion: false. Storage methods (refrigeration,
      wax coating, vacuum seal, cellar humidity) are facts. Just expand.

  Root "fitness app" → tile "workout plan"
    → shouldAskClarifyingQuestion: true. userInputCategory: "goal".
      clarificationReasoning: "branches depend on user's fitness goal —
      weight loss vs strength vs endurance produce different plans."
      clarifyingQuestion: "What's your primary fitness goal?"
      suggestedAnswers: ["Weight loss", "Strength", "Endurance", "General health"]

  Root "vacation to Japan" → tile "itinerary"
    → shouldAskClarifyingQuestion: true. userInputCategory: "preference".
      clarificationReasoning: "trip length and travel style determine
      which cities to visit." clarifyingQuestion: "How many days, and
      cities or countryside?" suggestedAnswers: []  (open-ended)

  Root "JavaScript framework" → tile "best practices"
    → shouldAskClarifyingQuestion: false. Best practices are general
      knowledge. Just expand.

When shouldAskClarifyingQuestion is false, OMIT the four related fields
(clarifyingQuestion, clarificationReasoning, userInputCategory,
suggestedAnswers).`;

/**
 * The JSON output example. Note: 2 of 6 branches have shouldAsk=true
 * (the expected frequency for a typical generation). The model picks
 * up this rate as the implicit norm; if this drops to 1/6 the model
 * starts emitting 0/6.
 *
 * Real values shown so the LLM has a literal shape to mimic — paired
 * with an explicit "do NOT copy these literally" header so the
 * placeholder-leak class of bug from commit 139c4a0 doesn't recur.
 *
 * Includes `description` field. The hook's prompt historically said
 * "NO description field. Title only." — but the schema (BRANCH_SET_SCHEMA)
 * permits description. Both call sites now share this shape.
 */
export const JSON_OUTPUT_EXAMPLE = `CRITICAL: Return ONLY valid JSON, no markdown, no commentary. Match
this exact shape (real values shown — do NOT copy these literally,
generate your own based on the user's idea). This example has 2 of 6
branches with shouldAskClarifyingQuestion=true, which is the expected
frequency for a typical generation:

{"branches":[
  {"title":"Revenue Model","description":"How the business makes money over time.","type":"action","complexity":3,"autoExpand":false,"shouldAskClarifyingQuestion":false},
  {"title":"Target Market","description":"Who the product is built for.","type":"concept","complexity":4,"autoExpand":false,"shouldAskClarifyingQuestion":true,"clarifyingQuestion":"Who's your target audience?","clarificationReasoning":"branches depend on which audience the user is building for","userInputCategory":"situation","suggestedAnswers":["Consumers","SMBs","Enterprise","Developers"]},
  {"title":"Legal Risk","description":"Compliance and liability exposure.","type":"risk","complexity":2,"autoExpand":false,"shouldAskClarifyingQuestion":false},
  {"title":"Pricing Strategy","description":"How to price the product.","type":"action","complexity":4,"autoExpand":false,"shouldAskClarifyingQuestion":true,"clarifyingQuestion":"What's your monetization preference?","clarificationReasoning":"pricing branches depend on whether user wants subscription, one-time, freemium, or usage-based","userInputCategory":"preference","suggestedAnswers":["Subscription","One-time","Freemium","Usage-based"]},
  {"title":"Tech Stack","description":"Languages, frameworks, infrastructure.","type":"technical","complexity":4,"autoExpand":true,"shouldAskClarifyingQuestion":false},
  {"title":"Success Metrics","description":"How to measure if it's working.","type":"question","complexity":3,"autoExpand":false,"shouldAskClarifyingQuestion":false}
]}`;
