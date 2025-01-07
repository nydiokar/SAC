import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { ProjectContext, FileChange } from '../ProjectContext';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import proxyquire from 'proxyquire';

// Mock vscode using proxyquire
const { ProjectContext: ProjectContextWithMock } = proxyquire('../ProjectContext', {
    'vscode': {
        workspace: {
            createFileSystemWatcher: () => ({
                onDidChange: () => ({ dispose: () => {} }),
                onDidCreate: () => ({ dispose: () => {} }),
                onDidDelete: () => ({ dispose: () => {} }),
                dispose: () => {}
            })
        },
        RelativePattern: class {
            constructor(public base: string, public pattern: string) {}
        },
        '@noCallThru': true
    }
});

describe('ProjectContext', () => {
    let tempDir: string;
    let projectContext: ProjectContext;

    beforeEach(async () => {
        tempDir = path.join(os.tmpdir(), 'project-context-test-' + Math.random().toString(36).slice(2));
        await fs.mkdir(tempDir, { recursive: true });
        projectContext = new ProjectContextWithMock(tempDir);
    });

    afterEach(async () => {
        // Clean up temporary directory
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should initialize with a root directory', () => {
        expect(projectContext.getStructure().root).to.equal(tempDir);
    });

    it('should handle file changes', async () => {
        // Create test file first
        const testFilePath = path.join(tempDir, 'test.ts');
        await fs.writeFile(testFilePath, 'test content');

        const changes: FileChange[] = [{
            filePath: 'test.ts',
            type: 'created',
            content: 'test content'
        }];

        await projectContext.updateContext(changes);
        const structure = projectContext.getStructure();
        
        expect(structure.files.has('test.ts')).to.be.true;
        const fileInfo = structure.files.get('test.ts');
        expect(fileInfo?.type).to.equal('.ts');
    });

    it('should analyze project structure', async () => {
        // Create some test files
        await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({
            dependencies: { 'test-dep': '1.0.0' },
            devDependencies: { 'test-dev-dep': '1.0.0' }
        }));
        await fs.writeFile(path.join(tempDir, 'test.ts'), 'console.log("test");');

        await projectContext.analyze();
        const structure = projectContext.getStructure();

        expect(structure.dependencies).to.deep.equal({
            'test-dep': '1.0.0',
            'test-dev-dep': '1.0.0'
        });
        expect(structure.files.has('package.json')).to.be.true;
        expect(structure.files.has('test.ts')).to.be.true;
    });

    describe('validateStructure', () => {
        it('should allow valid file operations', async () => {
            const result = await projectContext.validateStructure(
                path.join(tempDir, 'test.ts'),
                'create'
            );
            expect(result.isValid).to.be.true;
        });

        it('should prevent access outside project directory', async () => {
            const result = await projectContext.validateStructure(
                path.join(tempDir, '..', 'outside.txt'),
                'read'
            );
            expect(result.isValid).to.be.false;
            expect(result.reason).to.include('outside project directory');
        });

        it('should prevent access to node_modules', async () => {
            const result = await projectContext.validateStructure(
                path.join(tempDir, 'node_modules', 'package.json'),
                'read'
            );
            expect(result.isValid).to.be.false;
            expect(result.reason).to.include('Restricted system directory');
        });

        it('should prevent access to .env files', async () => {
            const result = await projectContext.validateStructure(
                path.join(tempDir, '.env'),
                'read'
            );
            expect(result.isValid).to.be.false;
            expect(result.reason).to.include('Sensitive environment files');
        });

        it('should prevent modification of non-existent files', async () => {
            const result = await projectContext.validateStructure(
                path.join(tempDir, 'nonexistent.ts'),
                'modify'
            );
            expect(result.isValid).to.be.false;
            expect(result.reason).to.include('does not exist');
        });

        it('should handle file existence checks correctly', async () => {
            // Create a test file
            const testFile = path.join(tempDir, 'existing.ts');
            await fs.writeFile(testFile, 'test content');
            await projectContext.updateContext([{
                filePath: 'existing.ts',
                type: 'created',
                content: 'test content'
            }]);

            // Test creating an existing file
            const createResult = await projectContext.validateStructure(testFile, 'create');
            expect(createResult.isValid).to.be.false;
            expect(createResult.reason).to.include('already exists');

            // Test modifying an existing file
            const modifyResult = await projectContext.validateStructure(testFile, 'modify');
            expect(modifyResult.isValid).to.be.true;

            // Test deleting an existing file
            const deleteResult = await projectContext.validateStructure(testFile, 'delete');
            expect(deleteResult.isValid).to.be.true;
        });
    });
});
