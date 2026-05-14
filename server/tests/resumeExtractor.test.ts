import { describe, expect, it } from 'vitest';
import { LocalResumeExtractor } from '../src/services/resumeExtractor.js';

describe('LocalResumeExtractor', () => {
  it('extracts Chinese labeled fields', async () => {
    const extractor = new LocalResumeExtractor();

    const result = await extractor.extract(
      ['姓名: 王小明', '性别: 男', '邮箱: wang@example.com', '电话: 138 0013 8000'].join('\n'),
    );

    expect(result).toEqual({
      name: '王小明',
      gender: 'male',
      email: 'wang@example.com',
      phone: '13800138000',
    });
  });

  it('extracts English labeled fields and normalizes international phone numbers', async () => {
    const extractor = new LocalResumeExtractor();

    const result = await extractor.extract(
      ['Name: Jane Doe', 'Gender: Female', 'Email: Jane.Doe@Example.COM', 'Phone: +1 (415) 555-0188'].join('\n'),
    );

    expect(result).toEqual({
      name: 'Jane Doe',
      gender: 'female',
      email: 'jane.doe@example.com',
      phone: '+14155550188',
    });
  });

  it('uses a conservative first-line name fallback', async () => {
    const extractor = new LocalResumeExtractor();

    const result = await extractor.extract(['John Smith', 'Senior Backend Engineer', 'john.smith@example.com'].join('\n'));

    expect(result.name).toBe('John Smith');
    expect(result.email).toBe('john.smith@example.com');
  });

  it('does not guess a name from obvious headings or contact lines', async () => {
    const extractor = new LocalResumeExtractor();

    const result = await extractor.extract(['个人简历', '联系方式', 'Email: person@example.com'].join('\n'));

    expect(result.name).toBeUndefined();
    expect(result.email).toBe('person@example.com');
  });
});
