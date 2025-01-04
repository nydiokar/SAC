import * as path from 'path';
import * as os from 'os';

// Setup global test environment
const mockVscode = {
    workspace: {
        workspaceFolders: [{
            uri: { fsPath: path.join(os.tmpdir(), 'test-workspace') }
        }]
    },
    window: {
        showErrorMessage: () => {},
        showInformationMessage: () => {},
        createOutputChannel: () => ({
            appendLine: () => {},
            show: () => {}
        })
    }
};

// Setup global mocks
(global as any).vscode = mockVscode;

// Other test setup can go here
process.env.NODE_ENV = 'test';