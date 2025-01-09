// First, set up VSCode mock
import { setupVSCodeMock } from '../../../test/setup/vscode';
setupVSCodeMock();

// Then import everything else
import { expect } from 'chai';
import { LocalStore, OperationPattern } from '../LocalStore';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { TestVSCodeInterface } from '../../vscode/TestVSCodeInterface';
import * as ripgrep from '../../ripgrep';
import sinon from 'sinon';

describe('Pattern Recognition', () => {
    let localStore: LocalStore;
    const testDbPath = path.join(os.tmpdir(), 'test-patterns.db');

    beforeEach(() => {
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        localStore = new LocalStore(testDbPath);
    });

    afterEach(async () => {
        await localStore.close();
    });

    describe('Pattern Matching', () => {
        it('should store and find similar file operation patterns', () => {
            const pattern: Omit<OperationPattern, 'id'> = {
                pattern: 'search typescript files',
                context: 'file_search',
                timestamp: Date.now(),
                metadata: {
                    filePattern: '*.ts',
                    regex: 'test'
                }
            };

            localStore.storePattern(pattern);
            const foundPattern = localStore.findSimilarPattern('search typescript files', 'file_search');
            expect(foundPattern).to.not.be.null;
            expect(foundPattern?.pattern).to.equal(pattern.pattern);
        });

        it('should find multiple patterns for the same operation', () => {
            const pattern1: Omit<OperationPattern, 'id'> = {
                pattern: 'search_files *.ts',
                context: 'file_search',
                timestamp: Date.now(),
                metadata: { filePattern: '*.ts' }
            };

            const pattern2: Omit<OperationPattern, 'id'> = {
                pattern: 'search_files *.ts',
                context: 'file_search',
                timestamp: Date.now() + 1000,
                metadata: { filePattern: '*.tsx' }
            };

            localStore.storePattern(pattern1);
            localStore.storePattern(pattern2);
            const patterns = localStore.findAllPatterns('search_files *.ts');
            expect(patterns).to.have.lengthOf(2);
        });

        it('should match patterns with partial word similarity', () => {
            const pattern: Omit<OperationPattern, 'id'> = {
                pattern: 'search typescript files',
                context: 'file_search',
                timestamp: Date.now(),
                metadata: { filePattern: '*.ts' }
            };

            localStore.storePattern(pattern);
            const foundPattern = localStore.findSimilarPattern('search typescript', 'file_search');
            expect(foundPattern).to.not.be.null;
        });

        it('should recognize file edit patterns', () => {
            const editPattern: Omit<OperationPattern, 'id'> = {
                pattern: 'edit_file main.ts',
                context: 'file_edit',
                timestamp: Date.now(),
                metadata: {
                    filePath: './src/main.ts',
                    changes: {
                        from: 'console.log',
                        to: 'logger.debug'
                    }
                }
            };

            localStore.storePattern(editPattern);
            const foundPattern = localStore.findSimilarPattern('edit_file main.ts', 'file_edit');
            expect(foundPattern).to.not.be.null;
            expect(foundPattern?.metadata?.changes).to.deep.equal(editPattern.metadata?.changes);
        });

        it('should recognize similar file operations with different paths', () => {
            const writePattern: Omit<OperationPattern, 'id'> = {
                pattern: 'write_file config.json',
                context: 'file_write',
                timestamp: Date.now(),
                metadata: {
                    filePath: './config.json',
                    content: '{"debug": true}'
                }
            };

            localStore.storePattern(writePattern);
            const foundPattern = localStore.findSimilarPattern('write_file test-config.json', 'file_write');
            expect(foundPattern).to.not.be.null;
            expect(foundPattern?.pattern).to.equal(writePattern.pattern);
        });

        it('should match patterns based on operation type and content similarity', () => {
            const pattern1: Omit<OperationPattern, 'id'> = {
                pattern: 'edit_file replace imports',
                context: 'file_edit',
                timestamp: Date.now(),
                metadata: {
                    filePath: './src/utils.ts',
                    changes: {
                        from: 'import { foo } from "bar"',
                        to: 'import { foo } from "@/bar"'
                    }
                }
            };

            localStore.storePattern(pattern1);
            const foundPattern = localStore.findSimilarPattern('edit_file fix imports', 'file_edit');
            expect(foundPattern).to.not.be.null;
            expect(foundPattern?.metadata?.changes).to.deep.equal(pattern1.metadata?.changes);
        });
    });

    describe('Integration Tests', () => {
        let vscode: TestVSCodeInterface;
        const testWorkspace = path.join(os.tmpdir(), 'test-workspace');

        beforeEach(async () => {
            vscode = new TestVSCodeInterface();
            
            sinon.stub(ripgrep, 'regexSearchFiles').callsFake(async (cwd, dirPath, regex) => {
                const results = [];
                const files = fs.readdirSync(dirPath);
                
                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    if (fs.statSync(filePath).isFile()) {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].match(regex)) {
                                results.push(`${file}:${i + 1}: ${lines[i]}`);
                            }
                        }
                    }
                }
                return results.join('\n') || "No results found";
            });

            if (fs.existsSync(testWorkspace)) {
                fs.rmSync(testWorkspace, { recursive: true, force: true });
            }
            fs.mkdirSync(testWorkspace, { recursive: true });
            
            fs.writeFileSync(
                path.join(testWorkspace, 'test1.ts'),
                'console.log("test1");\n// TODO: implement feature'
            );
            fs.writeFileSync(
                path.join(testWorkspace, 'test2.ts'),
                'console.log("test2");\n// TODO: fix bug'
            );
        });

        afterEach(() => {
            if (fs.existsSync(testWorkspace)) {
                fs.rmSync(testWorkspace, { recursive: true, force: true });
            }
            sinon.restore();
        });

        it('should store and reuse search pattern with actual file operations', async () => {
            // First search operation
            const initialPattern: Omit<OperationPattern, 'id'> = {
                pattern: 'search_files *.ts',
                context: 'file_search',
                timestamp: Date.now(),
                metadata: {
                    filePattern: '*.ts',
                    regex: 'TODO:',
                    path: testWorkspace
                }
            };

            // Store the pattern
            localStore.storePattern(initialPattern);

            // Simulate second search with similar intent
            const foundPattern = localStore.findSimilarPattern('search_files *.ts', 'file_search');
            expect(foundPattern).to.not.be.null;

            // Actually execute the search using found pattern
            if (foundPattern?.metadata) {
                const results = await ripgrep.regexSearchFiles(
                    testWorkspace,
                    foundPattern.metadata.path,
                    foundPattern.metadata.regex,
                    foundPattern.metadata.filePattern
                );

                // Verify search results
                expect(results).to.include('TODO: implement feature');
                expect(results).to.include('TODO: fix bug');
            }
        });

        it('should store and reuse file edit patterns with actual file changes', async () => {
            // Initial edit operation
            const editPattern: Omit<OperationPattern, 'id'> = {
                pattern: 'edit_file replace-console',
                context: 'file_edit',
                timestamp: Date.now(),
                metadata: {
                    filePath: path.join(testWorkspace, 'test1.ts'),
                    changes: {
                        from: 'console.log',
                        to: 'logger.debug'
                    }
                }
            };

            // Store the pattern
            localStore.storePattern(editPattern);

            // Simulate finding pattern for similar edit in another file
            const foundPattern = localStore.findSimilarPattern('edit_file replace-console', 'file_edit');
            expect(foundPattern).to.not.be.null;

            if (foundPattern?.metadata?.changes) {
                // Apply the found pattern to test2.ts
                const content = fs.readFileSync(path.join(testWorkspace, 'test2.ts'), 'utf-8');
                const newContent = content.replace(
                    foundPattern.metadata.changes.from,
                    foundPattern.metadata.changes.to
                );
                fs.writeFileSync(path.join(testWorkspace, 'test2.ts'), newContent);

                // Verify the changes
                const updatedContent = fs.readFileSync(path.join(testWorkspace, 'test2.ts'), 'utf-8');
                expect(updatedContent).to.include('logger.debug');
                expect(updatedContent).to.not.include('console.log');
            }
        });

        it('should handle multiple similar operations in sequence', async () => {
            // Store initial search pattern
            const searchPattern: Omit<OperationPattern, 'id'> = {
                pattern: 'search_files find-logs',
                context: 'file_search',
                timestamp: Date.now(),
                metadata: {
                    filePattern: '*.ts',
                    regex: 'console.log',
                    path: testWorkspace
                }
            };

            localStore.storePattern(searchPattern);

            // Store edit pattern based on search results
            const editPattern: Omit<OperationPattern, 'id'> = {
                pattern: 'edit_file update-logs',
                context: 'file_edit',
                timestamp: Date.now() + 1000,
                metadata: {
                    filePath: path.join(testWorkspace, 'test1.ts'),
                    changes: {
                        from: 'console.log',
                        to: 'logger.debug'
                    }
                }
            };

            localStore.storePattern(editPattern);

            // Simulate sequence of operations
            const operations = [
                { pattern: 'search_files find-logs', context: 'file_search' },
                { pattern: 'edit_file update-logs', context: 'file_edit' }
            ];

            for (const op of operations) {
                const foundPattern = localStore.findSimilarPattern(op.pattern, op.context);
                expect(foundPattern).to.not.be.null;
                expect(foundPattern?.context).to.equal(op.context);
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty patterns gracefully', () => {
            const pattern: Omit<OperationPattern, 'id'> = {
                pattern: '',
                context: 'file_search',
                timestamp: Date.now(),
                metadata: { filePattern: '*.ts' }
            };

            // We should either:
            // 1. Not store empty patterns, or
            // 2. Accept that empty patterns can be stored but verify their behavior
            
            // Let's verify that empty patterns are stored but don't match anything
            localStore.storePattern(pattern);
            const foundPattern = localStore.findSimilarPattern('some actual search', 'file_search');
            expect(foundPattern).to.be.null;
        });

        it('should handle special characters in patterns', () => {
            const pattern: Omit<OperationPattern, 'id'> = {
                pattern: 'search file with @#$%^',
                context: 'file_search',
                timestamp: Date.now(),
                metadata: { filePattern: '*.ts' }
            };

            localStore.storePattern(pattern);
            const foundPattern = localStore.findSimilarPattern('search file with @#$%^', 'file_search');
            expect(foundPattern).to.not.be.null;
        });

        it('should handle very long patterns', () => {
            const longPattern = 'search ' + 'very '.repeat(100) + 'long pattern';
            const pattern: Omit<OperationPattern, 'id'> = {
                pattern: longPattern,
                context: 'file_search',
                timestamp: Date.now(),
                metadata: { filePattern: '*.ts' }
            };

            localStore.storePattern(pattern);
            const foundPattern = localStore.findSimilarPattern(longPattern, 'file_search');
            expect(foundPattern).to.not.be.null;
        });

        it('should handle patterns with different cases', () => {
            const pattern: Omit<OperationPattern, 'id'> = {
                pattern: 'Search TypeScript Files',
                context: 'file_search',
                timestamp: Date.now(),
                metadata: { filePattern: '*.ts' }
            };

            localStore.storePattern(pattern);
            const foundPattern = localStore.findSimilarPattern('search typescript files', 'file_search');
            expect(foundPattern).to.not.be.null;
        });

        it('should handle invalid metadata', () => {
            const pattern: Omit<OperationPattern, 'id'> = {
                pattern: 'search files',
                context: 'file_search',
                timestamp: Date.now(),
                metadata: null as any
            };

            localStore.storePattern(pattern);
            const foundPattern = localStore.findSimilarPattern('search files', 'file_search');
            expect(foundPattern).to.not.be.null;
        });

        it('should handle patterns with unicode characters', () => {
            const pattern: Omit<OperationPattern, 'id'> = {
                pattern: 'search 你好 files',
                context: 'file_search',
                timestamp: Date.now(),
                metadata: { filePattern: '*.ts' }
            };

            localStore.storePattern(pattern);
            const foundPattern = localStore.findSimilarPattern('search 你好 files', 'file_search');
            expect(foundPattern).to.not.be.null;
        });

        it('should handle multiple similar patterns with different timestamps', async () => {
            // Create patterns with clearly different timestamps
            const baseTime = Date.now();
            const basePattern = 'search_files find-todos';
            
            // Store same pattern multiple times with different timestamps
            for (let i = 0; i < 10; i++) {
                const pattern: Omit<OperationPattern, 'id'> = {
                    pattern: basePattern,  // Use exact same pattern
                    context: 'file_search',
                    timestamp: baseTime + (1000 * i),  // Ensure 1 second difference between each
                    metadata: { filePattern: '*.ts' }
                };
                localStore.storePattern(pattern);
            }

            // Add a small delay to ensure all patterns are stored
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify all patterns are found when searching
            const allPatterns = localStore.findAllPatterns(basePattern);
            expect(allPatterns.length).to.equal(10);

            // Verify timestamps are different and in descending order
            for (let i = 0; i < allPatterns.length - 1; i++) {
                const current = allPatterns[i].timestamp;
                const next = allPatterns[i + 1].timestamp;
                expect(current, `Pattern ${i} timestamp should be greater than pattern ${i + 1}`).to.be.greaterThan(next);
            }
        });

        it('should find similar patterns using findSimilarPattern', async () => {
            const baseTime = Date.now();
            
            // Store patterns with slight variations
            for (let i = 0; i < 5; i++) {
                const pattern: Omit<OperationPattern, 'id'> = {
                    pattern: `search files ${i}`,
                    context: 'file_search',
                    timestamp: baseTime + (1000 * i),
                    metadata: { filePattern: '*.ts' }
                };
                localStore.storePattern(pattern);
            }

            // Should find a similar pattern
            const foundPattern = localStore.findSimilarPattern('search files', 'file_search');
            expect(foundPattern).to.not.be.null;
        });
    });
});
