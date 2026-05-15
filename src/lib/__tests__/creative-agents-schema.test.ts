import { describe, expect, it } from 'vitest';
import { CreativeAgentRunPayloadSchema } from '@/lib/creative-agents-schema';

function validPayload() {
  return {
    prompt: 'Create a premium watch campaign around borrowed time.',
    brandDefaults: {
      brandTone: 'luxe',
      brandVibe: 'cinematic restraint',
      brandPalette: 'black, silver, signal blue',
      defaultCta: 'learn_more',
    },
    run: {
      campaignTitle: 'Borrowed Time - Luxury Watch',
      conceptLine: 'Time is borrowed and returned with interest.',
      script: ['Open on absence.', 'Reveal the object.', 'Hold the proof detail.'],
      voiceover: ['We never own the hour.'],
      musicCue: 'Sparse piano and low sub pulse.',
      soundDesign: ['Mechanical tick as percussion.'],
      brandIdentity: ['Tone: Luxe.', 'Motion rule: every cut earns its place.'],
      shots: [
        {
          index: 1,
          title: 'Cold open',
          frame: 'A black macro surface with a narrow strip of light.',
          camera: '90mm macro, locked off',
          prompt: 'Luxury watch macro still, black glass, controlled reflection.',
          audio: 'Room-tone swell.',
          qualityGate: 'Logo geometry and highlight continuity.',
        },
        {
          index: 2,
          title: 'Human tension',
          frame: 'A hand pauses before touching the product.',
          camera: 'Handheld close pass',
          prompt: 'Hand hovering above luxury watch, premium editorial lighting.',
          audio: 'Soft breath and cloth movement.',
          qualityGate: 'Finger count and product scale.',
        },
        {
          index: 3,
          title: 'Proof detail',
          frame: 'The dial locks into focus.',
          camera: 'Focus pull to product face',
          prompt: 'Exact dial indices, clean symmetry, crisp material finish.',
          audio: 'Precise click.',
          qualityGate: 'Dial indices and text legibility.',
        },
      ],
      reviewIssues: [
        {
          id: 'dial-indices',
          severity: 'fixing',
          asset: 'Shot 03 proof detail',
          label: 'Inconsistent dial indices',
          before: 'Minute markers are uneven.',
          fix: 'Regenerate with explicit index symmetry.',
        },
      ],
      composeNotes: ['Keep review comments attached to shot index and version.'],
      assetCount: 12,
    },
    fixedIssueIds: ['dial-indices'],
  };
}

describe('CreativeAgentRunPayloadSchema', () => {
  it('accepts a complete creative agent run payload', () => {
    const parsed = CreativeAgentRunPayloadSchema.safeParse(validPayload());

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.run.shots).toHaveLength(3);
      expect(parsed.data.fixedIssueIds).toEqual(['dial-indices']);
    }
  });

  it('requires enough storyboard shots for handoff', () => {
    const payload = validPayload();
    payload.run.shots = payload.run.shots.slice(0, 2);

    expect(CreativeAgentRunPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects malformed review issue severities', () => {
    const payload = validPayload();
    payload.run.reviewIssues[0].severity = 'broken';

    expect(CreativeAgentRunPayloadSchema.safeParse(payload).success).toBe(false);
  });
});
