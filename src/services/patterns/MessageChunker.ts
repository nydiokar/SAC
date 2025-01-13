import { ClineMessage } from '../../shared/ExtensionMessage';

export interface TaskChunk {
    startTs: number;
    endTs: number;
    messages: ClineMessage[];
    intent?: string;
    checkpoints: {
        ts: number;
        type: 'start' | 'tool_usage' | 'error' | 'completion' | 'feedback';
        message: string;
        success?: boolean;
    }[];
}

export class MessageChunker {
    private readonly TASK_START_PATTERNS = [
        /^(create|implement|add|update|fix|refactor)/i,
        /^can you help/i,
        /^let's (create|implement|fix)/i
    ];

    private readonly TASK_END_PATTERNS = [
        /tests? pass(ed|ing)?/i,
        /successfully (created|implemented|fixed)/i,
        /completed successfully/i,
        /failed with error/i
    ];

    chunkMessages(messages: ClineMessage[]): TaskChunk[] {
        const chunks: TaskChunk[] = [];
        let currentChunk: TaskChunk | null = null;

        for (const msg of messages) {
            if (!msg || !msg.text) continue;

            // Start new chunk if it's a task start
            if (this.isTaskStart(msg)) {
                if (currentChunk) {
                    this.finalizeChunk(currentChunk);
                    chunks.push(currentChunk);
                }
                currentChunk = this.initializeChunk(msg);
                continue;
            }

            // Add to current chunk if exists
            if (currentChunk) {
                this.processMessage(msg, currentChunk);
                
                // Check for task completion
                if (this.isTaskEnd(msg)) {
                    this.finalizeChunk(currentChunk);
                    chunks.push(currentChunk);
                    currentChunk = null;
                }
            }
        }

        // Add final chunk if exists
        if (currentChunk) {
            this.finalizeChunk(currentChunk);
            chunks.push(currentChunk);
        }

        return this.validateAndCleanChunks(chunks);
    }

    private isTaskStart(msg: ClineMessage): boolean {
        if (msg.say !== 'text') return false;
        return this.TASK_START_PATTERNS.some(pattern => pattern.test(msg.text || ''));
    }

    private isTaskEnd(msg: ClineMessage): boolean {
        if (msg.say !== 'text') return false;
        return this.TASK_END_PATTERNS.some(pattern => pattern.test(msg.text || ''));
    }

    private initializeChunk(msg: ClineMessage): TaskChunk {
        return {
            startTs: msg.ts,
            endTs: msg.ts,
            messages: [msg],
            checkpoints: [{
                ts: msg.ts,
                type: 'start',
                message: msg.text || ''
            }]
        };
    }

    private processMessage(msg: ClineMessage, chunk: TaskChunk): void {
        chunk.messages.push(msg);
        chunk.endTs = msg.ts;

        // Track checkpoints based on message type
        switch (msg.say) {
            case 'tool':
                try {
                    const toolData = JSON.parse(msg.text || '');
                    chunk.checkpoints.push({
                        ts: msg.ts,
                        type: 'tool_usage',
                        message: msg.text || '',
                        success: true // Will be updated if an error follows
                    });
                } catch (e) {
                    console.warn('Invalid tool message:', msg.text);
                }
                break;

            case 'error':
                chunk.checkpoints.push({
                    ts: msg.ts,
                    type: 'error',
                    message: msg.text || '',
                    success: false
                });
                // Update last tool usage success status
                const lastToolUsage = chunk.checkpoints
                    .filter(cp => cp.type === 'tool_usage')
                    .pop();
                if (lastToolUsage) {
                    lastToolUsage.success = false;
                }
                break;

            case 'text':
                if (this.isTaskEnd(msg)) {
                    chunk.checkpoints.push({
                        ts: msg.ts,
                        type: 'completion',
                        message: msg.text || '',
                        success: !msg.text?.toLowerCase().includes('fail')
                    });
                }
                break;
        }
    }

    private finalizeChunk(chunk: TaskChunk): void {
        // Ensure chunk has an end checkpoint if not already present
        const hasCompletion = chunk.checkpoints.some(cp => cp.type === 'completion');
        if (!hasCompletion) {
            chunk.checkpoints.push({
                ts: chunk.endTs,
                type: 'completion',
                message: 'Task ended without explicit completion',
                success: undefined
            });
        }
    }

    private validateAndCleanChunks(chunks: TaskChunk[]): TaskChunk[] {
        return chunks.filter(chunk => {
            // Must have at least start and one other checkpoint
            if (chunk.checkpoints.length < 2) return false;
            
            // Must have some actual content
            if (chunk.messages.length < 2) return false;
            
            // Should have some meaningful duration
            if (chunk.endTs - chunk.startTs < 100) return false;
            
            return true;
        });
    }
} 