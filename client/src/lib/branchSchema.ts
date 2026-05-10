/**
 * Gemini response_schema for tile generation. Grammar-constrained
 * decoding — the model literally cannot emit values outside the enums or
 * an array of the wrong length.
 *
 * Mirrors the @Generable Branch + BranchSet structs that will land in
 * FoundationModelsPlugin.swift (Plan A.1). Keep these in sync; the
 * runtime parser at client/src/hooks/useAIGeneration.ts and the
 * HexmindApp local generateNeighbors expect the same field shapes from
 * both backends.
 *
 * Apple FoundationModels uses GenerationGuide.anyOf(...) for enum
 * enforcement; Gemini uses OpenAPI-3.0-style "enum" arrays. Both produce
 * the same hard guarantee.
 */

/**
 * OpenAPI-3.0-subset shape Gemini accepts as `generationConfig.responseSchema`.
 * See https://ai.google.dev/gemini-api/docs/structured-output for the full
 * type list (we only use string, integer, boolean, array, object).
 */
export const BRANCH_SET_SCHEMA = {
    type: 'object',
    properties: {
        branches: {
            type: 'array',
            minItems: 6,
            maxItems: 6,
            items: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Short label, 2-4 words',
                    },
                    description: {
                        type: 'string',
                        description: 'Brief 1-2 sentence explanation',
                    },
                    type: {
                        type: 'string',
                        enum: ['concept', 'action', 'technical', 'question', 'risk'],
                    },
                    complexity: {
                        type: 'integer',
                        description: '1-5 scale; how richly this could expand',
                    },
                    autoExpand: {
                        type: 'boolean',
                        description: 'true only for complexity 4-5; max 2 per generation',
                    },
                    shouldAskClarifyingQuestion: {
                        type: 'boolean',
                        description:
                            'Set true ONLY when downstream branches depend on knowledge ONLY THE USER HAS — preferences, constraints, situation, or goals. NEVER for facts you could state yourself.',
                    },
                    clarifyingQuestion: {
                        type: 'string',
                        description: 'Question text. Only present when shouldAsk is true.',
                    },
                    clarificationReasoning: {
                        type: 'string',
                        description:
                            'Why user input is required. Must reference the user\'s unique situation, not general knowledge. Only present when shouldAsk is true.',
                    },
                    userInputCategory: {
                        type: 'string',
                        enum: ['preference', 'constraint', 'situation', 'goal'],
                        description: 'Only present when shouldAsk is true.',
                    },
                    suggestedAnswers: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                            '0-5 short answers shown as tappable chips above the textbox. Empty array for purely open-ended questions.',
                    },
                    relatedTo: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Existing node keys this branch conceptually links to.',
                    },
                },
                required: ['title', 'type', 'complexity', 'autoExpand', 'shouldAskClarifyingQuestion'],
            },
        },
    },
    required: ['branches'],
} as const;
