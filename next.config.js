/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['googleapis']
  },
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