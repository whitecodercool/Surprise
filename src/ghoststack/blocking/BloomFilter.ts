/**
 * GhostStack Bloom Filter — O(1) probabilistic set for fast URL matching.
 * @module BloomFilter
 */
import { createHash } from 'crypto'

export class BloomFilter {
  private bits: Uint8Array
  private size: number
  private hashCount: number

  constructor(size: number = 100000, hashCount: number = 7) {
    this.size = size
    this.hashCount = hashCount
    this.bits = new Uint8Array(Math.ceil(size / 8))
  }

  /** Add a value to the filter */
  add(value: string): void {
    for (const pos of this.getPositions(value)) {
      this.bits[Math.floor(pos / 8)] |= 1 << (pos % 8)
    }
  }

  /** Check if value might be in the filter (false positives possible) */
  has(value: string): boolean {
    for (const pos of this.getPositions(value)) {
      if (!(this.bits[Math.floor(pos / 8)] & (1 << (pos % 8)))) return false
    }
    return true
  }

  private getPositions(value: string): number[] {
    const positions: number[] = []
    for (let i = 0; i < this.hashCount; i++) {
      const hash = createHash('md5').update(`${i}:${value}`).digest()
      const pos = ((hash.readUInt32BE(0) % this.size) + this.size) % this.size
      positions.push(pos)
    }
    return positions
  }
}
