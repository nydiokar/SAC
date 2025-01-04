export class HistoryValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'HistoryValidationError'
	}
}

export type HistoryItem = {
	id: string
	ts: number
	task: string
	tokensIn: number
	tokensOut: number
	cacheWrites?: number
	cacheReads?: number
	totalCost: number
	patterns?: string[]
	success?: boolean
	feedback?: string
}

const validateNumber = (value: number, field: string): void => {
	if (typeof value !== 'number' || isNaN(value)) {
		throw new HistoryValidationError(`${field} must be a valid number`)
	}
	if (value < 0) {
		throw new HistoryValidationError(`${field} cannot be negative`)
	}
}

const validatePatterns = (patterns: string[] | undefined): void => {
	if (patterns !== undefined) {
		if (!Array.isArray(patterns)) {
			throw new HistoryValidationError('patterns must be an array of strings')
		}
		if (patterns.some(p => typeof p !== 'string' || p.trim().length === 0)) {
			throw new HistoryValidationError('patterns must be non-empty strings')
		}
	}
}

const validateFeedback = (feedback: string | undefined): void => {
	if (feedback !== undefined && (typeof feedback !== 'string' || feedback.trim().length === 0)) {
		throw new HistoryValidationError('feedback must be a non-empty string')
	}
}

export const validateHistoryItem = (item: HistoryItem): void => {
	if (!item.id || typeof item.id !== 'string') {
		throw new HistoryValidationError('id must be a non-empty string')
	}
	if (!item.task || typeof item.task !== 'string') {
		throw new HistoryValidationError('task must be a non-empty string')
	}
	if (typeof item.ts !== 'number' || isNaN(item.ts)) {
		throw new HistoryValidationError('ts must be a valid timestamp')
	}

	validateNumber(item.tokensIn, 'tokensIn')
	validateNumber(item.tokensOut, 'tokensOut')
	validateNumber(item.totalCost, 'totalCost')

	if (item.cacheWrites !== undefined) {
		validateNumber(item.cacheWrites, 'cacheWrites')
	}
	if (item.cacheReads !== undefined) {
		validateNumber(item.cacheReads, 'cacheReads')
	}

	validatePatterns(item.patterns)
	validateFeedback(item.feedback)

	if (item.success !== undefined && typeof item.success !== 'boolean') {
		throw new HistoryValidationError('success must be a boolean')
	}
}

export const createHistoryItem = (
	task: string,
	tokensIn: number,
	tokensOut: number,
	totalCost: number,
	options: Partial<Omit<HistoryItem, 'id' | 'ts' | 'task' | 'tokensIn' | 'tokensOut' | 'totalCost'>> = {}
): HistoryItem => {
	const item = {
		id: crypto.randomUUID(),
		ts: Date.now(),
		task,
		tokensIn,
		tokensOut,
		totalCost,
		...options
	}
	validateHistoryItem(item)
	return item
}

export const serializeHistoryItem = (item: HistoryItem): string => {
	validateHistoryItem(item)
	return JSON.stringify(item)
}

export const deserializeHistoryItem = (data: string): HistoryItem => {
	let parsed: unknown
	try {
		parsed = JSON.parse(data)
	} catch (e) {
		throw new HistoryValidationError('Invalid JSON format')
	}

	if (typeof parsed !== 'object' || parsed === null) {
		throw new HistoryValidationError('Data must be an object')
	}

	const item = parsed as HistoryItem
	validateHistoryItem(item)
	return item
}
