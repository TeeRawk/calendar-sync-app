import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
              Calendar Sync App
            </h3>
            <p className="text-sm text-gray-600">
              Seamlessly synchronize your calendars across multiple platforms with advanced privacy controls and intelligent duplicate management.
            </p>
          </div>

          {/* Product */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
              Product
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/dashboard/new-sync" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Create Sync
                </Link>
              </li>
              <li>
                <span className="text-sm text-gray-600">
                  Duplicate Cleanup
                </span>
              </li>
              <li>
                <span className="text-sm text-gray-600">
                  Busy/Free Sync
                </span>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
              Support
            </h3>
            <ul className="space-y-2">
              <li>
                <a 
                  href="mailto:support@calendar-sync.com" 
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Help & Support
                </a>
              </li>
              <li>
                <a 
                  href="mailto:contact@calendar-sync.com" 
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Contact Us
                </a>
              </li>
              <li>
                <span className="text-sm text-gray-600">
                  Documentation
                </span>
              </li>
              <li>
                <span className="text-sm text-gray-600">
                  API Reference
                </span>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
              Legal
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/privacy" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <span className="text-sm text-gray-600">
                  Cookie Policy
                </span>
              </li>
              <li>
                <span className="text-sm text-gray-600">
                  GDPR Compliance
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-4">
              <p className="text-sm text-gray-500">
                © {new Date().getFullYear()} Calendar Sync App. All rights reserved.
              </p>
            </div>
            
            <div className="flex items-center space-x-6">
              <Link 
                href="/privacy" 
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Privacy
              </Link>
              <Link 
                href="/terms" 
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Terms
              </Link>
              <a 
                href="mailto:legal@calendar-sync.com" 
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Contact
              </a>
            </div>
          </div>
        </div>

        {/* Additional Legal Notice */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            This service integrates with Google Calendar and other third-party calendar services. 
            Your use of these integrations is subject to the respective service providers' terms and privacy policies.
          </p>
        </div>
      </div>
    </footer>
  );
}