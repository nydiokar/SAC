import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { Cline } from '../Cline';
import { LocalStore } from '../../services/storage/LocalStore';
import { ProjectContext } from '../../services/project-context/ProjectContext';
import { TestVSCodeInterface } from '../../services/vscode/TestVSCodeInterface';
import * as fs from 'fs/promises';

describe('Task Pattern Matching and Execution', function() {
    let localStore: LocalStore;
    let projectContext: ProjectContext;
    let cline: Cline;
    let sandbox: sinon.SinonSandbox;
    let vscodeInterface: TestVSCodeInterface;

    beforeEach(async function() {
        sandbox = sinon.createSandbox();
        
        // Setup filesystem stubs
        sandbox.stub(process, 'cwd').returns('/test/path');
        sandbox.stub(fs, 'mkdir').resolves();
        sandbox.stub(fs, 'writeFile').resolves();
        sandbox.stub(fs, 'readFile').resolves('[]');
        
        // Create LocalStore instance
        localStore = new LocalStore(':memory:');
        
        // Create ProjectContext with proper stubs
        projectContext = new ProjectContext('/test/path');
        const projectContextStubs = {
            initialize: sandbox.stub().resolves(),
            analyze: sandbox.stub().resolves(),
            getCurrentContext: sandbox.stub().returns('test context'),
            getStructure: sandbox.stub().returns({
                root: '/test/path',
                dependencies: {},
                files: new Map()
            })
        };
        Object.assign(projectContext, projectContextStubs);
        
        // Setup VSCode interface
        vscodeInterface = new TestVSCodeInterface();
        sandbox.stub(vscodeInterface, 'getWorkspacePath').returns('/test/path');
        sandbox.stub(vscodeInterface, 'getVisibleTextEditors').returns([]);
        sandbox.stub(vscodeInterface.context, 'globalStorageUri').value({
            fsPath: '/test/storage'
        });
        
        // Create provider mock with all required methods
        const mockProvider = {
            postStateToWebview: sandbox.stub().resolves(),
            postMessageToWebview: sandbox.stub().resolves(),
            updateTaskHistory: sandbox.stub().resolves(),
            deref: () => ({
                postStateToWebview: sandbox.stub().resolves(),
                postMessageToWebview: sandbox.stub().resolves(),
                updateTaskHistory: sandbox.stub().resolves()
            })
        };

        const mockConfig = { 
            type: 'anthropic', 
            apiKey: 'test', 
            model: 'test-model' 
        };
        
        const mockSettings = { 
            enabled: false, 
            actions: {} 
        };

        // Create Cline instance with task
        cline = new Cline(
            mockProvider as any,
            mockConfig as any,
            mockSettings as any,
            vscodeInterface,
            projectContext,
            localStore,
            undefined, // customInstructions
            'test task',
            [] // images
        );

        // Stub internal Cline methods
        sandbox.stub(cline as any, 'say').resolves();
        sandbox.stub(cline as any, 'initiateTaskLoop').resolves();
        sandbox.stub(cline as any, 'initializeServices').resolves();
        sandbox.stub(cline as any, 'ensureTaskDirectoryExists').resolves('/test/storage/tasks/test-id');
        sandbox.stub(cline as any, 'saveClineMessages').resolves();
        sandbox.stub(cline as any, 'saveApiConversationHistory').resolves();
    });

    afterEach(async () => {
        sandbox.restore();
        await localStore.close();
    });

    describe('Pattern Storage and Retrieval', function() {
        it('should store and find similar patterns', async function() {
            const storedPattern = {
                pattern: 'create component',
                context: 'test context',
                timestamp: Date.now()
            };
            await localStore.storePattern(storedPattern);

            const foundPattern = await localStore.findSimilarPattern(
                'create component',
                'test context'
            );

            expect(foundPattern).to.not.be.null;
            expect(foundPattern?.pattern).to.equal(storedPattern.pattern);
        });

        it('should find similar patterns with fuzzy matching', async function() {
            const storedPattern = {
                pattern: 'create new component',
                context: 'test context',
                timestamp: Date.now()
            };
            await localStore.storePattern(storedPattern);

            const foundPattern = await localStore.findSimilarPattern(
                'create component',
                'test context'
            );

            expect(foundPattern).to.not.be.null;
            expect(foundPattern?.pattern).to.equal(storedPattern.pattern);
        });

        it('should return null for unrelated patterns', async function() {
            const result = await localStore.findSimilarPattern(
                'something completely different',
                'different context'
            );
            expect(result).to.be.null;
        });
    });

    describe('Task Execution Flow', function() {
        it('should execute locally when similar pattern exists', async function() {
            // Setup pattern in store
            const pattern = {
                pattern: 'test task',
                context: 'test context',
                timestamp: Date.now()
            };
            await localStore.storePattern(pattern);
            
            const executeLocallyStub = sandbox.stub(cline as any, 'executeLocally').resolves();
            const executeWithAPIStub = sandbox.stub(cline as any, 'executeWithAPI').resolves();
            
            await cline.handleTask('test task');

            expect(executeLocallyStub.calledOnce).to.be.true;
            expect(executeWithAPIStub.called).to.be.false;
        });

        it('should use API and learn from execution when no pattern exists', async function() {
            const executeWithAPIStub = sandbox.stub(cline as any, 'executeWithAPI').resolves();
            const learnFromExecutionStub = sandbox.stub(cline as any, 'learnFromExecution').resolves();
            
            await cline.handleTask('unique new task');

            expect(executeWithAPIStub.calledOnce).to.be.true;
            expect(learnFromExecutionStub.calledOnce).to.be.true;
        });

        it('should learn from execution and store new patterns', async function() {
            const task = 'brand new task';
            const context = 'test context';
            
            // Don't re-stub getCurrentContext since it's already stubbed in beforeEach
            const storePatternSpy = sandbox.spy(localStore, 'storePattern');
            
            await cline['learnFromExecution'](task, {
                status: 'success',
                fileChanges: [],
                userFeedback: 'Great job!'
            });

            expect(storePatternSpy.calledOnce).to.be.true;
            const storedPattern = storePatternSpy.firstCall.args[0];
            expect(storedPattern.pattern).to.equal(task);
            expect(storedPattern.context).to.equal(context);
        });
    });
});
