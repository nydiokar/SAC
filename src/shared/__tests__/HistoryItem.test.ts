import { describe, it, beforeEach, afterEach } from "mocha"
import { HistoryItem, HistoryValidationError, createHistoryItem, serializeHistoryItem, deserializeHistoryItem } from '../HistoryItem'
import sinon from 'sinon'
import { expect } from 'chai' 

describe('HistoryItem', () => {
    let originalCrypto: any;
    
    beforeEach(() => {
        // Store original crypto
        originalCrypto = global.crypto;
        // Set mock crypto
        Object.defineProperty(global, 'crypto', {
            value: {
                randomUUID: () => '123e4567-e89b-12d3-a456-426614174000'
            },
            configurable: true
        });
        
        const fixedDate = new Date('2024-01-01');
        sinon.useFakeTimers(fixedDate.getTime());
    });

    afterEach(() => {
        sinon.restore();
        // Restore original crypto
        Object.defineProperty(global, 'crypto', {
            value: originalCrypto,
            configurable: true
        });
    });

    describe('createHistoryItem', () => {
        it('creates a basic history item with required fields', () => {
            const item = createHistoryItem('test task', 100, 200, 0.002)
            
            expect(item).to.deep.equal({
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

            expect(item).to.deep.equal({
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
            expect(() => {
                createHistoryItem('task', 100, 200, 0.002, {
                    patterns: ['valid pattern']
                })
            }).to.not.throw()

            // Invalid patterns - not an array
            expect(() => {
                createHistoryItem('task', 100, 200, 0.002, {
                    patterns: 'not an array' as any
                })
            }).to.throw(HistoryValidationError)

            // Invalid patterns - empty string
            expect(() => {
                createHistoryItem('task', 100, 200, 0.002, {
                    patterns: ['valid', '']
                })
            }).to.throw(HistoryValidationError)

            // Invalid patterns - non-string element
            expect(() => {
                createHistoryItem('task', 100, 200, 0.002, {
                    patterns: ['valid', 123 as any]
                })
            }).should.throw(HistoryValidationError)
        })

        it('validates success field correctly', () => {
            expect(() => {
                createHistoryItem('task', 100, 200, 0.002, { success: true })
            }).to.not.throw()

            expect(() => {
                createHistoryItem('task', 100, 200, 0.002, {
                    success: 'true' as any
                })
            }).to.throw(HistoryValidationError)
        })

        it('validates feedback field correctly', () => {
            expect(() => {
                createHistoryItem('task', 100, 200, 0.002, {
                    feedback: 'valid feedback'
                })
            }).to.not.throw()

            expect(() => {
                createHistoryItem('task', 100, 200, 0.002, {
                    feedback: ''
                })
            }).to.throw(HistoryValidationError)

            expect(() => {
                createHistoryItem('task', 100, 200, 0.002, {
                    feedback: 123 as any
                })
            }).to.throw(HistoryValidationError)
        })

        it('validates numeric fields correctly', () => {
            expect(() => { 
                createHistoryItem('task', -1, 200, 0.002)
            }).to.throw(HistoryValidationError)
            
            expect(() => { 
                createHistoryItem('task', NaN, 200, 0.002)
            }).to.throw(HistoryValidationError)

            expect(() => { 
                createHistoryItem('task', 100, -1, 0.002)
            }).to.throw(HistoryValidationError)
            
            expect(() => { 
                createHistoryItem('task', 100, NaN, 0.002)
            }).to.throw(HistoryValidationError)

            expect(() => {
                createHistoryItem('task', 100, 200, -1)
            }).to.throw(HistoryValidationError)
            
            expect(() => {
                createHistoryItem('task', 100, 200, NaN)
            }).to.throw(HistoryValidationError)

            expect(() => {
                createHistoryItem('task', 100, 200, 0.002, {
                    cacheReads: -1
                })
            }).to.throw(HistoryValidationError)

            expect(() => {
                createHistoryItem('task', 100, 200, 0.002, {
                    cacheWrites: -1
                })
            }).to.throw(HistoryValidationError)
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

            deserialized.should.eql(original)
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

            deserialized.should.eql(oldFormatItem)
            should(deserialized.patterns).be.undefined()
            should(deserialized.success).be.undefined()
            should(deserialized.feedback).be.undefined()
        })

        it('throws error for invalid JSON', () => {
            (function() {
                deserializeHistoryItem('invalid json')
            }).should.throw(HistoryValidationError)
        })

        it('throws error for invalid data structure', () => {
            (function() { 
                deserializeHistoryItem('null')
            }).should.throw(HistoryValidationError)
            
            expect(() => {
                deserializeHistoryItem('"string"')
            }).to.throw(HistoryValidationError)
            
            expect(() => {
				deserializeHistoryItem("[]")
			}).to.throw(HistoryValidationError);
		});
	});
});
