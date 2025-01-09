import * as vscode from 'vscode';
import { VSCodeDiagnostic, VSCodeEditor, VSCodeFileSystemWatcher, VSCodeTerminal, VSCodeWorkspaceFolder } from './types';

export interface IVSCodeInterface {
    // VSCode operations
    showMessage(message: string): Promise<void>;
    showErrorMessage(message: string): Promise<void>;
    getVisibleTextEditors(): VSCodeEditor[];
    getWorkspacePath(): string;
    getWorkspaceFolders(): VSCodeWorkspaceFolder[];
    createFileSystemWatcher(globPattern: string): VSCodeFileSystemWatcher;
    getTerminals(): VSCodeTerminal[];
    getDiagnostics(): VSCodeDiagnostic[];

    // Extension context as a property
    readonly context: vscode.ExtensionContext;
}
