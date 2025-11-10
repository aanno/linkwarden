/**
 * Unit tests for sorting utilities
 */

import { parseSort, parseSortWithLegacy, orderByToString } from '../sorting';

describe('parseSort', () => {
  it('should parse single column', () => {
    const result = parseSort('name', 'asc');
    expect(result).toEqual([{ name: 'asc' }, { id: 'desc' }]);
  });

  it('should parse multiple columns', () => {
    const result = parseSort('name,createdAt', 'asc,desc');
    expect(result).toEqual([
      { name: 'asc' },
      { createdAt: 'desc' },
      { id: 'desc' }
    ]);
  });

  it('should use last direction for remaining columns', () => {
    const result = parseSort('name,createdAt,updatedAt', 'asc,desc');
    expect(result).toEqual([
      { name: 'asc' },
      { createdAt: 'desc' },
      { updatedAt: 'desc' },
      { id: 'desc' }
    ]);
  });

  it('should default to asc when dir omitted', () => {
    const result = parseSort('name,createdAt');
    expect(result).toEqual([
      { name: 'asc' },
      { createdAt: 'asc' },
      { id: 'desc' }
    ]);
  });

  it('should filter invalid columns with whitelist', () => {
    const result = parseSort(
      'name,malicious_column,id',
      'asc,desc,asc',
      ['name', 'id', 'createdAt']
    );
    expect(result).toEqual([
      { name: 'asc' },
      { id: 'asc' }
    ]);
  });

  it('should return default when no sort provided', () => {
    const result = parseSort(undefined, undefined, undefined, [{ createdAt: 'desc' }]);
    expect(result).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('should return default when empty string', () => {
    const result = parseSort('', undefined);
    expect(result).toEqual([{ id: 'desc' }]);
  });

  it('should handle whitespace in column names', () => {
    const result = parseSort(' name , createdAt ', ' asc , desc ');
    expect(result).toEqual([
      { name: 'asc' },
      { createdAt: 'desc' },
      { id: 'desc' }
    ]);
  });

  it('should handle invalid directions gracefully', () => {
    const result = parseSort('name,createdAt', 'invalid,desc');
    expect(result).toEqual([
      { name: 'asc' }, // Fallback to asc for invalid
      { createdAt: 'desc' },
      { id: 'desc' }
    ]);
  });

  it('should not add duplicate id if already present', () => {
    const result = parseSort('name,id', 'asc,desc');
    expect(result).toEqual([
      { name: 'asc' },
      { id: 'desc' }
    ]);
  });

  it('should handle id at the beginning', () => {
    const result = parseSort('id,name', 'asc,desc');
    expect(result).toEqual([
      { id: 'asc' },
      { name: 'desc' }
    ]);
  });

  it('should filter all columns when none match whitelist', () => {
    const result = parseSort(
      'invalid1,invalid2',
      'asc,desc',
      ['name', 'id']
    );
    expect(result).toEqual([{ id: 'desc' }]); // Falls back to default
  });
});

describe('parseSortWithLegacy', () => {
  it('should handle legacy enum value 0 (DateNewestFirst)', () => {
    const result = parseSortWithLegacy(0);
    expect(result).toEqual([{ id: 'desc' }]);
  });

  it('should handle legacy enum value 1 (DateOldestFirst)', () => {
    const result = parseSortWithLegacy(1);
    expect(result).toEqual([{ id: 'asc' }]);
  });

  it('should handle legacy enum value 2 (NameAZ)', () => {
    const result = parseSortWithLegacy(2);
    expect(result).toEqual([{ name: 'asc' }, { id: 'desc' }]);
  });

  it('should handle legacy enum value 3 (NameZA)', () => {
    const result = parseSortWithLegacy(3);
    expect(result).toEqual([{ name: 'desc' }, { id: 'desc' }]);
  });

  it('should handle legacy enum as string', () => {
    const result = parseSortWithLegacy('2');
    expect(result).toEqual([{ name: 'asc' }, { id: 'desc' }]);
  });

  it('should handle unknown enum value', () => {
    const result = parseSortWithLegacy(99);
    expect(result).toEqual([{ id: 'desc' }]); // Default
  });

  it('should handle column-based sort when not enum', () => {
    const result = parseSortWithLegacy('name', 'asc');
    expect(result).toEqual([{ name: 'asc' }, { id: 'desc' }]);
  });

  it('should handle column-based multi-column sort', () => {
    const result = parseSortWithLegacy('name,createdAt', 'asc,desc');
    expect(result).toEqual([
      { name: 'asc' },
      { createdAt: 'desc' },
      { id: 'desc' }
    ]);
  });

  it('should respect allowed columns in column-based mode', () => {
    const result = parseSortWithLegacy(
      'name,invalid',
      'asc,desc',
      ['name', 'id']
    );
    expect(result).toEqual([{ name: 'asc' }, { id: 'desc' }]);
  });
});

describe('orderByToString', () => {
  it('should convert single column to string', () => {
    const result = orderByToString([{ name: 'asc' }]);
    expect(result).toBe('name ASC');
  });

  it('should convert multiple columns to string', () => {
    const result = orderByToString([
      { name: 'asc' },
      { id: 'desc' }
    ]);
    expect(result).toBe('name ASC, id DESC');
  });

  it('should handle desc direction', () => {
    const result = orderByToString([
      { createdAt: 'desc' },
      { name: 'asc' }
    ]);
    expect(result).toBe('createdAt DESC, name ASC');
  });

  it('should handle empty array', () => {
    const result = orderByToString([]);
    expect(result).toBe('');
  });

  it('should handle three columns', () => {
    const result = orderByToString([
      { name: 'asc' },
      { createdAt: 'desc' },
      { id: 'desc' }
    ]);
    expect(result).toBe('name ASC, createdAt DESC, id DESC');
  });
});
