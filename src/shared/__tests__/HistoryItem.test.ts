import { HistoryItem, HistoryValidationError, createHistoryItem, serializeHistoryItem, deserializeHistoryItem } from '../HistoryItem'

describe('HistoryItem', () => {
	const mockCrypto = {
		randomUUID: () => '123e4567-e89b-12d3-a456-426614174000'
	}
	global.crypto = mockCrypto as any
	
	beforeEach(() => {
		jest.useFakeTimers()
		jest.setSystemTime(new Date('2024-01-01'))
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	describe('createHistoryItem', () => {
		it('creates a basic history item with required fields', () => {
			const item = createHistoryItem('test task', 100, 200, 0.002)
			
			expect(item).toEqual({
				id: '123e4567-e89b-12d3-a456-426614174000',
				ts: 1704067200000,
				task: 'test task',
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.002
			})
		})

		it('creates a history item with optional fields', () => {
			const item = createHistoryItem('test task', 100, 200, 0.002, {
				patterns: ['pattern1', 'pattern2'],
				success: true,
				feedback: 'Great job!',
				cacheReads: 1,
				cacheWrites: 2
			})

			expect(item).toEqual({
				id: '123e4567-e89b-12d3-a456-426614174000',
				ts: 1704067200000,
				task: 'test task',
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.002,
				patterns: ['pattern1', 'pattern2'],
				success: true,
				feedback: 'Great job!',
				cacheReads: 1,
				cacheWrites: 2
			})
		})
	})

	describe('validation', () => {
		it('validates patterns field correctly', () => {
			// Valid patterns
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				patterns: ['valid pattern']
			})).not.toThrow()

			// Invalid patterns - not an array
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				patterns: 'not an array' as any
			})).toThrow(HistoryValidationError)

			// Invalid patterns - empty string
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				patterns: ['valid', '']
			})).toThrow(HistoryValidationError)

			// Invalid patterns - non-string element
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				patterns: ['valid', 123 as any]
			})).toThrow(HistoryValidationError)
		})

		it('validates success field correctly', () => {
			// Valid boolean values
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				success: true
			})).not.toThrow()
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				success: false
			})).not.toThrow()

			// Invalid success value
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				success: 'true' as any
			})).toThrow(HistoryValidationError)
		})

		it('validates feedback field correctly', () => {
			// Valid feedback
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				feedback: 'valid feedback'
			})).not.toThrow()

			// Invalid feedback - empty string
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				feedback: ''
			})).toThrow(HistoryValidationError)

			// Invalid feedback - non-string
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				feedback: 123 as any
			})).toThrow(HistoryValidationError)
		})

		it('validates numeric fields correctly', () => {
			// Invalid tokensIn
			expect(() => createHistoryItem('task', -1, 200, 0.002)).toThrow(HistoryValidationError)
			expect(() => createHistoryItem('task', NaN, 200, 0.002)).toThrow(HistoryValidationError)

			// Invalid tokensOut
			expect(() => createHistoryItem('task', 100, -1, 0.002)).toThrow(HistoryValidationError)
			expect(() => createHistoryItem('task', 100, NaN, 0.002)).toThrow(HistoryValidationError)

			// Invalid totalCost
			expect(() => createHistoryItem('task', 100, 200, -1)).toThrow(HistoryValidationError)
			expect(() => createHistoryItem('task', 100, 200, NaN)).toThrow(HistoryValidationError)

			// Invalid cache values
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				cacheReads: -1
			})).toThrow(HistoryValidationError)
			expect(() => createHistoryItem('task', 100, 200, 0.002, {
				cacheWrites: -1
			})).toThrow(HistoryValidationError)
		})
	})

	describe('serialization', () => {
		it('serializes and deserializes a history item with all fields', () => {
			const original: HistoryItem = {
				id: '123',
				ts: 1704067200000,
				task: 'test task',
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.002,
				patterns: ['pattern1'],
				success: true,
				feedback: 'Good work',
				cacheReads: 1,
				cacheWrites: 2
			}

			const serialized = serializeHistoryItem(original)
			const deserialized = deserializeHistoryItem(serialized)

			expect(deserialized).toEqual(original)
		})

		it('maintains backward compatibility with old format', () => {
			const oldFormatItem = {
				id: '123',
				ts: 1704067200000,
				task: 'test task',
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.002
			}

			const serialized = JSON.stringify(oldFormatItem)
			const deserialized = deserializeHistoryItem(serialized)

			expect(deserialized).toEqual(oldFormatItem)
			expect(deserialized.patterns).toBeUndefined()
			expect(deserialized.success).toBeUndefined()
			expect(deserialized.feedback).toBeUndefined()
		})

		it('throws error for invalid JSON', () => {
			expect(() => deserializeHistoryItem('invalid json')).toThrow(HistoryValidationError)
		})

		it('throws error for invalid data structure', () => {
			expect(() => deserializeHistoryItem('null')).toThrow(HistoryValidationError)
			expect(() => deserializeHistoryItem('"string"')).toThrow(HistoryValidationError)
			expect(() => deserializeHistoryItem('[]')).toThrow(HistoryValidationError)
		})
	})
})
