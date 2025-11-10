# Testing Guide for Linkwarden

This document explains how to run and write tests for Linkwarden, specifically for the pagination utilities.

## Test Framework

Linkwarden uses **Jest** with **ts-jest** for unit testing TypeScript code.

## Running Tests

### From Workspace Root (`/workspaces/linkwarden`)

```bash
# Run all web tests
yarn test

# Run tests in watch mode (auto-rerun on file changes)
yarn web:test:watch

# Run tests with coverage report
yarn web:test:coverage
```

### From Web App Directory (`/workspaces/linkwarden/apps/web`)

```bash
# Run all tests
yarn jest

# Run tests in watch mode
yarn jest --watch

# Run tests with coverage report
yarn jest --coverage

# List which tests will be run
yarn jest --listTests
```

**Note:** The monorepo uses yarn workspaces. The root `package.json` delegates to the web workspace, so you can run tests from either location.

### Test-Specific Commands

```bash
# Run a specific test file
yarn jest sorting.test.ts
yarn jest pagination.test.ts

# Run tests matching a pattern
yarn jest --testNamePattern="parseSort"
yarn jest --testNamePattern="pagination"

# Run only failed tests from last run
yarn jest --onlyFailures

# Verbose output
yarn jest --verbose
```

## Test Structure

Tests are located in `__tests__` directories next to the code they test:

```
apps/web/lib/api/utils/
├── types.ts
├── sorting.ts
├── pagination.ts
└── __tests__/
    ├── sorting.test.ts
    ├── pagination.test.ts
    └── (future tests)
```

## Existing Tests

### Pagination Utility Tests (52 total)

#### Sorting Tests (26 tests)

Located in: `apps/web/lib/api/utils/__tests__/sorting.test.ts`

**`parseSort()` - 12 tests:**
- ✅ Single column sorting
- ✅ Multi-column sorting
- ✅ Direction handling (asc/desc)
- ✅ Column whitelist security
- ✅ Edge cases (empty, invalid, whitespace)
- ✅ Auto-adding `id` for cursor stability

**`parseSortWithLegacy()` - 9 tests:**
- ✅ Backward compatibility with enum values (0-3)
- ✅ Column-based fallback
- ✅ Column whitelist enforcement

**`orderByToString()` - 5 tests:**
- ✅ Debug output formatting
- ✅ Single and multi-column conversion

#### Pagination Tests (26 tests)

Located in: `apps/web/lib/api/utils/__tests__/pagination.test.ts`

**`parsePagination()` - 13 tests:**
- ✅ Limit validation and bounds (default: 50, max: 100)
- ✅ Cursor handling
- ✅ Sort parameter parsing
- ✅ Error handling (invalid cursor, NaN)
- ✅ Custom default configurations

**`buildPaginatedResponse()` - 6 tests:**
- ✅ `hasMore` detection
- ✅ `nextCursor` calculation
- ✅ Edge cases (empty, single item, exact limit)

**`buildPaginatedResponseWithCount()` - 2 tests:**
- ✅ Total count inclusion
- ✅ Integration with hasMore logic

**`paginate()` - 5 tests:**
- ✅ Integration of parsing + query + response building
- ✅ Query function parameter passing
- ✅ Error propagation

## Writing New Tests

### Test File Template

```typescript
/**
 * Unit tests for [feature name]
 */

import { functionToTest } from '../module';

describe('functionToTest', () => {
  it('should do something specific', () => {
    const result = functionToTest(input);
    expect(result).toEqual(expectedOutput);
  });

  it('should handle edge case', () => {
    const result = functionToTest(edgeCaseInput);
    expect(result).toBeDefined();
  });

  it('should throw error for invalid input', () => {
    expect(() => functionToTest(invalidInput)).toThrow('Error message');
  });
});
```

### Common Jest Matchers

```typescript
// Equality
expect(result).toBe(42);              // Strict equality (===)
expect(result).toEqual({ a: 1 });     // Deep equality

// Truthiness
expect(result).toBeDefined();
expect(result).toBeUndefined();
expect(result).toBeNull();
expect(result).toBeTruthy();
expect(result).toBeFalsy();

// Numbers
expect(result).toBeGreaterThan(10);
expect(result).toBeLessThan(100);
expect(result).toBeCloseTo(0.3);      // Floating point

// Arrays/Objects
expect(array).toHaveLength(3);
expect(array).toContain('item');
expect(obj).toHaveProperty('key');

// Exceptions
expect(() => fn()).toThrow();
expect(() => fn()).toThrow('Error message');
expect(() => fn()).toThrow(ErrorClass);

// Promises
await expect(promise).resolves.toBe(value);
await expect(promise).rejects.toThrow();

// Mocks
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
expect(mockFn).toHaveBeenCalledTimes(3);
```

### Mocking Example

```typescript
it('should call query function with correct params', async () => {
  const mockData = [{ id: 1, name: 'Test' }];
  const queryFn = jest.fn().mockResolvedValue(mockData);

  const result = await paginate({ limit: 10 }, queryFn);

  expect(queryFn).toHaveBeenCalledWith({
    take: 10,
    skip: undefined,
    cursor: undefined,
    orderBy: [{ id: 'desc' }]
  });

  expect(result.items).toEqual(mockData);
});
```

## Test Configuration

### Jest Config Location

`apps/web/jest.config.js`

**Key Settings:**
- **Preset:** `ts-jest` (TypeScript support)
- **Test Environment:** `node` (not browser)
- **Test Match:** Only `lib/api/utils/__tests__/**/*.test.ts`
- **Ignores:** e2e tests, Playwright specs, node_modules, .next

**Module Mapping:**
- `@/...` → `<rootDir>/...` (imports with @ work in tests)

**Transform:**
- TypeScript files compiled with ts-jest
- ESModule interop enabled

### Why e2e Tests Are Excluded

Linkwarden has two test systems:
1. **Jest** - Unit tests for utilities, functions, helpers
2. **Playwright** - E2E tests for full application testing

Jest config explicitly excludes:
- `/e2e/` directory
- `*.spec.ts` files (Playwright convention)
- Playwright test files

This prevents conflicts between the two test frameworks.

## Coverage Reports

Generate coverage report:

```bash
yarn jest --coverage
```

**Output:**
- Terminal: Summary table with percentages
- HTML Report: `coverage/lcov-report/index.html`

**Coverage Thresholds:**

Currently no thresholds enforced. Aim for:
- **Statements:** 80%+
- **Branches:** 75%+
- **Functions:** 80%+
- **Lines:** 80%+

## Testing Best Practices

### 1. Test Naming

```typescript
// ✅ Good: Describes behavior
it('should return default sort when no params provided', () => { ... });

// ❌ Bad: Too vague
it('works', () => { ... });
```

### 2. One Assertion Per Test (When Possible)

```typescript
// ✅ Good: Focused test
it('should set hasMore to true when items equal limit', () => {
  const result = buildPaginatedResponse(items, 3);
  expect(result.hasMore).toBe(true);
});

it('should set nextCursor to last item id when hasMore is true', () => {
  const result = buildPaginatedResponse(items, 3);
  expect(result.nextCursor).toBe(3);
});

// ⚠️ Acceptable: Related assertions
it('should build correct paginated response', () => {
  const result = buildPaginatedResponse(items, 3);
  expect(result.hasMore).toBe(true);
  expect(result.nextCursor).toBe(3);
  expect(result.items).toEqual(items);
});
```

### 3. Test Edge Cases

Always test:
- Empty inputs (`[]`, `""`, `undefined`, `null`)
- Boundary values (0, 1, max limits)
- Invalid inputs (negative numbers, NaN, wrong types)
- Large datasets
- Special characters in strings

### 4. Use Descriptive Test Data

```typescript
// ✅ Good: Clear what's being tested
const items = [
  { id: 1, name: 'first' },
  { id: 2, name: 'second' },
  { id: 3, name: 'third' }
];

// ❌ Bad: Generic data
const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
```

### 5. Test Public API, Not Implementation

```typescript
// ✅ Good: Tests behavior
it('should return sorted results', () => {
  const result = parseSort('name', 'asc');
  expect(result).toEqual([{ name: 'asc' }, { id: 'desc' }]);
});

// ❌ Bad: Tests implementation details
it('should call internal helper function', () => {
  const spy = jest.spyOn(module, '_internalHelper');
  parseSort('name', 'asc');
  expect(spy).toHaveBeenCalled();
});
```

## Continuous Integration

Tests should be run:
1. **Locally** - Before committing
2. **Pre-commit hook** - Automatically on `git commit`
3. **CI/CD pipeline** - On every push/PR

### Adding to CI

Example GitHub Actions workflow:

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: yarn install
      - run: yarn jest
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Debugging Tests

### VSCode Debugging

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": [
    "--runInBand",
    "--no-cache",
    "${file}"
  ],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Debugging Tips

```typescript
// Add console.log in tests
it('should work', () => {
  const result = fn(input);
  console.log('Result:', result);
  expect(result).toBe(expected);
});

// Run single test in isolation
yarn jest sorting.test.ts -t "should parse single column"

// Disable test timeout for debugging
jest.setTimeout(100000);
```

## Common Issues

### Issue: Tests timeout

**Solution:** Increase timeout

```typescript
jest.setTimeout(10000); // 10 seconds

// Or per-test
it('long running test', async () => {
  // test code
}, 10000);
```

### Issue: Import errors

**Solution:** Check module mapping in jest.config.js

```javascript
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/$1',
}
```

### Issue: TypeScript errors in tests

**Solution:** Update tsconfig in jest.config.js

```javascript
transform: {
  '^.+\\.tsx?$': ['ts-jest', {
    tsconfig: {
      esModuleInterop: true,
      // ... other options
    },
  }],
}
```

## Future Testing Plans

### Planned Test Coverage

- [ ] Integration tests for getTags controller
- [ ] Integration tests for API endpoints
- [ ] Tests for collections pagination
- [ ] Tests for users pagination
- [ ] Tests for search/filter functionality
- [ ] Performance tests for large datasets

### Testing Real Database

For integration tests that need database:

```typescript
import { prisma } from '@linkwarden/prisma';

beforeAll(async () => {
  // Setup test database
  await prisma.$connect();
});

afterAll(async () => {
  // Cleanup
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clear data before each test
  await prisma.tag.deleteMany();
});

it('should query real database', async () => {
  await prisma.tag.create({
    data: { name: 'test', ownerId: 1 }
  });

  const tags = await getTags({ userId: 1 });
  expect(tags.response.items).toHaveLength(1);
});
```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [ts-jest Documentation](https://kulshekhar.github.io/ts-jest/)
- [Jest Expect Matchers](https://jestjs.io/docs/expect)
- [Testing Best Practices](https://testingjavascript.com/)

## Questions?

For questions about testing:
1. Check this documentation first
2. Review existing test files for examples
3. Consult Jest documentation
4. Ask in team chat/discussions
