import { Tools } from 'librechat-data-provider';

import { buildWebSearchContext } from './web';

describe('buildWebSearchContext', () => {
  it('should include the default web search context', () => {
    const result = buildWebSearchContext();

    expect(result).toContain(`# \`${Tools.web_search}\`:`);
    expect(result).toContain('Current Date & Time:');
    expect(result).toContain('**CITATION FORMAT - UNICODE ESCAPE SEQUENCES ONLY:**');
    expect(result).not.toContain('**PLANNER INSTRUCTIONS:**');
  });

  it('should include planner instructions when plannerPrompt is provided', () => {
    const prompt = 'Research the legal issue with official Sri Lanka government sources first.';
    const result = buildWebSearchContext(prompt);

    expect(result).toContain('**PLANNER INSTRUCTIONS:**');
    expect(result).toContain(prompt);
  });

  it('should omit planner instructions when plannerPrompt is empty', () => {
    const result = buildWebSearchContext('   ');

    expect(result).not.toContain('**PLANNER INSTRUCTIONS:**');
  });
});
