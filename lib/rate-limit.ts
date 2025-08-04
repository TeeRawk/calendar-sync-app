/**
 * Rate limiting utilities for authentication endpoints
 * Implements sliding window rate limiting with in-memory storage
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private requests = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 15 * 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.requests.forEach((entry, key) => {
      if (now >= entry.resetTime) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.requests.delete(key));
  }

  isAllowed(identifier: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = this.requests.get(identifier);

    if (!entry || now >= entry.resetTime) {
      // First request or window expired
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return { allowed: true };
    }

    if (entry.count >= this.maxRequests) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Increment count
    entry.count++;
    return { allowed: true };
  }

  reset(identifier: string) {
    this.requests.delete(identifier);
  }
}

// Create rate limiters for different endpoints
export const authRateLimit = new RateLimiter(5, 15 * 60 * 1000); // 5 requests per 15 minutes
export const refreshRateLimit = new RateLimiter(20, 15 * 60 * 1000); // 20 requests per 15 minutes
export const generalRateLimit = new RateLimiter(100, 15 * 60 * 1000); // 100 requests per 15 minutes

/**
 * Get client identifier for rate limiting
 * Uses IP address with fallback to user agent
 */
export function getClientIdentifier(request: Request): string {
  // Try to get real IP from various headers (for production behind proxies)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
  
  // Fallback to user agent if IP not available
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  return `${ip}:${userAgent}`;
}

/**
 * Apply rate limiting to a request
 */
export function applyRateLimit(
  rateLimiter: RateLimiter,
  identifier: string
): { allowed: boolean; retryAfter?: number } {
  return rateLimiter.isAllowed(identifier);
}

/**
 * Create rate limit response
 */
export function createRateLimitResponse(retryAfter: number) {
  return new Response(
    JSON.stringify({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      retryAfter
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': (Date.now() + retryAfter * 1000).toString()
      }
    }
  );
}