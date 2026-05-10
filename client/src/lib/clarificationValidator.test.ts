import { describe, it, expect } from 'vitest';
import {
    isFactualLookup,
    validateClarification,
    validateBranches,
} from './clarificationValidator';

describe('isFactualLookup', () => {
    describe('rejects factual openers', () => {
        const factual = [
            'What is pasteurization?',
            'What are the storage options?',
            'How do you store cheese?',
            'How does refrigeration work?',
            'Where is the best climate?',
            'Which method?',
            'Which type?',
            'Tell me the definition of curing.',
            // Case insensitive
            'WHAT IS this?',
            'how do you do it',
            // Leading whitespace
            '  What is X?',
        ];
        for (const q of factual) {
            it(`rejects "${q}"`, () => {
                expect(isFactualLookup(q)).toBe(true);
            });
        }
    });

    describe('passes user-knowledge questions', () => {
        const userKnowledge = [
            "What's your fitness goal?",
            "What's your budget?",
            'What matters most to you?',
            'How important is privacy to you?',
            'Personal or commercial use?',
            'How many hours do you have available?', // user has time, not factual
            'Do you have dietary restrictions?',
            'Are you doing this for personal use or work?',
            'What outcome are you optimizing for?',
            'Which option do YOU prefer?',
            // "Which X" with more than one word should pass — only bare "Which X?" matches
            'Which framework do you already use?',
        ];
        for (const q of userKnowledge) {
            it(`passes "${q}"`, () => {
                expect(isFactualLookup(q)).toBe(false);
            });
        }
    });
});

describe('validateClarification', () => {
    it('returns branch unchanged when shouldAsk is false', () => {
        const input = {
            title: 'Storage',
            shouldAskClarifyingQuestion: false,
        };
        expect(validateClarification(input)).toEqual(input);
    });

    it('returns branch unchanged when shouldAsk is undefined', () => {
        const input = { title: 'Storage' };
        expect(validateClarification(input)).toEqual(input);
    });

    it('drops shouldAsk to false when no question text is present', () => {
        const input = {
            title: 'Storage',
            shouldAskClarifyingQuestion: true,
        };
        expect(validateClarification(input)).toEqual({
            title: 'Storage',
            shouldAskClarifyingQuestion: false,
        });
    });

    it('clears the entire clarification field-set when question is factual', () => {
        const input = {
            title: 'Storage',
            shouldAskClarifyingQuestion: true,
            clarifyingQuestion: 'How do you store cheese?',
            clarificationReasoning: 'depends on cheese type',
            userInputCategory: 'situation' as const,
            suggestedAnswers: ['Fridge', 'Cellar', 'Wax'],
        };
        expect(validateClarification(input)).toEqual({
            title: 'Storage',
            shouldAskClarifyingQuestion: false,
            clarifyingQuestion: undefined,
            clarificationReasoning: undefined,
            userInputCategory: undefined,
            suggestedAnswers: undefined,
        });
    });

    it('preserves a legitimate user-knowledge question', () => {
        const input = {
            title: 'Workout plan',
            shouldAskClarifyingQuestion: true,
            clarifyingQuestion: "What's your primary fitness goal?",
            clarificationReasoning: 'plan depends on user goal',
            userInputCategory: 'goal' as const,
            suggestedAnswers: ['Weight loss', 'Strength', 'Endurance'],
        };
        expect(validateClarification(input)).toEqual(input);
    });

    it('preserves all non-clarification fields when clearing', () => {
        const input = {
            title: 'Storage',
            description: 'A way to keep cheese',
            type: 'concept' as const,
            complexity: 3,
            autoExpand: false,
            shouldAskClarifyingQuestion: true,
            clarifyingQuestion: 'What is the best storage?',
            relatedTo: ['1,0'],
        };
        const result = validateClarification(input);
        expect(result.title).toBe('Storage');
        expect(result.description).toBe('A way to keep cheese');
        expect(result.type).toBe('concept');
        expect(result.complexity).toBe(3);
        expect(result.autoExpand).toBe(false);
        expect(result.relatedTo).toEqual(['1,0']);
        expect(result.shouldAskClarifyingQuestion).toBe(false);
        expect(result.clarifyingQuestion).toBeUndefined();
    });
});

describe('validateBranches', () => {
    it('runs validator over every branch in the set', () => {
        const input = [
            {
                title: 'Storage',
                shouldAskClarifyingQuestion: true,
                clarifyingQuestion: 'How do you store cheese?', // factual
            },
            {
                title: 'Goal',
                shouldAskClarifyingQuestion: true,
                clarifyingQuestion: "What's your goal?", // legitimate
            },
            {
                title: 'Other',
                shouldAskClarifyingQuestion: false,
            },
        ];
        const result = validateBranches(input);
        expect(result[0].shouldAskClarifyingQuestion).toBe(false);
        expect(result[0].clarifyingQuestion).toBeUndefined();
        expect(result[1].shouldAskClarifyingQuestion).toBe(true);
        expect(result[1].clarifyingQuestion).toBe("What's your goal?");
        expect(result[2].shouldAskClarifyingQuestion).toBe(false);
    });

    it('returns an array of the same length', () => {
        const input = Array.from({ length: 6 }, (_, i) => ({
            title: `Branch ${i}`,
        }));
        const result = validateBranches(input);
        expect(result).toHaveLength(6);
    });
});
