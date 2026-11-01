// redisCache.js - High-performance Redis caching layer for common questions and answers
// Supports:
//   1. Upstash Redis HTTP REST (ideal for Vercel Serverless / Edge)
//   2. Standard TCP Redis (ioredis via REDIS_URL or REDIS_HOST)
//   3. In-memory LRU Cache Fallback (for zero-setup local development or offline resilience)
const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = parseInt(process.env.REDIS_CACHE_TTL || '86400', 10); // 24 hours
const KEY_PREFIX = 'guni:qa:';

class RedisCacheManager {
  constructor() {
    this.mode = 'none';
    this.client = null;
    this.memoryCache = new Map();
    this.maxMemoryItems = 1000;
    this.stats = { hits: 0, misses: 0 };
    this.initClient();
  }

  initClient() {
    // 1. Upstash Redis REST API
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      this.mode = 'upstash-rest';
      this.upstashUrl = process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '');
      this.upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      console.log('✓ [Cache] Redis initialized via Upstash REST API');
      return;
    }

    // 2. Standard TCP Redis (via ioredis)
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    if (redisUrl || redisHost) {
      try {
        const Redis = require('ioredis');
        const opts = {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 2500,
          commandTimeout: 2000,
          enableReadyCheck: false,
          retryStrategy: (times) => (times <= 3 ? Math.min(times * 200, 1000) : null)
        };

        this.client = redisUrl ? new Redis(redisUrl, opts) : new Redis({
          host: redisHost,
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          ...opts
        });

        this.client.on('error', (err) => {
          console.warn('[Cache Warning] Redis TCP client error:', err.message);
        });

        this.client.connect().catch((err) => {
          console.warn('[Cache Warning] Initial Redis connection failed:', err.message);
        });

        this.mode = 'ioredis';
        console.log('✓ [Cache] Redis initialized via TCP client (ioredis)');
        return;
      } catch (err) {
        console.warn('[Cache Warning] Failed to initialize ioredis:', err.message);
      }
    }

    // 3. In-Memory Fallback
    this.mode = 'memory';
    console.log('✓ [Cache] Redis credentials not found — using in-memory LRU cache fallback');
  }

  // Normalizes question query text to maximize cache hit rates across slight variations
  normalizeQuery(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .toLowerCase()
      // Replace non-word punctuation with spaces
      .replace(/[?!.,;:()[\]{}"'`~@#$%^&*+=/\\|<>_-]+/g, ' ')
      // Collapse consecutive whitespaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Deterministically generates cache key based on query, language, and conversation context
  buildCacheKey(queryText, lang = 'en', history = []) {
    const normalized = this.normalizeQuery(queryText);
    const langCode = (lang || 'en').toLowerCase().slice(0, 5);

    // Multi-turn context handling: If history exists, include the previous turn hash
    let contextHash = 'none';
    if (Array.isArray(history) && history.length > 0) {
      const recentUserTurns = history
        .filter(t => t && t.role === 'user' && t.content)
        .slice(-2)
        .map(t => this.normalizeQuery(t.content))
        .join(' > ');
      if (recentUserTurns) {
        contextHash = crypto.createHash('md5').update(recentUserTurns).digest('hex').slice(0, 10);
      }
    }

    const queryHash = crypto.createHash('md5').update(normalized).digest('hex').slice(0, 16);
    return `${KEY_PREFIX}${langCode}:${contextHash}:${queryHash}`;
  }

  async get(queryText, lang = 'en', history = []) {
    const key = this.buildCacheKey(queryText, lang, history);
    const t0 = Date.now();

    try {
      let rawData = null;

      if (this.mode === 'upstash-rest') {
        const res = await fetch(`${this.upstashUrl}/get/${encodeURIComponent(key)}`, {
          headers: { Authorization: `Bearer ${this.upstashToken}` },
          signal: AbortSignal.timeout(2000)
        });
        if (res.ok) {
          const body = await res.json();
          rawData = body.result;
        }
      } else if (this.mode === 'ioredis' && this.client && this.client.status === 'ready') {
        rawData = await this.client.get(key);
      } else {
        // In-memory lookup
        const item = this.memoryCache.get(key);
        if (item) {
          if (item.expiresAt > Date.now()) {
            rawData = item.value;
          } else {
            this.memoryCache.delete(key);
          }
        }
      }

      if (rawData) {
        const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        this.stats.hits++;
        const elapsedMs = Date.now() - t0;
        console.log(`⚡ [Cache HIT] (${this.mode}, ${elapsedMs}ms) Key: ${key} -> "${queryText.slice(0, 45)}"`);
        return parsed;
      }
    } catch (err) {
      console.warn('[Cache Warning] Failed to read from cache:', err.message);
    }

    this.stats.misses++;
    return null;
  }

  async set(queryText, lang = 'en', history = [], data = {}, ttlSeconds = DEFAULT_TTL_SECONDS) {
    if (!data || !data.answer) return;
    const key = this.buildCacheKey(queryText, lang, history);
    const payload = JSON.stringify({
      ...data,
      cachedAt: new Date().toISOString()
    });

    try {
      if (this.mode === 'upstash-rest') {
        await fetch(`${this.upstashUrl}/set/${encodeURIComponent(key)}?ex=${ttlSeconds}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.upstashToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ value: payload }),
          signal: AbortSignal.timeout(2500)
        });
      } else if (this.mode === 'ioredis' && this.client && this.client.status === 'ready') {
        await this.client.set(key, payload, 'EX', ttlSeconds);
      }

      // Always populate in-memory LRU cache as well for ultra-fast local hits
      if (this.memoryCache.size >= this.maxMemoryItems) {
        const oldestKey = this.memoryCache.keys().next().value;
        this.memoryCache.delete(oldestKey);
      }
      this.memoryCache.set(key, {
        value: payload,
        expiresAt: Date.now() + (ttlSeconds * 1000)
      });
    } catch (err) {
      console.warn('[Cache Warning] Failed to write to cache:', err.message);
    }
  }

  async flush() {
    try {
      this.memoryCache.clear();
      if (this.mode === 'ioredis' && this.client && this.client.status === 'ready') {
        const keys = await this.client.keys(`${KEY_PREFIX}*`);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      }
      console.log('✓ [Cache] Flushed FAQ cache');
    } catch (err) {
      console.warn('[Cache Warning] Failed to flush cache:', err.message);
    }
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const ratio = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : '0%';
    return {
      mode: this.mode,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRatio: ratio,
      memoryItems: this.memoryCache.size
    };
  }
}

// Singleton cache instance
module.exports = new RedisCacheManager();

