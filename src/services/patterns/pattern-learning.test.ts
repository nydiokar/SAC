import { Cline, ExecutionResult } from '../../core/Cline';
import { LocalStore } from '../storage/LocalStore';
import { ProjectContext } from '../project-context/ProjectContext';
import { PatternService } from './PatternService';
import { LogPatternExtractor } from './LogPatternExtractor_old';
import { IVSCodeInterface } from '../vscode/VSCodeInterface';
import { ApiConfiguration } from '../../shared/api';
import { AutoApprovalSettings } from '../../shared/AutoApprovalSettings';
import { ClineProvider } from '../../core/webview/ClineProvider';
import { expect } from 'chai';

describe('Pattern Learning Integration', () => {
    let cline: Cline;
    let localStore: LocalStore;
    let projectContext: ProjectContext;
    let patternService: PatternService;
    let logExtractor: LogPatternExtractor;

    // Mock dependencies
    const mockVSCodeInterface: IVSCodeInterface = {
        context: {
            globalStorageUri: { fsPath: '/test/storage' },
            subscriptions: []
        },
        // Add other required interface methods as needed
    } as any;

    const mockApiConfig: ApiConfiguration = {
        apiKey: 'test-key',
        apiModelId: 'claude-3-sonnet'
    };

    const mockAutoApprovalSettings: AutoApprovalSettings = {
        enabled: false,
        actions: {
            readFiles: false,
            editFiles: false,
            executeCommands: false,
            useBrowser: false,
            useMcp: false
        },
        maxRequests: 0,
        enableNotifications: false
    };

    const mockProvider = new ClineProvider(mockVSCodeInterface, mockAutoApprovalSettings, mockApiConfig, projectContext, localStore);

    beforeEach(async () => {
        localStore = new LocalStore(':memory:');
        logExtractor = new LogPatternExtractor(localStore, projectContext);
        patternService = new PatternService(localStore, logExtractor);
        projectContext = new ProjectContext('/test/path', localStore);
        await projectContext.initialize();

        cline = new Cline(
            mockProvider,
            mockApiConfig,
            mockAutoApprovalSettings,
            mockVSCodeInterface,
            projectContext,
            localStore
        );
    });

    // Make learnFromExecution public for testing
    class TestCline extends Cline {
        public async testLearnFromExecution(task: string, result: ExecutionResult): Promise<void> {
            return this.learnFromExecution(task, result);
        }
    }

    test('should learn from task execution', async () => {
        const testCline = new TestCline(
            mockProvider,
            mockApiConfig,
            mockAutoApprovalSettings,
            mockVSCodeInterface,
            projectContext,
            localStore
        );

        const task = "Create a test function";
        const result = {
            status: 'success' as const, // Fix type issue
            fileChanges: [{
                filePath: 'test.ts',
                type: 'created' as const,
                content: 'test content'
            }],
            userFeedback: "Perfect!"
        };

        await testCline.testLearnFromExecution(task, result);

        const patterns = await localStore.findAllPatterns(task);
        expect(patterns.length).to.be.greaterThan(0);
        expect(patterns[0].pattern).to.equal(task);

        const usage = await localStore.getPatternHistory(patterns[0].id!);
        expect(usage.length).to.be.greaterThan(0);
        expect(usage[0].outcome).to.equal('success');
    });
});
