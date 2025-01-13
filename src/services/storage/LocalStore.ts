import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { PatternStorage } from './PatternStorage';
import { LearningStorage } from './LearningStorage';
import { PatternCategory, PatternRow } from './types';
import { ExecutionOutcome } from './types';
import { LearningPattern, OperationPattern } from '../patterns/BasePattern';

export type { OperationPattern };

interface ConfidenceUpdateOptions {
    successIncrease?: number;  // How much to increase on success (default 0.1)
    failureDecrease?: number;  // How much to decrease on failure (default 0.2)
    minConfidence?: number;    // Minimum confidence threshold (default 0.0)
    maxConfidence?: number;    // Maximum confidence threshold (default 1.0)
    forkThreshold?: number;    // When to fork pattern (default 0.3)
}

interface PatternUsage {
    patternId: number;
    timestamp: number;
    outcome: 'success' | 'failure' | 'partial';
    feedback?: string;  // Optional user feedback
    adjustments?: string[];  // What needed to be adjusted
}

export class LocalStore {
    private db: DatabaseType;
    private patternStorage: PatternStorage;
    private learningStorage: LearningStorage;

    constructor(dbPath: string) {
        this.db = new Database(dbPath);
        this.patternStorage = new PatternStorage(this.db);
        this.learningStorage = new LearningStorage(this.db, this.patternStorage);
        this.initializeTables();
    }

    async close(): Promise<void> {
        if (this.db) {
            this.db.close();
        }
    }

    private initializeTables(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS patterns (
                id INTEGER PRIMARY KEY,
                pattern TEXT NOT NULL,
                context TEXT,
                timestamp INTEGER,
                metadata TEXT,
                confidence REAL
            );

            CREATE TABLE IF NOT EXISTS learning_patterns (
                id INTEGER PRIMARY KEY,
                pattern_id INTEGER,
                project_fingerprint TEXT,
                execution_data TEXT,
                category TEXT,
                FOREIGN KEY(pattern_id) REFERENCES patterns(id)
            );

            CREATE TABLE IF NOT EXISTS pattern_usage (
                id INTEGER PRIMARY KEY,
                pattern_id INTEGER,
                timestamp INTEGER,
                outcome TEXT,
                feedback TEXT,
                adjustments TEXT,
                FOREIGN KEY(pattern_id) REFERENCES patterns(id)
            );

            CREATE TABLE IF NOT EXISTS pattern_evolution (
                id INTEGER PRIMARY KEY,
                original_pattern_id INTEGER,
                changes TEXT,
                outcome TEXT,
                timestamp INTEGER,
                FOREIGN KEY(original_pattern_id) REFERENCES patterns(id)
            );

            CREATE TABLE IF NOT EXISTS pattern_validation (
                id INTEGER PRIMARY KEY,
                pattern_id INTEGER,
                success INTEGER,
                context TEXT,
                timestamp INTEGER,
                metadata TEXT,
                FOREIGN KEY(pattern_id) REFERENCES patterns(id)
            );
        `);
    }

    // Core pattern operations
    async storePattern(pattern: OperationPattern): Promise<number> {
        return this.patternStorage.store(pattern);
    }

    async updatePatternConfidence(
        patternId: number, 
        success: boolean, 
        options?: ConfidenceUpdateOptions
    ): Promise<number> {
        return this.patternStorage.updateConfidence(patternId, success, options);
    }

    async recordPatternUsage(usage: PatternUsage): Promise<void> {
        return this.patternStorage.recordUsage(usage);
    }

    // Learning pattern operations
    async storeLearningPattern(pattern: LearningPattern): Promise<number> {
        return this.learningStorage.store(pattern);
    }

    // Pattern finding operations
    async findSimilarPattern(pattern: string, context?: string): Promise<OperationPattern | null> {
        const patterns = await this.patternStorage.find(pattern);
        if (!patterns.length) return null;
        
        if (context) {
            return this.findBestMatchForContext(patterns, context);
        }
        
        return patterns[0];
    }

    async findAllSimilarPatterns(pattern: string, context?: string): Promise<OperationPattern[]> {
        const patterns = await this.patternStorage.find(pattern);
        if (context) {
            return this.findMatchesForContext(patterns, context);
        }
        return patterns;
    }

    async findAllPatterns(pattern: string): Promise<OperationPattern[]> {
        return this.patternStorage.find(pattern);
    }

    async findPatternsByFingerprint(fingerprint?: string): Promise<OperationPattern[]> {
        if (!fingerprint) return [];
        const stmt = this.db.prepare(`
            SELECT p.* FROM patterns p
            JOIN learning_patterns lp ON p.id = lp.pattern_id
            WHERE lp.project_fingerprint = ?
        `);
        const rows = stmt.all(fingerprint) as PatternRow[];
        return rows.map(row => ({
            id: row.id,
            pattern: row.pattern,
            context: row.context,
            timestamp: row.timestamp,
            metadata: row.metadata ? JSON.parse(row.metadata) : {},
            confidence: row.confidence
        }));
    }

    async updatePatternValidation(
        patternId: number,
        validation: {
            success: 'success' | 'failure' | 'partial';
            projectContext: string;
            timestamp: number;
            adjustments: string[];
        }
    ): Promise<void> {
        const stmt = this.db.prepare(`
            INSERT INTO pattern_validation (
                pattern_id,
                success,
                context,
                timestamp,
                metadata
            ) VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(
            patternId,
            validation.success === 'success' ? 1 : 0,
            validation.projectContext,
            validation.timestamp,
            JSON.stringify({ adjustments: validation.adjustments })
        );
    }

    private findBestMatchForContext(
        patterns: OperationPattern[], 
        context: string
    ): OperationPattern | null {
        // First try exact context match
        const exactMatch = patterns.find(p => p.context === context);
        if (exactMatch) return exactMatch;

        // Then try partial context match
        const partialMatch = patterns.find(p => 
            p.context && (
                p.context.includes(context) || 
                context.includes(p.context)
            )
        );
        if (partialMatch) return partialMatch;

        // If no context matches, return null
        return null;
    }

    private findMatchesForContext(
        patterns: OperationPattern[], 
        context: string
    ): OperationPattern[] {
        // First get exact context matches
        const exactMatches = patterns.filter(p => p.context === context);
        if (exactMatches.length > 0) return exactMatches;

        // Then get partial context matches
        return patterns.filter(p => 
            p.context && (
                p.context.includes(context) || 
                context.includes(p.context)
            )
        );
    }

    async validateAndTrackPattern(
        patternId: number,
        result: any,
        context: string,
        changes?: string[]
    ): Promise<void> {
        await this.patternStorage.validatePattern(patternId, result, context);
        
        if (changes?.length) {
            await this.patternStorage.trackEvolution(
                patternId,
                changes,
                result.success ? 'success' : 'failure'
            );
        }
    }

    async getPatternInsights(patternId: number): Promise<{
        evolution: Array<{changes: string[], outcome: ExecutionOutcome}>;
        history: {successes: number, failures: number, adaptations: string[]};
    }> {
        const evolution = await this.patternStorage.getPatternEvolution(patternId);
        const history = await this.learningStorage.getPatternHistory(patternId);
        
        return { evolution, history };
    }
}
