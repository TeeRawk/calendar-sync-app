/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['googleapis']
  },
  // Security headers for production
  async headers() {
    const headers = []
    
    if (process.env.NODE_ENV === 'production') {
      headers.push({
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://accounts.google.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://accounts.google.com https://www.googleapis.com https://oauth2.googleapis.com; frame-src 'self' https://accounts.google.com;"
          }
        ]
      })
    }
    
    return headers
  },
  // Optimize for production
  compress: true,
  poweredByHeader: false,
  // Enable static optimization
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  async rewrites() {
    return [
      {
        source: '/api/cron/:path*',
        destination: '/api/cron/:path*'
      }
    ]
  }
}

module.exports = nextConfig