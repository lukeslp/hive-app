/**
 * Post-hoc validator for tile clarification questions.
 *
 * The LLM emits `shouldAskClarifyingQuestion: true` when it thinks a tile
 * needs the user's unique knowledge to expand meaningfully. The schema can
 * enforce field SHAPE (enum membership, etc.) but not SEMANTICS — a model
 * can still launder a factual question ("What is pasteurization?") as a
 * "constraint" category, especially as a session lengthens and the negative
 * "ask only for user-knowledge" instruction decays.
 *
 * This validator is the third layer of defense (after schema + few-shot):
 * if the question matches a factual-lookup pattern, drop the entire
 * clarification flag-set. The tile then expands into branches normally —
 * same fallback as not asking. No UX hole.
 *
 * Pattern source: /Users/luke/.claude/plans/enchanted-mapping-wall.md A.4.
 * The patterns intentionally only match QUESTION OPENERS that signal
 * factual lookup, not all uses of "what" or "which" — "What's your fitness
 * goal?" passes because the possessive marks user-knowledge intent.
 */

/**
 * Minimum shape the validator needs. Any object carrying these optional
 * fields is acceptable — keeps the validator decoupled from the full
 * BranchSuggestion type, which has a stricter NodeType enum on `type` that
 * runtime-parsed branches don't satisfy.
 */
export interface ClarifiableBranch {
    shouldAskClarifyingQuestion?: boolean;
    clarifyingQuestion?: string | null;
    clarificationReasoning?: string | null;
    userInputCategory?: 'preference' | 'constraint' | 'situation' | 'goal' | null;
    suggestedAnswers?: string[] | null;
}

/**
 * Question openers that signal factual lookup. Each pattern is anchored to
 * the START of the question (after stripping leading whitespace) except for
 * "definition of" which can appear mid-sentence. Case-insensitive.
 *
 * Anti-examples (these intentionally PASS the validator):
 * - "What's your fitness goal?" — possessive 's, marks user-knowledge
 * - "What matters most to you?" — open-ended, not a lookup
 * - "Which option do YOU prefer?" — explicit user reference
 */
const FACTUAL_LOOKUP_PATTERNS: readonly RegExp[] = [
    /^\s*what is\b/i,
    /^\s*what are\b/i,
    /^\s*how do you\b/i,
    /^\s*how does\b/i,
    /^\s*where is\b/i,
    // "Which X?" with at most one word after "which" — bare lookups like
    // "Which type?" or "Which method?". Multi-word forms like "Which
    // framework do you already use?" pass because they reference the user.
    /^\s*which (\w+)\??$/i,
    /\bdefinition of\b/i,
    // Deliberately NOT included: /^\s*how many\b/i.
    // It catches legitimate user-resource questions ("How many hours do
    // YOU have available?") and the false-positive cost of suppressing
    // real questions outweighs the marginal benefit of catching factual
    // "how many" — the rewritten prompt should rarely produce these.
];

/**
 * Returns true when the given question looks like a factual lookup the
 * model could answer itself. Exported for testing.
 */
export function isFactualLookup(question: string): boolean {
    return FACTUAL_LOOKUP_PATTERNS.some((p) => p.test(question));
}

/**
 * Run the validator on a single branch. Returns a (possibly-modified) copy.
 *
 * Mutation rules:
 * - shouldAsk == false → returned unchanged.
 * - shouldAsk == true && no question text → drop shouldAsk to false.
 * - shouldAsk == true && question matches a factual pattern → drop the
 *   entire clarification field set (shouldAsk, question, reasoning,
 *   category, suggestedAnswers all cleared). The tile reverts to a normal
 *   expand-on-tap.
 * - shouldAsk == true && question passes → returned unchanged.
 */
export function validateClarification<T extends ClarifiableBranch>(
    branch: T,
): T {
    if (!branch.shouldAskClarifyingQuestion) return branch;
    if (!branch.clarifyingQuestion) {
        // Cast: spread + override on a generic narrows poorly in TS — we
        // know the shape is preserved because only optional clarification
        // fields are touched.
        return { ...branch, shouldAskClarifyingQuestion: false } as T;
    }
    if (!isFactualLookup(branch.clarifyingQuestion)) return branch;
    return {
        ...branch,
        shouldAskClarifyingQuestion: false,
        clarifyingQuestion: undefined,
        clarificationReasoning: undefined,
        userInputCategory: undefined,
        suggestedAnswers: undefined,
    } as T;
}

/** Run the validator across an entire branch set. */
export function validateBranches<T extends ClarifiableBranch>(
    branches: T[],
): T[] {
    return branches.map(validateClarification);
}
