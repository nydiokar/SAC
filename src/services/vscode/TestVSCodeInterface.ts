import * as vscode from 'vscode';
import { IVSCodeInterface } from './VSCodeInterface';
import { VSCodeDiagnostic, VSCodeEditor, VSCodeFileSystemWatcher, VSCodeTerminal, VSCodeWorkspaceFolder } from './types';
import { MockMemento, MockSecretStorage } from '../../test/mocks/vscode';
import * as path from 'path';

export class TestVSCodeInterface implements IVSCodeInterface {
    public readonly context: vscode.ExtensionContext;

    constructor() {
        const mockMemento = new MockMemento();
        const mockSecretStorage = new MockSecretStorage();

        this.context = {
            subscriptions: [],
            workspaceState: mockMemento,
            globalState: mockMemento,
            extensionPath: path.normalize('/test/extension'),
            storagePath: path.normalize('/test/storage'),
            globalStoragePath: path.normalize('/test/global-storage'),
            logPath: path.normalize('/test/log'),
            extensionUri: { fsPath: path.normalize('/test/extension') } as any,
            environmentVariableCollection: {} as any,
            extensionMode: vscode.ExtensionMode.Production,
            secrets: mockSecretStorage,
            storageUri: { fsPath: path.normalize('/test/storage') } as any,
            globalStorageUri: { fsPath: path.normalize('/test/global-storage') } as any,
            logUri: { fsPath: path.normalize('/test/log') } as any,
            asAbsolutePath: (relativePath: string) => path.join('/test/extension', relativePath)
        } as unknown as vscode.ExtensionContext;
    }

    async showMessage(message: string): Promise<void> {}
    async showErrorMessage(message: string): Promise<void> {}
    getVisibleTextEditors(): VSCodeEditor[] { return []; }
    getWorkspacePath(): string { return ''; }
    getWorkspaceFolders(): VSCodeWorkspaceFolder[] { return []; }
    createFileSystemWatcher(): VSCodeFileSystemWatcher {
        return {
            dispose: () => {},
            onDidChange: () => ({ dispose: () => {} }),
            onDidCreate: () => ({ dispose: () => {} }),
            onDidDelete: () => ({ dispose: () => {} })
        };
    }
    getTerminals(): VSCodeTerminal[] { return []; }
    getDiagnostics(): VSCodeDiagnostic[] { return []; }
}
