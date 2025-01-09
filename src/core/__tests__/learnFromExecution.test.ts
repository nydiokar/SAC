import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { Cline, ExecutionResult } from '../Cline';
import { LocalStore, OperationPattern } from '../../services/storage/LocalStore';
import { FileChange, ProjectContext } from '../../services/project-context/ProjectContext';
import { TestVSCodeInterface } from '../../services/vscode/TestVSCodeInterface';
import path from 'path';
import fs from 'fs';
import os from 'os';


describe('Cline.learnFromExecution', () => {
    let cline: Cline;
    let localStore: LocalStore;
    let projectContext: ProjectContext;
    let dbPath: string;
    let workspacePath: string;
    let vscodeInterface: TestVSCodeInterface;

    beforeEach(() => {
        dbPath = path.join(os.tmpdir(), `test-db-${Date.now()}.sqlite`);
        localStore = new LocalStore(dbPath);
        workspacePath = path.join(os.tmpdir(), `test-workspace-${Date.now()}`);
        fs.mkdirSync(workspacePath, { recursive: true });
        projectContext = new ProjectContext(workspacePath);
        vscodeInterface = new TestVSCodeInterface();

        cline = new Cline(
            {} as any,
            { model: 'test-model' } as any,
            { enabled: false } as any,
            vscodeInterface,
            projectContext,
            localStore,
            undefined,
            'Test task'
        );
    });

    afterEach(async () => {
        await localStore.close();
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
        if (fs.existsSync(workspacePath)) {
            await fs.promises.rm(workspacePath, { recursive: true, force: true });
        }
    });

    it('should store successful execution pattern with file changes', async () => {
        // Create necessary directories first
        const testFilePath = path.join(workspacePath, 'test.ts');
        await fs.promises.writeFile(testFilePath, 'console.log("test");');

        const fileChanges: FileChange[] = [{
            filePath: 'test.ts',
            type: 'created',
            content: 'console.log("test");'
        }];

        await projectContext.updateContext(fileChanges);

        const result: ExecutionResult = {
            status: 'success',
            fileChanges
        };

        await cline['learnFromExecution']('Create a test file', result);

        const pattern = await localStore.findSimilarPattern('Create a test file');
        expect(pattern).to.not.be.null;
        expect(pattern?.pattern).to.equal('Create a test file');
        expect(pattern?.context).to.include('test.ts');
    });

    it('should store failed execution pattern with error details', async () => {
        const result: ExecutionResult = {
            status: 'error',
            error: 'Test error message'
        };

        await cline['learnFromExecution']('Failed task', result);

        const pattern = await localStore.findSimilarPattern('Failed task');
        expect(pattern).to.not.be.null;
        expect(pattern?.pattern).to.equal('Failed task');
        expect(pattern?.context).to.include('Test error message');
    });

    it('should store pattern with user feedback', async () => {
        const result: ExecutionResult = {
            status: 'success',
            userFeedback: 'Test feedback'
        };
        
        await cline['learnFromExecution']('Task with feedback', result);

        const patterns = await localStore.findAllPatterns('Task with feedback');
        expect(patterns).to.have.length(2); // One for status, one for feedback
        
        // Find the feedback pattern
        const feedbackPattern = patterns.find((p: OperationPattern) => p.metadata?.type === 'feedback');
        expect(feedbackPattern).to.not.be.null;
        expect(feedbackPattern?.context).to.equal('User Feedback: Test feedback');
    });

    it('should store successful execution pattern with multiple file changes', async () => {
        const srcDir = path.join(workspacePath, 'src');
        await fs.promises.mkdir(srcDir, { recursive: true });
        
        await fs.promises.writeFile(
            path.join(srcDir, 'test.ts'), 
            'console.log("test");'
        );
        await fs.promises.writeFile(
            path.join(srcDir, 'lib.ts'), 
            'export const foo = () => {};'
        );

        const fileChanges: FileChange[] = [
            {
                filePath: 'src/test.ts',
                type: 'created',
                content: 'console.log("test");'
            },
            {
                filePath: 'src/lib.ts',
                type: 'modified',
                content: 'export const foo = () => {};'
            }
        ];

        await projectContext.updateContext(fileChanges);

        const result: ExecutionResult = {
            status: 'success',
            fileChanges,
            userFeedback: 'Great job!'
        };

        await cline['learnFromExecution']('Complex task', result);

        const patterns = await localStore.findAllPatterns('Complex task');
        expect(patterns).to.have.length(2); // One for status+files, one for feedback

        // Find the main pattern
        const mainPattern = patterns.find((p: OperationPattern) => !p.metadata?.type);
        expect(mainPattern?.context).to.include('src/test.ts');
        expect(mainPattern?.context).to.include('src/lib.ts');

        // Find the feedback pattern
        const feedbackPattern = patterns.find((p: OperationPattern) => p.metadata?.type === 'feedback');
        expect(feedbackPattern?.context).to.equal('User Feedback: Great job!');
    });

    it('should handle empty execution result gracefully', async () => {
        const result: ExecutionResult = {
            status: 'success'
        };

        await cline['learnFromExecution']('Simple task', result);

        const pattern = await localStore.findSimilarPattern('Simple task');
        expect(pattern).to.not.be.null;
        expect(pattern?.pattern).to.equal('Simple task');
        expect(pattern?.context).to.include('Status: success');
    });

    it('should handle execution result with undefined fields', async () => {
        const result: ExecutionResult = {
            status: 'success',
            fileChanges: undefined,
            userFeedback: undefined,
            error: undefined
        };

        await cline['learnFromExecution']('Task with undefined fields', result);

        const pattern = await localStore.findSimilarPattern('Task with undefined fields');
        expect(pattern).to.not.be.null;
        expect(pattern?.pattern).to.equal('Task with undefined fields');
        expect(pattern?.context).to.include('Status: success');
    });
});