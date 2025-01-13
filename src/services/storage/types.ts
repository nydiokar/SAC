// Move all interfaces here for better organization
export interface ToolUsage {
    tool: string;
    params: any;
    timestamp: number;
    success?: boolean;
}

export interface PatternRow {
    id: number;
    pattern: string;
    context: string;
    timestamp: number;
    metadata: string | null;
    confidence: number;
}

export interface ConfidenceUpdateOptions {
    successIncrease?: number;
    failureDecrease?: number;
    minConfidence?: number;
    maxConfidence?: number;
    forkThreshold?: number;
}

export interface PatternUsage {
    patternId: number;
    timestamp: number;
    outcome: 'success' | 'failure' | 'partial';
    feedback?: string;
    adjustments?: string[];
}

export type ExecutionOutcome = 'success' | 'failure' | 'partial';
export type PatternCategory = 'refactoring' | 'optimization' | 'code generation' | 'debugging';

export interface DatabaseRow {
    id: number;
    [key: string]: any;
}

export interface PatternEvolutionRow extends DatabaseRow {
    changes: string;
    outcome: ExecutionOutcome;
    timestamp: number;
}

export interface PatternHistoryRow {
    successes: number;
    failures: number;
    adaptations: string | null;
} 