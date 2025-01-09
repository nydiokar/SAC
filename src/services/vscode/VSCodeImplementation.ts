import * as vscode from 'vscode';
import { IVSCodeInterface } from './VSCodeInterface';
import { VSCodeDiagnostic, VSCodeEditor, VSCodeFileSystemWatcher, VSCodeTerminal, VSCodeWorkspaceFolder } from './types';

export class VSCodeImplementation implements IVSCodeInterface {
    constructor(
        private readonly vscodeApi: typeof vscode,
        public readonly context: vscode.ExtensionContext
    ) {}

    async showMessage(message: string): Promise<void> {
        await this.vscodeApi.window.showInformationMessage(message);
    }

    async showErrorMessage(message: string): Promise<void> {
        await this.vscodeApi.window.showErrorMessage(message);
    }

    getVisibleTextEditors(): VSCodeEditor[] {
        return this.vscodeApi.window.visibleTextEditors.map(editor => ({
            fsPath: editor.document.uri.fsPath,
            document: editor.document,
            selection: editor.selection
        }));
    }

    getWorkspacePath(): string {
        return this.vscodeApi.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    getWorkspaceFolders(): VSCodeWorkspaceFolder[] {
        return this.vscodeApi.workspace.workspaceFolders?.map(folder => ({
            uri: folder.uri
        })) || [];
    }

    createFileSystemWatcher(globPattern: string): VSCodeFileSystemWatcher {
        const watcher = this.vscodeApi.workspace.createFileSystemWatcher(globPattern);
        return {
            dispose: () => watcher.dispose(),
            onDidChange: () => watcher.onDidChange(() => {}),
            onDidCreate: () => watcher.onDidCreate(() => {}),
            onDidDelete: () => watcher.onDidDelete(() => {})
        };
    }

    getTerminals(): VSCodeTerminal[] {
        return this.vscodeApi.window.terminals.map(terminal => ({
            id: terminal.processId ? Number(terminal.processId) : 0,
            lastCommand: undefined
        }));
    }

    getDiagnostics(): VSCodeDiagnostic[] {
        const diagnostics: VSCodeDiagnostic[] = [];
        this.vscodeApi.languages.getDiagnostics().forEach(([uri, diags]) => {
            diags.forEach(diag => {
                diagnostics.push({
                    file: uri.fsPath,
                    line: diag.range.start.line,
                    message: diag.message,
                    severity: diag.severity === 1 ? 'error' : 
                             diag.severity === 2 ? 'warning' : 'info'
                });
            });
        });
        return diagnostics;
    }
}
