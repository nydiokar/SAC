export const workspace = {
    workspaceFolders: [{
        uri: { fsPath: process.cwd() }
    }]
};

export const window = {
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
};

export const ExtensionContext = {};
export const OutputChannel = {};
export const Disposable = {
    from: (...disposables: any[]) => ({
        dispose: () => disposables.forEach(d => d.dispose?.())
    })
};

export const Uri = {
    file: (path: string) => ({ fsPath: path }),
    parse: (url: string) => ({ fsPath: url })
};

export class Position {
    constructor(public line: number, public character: number) {}
}

export class Range {
    constructor(
        startLine: number,
        startCharacter: number,
        endLine: number,
        endCharacter: number
    ) {
        this.start = new Position(startLine, startCharacter);
        this.end = new Position(endLine, endCharacter);
    }
    start: Position;
    end: Position;
}

export class ThemeColor {
    constructor(public id: string) {}
}
