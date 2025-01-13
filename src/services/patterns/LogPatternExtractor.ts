import { MessageChunker, TaskChunk } from './MessageChunker';
import { ClineMessage } from '../../shared/ExtensionMessage';
import { LocalStore } from '../storage/LocalStore';
import { ProjectContext } from '../project-context/ProjectContext';
import { LearningPattern } from '../patterns/BasePattern';
import { ExecutionOutcome, PatternCategory, ToolUsage } from '../storage/types';

/**
 * Refactored to rely on your existing MessageChunker.
 * 
 * Steps:
 *  1) Filter out any irrelevant messages if needed.
 *  2) Call chunker.chunkMessages(filtered).
 *  3) For each chunk, 'processChunk' to detect success/failure & store a pattern.
 */
export class LogPatternExtractor {
  private chunker: MessageChunker;

  constructor(
    private localStore: LocalStore,
    private projectContext: ProjectContext
  ) {
    this.chunker = new MessageChunker();
  }

  /**
   * Main entry: chunk the messages, then process each chunk.
   */
  public async extractPatterns(messages: ClineMessage[]): Promise<void> {
    // 1) (Optional) Filter out noise if you have any (like 'api_req_started')
    const relevantMessages = messages.filter(m =>
      !(m.say === 'api_req_started' || m.say === 'api_req_finished')
    );

    // 2) Use your existing chunker
    const chunks = this.chunker.chunkMessages(relevantMessages);

    // 3) Process each chunk => store final pattern
    for (const chunk of chunks) {
      await this.processChunk(chunk);
    }
  }

  /**
   * This method processes a single TaskChunk, detects success/failure,
   * builds a final LearningPattern, then stores it in your local store.
   */
  private async processChunk(chunk: TaskChunk): Promise<void> {
    try {
      // Step A) Derive outcome from chunk's checkpoints
      const outcome = this.determineOutcome(chunk);

      // Step B) Convert chunk's tool usage + file changes to a more explicit structure
      //   - gather from chunk.checkpoints => 'tool_usage'
      //   - gather 'error' messages => store in outcome or in metadata
      const toolUsage = this.extractToolUsage(chunk);
      const fileChanges = this.extractFileChanges(toolUsage);

      // Extract error patterns from the chunk
      const errorPatterns = this.extractErrorPatterns(chunk);

      // Add this: Determine task type from the pattern text
      const taskType = this.determineTaskType(this.deriveIntent(chunk));

      // Get project context string
      const contextString = await this.projectContext.getCurrentContext();

      // Parse dependencies and file types from context string
      const dependencies: { [key: string]: string } = {};
      const fileTypes: string[] = [];

      const lines = contextString.split('\n');
      let inDependencies = false;
      let inFileTypes = false;

      for (const line of lines) {
        if (line === 'Dependencies:') {
          inDependencies = true;
          inFileTypes = false;
          continue;
        } else if (line === 'File types:') {
          inDependencies = false;
          inFileTypes = true;
          continue;
        }

        if (inDependencies && line.includes('@')) {
          const [name, version] = line.split('@');
          dependencies[name.trim()] = version.trim();
        } else if (inFileTypes && line.includes(':')) {
          const [type] = line.split(':');
          fileTypes.push(type.trim());
        }
      }

      // Extract dependencies from file changes
      const fileDependencies = fileChanges.reduce<string[]>((deps, change) => {
        const extracted = this.extractImportDependencies(change.content);
        return [...deps, ...extracted];
      }, []);

      // Step C) Build the final LearningPattern
      const pattern: LearningPattern = {
        pattern: this.deriveIntent(chunk),
        context: JSON.stringify({
          projectState: {
            contextString,
            dependencies,
            fileTypes
          },
          fileChanges,
          toolUsage,
          errorPatterns,
          dependencies: fileDependencies // Add extracted dependencies to context
        }),
        timestamp: chunk.startTs,
        metadata: {
          outcome: {
            status: outcome,
            error: this.extractError(chunk),      // last error text, if any
            feedback: this.extractFeedback(chunk) // last feedback text, if any
          },
          fileChanges: {
            from: '',
            to: JSON.stringify(fileChanges)
          },
          toolUsage,
          errorPatterns,
          taskType, // Add the taskType to metadata
        },
        confidence: this.calculateConfidence(chunk, outcome),
        projectContext: {
          fingerprint: contextString,
          fileTypes,
          dependencies: [...Object.keys(dependencies), ...fileDependencies] // Include both types of dependencies
        },
        execution: {
          operations: toolUsage.map(tu => ({
            type: tu.tool,
            params: tu.params,
            timestamp: tu.timestamp
          })),
          outcome: outcome as ExecutionOutcome
        },
        category: 'code generation' as PatternCategory
      };

      // Step D) Store it in local store
      const patternId = await this.localStore.storePattern(pattern);

      // Step E) Optionally record pattern usage
      await this.localStore.recordPatternUsage({
        patternId,
        timestamp: Date.now(),
        outcome, // 'success'|'failure'|'partial'
        feedback: this.extractFeedback(chunk),
        adjustments: this.extractAdjustments(chunk)
      });

    } catch (err) {
      console.error('Error processing chunk:', err);
      throw err;
    }
  }

  /**
   * Extract import dependencies from file content
   */
  private extractImportDependencies(content: string): string[] {
    const dependencies: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('import ') || trimmed.startsWith('require(')) {
        // Match single quotes, double quotes, or backticks
        const matches = line.match(/['"`](.*?)['"`]/);
        if (matches && matches[1]) {
          // Only include relative imports starting with ./ or ../
          if (matches[1].startsWith('.')) {
            dependencies.push(matches[1]);
          }
        }
      }
    }
    
    return dependencies;
  }

  /**
   * Determine final outcome by looking at chunk.checkpoints:
   * - If we see an error => 'failure'
   * - If final completion checkpoint says success => 'success'
   * - Else => 'partial'
   */
  private determineOutcome(chunk: TaskChunk): ExecutionOutcome {
    // 1) Check final completion checkpoint first
    const completion = chunk.checkpoints.find(cp => cp.type === 'completion');
    if (completion?.success === true) {
      return 'success';
    }

    // 2) If any error and no successful completion, return failure
    const hasError = chunk.checkpoints.some(cp => cp.type === 'error');
    if (hasError) {
      return 'failure';
    }

    // 3) Otherwise partial
    return 'partial';
  }

  /**
   * Returns an array of tool usage extracted from chunk.checkpoints of type=tool_usage.
   */
  private extractToolUsage(chunk: TaskChunk): ToolUsage[] {
    return chunk.checkpoints
      .filter(cp => cp.type === 'tool_usage')
      .map(cp => {
        let toolData: any = {};
        try {
          toolData = JSON.parse(cp.message);
        } catch (err) {
          // If parse fails, fallback to raw text
          toolData = { tool: 'unknown', params: {}, raw: cp.message };
        }
        return {
          tool: toolData.tool || toolData.type || 'unknown',
          params: toolData.params || {},
          timestamp: cp.ts,
          success: cp.success ?? false
        };
      });
  }

  /**
   * Convert your tool usage array to a simpler [FileChange] array if you want.
   */
  private extractFileChanges(toolUsage: ToolUsage[]): Array<{
    filePath: string;
    type: 'created' | 'modified';
    content: string;
  }> {
    const changes: Array<{
      filePath: string;
      type: 'created' | 'modified';
      content: string;
    }> = [];

    for (const u of toolUsage) {
      if (u.tool === 'write_to_file' || u.tool === 'newFileCreated') {
        changes.push({
          filePath: u.params?.path || '',
          type: 'created',
          content: u.params?.content || ''
        });
      } else if (u.tool === 'replace_in_file') {
        changes.push({
          filePath: u.params?.path || '',
          type: 'modified',
          content: u.params?.content || ''
        });
      }
    }
    return changes;
  }

  /**
   * Possibly derive an "intent" from the chunk's first message or from some logic in chunk.
   * For now, we just return the text of the first message if it's not JSON.
   */
  private deriveIntent(chunk: TaskChunk): string {
    if (!chunk.messages.length) return 'No messages in chunk';
    const firstMsg = chunk.messages[0];
    // For example, skip if first message is JSON
    if (firstMsg.text && firstMsg.text.startsWith('{') && firstMsg.text.endsWith('}')) {
      return 'Some JSON-based task';
    }
    return firstMsg.text || 'Empty text';
  }

  private extractError(chunk: TaskChunk): string | undefined {
    // If we want the last error message encountered
    const errorCp = chunk.checkpoints.filter(cp => cp.type === 'error').pop();
    return errorCp?.message;
  }

  private extractFeedback(chunk: TaskChunk): string | undefined {
    // If you store feedback in 'feedback' type or user_feedback, do similarly
    const feedbackCp = chunk.checkpoints.filter(cp => cp.type === 'feedback').pop();
    return feedbackCp?.message;
  }

  /**
   * If you track "adjustments" = any tool usage after an error, or something.
   * 
   * For example, let's say after an error checkpoint, next tool usage is "adjustment."
   */
  private extractAdjustments(chunk: TaskChunk): string[] {
    const adjustments: string[] = [];
    let hadError = false;
    for (const cp of chunk.checkpoints) {
      if (cp.type === 'error') {
        hadError = true;
      } else if (hadError && cp.type === 'tool_usage') {
        adjustments.push(cp.message); // or parse out tool usage
      }
    }
    return adjustments;
  }

  /**
   * Example confidence logic:
   * - Start at 0.5
   * - If success => +0.2
   * - If failure => -0.2
   * - If partial => +0.1
   * - If chunk has a "tool_usage" => +0.1
   */
  private calculateConfidence(chunk: TaskChunk, outcome: ExecutionOutcome): number {
    let c = 0.5;
    switch (outcome) {
      case 'success':
        c += 0.2;
        break;
      case 'failure':
        c -= 0.2;
        break;
      case 'partial':
        c += 0.1;
        break;
    }
    // if chunk has any tool usage
    if (chunk.checkpoints.some(cp => cp.type === 'tool_usage')) {
      c += 0.1;
    }
    return Math.max(0, Math.min(1, c));
  }

  /**
   * Extract error patterns from chunk messages
   */
  private extractErrorPatterns(chunk: TaskChunk): string[] {
    // Make sure we're capturing the full error message
    return chunk.messages
      .filter(msg => msg.say === 'error')
      .map(msg => msg.text)
      .filter((text): text is string => text != null); // Type guard to ensure non-null
  }

  /**
   * New method: Determine the type of task from the pattern text
   */
  private determineTaskType(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('update')) return 'update';
    if (lower.includes('fix')) return 'fix';
    if (lower.includes('create') || lower.includes('implement') || lower.includes('add') || lower.includes('generate')) return 'create';
    if (lower.includes('delete') || lower.includes('remove')) return 'delete';
    return 'other';
  }
}
