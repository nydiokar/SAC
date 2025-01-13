import path from 'path';
import os from 'os';
import fs from 'fs';
import { expect } from 'chai';
import should from 'should';

import { setupVSCodeMock } from '../../../test/setup/vscode';
import { LocalStore } from '../LocalStore';
import { OperationPattern } from '../../patterns/BasePattern';
import { ToolUsage } from '../types';

setupVSCodeMock();

const testDbPath = path.join(os.tmpdir(), 'test-patterns.db');

async function removeTestDbFile() {
  try {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  } catch (error) {
    // If file is busy, wait a bit and try again
    await new Promise(resolve => setTimeout(resolve, 100));
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  }
}

describe('LocalStore', () => {
  let localStore: LocalStore;

  beforeEach(async () => {
    await removeTestDbFile();
    localStore = new LocalStore(testDbPath);
  });

  afterEach(async () => {
    if (localStore) {
      await localStore.close(); // Ensure database is closed
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for connections to close
    await removeTestDbFile();
  });

  // --------------------------------------------------------------------------------
  // Basic Pattern Operations
  // --------------------------------------------------------------------------------
  describe('Basic Pattern Operations', () => {
    it('should store and retrieve a pattern', async () => {
      const pattern: Omit<OperationPattern, 'id'> = {
        pattern: 'test pattern',
        context: 'test context',
        timestamp: Date.now(),
        metadata: {
          taskType: 'test',
          toolUsage: [] as ToolUsage[],
        },
        confidence: 1.0,
      };

      const id = await localStore.storePattern(pattern);
      should(id).be.above(0);

      const retrieved = await localStore.findSimilarPattern(pattern.pattern);
      should(retrieved).not.be.null();
      should(retrieved).not.be.undefined();

      if (retrieved) {
        retrieved.pattern.should.equal(pattern.pattern);
        retrieved.context.should.equal(pattern.context);
        retrieved.timestamp.should.equal(pattern.timestamp);
        should(retrieved.metadata).not.be.undefined();
        should(retrieved.metadata).deepEqual(pattern.metadata);
      }
    });

    it('should find similar patterns', async () => {
      const pattern: Omit<OperationPattern, 'id'> = {
        pattern: 'test pattern',
        context: 'test',
        timestamp: Date.now(),
        metadata: {
          taskType: 'test',
          toolUsage: [] as ToolUsage[],
        },
        confidence: 1.0,
      };

      await localStore.storePattern(pattern);
      const similar = await localStore.findSimilarPattern(pattern.pattern);
      expect(similar).to.not.be.null;
    });

    it('should return null for non-existent patterns', async () => {
      const result = await localStore.findSimilarPattern('non-existent pattern');
      should(result).be.null();
    });
  });

  // --------------------------------------------------------------------------------
  // Pattern Evolution Tests
  // --------------------------------------------------------------------------------
  describe('Pattern Learning and Evolution', () => {
    it('should recognize evolving patterns', async () => {
        // Store a simpler pattern first
        const pattern1 = {
            pattern: 'create component Button',
            context: 'react',
            timestamp: Date.now() - 2000,
            metadata: { 
                taskType: 'component',
                toolUsage: [],
                framework: 'react'
            },
            confidence: 1.0
        };
        await localStore.storePattern(pattern1);

        // Verify we can find the exact pattern
        const exactMatch = await localStore.findSimilarPattern('create component Button', 'react');
        should(exactMatch).not.be.null();
        should(exactMatch?.context).equal('react');

        // Store a similar pattern
        const pattern2 = {
            pattern: 'create component Card',
            context: 'react',
            timestamp: Date.now() - 1000,
            metadata: { 
                taskType: 'component',
                toolUsage: [],
                framework: 'react'
            },
            confidence: 1.0
        };
        await localStore.storePattern(pattern2);

        // Search with partial match
        const similar = await localStore.findSimilarPattern('create component', 'react');
        should(similar).not.be.null();
        should(similar?.metadata.framework).equal('react');
        should(similar?.context).equal('react');
    });
  });

  // --------------------------------------------------------------------------------
  // Multi-Project Pattern Recognition
  // --------------------------------------------------------------------------------
  describe('Multi-Project Pattern Recognition', () => {
    beforeEach(async () => {
      // Setup test patterns
      const projectPatterns = [
        {
          pattern: 'create component Button',
          context: 'react',
          timestamp: Date.now(),
          metadata: {
            taskType: 'component',
            toolUsage: [],
            framework: 'react'
          },
          confidence: 1.0
        },
        {
          pattern: 'add redux store',
          context: 'react',
          timestamp: Date.now(),
          metadata: {
            taskType: 'state',
            toolUsage: [],
            framework: 'react'
          },
          confidence: 1.0
        },
        {
          pattern: 'create api endpoint users',
          context: 'python-fastapi',
          timestamp: Date.now(),
          metadata: {
            taskType: 'endpoint',
            toolUsage: [],
            framework: 'fastapi'
          },
          confidence: 1.0
        }
      ];

      for (const pattern of projectPatterns) {
        await localStore.storePattern(pattern);
      }
    });

    it('should find patterns within specific project context', async () => {
      const reactPattern = await localStore.findSimilarPattern('create component', 'react');
      should(reactPattern).not.be.null();
      should(reactPattern?.context).equal('react');
      should(reactPattern?.metadata.framework).equal('react');
    });

    it('should not mix patterns between projects', async () => {
      const pythonPattern = await localStore.findSimilarPattern('create api', 'python-fastapi');
      should(pythonPattern).not.be.null();
      should(pythonPattern?.metadata.framework).equal('fastapi');
    });

    it('should handle project-specific metadata', async () => {
      const patterns = [
        {
          pattern: 'create component with tailwind',
          context: 'react',
          timestamp: Date.now(),
          metadata: {
            taskType: 'component',
            toolUsage: [],
            framework: 'react',
            filePath: 'src/components/'
          },
          confidence: 1.0
        }
      ];

      for (const p of patterns) {
        await localStore.storePattern(p);
      }

      const found = await localStore.findSimilarPattern('create component', 'react');
      should(found).not.be.null();
      should(found?.metadata.framework).equal('react');
      should(found?.metadata.taskType).equal('component');
    });
  });

  // --------------------------------------------------------------------------------
  // Performance Benchmarks
  // --------------------------------------------------------------------------------
  describe('Performance Benchmarks', () => {
    const printResults = (
      name: string,
      results: {
        operation: string;
        count: number;
        totalTime: number;
        avgTime: number;
      },
    ) => {
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
        await localStore.storePattern({
          pattern: `${operations[i % operations.length]} ${i}`,
          context: contexts[i % contexts.length],
          timestamp: Date.now(),
          metadata: { taskType: 'test' },
          confidence: 1.0,
        } as unknown as OperationPattern);
      }
      const storeTime = Date.now() - storeStart;

      printResults('Bulk Store', {
        operation: 'Store Patterns',
        count: numPatterns,
        totalTime: storeTime,
        avgTime: storeTime / numPatterns,
      });

      // Search Performance Test
      const searches = contexts.map((context) => ({
        pattern: 'create',
        context,
      }));

      const searchTimes: number[] = [];
      for (const search of searches) {
        const searchStart = Date.now();
        const results = await localStore.findSimilarPattern(search.pattern, search.context);
        searchTimes.push(Date.now() - searchStart);
        should(results).not.be.null();
      }

      const avgSearchTime =
        searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;

      printResults('Search Performance', {
        operation: 'Pattern Search',
        count: searches.length,
        totalTime: searchTimes.reduce((a, b) => a + b, 0),
        avgTime: avgSearchTime,
      });

      should(avgSearchTime).be.below(50); // Searches should average under 50ms
    });

    it('should handle concurrent operations efficiently', async () => {
      const numOperations = 10;
      const patterns = Array.from({ length: numOperations }, (_, i) => ({
        pattern: `concurrent test ${i}`,
        context: 'test',
        timestamp: Date.now(),
        metadata: {
          taskType: 'test',
          toolUsage: [] as ToolUsage[],
        },
        confidence: 1.0,
      }));

      // Execute store operations concurrently
      const startTime = Date.now();
      const patternIds = await Promise.all(
        patterns.map(pattern => localStore.storePattern(pattern))
      );
      const endTime = Date.now();

      // Verify all patterns were stored
      for (const patternId of patternIds) {
        expect(patternId).to.be.above(0);
      }

      // Record usage for all patterns concurrently
      await Promise.all(
        patternIds.map(patternId =>
          localStore.recordPatternUsage({
            patternId,
            timestamp: Date.now(),
            outcome: 'success',
          })
        )
      );

      // Verify all patterns have usage records
      for (const patternId of patternIds) {
        const insights = await localStore.getPatternInsights(patternId);
        expect(insights.history.successes).to.be.greaterThan(0);
      }

      // Verify performance
      const totalTime = endTime - startTime;
      const avgTimePerOperation = totalTime / numOperations;
      expect(avgTimePerOperation).to.be.below(100); // Each operation should take less than 100ms on average
    });

    it('should update confidence based on usage', async () => {
      const pattern: OperationPattern = {
        pattern: 'run tests',
        context: 'jest',
        timestamp: Date.now(),
        metadata: {
          taskType: 'test',
          toolUsage: [],
        },
        confidence: 0.5,
      };

      const patternId = await localStore.storePattern(pattern);
      await localStore.updatePatternConfidence(patternId, true);

      const similar = await localStore.findSimilarPattern('run tests');
      expect(similar).to.not.be.null;
      if (similar) {
        expect(similar.confidence).to.be.greaterThan(0.5);
      }
    });
  });

  // --------------------------------------------------------------------------------
  // Pattern Evolution (Additional Tests)
  // --------------------------------------------------------------------------------
  describe('Pattern Evolution', () => {
    it('should track pattern changes', async () => {
      const pattern: Omit<OperationPattern, 'id'> = {
        pattern: 'format code',
        context: 'prettier',
        timestamp: Date.now(),
        metadata: {
          taskType: 'format',
          toolUsage: [] as ToolUsage[],
        },
        confidence: 1.0,
      };

      const patternId = await localStore.storePattern(pattern);
      await localStore.validateAndTrackPattern(patternId, { success: true }, 'prettier', [
        'formatting updated',
      ]);

      const insights = await localStore.getPatternInsights(patternId);
      expect(insights.evolution).to.not.be.empty;
    });

    it('should handle patterns with unicode characters', async () => {
      const pattern: Omit<OperationPattern, 'id'> = {
        pattern: 'search 你好 files',
        context: 'file_search',
        timestamp: Date.now(),
        metadata: { taskType: 'search', toolUsage: [] },
        confidence: 1.0,
      };

      await localStore.storePattern(pattern);
      const foundPattern = await localStore.findSimilarPattern('search 你好 files', 'file_search');
      expect(foundPattern).to.not.be.null;
    });

    it('should handle multiple similar patterns with different timestamps', async () => {
      // Create patterns with clearly different timestamps
      const baseTime = Date.now();
      const basePattern = 'search_files find-todos';

      // Store same pattern multiple times with different timestamps
      for (let i = 0; i < 10; i++) {
        const pattern: Omit<OperationPattern, 'id'> = {
          pattern: basePattern,
          context: 'file_search',
          timestamp: baseTime + 1000 * i,
          metadata: { taskType: 'search', toolUsage: [] },
          confidence: 1.0,
        };
        await localStore.storePattern(pattern);
      }

      // Small delay to ensure all patterns are stored
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify all patterns are found when searching
      const allPatterns = await localStore.findSimilarPattern(basePattern);
      expect(allPatterns).to.not.be.null;
      
      if (Array.isArray(allPatterns)) {
        expect(allPatterns.length).to.equal(10);

        // Verify timestamps are different and in descending order
        for (let i = 0; i < allPatterns.length - 1; i++) {
          const current = allPatterns[i].timestamp;
          const next = allPatterns[i + 1].timestamp;
          expect(current).to.be.greaterThan(
            next,
            `Pattern ${i} timestamp should be greater than pattern ${i + 1}`,
          );
        }
      }
    });

    it('should find similar patterns using findSimilarPattern', async () => {
      const baseTime = Date.now();

      // Store patterns with slight variations
      for (let i = 0; i < 5; i++) {
        const pattern: Omit<OperationPattern, 'id'> = {
          pattern: `search files ${i}`,
          context: 'file_search',
          timestamp: baseTime + 1000 * i,
          metadata: { taskType: 'search', toolUsage: [] },
          confidence: 1.0,
        };
        await localStore.storePattern(pattern);
      }

      // Should find a similar pattern
      const foundPattern = await localStore.findSimilarPattern('search files', 'file_search');
      expect(foundPattern).to.not.be.null;
    });
  });
});

// --------------------------------------------------------------------------------
// Pattern Search (Additional Suite)
// --------------------------------------------------------------------------------
describe('Pattern Search', () => {
  let localStore: LocalStore;  // Declare at test suite level

  beforeEach(async () => {
    await removeTestDbFile();
    localStore = new LocalStore(testDbPath);
  });

  afterEach(async () => {
    if (localStore) {
      await localStore.close();
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    await removeTestDbFile();
  });

  it('should find all matching patterns', async () => {
    const patterns = [
      {
        pattern: 'test pattern one',
        context: 'test',
        timestamp: Date.now(),
        metadata: { taskType: 'test', toolUsage: [] },
        confidence: 1.0
      },
      {
        pattern: 'test pattern two',
        context: 'test',
        timestamp: Date.now(),
        metadata: { taskType: 'test', toolUsage: [] },
        confidence: 1.0
      }
    ];

    for (const p of patterns) {
      await localStore.storePattern(p);
    }

    const results = await localStore.findAllSimilarPatterns('test pattern');
    should(results).not.be.null();
    should(results.length).equal(2);
  });
});
