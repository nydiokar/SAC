import { Database } from "better-sqlite3";
import { OperationPattern } from "../patterns/BasePattern";
import { ConfidenceUpdateOptions, PatternUsage, ExecutionOutcome, PatternRow } from "./types";

interface PatternEvolutionRow {
    changes: string;
    outcome: ExecutionOutcome;
    timestamp: number;
}

interface ConfidenceResult {
    confidence: number;
}

export class PatternStorage {
    constructor(private db: Database) {}

    async store(pattern: OperationPattern): Promise<number> {
        const stmt = this.db.prepare(`
            INSERT INTO patterns (pattern, context, timestamp, metadata, confidence)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            pattern.pattern,
            pattern.context,
            pattern.timestamp,
            JSON.stringify(pattern.metadata),
            pattern.confidence
        );

        return result.lastInsertRowid as number;
    }

    async updateConfidence(
        patternId: number, 
        success: boolean, 
        options?: ConfidenceUpdateOptions
    ): Promise<number> {
        const stmt = this.db.prepare(`
            UPDATE patterns 
            SET confidence = CASE 
                WHEN ? THEN MIN(confidence + ?, ?)
                ELSE MAX(confidence - ?, ?)
            END
            WHERE id = ?
            RETURNING confidence
        `);
        
        const {
            successIncrease = 0.1,
            failureDecrease = 0.2,
            minConfidence = 0.0,
            maxConfidence = 1.0
        } = options || {};

        const result = stmt.get(
            success ? 1 : 0,
            success ? successIncrease : failureDecrease,
            success ? maxConfidence : minConfidence,
            success ? successIncrease : failureDecrease,
            success ? maxConfidence : minConfidence,
            patternId
        ) as { confidence: number };

        return result.confidence;
    }

    async recordUsage(usage: PatternUsage): Promise<void> {
        const stmt = this.db.prepare(`
            INSERT INTO pattern_usage (pattern_id, timestamp, outcome, feedback, adjustments)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(
            usage.patternId,
            usage.timestamp,
            usage.outcome,
            usage.feedback,
            usage.adjustments ? JSON.stringify(usage.adjustments) : null
        );
    }

    async find(pattern: string): Promise<OperationPattern[]> {
        const stmt = this.db.prepare(`
            SELECT * FROM patterns 
            WHERE pattern LIKE ? 
            ORDER BY timestamp DESC
        `);
        const rows = stmt.all(`%${pattern}%`) as PatternRow[];
        return rows.map(row => ({
            id: row.id,
            pattern: row.pattern,
            context: row.context,
            timestamp: row.timestamp,
            metadata: row.metadata ? JSON.parse(row.metadata) : {},
            confidence: row.confidence
        }));
    }

    async trackEvolution(
        patternId: number,
        changes: string[],
        outcome: ExecutionOutcome
    ): Promise<void> {
        const stmt = this.db.prepare(`
            INSERT INTO pattern_evolution (original_pattern_id, changes, outcome, timestamp)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(
            patternId,
            JSON.stringify(changes),
            outcome,
            Date.now()
        );
    }

    async validatePattern(patternId: number, result: any, context: string): Promise<void> {
        const stmt = this.db.prepare(`
            INSERT INTO pattern_validation (pattern_id, success, context, timestamp)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(
            patternId,
            result.success ? 1 : 0,
            context,
            Date.now()
        );
    }

    async getPatternEvolution(patternId: number): Promise<Array<{
        changes: string[],
        outcome: ExecutionOutcome
    }>> {
        const stmt = this.db.prepare(`
            SELECT changes, outcome 
            FROM pattern_evolution 
            WHERE original_pattern_id = ?
            ORDER BY timestamp DESC
        `);
        const rows = stmt.all(patternId) as Array<{changes: string, outcome: ExecutionOutcome}>;
        return rows.map(row => ({
            changes: JSON.parse(row.changes),
            outcome: row.outcome
        }));
    }
}
