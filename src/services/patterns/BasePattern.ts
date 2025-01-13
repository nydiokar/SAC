import { ExecutionOutcome, PatternCategory, ToolUsage } from "../storage/types";

// Basic pattern interface with essential fields
export interface BasePattern {
    id?: number;
    pattern: string;
    timestamp: number;
    confidence: number;
}

// Simple operation pattern for basic usage
export interface OperationPattern extends BasePattern {
    context: string;
    metadata: {
        taskType?: string;
        toolUsage: ToolUsage[];
        framework?: string;
        filePath?: string;
        // File operation metadata
        path?: string;
        regex?: string;
        filePattern?: string;
        // Edit operation metadata
        changes?: {
            from: string;
            to: string;
        };
    };
}

// Extended learning pattern with more complex metadata
export interface LearningPattern extends BasePattern {
    context: string;
    projectContext: {
        fingerprint: string;
        fileTypes: string[];
        dependencies: string[];
    };
    metadata: {
        taskType?: string;
        toolUsage: ToolUsage[];
        framework?: string;
        filePath?: string;
        path?: string;
        regex?: string;
        filePattern?: string;
        fileTypes?: string[];
        errorPatterns?: string[];
        environment?: Record<string, any>;
        outcome?: {
            status: 'success' | 'failure' | 'partial';
            error?: string;
            feedback?: string;
        };
        changes?: {
            from: string;
            to: string;
        };
        hasTests?: boolean;
        hasStyles?: boolean;
        styling?: string;
        fileChanges?: {
            from: string;
            to: string;
        };
        security?: string;
    };
    execution: {
        operations: Operation[];
        outcome: ExecutionOutcome;
    };
    category: PatternCategory;
}

export interface Operation {
    type: string;
    params: any;
    timestamp: number;
}
