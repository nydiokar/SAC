import { describe, it, beforeEach, afterEach } from 'mocha';
import { LocalStore, OperationPattern } from '../LocalStore';
import path from 'path';
import fs from 'fs';
import os from 'os';
import should from 'should';

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

  it('should store and retrieve a pattern', () => {
    const pattern: Omit<OperationPattern, 'id'> = {
      pattern: 'test pattern',
      context: 'test context',
      timestamp: Date.now(),
      metadata: { key: 'value' }
    };

    const id = store.storePattern(pattern);
    should(id).be.above(0);

    const retrieved = store.findSimilarPattern(pattern.pattern);
    should(retrieved).not.be.null();
    should(retrieved).not.be.undefined();
    
    // Now we can safely assert on the retrieved value
    const nonNullRetrieved = retrieved as OperationPattern;
    nonNullRetrieved.pattern.should.equal(pattern.pattern);
    nonNullRetrieved.context.should.equal(pattern.context);
    nonNullRetrieved.timestamp.should.equal(pattern.timestamp);
    should(nonNullRetrieved.metadata).not.be.undefined();
    should(nonNullRetrieved.metadata).eql(pattern.metadata);
  });

  it('should find similar patterns', () => {
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
    should(similar).not.be.null();
    should(similar).not.be.undefined();
    
    const nonNullSimilar = similar as OperationPattern;
    nonNullSimilar.pattern.should.equal('implement feature Y'); // Should return most recent
  });

  it('should find patterns with context hint', () => {
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
    should(frontendBug).not.be.null();
    should(frontendBug).not.be.undefined();
    const nonNullFrontendBug = frontendBug as OperationPattern;
    nonNullFrontendBug.context.should.equal('frontend component');

    const backendBug = store.findSimilarPattern('fix bug', 'backend');
    should(backendBug).not.be.null();
    should(backendBug).not.be.undefined();
    const nonNullBackendBug = backendBug as OperationPattern;
    nonNullBackendBug.context.should.equal('backend service');
  });

  it('should return null for non-existent patterns', () => {
    const result = store.findSimilarPattern('non-existent pattern');
    should(result).be.null();
  });
});
