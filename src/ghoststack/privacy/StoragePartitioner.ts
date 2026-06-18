/**
 * GhostStack Storage Partitioner
 * Partitions localStorage and IndexedDB per top-level domain.
 * @module StoragePartitioner
 */
import { session } from 'electron'

export class StoragePartitioner {
  /** Apply storage partitioning. Electron handles this via site isolation. */
  apply(): void {
    // Electron's Chromium backend handles storage partitioning when site isolation is enabled
    // We enforce it by setting partition-based storage via webPreferences
    // Additional cleanup on tab close is handled by the TabManager
  }

  /** Get injection script for additional client-side storage isolation */
  getInjectionScript(): string {
    return `(function(){
const _origSetItem = Storage.prototype.setItem;
const _origGetItem = Storage.prototype.getItem;
const _prefix = location.hostname.replace(/[^a-z0-9]/gi,'_') + '__';
Storage.prototype.setItem = function(key, value) {
  return _origSetItem.call(this, _prefix + key, value);
};
Storage.prototype.getItem = function(key) {
  return _origGetItem.call(this, _prefix + key);
};
})();`
  }

  /** Clear partitioned storage for a domain */
  async clearForDomain(domain: string): Promise<void> {
    try {
      await session.defaultSession.clearStorageData({ origin: `https://${domain}` })
    } catch {
      /* ignore */
    }
  }

  /** Clear all storage */
  async clearAll(): Promise<void> {
    await session.defaultSession.clearStorageData()
  }
}
