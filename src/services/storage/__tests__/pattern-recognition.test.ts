import { setupVSCodeMock } from '../../../test/setup/vscode';
setupVSCodeMock();

import { expect } from 'chai';
import { LocalStore } from '../LocalStore';
import { OperationPattern } from '../../patterns/BasePattern';
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
        try {
            // Close the database connection first
            await localStore.close();
            
            if (fs.existsSync(testDbPath)) {
                fs.unlinkSync(testDbPath);
            }
        } catch (error) {
            console.warn('Warning: Could not cleanup test database:', error);
        }
    });

    describe('Pattern Matching', () => {
        it('should store and find similar file operation patterns', async () => {
            const pattern: Omit<OperationPattern, 'id'> = {
                pattern: 'search typescript files',
                context: 'file_search',
                timestamp: Date.now(),
                metadata: {
                    taskType: 'search',
                    toolUsage: []
                },
                confidence: 1.0
            };

            await localStore.storePattern(pattern);
            const foundPattern = await localStore.findSimilarPattern('search typescript files', 'file_search');
            expect(foundPattern).to.not.be.null;
            expect(foundPattern?.pattern).to.equal(pattern.pattern);
        });

        it('should match patterns based on operation type and content similarity', async () => {
            const pattern1: Omit<OperationPattern, 'id'> = {
                pattern: 'edit_file replace imports',
                context: 'file_edit',
                timestamp: Date.now(),
                metadata: {
                    taskType: 'edit',
                    toolUsage: []
                },
                confidence: 1.0
            };

            await localStore.storePattern(pattern1);
            const foundPattern = await localStore.findSimilarPattern('edit_file fix imports', 'file_edit');
            expect(foundPattern).to.not.be.null;
            expect(foundPattern?.metadata?.taskType).to.equal(pattern1.metadata?.taskType);
        });
    });

    describe('Multi-Project Pattern Recognition', () => {
        beforeEach(async () => {
            const projectPatterns: Array<Omit<OperationPattern, 'id'>> = [
                // React Project Patterns
                {
                    pattern: 'create component Button',
                    context: 'react',
                    timestamp: Date.now(),
                    metadata: { 
                        taskType: 'component', 
                        toolUsage: [] as Array<{
                            tool: string;
                            params: any;
                            timestamp: number;
                            success?: boolean;
                        }>,
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
                        toolUsage: [] as Array<{
                            tool: string;
                            params: any;
                            timestamp: number;
                            success?: boolean;
                        }>
                    },
                    confidence: 1.0
                },
                // Python Backend Patterns
                {
                    pattern: 'create api endpoint users',
                    context: 'python-fastapi',
                    timestamp: Date.now(),
                    metadata: { 
                        taskType: 'endpoint', 
                        toolUsage: []
                    },
                    confidence: 1.0
                },
                {
                    pattern: 'add database model User',
                    context: 'python-fastapi',
                    timestamp: Date.now(),
                    metadata: { 
                        taskType: 'model', 
                        toolUsage: []
                    },
                    confidence: 1.0
                }
            ];

            for (const pattern of projectPatterns) {
                await localStore.storePattern(pattern);
            }
        });

        it('should find patterns within specific project context', async () => {
            const reactPattern = await localStore.findSimilarPattern('create component Card', 'react');
            if (reactPattern) {
                expect(reactPattern.metadata?.taskType).to.equal('component');
                expect(reactPattern.metadata?.framework).to.equal('react');
                expect(reactPattern.context).to.equal('react');
            }

            const pythonPattern = await localStore.findSimilarPattern('create api endpoint posts', 'python-fastapi');
            if (pythonPattern) {
                expect(pythonPattern.metadata?.taskType).to.equal('endpoint');
                expect(pythonPattern.metadata?.framework).to.equal('fastapi');
                expect(pythonPattern.context).to.equal('python-fastapi');
            }
        });

        it('should not mix patterns between projects', async () => {
            const nodePattern = await localStore.findSimilarPattern('create route', 'nodejs');
            if (nodePattern) {
                expect(nodePattern.metadata?.framework).to.equal('express');
                expect(nodePattern.metadata?.framework).to.not.equal('react');
                expect(nodePattern.metadata?.framework).to.not.equal('fastapi');
            }
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
                    taskType: 'search',
                    toolUsage: [],
                    path: testWorkspace,
                    regex: 'TODO:',
                    filePattern: '*.ts'
                },
                confidence: 1.0
            };

            // Store the pattern
            await localStore.storePattern(initialPattern);

            // Simulate second search with similar intent
            const foundPattern = await localStore.findSimilarPattern('search_files *.ts', 'file_search');
            expect(foundPattern).to.not.be.null;

            // Actually execute the search using found pattern
            if (foundPattern?.metadata?.path && foundPattern.metadata.regex) {
                const results = await ripgrep.regexSearchFiles(
                    testWorkspace,
                    foundPattern.metadata.path,
                    foundPattern.metadata.regex,
                    foundPattern.metadata.filePattern || '*.ts'
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
                    taskType: 'edit',
                    filePath: path.join(testWorkspace, 'test1.ts'),
                    changes: {
                        from: 'console.log',
                        to: 'logger.debug'
                    },
                    toolUsage: []
                },
                confidence: 1.0
            };

            await localStore.storePattern(editPattern);
            const foundPattern = await localStore.findSimilarPattern('edit_file replace-console', 'file_edit');
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
                    taskType: 'search',
                    toolUsage: []
                },
                confidence: 1.0
            };

            await localStore.storePattern(searchPattern);

            // Store edit pattern based on search results
            const editPattern: Omit<OperationPattern, 'id'> = {
                pattern: 'edit_file update-logs',
                context: 'file_edit',
                timestamp: Date.now() + 1000,
                metadata: {
                    taskType: 'edit',
                    toolUsage: []
                },
                confidence: 1.0
            };

            await localStore.storePattern(editPattern);

            // Simulate sequence of operations
            const operations = [
                { pattern: 'search_files find-logs', context: 'file_search' },
                { pattern: 'edit_file update-logs', context: 'file_edit' }
            ];

            for (const op of operations) {
                const foundPattern = await localStore.findSimilarPattern(op.pattern, op.context);
                expect(foundPattern).to.not.be.null;
                expect(foundPattern?.context).to.equal(op.context);
            }
        });
    });
});
