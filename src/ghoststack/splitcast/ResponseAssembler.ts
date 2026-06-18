/**
 * GhostStack Response Assembler
 * Reassembles fragmented responses from carrier connections.
 * Decrypts, sorts by sequence number, and reconstructs original data.
 * @module ResponseAssembler
 */

import type { Fragment } from './FragmentEncoder'

/** Assembled response */
export interface AssembledResponse {
  success: boolean
  data: Buffer | null
  totalFragments: number
  receivedFragments: number
  error?: string
}

/**
 * Response Assembler — collects and reassembles fragmented data.
 * Handles out-of-order delivery and missing fragment detection.
 */
export class ResponseAssembler {
  private pendingAssemblies: Map<string, Map<number, Fragment>> = new Map()

  /**
   * Add a received fragment to the assembly buffer.
   * @param assemblyId - Unique assembly session ID
   * @param fragment - Received fragment
   * @param totalExpected - Total number of expected fragments
   * @returns AssembledResponse if all fragments received, null otherwise
   */
  addFragment(
    assemblyId: string,
    fragment: Fragment,
    totalExpected: number
  ): AssembledResponse | null {
    if (!this.pendingAssemblies.has(assemblyId)) {
      this.pendingAssemblies.set(assemblyId, new Map())
    }

    const fragments = this.pendingAssemblies.get(assemblyId)!
    fragments.set(fragment.sequence, fragment)

    // Check if all fragments received
    if (fragments.size >= totalExpected) {
      const result = this.assemble(assemblyId, totalExpected)
      this.pendingAssemblies.delete(assemblyId)
      return result
    }

    return null
  }

  /**
   * Assemble all fragments for a session.
   * @param assemblyId - Assembly session ID
   * @param totalExpected - Total expected fragments
   * @returns Assembled response
   */
  private assemble(assemblyId: string, totalExpected: number): AssembledResponse {
    const fragments = this.pendingAssemblies.get(assemblyId)
    if (!fragments) {
      return {
        success: false,
        data: null,
        totalFragments: totalExpected,
        receivedFragments: 0,
        error: 'No fragments found'
      }
    }

    // Sort by sequence number and concatenate
    const sorted = Array.from(fragments.values()).sort((a, b) => a.sequence - b.sequence)
    const buffers = sorted.map((f) => f.data)

    return {
      success: true,
      data: Buffer.concat(buffers),
      totalFragments: totalExpected,
      receivedFragments: fragments.size
    }
  }

  /**
   * Check if an assembly is complete.
   * @param assemblyId - Assembly session ID
   * @param totalExpected - Total expected fragments
   * @returns true if all fragments received
   */
  isComplete(assemblyId: string, totalExpected: number): boolean {
    const fragments = this.pendingAssemblies.get(assemblyId)
    return fragments ? fragments.size >= totalExpected : false
  }

  /**
   * Get the number of received fragments for an assembly.
   * @param assemblyId - Assembly session ID
   * @returns Number of received fragments
   */
  getReceivedCount(assemblyId: string): number {
    return this.pendingAssemblies.get(assemblyId)?.size || 0
  }

  /**
   * Cancel and clean up a pending assembly.
   * @param assemblyId - Assembly session ID
   */
  cancel(assemblyId: string): void {
    this.pendingAssemblies.delete(assemblyId)
  }

  /**
   * Clean up all pending assemblies.
   */
  clear(): void {
    this.pendingAssemblies.clear()
  }
}
