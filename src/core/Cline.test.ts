import { describe, it } from 'mocha';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import proxyquire from 'proxyquire';
import { FileChange } from '../services/project-context/ProjectContext';

chai.use(chaiAsPromised);
const expect = chai.expect;

const vscodeMock = {
    workspace: {
        workspaceFolders: [{
            uri: { fsPath: process.cwd() }
        }]
    },
    window: {
        visibleTextEditors: [],
        tabGroups: {
            all: []
        },
        createTextEditorDecorationType: () => ({
            dispose: () => {}
        }),
        createOutputChannel: () => ({
            appendLine: () => {},
            append: () => {},
            show: () => {},
            dispose: () => {}
        })
    },
    ExtensionContext: {},
    OutputChannel: {},
    Disposable: {
        from: (...disposables: any[]) => ({
            dispose: () => disposables.forEach(d => d.dispose?.())
        })
    },
    Uri: {
        file: (path: string) => ({ fsPath: path }),
        parse: (url: string) => ({ fsPath: url })
    },
    Position: class Position {
        line: number;
        character: number;
        constructor(line: number, character: number) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class Range {
        start: { line: number; character: number };
        end: { line: number; character: number };
        constructor(
            startLine: number,
            startCharacter: number,
            endLine: number,
            endCharacter: number
        ) {
            this.start = { line: startLine, character: startCharacter };
            this.end = { line: endLine, character: endCharacter };
        }
    },
    ThemeColor: class {
        constructor(public id: string) {}
    },
    '@noCallThru': true
};

// Need to mock vscode for all modules that use it
const DiffViewProvider = proxyquire('../integrations/editor/DiffViewProvider', {
    'vscode': vscodeMock
}).DiffViewProvider;

const DecorationController = proxyquire('../integrations/editor/DecorationController', {
    'vscode': vscodeMock
}).DecorationController;

const { Cline } = proxyquire('./Cline', {
    'vscode': vscodeMock,
    '../integrations/editor/DiffViewProvider': { DiffViewProvider },
    '../integrations/editor/DecorationController': { DecorationController }
});

describe('Cline', () => {
    beforeEach(() => {
    });

    it('should initialize with mocked vscode', () => {
        const mockProvider = {
            context: {
                globalStorageUri: {
                    fsPath: 'test-storage'
                }
            },
            postStateToWebview: async () => {},
            mcpHub: { isConnecting: false },
            updateTaskHistory: async () => [],
            postMessageToWebview: async () => {},
            getTaskWithId: async () => undefined,
            outputChannel: {
                appendLine: () => {},
                append: () => {},
                show: () => {},
                dispose: () => {}
            },
            latestAnnouncementId: '',
            disposables: [],
            dispose: () => {}
        };

        const mockApiConfig = {
            getModel: () => ({ info: {}, id: 'test-model' })
        };

        const mockAutoApprovalSettings = {
            enabled: false,
            actions: {},
            maxRequests: 10,
            enableNotifications: false
        };

        const cline = new Cline(
            mockProvider as any,
            mockApiConfig as any,
            mockAutoApprovalSettings as any,
            undefined,
            'test task'
        );

        expect(cline).to.exist;
        expect(cline).to.be.instanceOf(Cline);
    });

    it('should initialize ProjectContext with current working directory', () => {
        const mockProvider = {
            context: {
                globalStorageUri: {
                    fsPath: 'test-storage'
                }
            },
            postStateToWebview: async () => {},
            mcpHub: { isConnecting: false },
            updateTaskHistory: async () => [],
            postMessageToWebview: async () => {},
            getTaskWithId: async () => undefined,
            outputChannel: {
                appendLine: () => {},
                append: () => {},
                show: () => {},
                dispose: () => {}
            },
            latestAnnouncementId: '',
            disposables: [],
            dispose: () => {}
        };

        const mockApiConfig = {
            getModel: () => ({ info: {}, id: 'test-model' })
        };

        const mockAutoApprovalSettings = {
            enabled: false,
            actions: {},
            maxRequests: 10,
            enableNotifications: false
        };

        const cline = new Cline(
            mockProvider as any,
            mockApiConfig as any,
            mockAutoApprovalSettings as any,
            undefined,
            'test task'
        );

        // Test that handleFileChanges can be called without throwing
        const changes: FileChange[] = [{
            filePath: 'test.ts',
            type: 'created' as const,
            content: 'test content'
        }];

        return expect(cline.handleFileChanges(changes)).to.eventually.be.fulfilled;
    });
});
