import { describe, expect, it } from 'vitest';
import { formatLength, parseLength } from './units';

describe('parseLength', () => {
  it('parses bare numbers in project units', () => {
    expect(parseLength('36', 'imperial')).toBeCloseTo(914.4);
    expect(parseLength('900', 'metric')).toBe(900);
  });

  it('parses fractions and mixed numbers as inches', () => {
    expect(parseLength('3/4', 'imperial')).toBeCloseTo(19.05);
    expect(parseLength('1-1/2', 'imperial')).toBeCloseTo(38.1);
    expect(parseLength('1 1/2', 'imperial')).toBeCloseTo(38.1);
    expect(parseLength('1 1/2"', 'imperial')).toBeCloseTo(38.1);
    expect(parseLength('35-1/2"', 'imperial')).toBeCloseTo(901.7);
  });

  it('parses explicit unit suffixes regardless of project units', () => {
    expect(parseLength('19mm', 'imperial')).toBe(19);
    expect(parseLength('1.5cm', 'imperial')).toBe(15);
    expect(parseLength('0.5m', 'imperial')).toBe(500);
    expect(parseLength('0.75in', 'metric')).toBeCloseTo(19.05);
    expect(parseLength('36"', 'metric')).toBeCloseTo(914.4);
  });

  it('parses feet and feet-inches', () => {
    expect(parseLength(`2'`, 'imperial')).toBeCloseTo(609.6);
    expect(parseLength(`2'6"`, 'imperial')).toBeCloseTo(762);
    expect(parseLength(`2' 6-1/2"`, 'imperial')).toBeCloseTo(774.7);
  });

  it('rejects garbage instead of guessing', () => {
    expect(parseLength('abc', 'imperial')).toBeNull();
    expect(parseLength('', 'imperial')).toBeNull();
    expect(parseLength('1/0', 'imperial')).toBeNull();
  });
});

describe('formatLength', () => {
  it('formats imperial as fractional inches to 1/32', () => {
    expect(formatLength(914.4, 'imperial')).toBe('36"');
    expect(formatLength(38.1, 'imperial')).toBe('1-1/2"');
    expect(formatLength(19.05, 'imperial')).toBe('3/4"');
    expect(formatLength(901.7, 'imperial')).toBe('35-1/2"');
  });

  it('formats metric as mm with one decimal max', () => {
    expect(formatLength(762, 'metric')).toBe('762 mm');
    expect(formatLength(19.05, 'metric')).toBe('19.1 mm');
  });

  it('round-trips through parse', () => {
    for (const mm of [19.05, 38.1, 762, 914.4, 1828.8]) {
      const text = formatLength(mm, 'imperial');
      expect(parseLength(text, 'imperial')).toBeCloseTo(mm, 1);
    }
  });
});
