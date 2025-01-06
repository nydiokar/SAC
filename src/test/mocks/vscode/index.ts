import '../../../utils/path';
import path from 'path';

import type { SecretStorageChangeEvent } from 'vscode';

// Define ExtensionMode directly in the mock
export const ExtensionMode = {
    Production: 1,
    Development: 2,
    Test: 3
} as const;

// Create a proxy that handles unmocked VSCode APIs
const createVSCodeProxy = () => {
    return new Proxy({}, {
        get: (target, prop) => {
            if (!(prop in target)) {
                console.warn(`Warning: Unmocked VSCode API called: ${String(prop)}`);
                return () => ({});
            }
            return target[prop as keyof typeof target];
        }
    });
};

// Only mock what we explicitly need, let proxy handle the rest
export const window = {
    visibleTextEditors: [],
    terminals: [],
    showInformationMessage: async () => {},
    showErrorMessage: async () => {},
    createTextEditorDecorationType: (options: any) => ({
        key: 'mock-decoration-type',
        dispose: () => {},
        ...options
    }),
    ...createVSCodeProxy()
};

export const workspace = {
    workspaceFolders: [{
        uri: { fsPath: path.normalize('/test/workspace') }
    }],
    ...createVSCodeProxy()
};

export const commands = {
    executeCommand: () => Promise.resolve(),
    ...createVSCodeProxy()
};

export const extensions = {
    getExtension: (id?: string) => ({
        id: id || 'test-extension'
    }),
    ...createVSCodeProxy()
};

// Basic types we know we need
export class ThemeColor {
    constructor(public id: string) {}
}

export function createExtensionContext(): any {
    return {
        subscriptions: [],
        extensionPath: path.normalize('/test/extension'),
        globalState: new MockMemento(),
        workspaceState: new MockMemento(),
        secrets: new MockSecretStorage(),
        extensionUri: { fsPath: path.normalize('/test/extension') },
        environmentVariableCollection: {},
        extensionMode: ExtensionMode.Production,
        storageUri: { fsPath: path.normalize('/test/storage') },
        globalStorageUri: { fsPath: path.normalize('/test/global-storage') },
        logUri: { fsPath: path.normalize('/test/log') },
        asAbsolutePath: (relativePath: string) => path.join('/test/extension', relativePath)
    };
}

// Keep existing helper classes
export class MockMemento {
    private storage = new Map<string, any>();

    get<T>(key: string): T | undefined {
        return this.storage.get(key);
    }

    update(key: string, value: any): Thenable<void> {
        this.storage.set(key, value);
        return Promise.resolve();
    }
}

export class MockSecretStorage {
    private storage = new Map<string, string>();
    public onDidChange = new EventEmitter<SecretStorageChangeEvent>().event;

    get(key: string): Thenable<string | undefined> {
        return Promise.resolve(this.storage.get(key));
    }

    store(key: string, value: string): Thenable<void> {
        this.storage.set(key, value);
        return Promise.resolve();
    }

    delete(key: string): Thenable<void> {
        this.storage.delete(key);
        return Promise.resolve();
    }
}

export class EventEmitter<T> {
    private handlers: ((e: T) => any)[] = [];
    
    event = (listener: (e: T) => any) => {
        this.handlers.push(listener);
        return {
            dispose: () => {
                const idx = this.handlers.indexOf(listener);
                if (idx >= 0) {
                    this.handlers.splice(idx, 1);
                }
            }
        };
    };

    fire(data: T) {
        this.handlers.forEach(h => h(data));
    }
}
