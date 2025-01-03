import { LocalStore, OperationPattern } from '../LocalStore';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('LocalStore', () => {
  let store: LocalStore;
  let dbPath: string;

  beforeEach(() => {
    // Create a temporary database file for testing
    dbPath = path.join(os.tmpdir(), `test-db-${Date.now()}.sqlite`);
    store = new LocalStore(dbPath);
  });

  afterEach(() => {
    // Clean up after each test
    store.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  test('should store and retrieve a pattern', () => {
    const pattern: Omit<OperationPattern, 'id'> = {
      pattern: 'test pattern',
      context: 'test context',
      timestamp: Date.now(),
      metadata: { key: 'value' }
    };

    const id = store.storePattern(pattern);
    expect(id).toBeGreaterThan(0);

    const retrieved = store.findSimilarPattern(pattern.pattern);
    expect(retrieved).toBeTruthy();
    expect(retrieved?.pattern).toBe(pattern.pattern);
    expect(retrieved?.context).toBe(pattern.context);
    expect(retrieved?.timestamp).toBe(pattern.timestamp);
    expect(retrieved?.metadata).toEqual(pattern.metadata);
  });

  test('should find similar patterns', () => {
    const patterns = [
      {
        pattern: 'implement feature X',
        context: 'frontend',
        timestamp: Date.now() - 1000
      },
      {
        pattern: 'implement feature Y',
        context: 'backend',
        timestamp: Date.now()
      }
    ];

    patterns.forEach(p => store.storePattern(p));

    const similar = store.findSimilarPattern('implement feature');
    expect(similar).toBeTruthy();
    expect(similar?.pattern).toBe('implement feature Y'); // Should return most recent
  });

  test('should find patterns with context hint', () => {
    const patterns = [
      {
        pattern: 'fix bug',
        context: 'frontend component',
        timestamp: Date.now() - 1000
      },
      {
        pattern: 'fix bug',
        context: 'backend service',
        timestamp: Date.now()
      }
    ];

    patterns.forEach(p => store.storePattern(p));

    const frontendBug = store.findSimilarPattern('fix bug', 'frontend');
    expect(frontendBug).toBeTruthy();
    expect(frontendBug?.context).toBe('frontend component');

    const backendBug = store.findSimilarPattern('fix bug', 'backend');
    expect(backendBug).toBeTruthy();
    expect(backendBug?.context).toBe('backend service');
  });

  test('should return null for non-existent patterns', () => {
    const result = store.findSimilarPattern('non-existent pattern');
    expect(result).toBeNull();
  });
});
