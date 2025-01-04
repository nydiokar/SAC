import { describe, it } from 'mocha';
import { expect } from 'chai';
import { ProjectContext, FileChange } from '../../services/project-context/ProjectContext';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

describe('ProjectContext Integration', () => {
    let tempDir: string;
    let projectContext: ProjectContext;

    beforeEach(async () => {
        // Create a temporary directory for testing
        tempDir = path.join(os.tmpdir(), 'project-context-test-' + Math.random().toString(36).slice(2));
        await fs.mkdir(tempDir, { recursive: true });
        projectContext = new ProjectContext(tempDir);
    });

    afterEach(async () => {
        // Clean up temporary directory
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should analyze project structure', async () => {
        // Create test files
        await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({
            dependencies: { 'test-dep': '1.0.0' },
            devDependencies: { 'test-dev-dep': '1.0.0' }
        }));
        await fs.writeFile(path.join(tempDir, 'test.ts'), 'console.log("test");');

        // Analyze project
        await projectContext.analyze();

        // Get structure
        const structure = projectContext.getStructure();

        // Verify dependencies were parsed
        expect(structure.dependencies).to.deep.equal({
            'test-dep': '1.0.0',
            'test-dev-dep': '1.0.0'
        });

        // Verify files were detected
        expect(structure.files.has('package.json')).to.be.true;
        expect(structure.files.has('test.ts')).to.be.true;
    });

    it('should handle file changes', async () => {
        // Create initial file
        const testFilePath = 'test.ts';
        const testContent = 'console.log("test");';
        await fs.writeFile(path.join(tempDir, testFilePath), testContent);

        // Create a file change event
        const changes: FileChange[] = [{
            filePath: testFilePath,
            type: 'created',
            content: testContent
        }];

        // Update context with changes
        await projectContext.updateContext(changes);

        // Verify file was tracked
        const structure = projectContext.getStructure();
        expect(structure.files.has(testFilePath)).to.be.true;
        const fileInfo = structure.files.get(testFilePath);
        expect(fileInfo?.type).to.equal('.ts');
    });
});
