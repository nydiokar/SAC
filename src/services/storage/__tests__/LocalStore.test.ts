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
        timestamp: Date.now() - 1000  // older timestamp
      },
      {
        pattern: 'implement feature Y',
        context: 'backend',
        timestamp: Date.now()         // newer timestamp
      }
    ];

    // Store patterns in order
    patterns.forEach(p => store.storePattern(p));

    // When searching for similar patterns, it should return the most recent one
    const similar = store.findSimilarPattern('implement feature');
    should(similar).not.be.null();
    should(similar).not.be.undefined();
    
    // The test is failing here - it's getting X when it should get Y
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

  describe('Pattern Learning and Evolution', () => {
    it('should recognize evolving patterns', () => {
      const patterns = [
        {
          pattern: 'create component Button',
          context: 'react',
          timestamp: Date.now() - 2000,
          metadata: { type: 'component' }
        },
        {
          pattern: 'create component Button with styles',
          context: 'react',
          timestamp: Date.now() - 1000,
          metadata: { type: 'component', hasStyles: true }
        },
        {
          pattern: 'create component Button with styles and tests',
          context: 'react',
          timestamp: Date.now(),
          metadata: { type: 'component', hasStyles: true, hasTests: true }
        }
      ];

      patterns.forEach(p => store.storePattern(p));

      const similar = store.findSimilarPattern('create component Card with styles and tests');
      should(similar).not.be.null();
      should(similar?.metadata?.hasTests).be.true();
      should(similar?.metadata?.hasStyles).be.true();
    });
  });

  describe('Multi-Project Pattern Recognition', () => {
    beforeEach(async () => {
      // Setup test patterns for different projects
      const projectPatterns = [
        // React Project Patterns
        {
          pattern: 'create component Button',
          context: 'react',
          timestamp: Date.now(),
          metadata: { type: 'component', framework: 'react' }
        },
        {
          pattern: 'add redux store',
          context: 'react',
          timestamp: Date.now(),
          metadata: { type: 'state', framework: 'react' }
        },
        // Python Backend Patterns
        {
          pattern: 'create api endpoint users',
          context: 'python-fastapi',
          timestamp: Date.now(),
          metadata: { type: 'endpoint', framework: 'fastapi' }
        },
        {
          pattern: 'add database model User',
          context: 'python-fastapi',
          timestamp: Date.now(),
          metadata: { type: 'model', framework: 'fastapi' }
        },
        // Node.js Patterns
        {
          pattern: 'create express route auth',
          context: 'nodejs',
          timestamp: Date.now(),
          metadata: { type: 'route', framework: 'express' }
        }
      ];

      for (const pattern of projectPatterns) {
        await store.storePattern(pattern);
      }
    });

    it('should find patterns within specific project context', () => {
      // React context
      const reactPattern = store.findSimilarPattern('create component Card', 'react');
      should(reactPattern).not.be.null();
      should(reactPattern?.metadata?.framework).equal('react');
      should(reactPattern?.context).equal('react');

      // Python context
      const pythonPattern = store.findSimilarPattern('create api endpoint posts', 'python-fastapi');
      should(pythonPattern).not.be.null();
      should(pythonPattern?.metadata?.framework).equal('fastapi');
      should(pythonPattern?.context).equal('python-fastapi');
    });

    it('should not mix patterns between projects', () => {
      const nodePattern = store.findSimilarPattern('create route', 'nodejs');
      should(nodePattern).not.be.null();
      should(nodePattern?.metadata?.framework).not.equal('react');
      should(nodePattern?.metadata?.framework).not.equal('fastapi');
    });

    it('should handle project-specific metadata', () => {
      const patterns = [
        {
          pattern: 'create component with tailwind',
          context: 'react',
          timestamp: Date.now(),
          metadata: { 
            type: 'component', 
            framework: 'react',
            styling: 'tailwind'
          }
        },
        {
          pattern: 'create fastapi endpoint with auth',
          context: 'python-fastapi',
          timestamp: Date.now(),
          metadata: { 
            type: 'endpoint', 
            framework: 'fastapi',
            security: 'auth'
          }
        }
      ];

      patterns.forEach(p => store.storePattern(p));

      const reactPattern = store.findSimilarPattern('create component styled', 'react');
      should(reactPattern?.metadata?.styling).equal('tailwind');

      const pythonPattern = store.findSimilarPattern('create endpoint secure', 'python-fastapi');
      should(pythonPattern?.metadata?.security).equal('auth');
    });
  });

  describe('Performance Benchmarks', () => {
    const printResults = (name: string, results: {
        operation: string;
        count: number;
        totalTime: number;
        avgTime: number;
    }) => {
        console.log('\n' + '='.repeat(50));
        console.log(`Benchmark: ${name}`);
        console.log('-'.repeat(50));
        console.log(`Operation: ${results.operation}`);
        console.log(`Total Items: ${results.count}`);
        console.log(`Total Time: ${results.totalTime}ms`);
        console.log(`Average Time: ${results.avgTime.toFixed(2)}ms per operation`);
        console.log('='.repeat(50) + '\n');
    };

    it('should handle bulk operations efficiently', async () => {
        const numPatterns = 1000;
        const contexts = ['react', 'python', 'nodejs'];
        const operations = ['create', 'update', 'delete', 'find'];

        // Bulk Store Test
        const storeStart = Date.now();
        for (let i = 0; i < numPatterns; i++) {
            await store.storePattern({
                pattern: `${operations[i % operations.length]} ${i}`,
                context: contexts[i % contexts.length],
                timestamp: Date.now(),
                metadata: { index: i }
            });
        }
        const storeTime = Date.now() - storeStart;

        printResults('Bulk Store', {
            operation: 'Store Patterns',
            count: numPatterns,
            totalTime: storeTime,
            avgTime: storeTime / numPatterns
        });

        // Search Performance Test
        const searches = contexts.map(context => ({
            pattern: 'create',
            context
        }));

        const searchTimes: number[] = [];
        for (const search of searches) {
            const searchStart = Date.now();
            const results = store.findSimilarPattern(search.pattern, search.context);
            searchTimes.push(Date.now() - searchStart);
            should(results).not.be.null();
        }

        const avgSearchTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
        
        printResults('Search Performance', {
            operation: 'Pattern Search',
            count: searches.length,
            totalTime: searchTimes.reduce((a, b) => a + b, 0),
            avgTime: avgSearchTime
        });

        should(avgSearchTime).be.below(50); // Searches should average under 50ms
    });

    it('should handle concurrent operations efficiently', async () => {
        const numOperations = 100;
        const operations = Array(numOperations).fill(null).map((_, i) => ({
            store: {
                pattern: `concurrent test ${i}`,
                context: i % 2 === 0 ? 'react' : 'python',
                timestamp: Date.now(),
                metadata: { index: i }
            },
            search: 'concurrent test'
        }));

        const startTime = Date.now();
        const results = await Promise.all(operations.map(async op => {
            const storeStart = Date.now();
            await store.storePattern(op.store);
            const storeTime = Date.now() - storeStart;

            const searchStart = Date.now();
            const result = store.findSimilarPattern(op.search, op.store.context);
            const searchTime = Date.now() - searchStart;

            should(result).not.be.null();
            return { storeTime, searchTime };
        }));

        const totalTime = Date.now() - startTime;
        const avgStoreTime = results.reduce((sum, r) => sum + r.storeTime, 0) / results.length;
        const avgSearchTime = results.reduce((sum, r) => sum + r.searchTime, 0) / results.length;

        printResults('Concurrent Operations', {
            operation: 'Store + Search',
            count: numOperations,
            totalTime,
            avgTime: totalTime / numOperations
        });

        console.log(`Average Store Time: ${avgStoreTime.toFixed(2)}ms`);
        console.log(`Average Search Time: ${avgSearchTime.toFixed(2)}ms`);

        should(totalTime).be.below(1000); // Total time under 1 second
        should(avgStoreTime).be.below(10); // Average store time under 10ms
        should(avgSearchTime).be.below(10); // Average search time under 10ms
    });
  });
});
