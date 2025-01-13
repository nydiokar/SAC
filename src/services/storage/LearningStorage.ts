import { Database } from "better-sqlite3";
import { LearningPattern, OperationPattern } from "../patterns/BasePattern";
import { BasePattern } from "../patterns/BasePattern";
import { PatternStorage } from "./PatternStorage";

interface PatternHistoryRow {
    successes: number;
    failures: number;
    adaptations: string | null;
}

export class LearningStorage {
    constructor(private db: Database, private patternStorage: PatternStorage) {}

    async store(pattern: LearningPattern): Promise<number> {
        // First store the base pattern
        const patternId = await this.patternStorage.store({
            pattern: pattern.pattern,
            context: JSON.stringify(pattern.projectContext),
            timestamp: pattern.timestamp,
            metadata: pattern.metadata,
            confidence: 1.0
        });

        // Then store the learning-specific data
        const stmt = this.db.prepare(`
            INSERT INTO learning_patterns (
                pattern_id, 
                project_fingerprint,
                execution_data,
                category
            ) VALUES (?, ?, ?, ?)
        `);
        stmt.run(
            patternId,
            pattern.projectContext.fingerprint,
            JSON.stringify(pattern.execution),
            pattern.category
        );

        return patternId;
    }

    async findByFingerprint(fingerprint: string): Promise<LearningPattern[]> {
        const stmt = this.db.prepare(`
            SELECT lp.*, p.* 
            FROM learning_patterns lp
            JOIN patterns p ON p.id = lp.pattern_id
            WHERE lp.project_fingerprint = ?
        `);
        return stmt.all(fingerprint) as LearningPattern[];
    }

    private async storeBasePattern(pattern: LearningPattern): Promise<number> {
        const basePattern: BasePattern = {
            pattern: pattern.pattern,
            timestamp: pattern.timestamp,
            confidence: pattern.confidence
        };
        return this.patternStorage.store(basePattern as OperationPattern);
    }

    async findSimilarPatterns(pattern: LearningPattern): Promise<LearningPattern[]> {
        const stmt = this.db.prepare(`
            SELECT lp.*, p.*
            FROM learning_patterns lp
            JOIN patterns p ON p.id = lp.pattern_id
            WHERE lp.category = ? 
            AND lp.project_fingerprint LIKE ?
            ORDER BY p.confidence DESC
            LIMIT 5
        `);

        return stmt.all(
            pattern.category,
            `%${pattern.projectContext.fingerprint}%`
        ) as LearningPattern[];
    }

    async updateLearningMetadata(
        patternId: number,
        metadata: {
            success?: boolean;
            adjustments?: string[];
            feedback?: string;
            
        }
    ): Promise<void> {
        const stmt = this.db.prepare(`
            UPDATE learning_patterns
            SET execution_data = json_patch(
                execution_data,
                json(?))
            WHERE pattern_id = ?
        `);

        stmt.run(
            JSON.stringify(metadata),
            patternId
        );
    }

    async getPatternHistory(patternId: number): Promise<{
        successes: number;
        failures: number;
        adaptations: string[];
    }> {
        const usageStmt = this.db.prepare(`
            SELECT 
                COUNT(CASE WHEN outcome = 'success' THEN 1 END) as successes,
                COUNT(CASE WHEN outcome = 'failure' THEN 1 END) as failures
            FROM pattern_usage
            WHERE pattern_id = ?
        `);
        
        const adaptationsStmt = this.db.prepare(`
            SELECT adjustments
            FROM pattern_usage
            WHERE pattern_id = ? AND adjustments IS NOT NULL
        `);

        const usage = usageStmt.get(patternId) as {successes: number, failures: number};
        const adaptationRows = adaptationsStmt.all(patternId) as Array<{adjustments: string}>;
        
        const adaptations = adaptationRows
            .map(row => JSON.parse(row.adjustments))
            .flat();

        return {
            successes: usage.successes,
            failures: usage.failures,
            adaptations
        };
    }
}
