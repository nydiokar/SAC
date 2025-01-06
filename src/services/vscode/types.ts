export type VSCodeDiagnostic = {
    file: string;
    line: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
};

export type VSCodeTerminal = {
    id: number;
    lastCommand?: string;
};

export type VSCodeEditor = {
    fsPath: string;
};

export type VSCodeWorkspaceFolder = {
    uri: { fsPath: string };
};

export type VSCodeFileSystemWatcher = {
    dispose: () => void;
    onDidChange: () => { dispose: () => void };
    onDidCreate: () => { dispose: () => void };
    onDidDelete: () => { dispose: () => void };
};
