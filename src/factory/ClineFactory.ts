import * as vscode from 'vscode';
import { Cline } from '../core/Cline';
import { ClineProvider } from '../core/webview/ClineProvider';
import { ProjectContext } from '../services/project-context/ProjectContext';
import { LocalStore } from '../services/storage/LocalStore';
import { VSCodeImplementation } from '../services/vscode/VSCodeImplementation';
import { TestVSCodeInterface } from '../services/vscode/TestVSCodeInterface';
import { ApiConfiguration } from '../shared/api';
import { AutoApprovalSettings } from '../shared/AutoApprovalSettings';
import { HistoryItem } from '../shared/HistoryItem';
import { IVSCodeInterface } from '../services/vscode/VSCodeInterface';

export class ClineFactory {
    static createForProduction(
        provider: ClineProvider,
        apiConfiguration: ApiConfiguration,
        autoApprovalSettings: AutoApprovalSettings,
        projectContext: ProjectContext,
        localStore: LocalStore,
        customInstructions?: string,
        task?: string,
        images?: string[],
        historyItem?: HistoryItem
    ): Cline {
        const vscodeInterface = new VSCodeImplementation(vscode, provider.context);
        return new Cline(
            provider,
            apiConfiguration,
            autoApprovalSettings,
            vscodeInterface,
            projectContext,
            localStore,
            customInstructions,
            task,
            images,
            historyItem
        );
    }

    static createForTest(): Cline {
        const vscodeInterface = new TestVSCodeInterface();
        const mockProvider = {
            context: vscodeInterface.context,
            disposables: [],
            latestAnnouncementId: '',
            apiConfiguration: {} as ApiConfiguration,
            autoApprovalSettings: {} as AutoApprovalSettings,
            projectContext: {} as ProjectContext,
            localStore: {} as LocalStore,
            customInstructions: undefined,
            task: undefined,
            images: undefined,
            historyItem: undefined,
            vscodeInterface: new TestVSCodeInterface(),
            outputChannel: {} as vscode.OutputChannel,
            workspaceTracker: undefined,
            mcpHub: undefined,
            view: undefined,
            cline: undefined,
        } as unknown as ClineProvider;

        return new Cline(
            mockProvider,
            {} as ApiConfiguration,
            {} as AutoApprovalSettings,
            vscodeInterface,
            new ProjectContext("test"),
            new LocalStore("test"),
            undefined,
            undefined,
            undefined,
            undefined
        );
    }
}
