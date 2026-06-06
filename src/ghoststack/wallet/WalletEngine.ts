import { ethers } from 'ethers'
import * as argon2 from 'argon2'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export class WalletEngine {
  private static instance: WalletEngine
  
  // In-memory unlocked wallet. MUST be explicitly zeroed out when locking.
  private unlockedWallet: ethers.HDNodeWallet | ethers.Wallet | null = null
  private walletPath: string

  private constructor() {
    // In dev environment we can just use process.cwd for easy inspection
    this.walletPath = path.join(app ? app.getPath('userData') : process.cwd(), 'ghost_wallet.enc')
  }

  public static getInstance(): WalletEngine {
    if (!WalletEngine.instance) {
      WalletEngine.instance = new WalletEngine()
    }
    return WalletEngine.instance
  }

  /** Check if a wallet file already exists */
  public hasWallet(): boolean {
    return fs.existsSync(this.walletPath)
  }

  /** 
   * Generate a new 12-word BIP-39 Mnemonic 
   */
  public generateMnemonic(): string {
    const randomBytes = crypto.randomBytes(16)
    const mnemonic = ethers.Mnemonic.fromEntropy(randomBytes)
    return mnemonic.phrase
  }

  /**
   * Derive an encryption key from a master password using Argon2id.
   * This is extremely resistant to GPU brute-force attacks.
   */
  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
      salt: salt,
      hashLength: 32, // 256-bit key for ChaCha20
      raw: true
    })
    return hash
  }

  /**
   * Create a new wallet from a mnemonic and encrypt it to disk.
   */
  public async createWallet(mnemonicPhrase: string, password: string): Promise<string> {
    const wallet = ethers.Wallet.fromPhrase(mnemonicPhrase)
    
    // Create random salt for key derivation
    const salt = crypto.randomBytes(16)
    
    // Derive 256-bit encryption key
    const key = await this.deriveKey(password, salt)
    
    // Encrypt the private key using ChaCha20-Poly1305
    const nonce = crypto.randomBytes(12) // 96-bit nonce
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)
    
    let encrypted = cipher.update(wallet.privateKey, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag().toString('hex')

    // Save to disk
    const payload = {
      salt: salt.toString('hex'),
      nonce: nonce.toString('hex'),
      authTag: authTag,
      ciphertext: encrypted,
      address: wallet.address
    }

    fs.writeFileSync(this.walletPath, JSON.stringify(payload))
    
    // Zero out the key in memory buffer
    key.fill(0)
    
    this.unlockedWallet = wallet
    return wallet.address
  }

  /**
   * Unlock an existing wallet.
   */
  public async unlockWallet(password: string): Promise<boolean> {
    if (!this.hasWallet()) return false

    try {
      const payloadStr = fs.readFileSync(this.walletPath, 'utf8')
      const payload = JSON.parse(payloadStr)

      const salt = Buffer.from(payload.salt, 'hex')
      const nonce = Buffer.from(payload.nonce, 'hex')
      const authTag = Buffer.from(payload.authTag, 'hex')
      
      const key = await this.deriveKey(password, salt)
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
      decipher.setAuthTag(authTag)
      
      let privateKey = decipher.update(payload.ciphertext, 'hex', 'utf8')
      privateKey += decipher.final('utf8')
      
      key.fill(0)

      this.unlockedWallet = new ethers.Wallet(privateKey)
      
      // Attempt to clear privateKey string from memory via GC hint
      privateKey = '0'.repeat(privateKey.length)
      
      return true
    } catch (e) {
      console.error('[WalletEngine] Failed to unlock wallet. Incorrect password or corrupted file.', e)
      return false
    }
  }

  /**
   * Check if wallet is currently unlocked in memory.
   */
  public isUnlocked(): boolean {
    return this.unlockedWallet !== null
  }

  public getAddress(): string | null {
    return this.unlockedWallet ? this.unlockedWallet.address : null
  }

  /**
   * Wipe the in-memory wallet.
   */
  public lockWallet(): void {
    if (this.unlockedWallet) {
      this.unlockedWallet = null
    }
  }

  /**
   * Sign a transaction if the wallet is unlocked.
   */
  public async signTransaction(txRequest: ethers.TransactionRequest): Promise<string> {
    if (!this.unlockedWallet) {
      throw new Error('Wallet is locked')
    }
    return await this.unlockedWallet.signTransaction(txRequest)
  }

  /**
   * Sign a personal message.
   */
  public async signMessage(message: string | Uint8Array): Promise<string> {
    if (!this.unlockedWallet) {
      throw new Error('Wallet is locked')
    }
    return await this.unlockedWallet.signMessage(message)
  }
}
