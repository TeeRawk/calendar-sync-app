import Link from 'next/link';

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="mb-8">
            <Link 
              href="/" 
              className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-4 inline-block"
            >
              ← Back to Home
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
            <p className="text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <div className="prose prose-gray max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Agreement to Terms</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                These Terms of Service ("Terms") govern your use of the Calendar Sync App service ("Service") 
                operated by us ("Company," "we," "our," or "us"). By accessing or using our Service, you agree 
                to be bound by these Terms.
              </p>
              <p className="text-gray-700 leading-relaxed">
                If you disagree with any part of these Terms, then you may not access the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Description of Service</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Calendar Sync App is a web-based service that allows users to:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
                <li>Connect and synchronize multiple calendar sources</li>
                <li>Integrate Google Calendar with external ICS feeds</li>
                <li>Manage calendar events and synchronization settings</li>
                <li>Handle busy/free calendar synchronization with privacy controls</li>
                <li>Clean up and manage duplicate calendar events</li>
              </ul>
              <p className="text-gray-700 leading-relaxed">
                The Service is provided on an "as is" and "as available" basis.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">3. User Accounts and Registration</h2>
              
              <h3 className="text-lg font-medium text-gray-800 mb-3">3.1 Account Creation</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                To use our Service, you must:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
                <li>Create an account by providing accurate and complete information</li>
                <li>Be at least 13 years of age</li>
                <li>Have legal capacity to enter into these Terms</li>
                <li>Maintain the security of your account credentials</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-800 mb-3">3.2 Account Responsibilities</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                You are responsible for:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
                <li>All activities that occur under your account</li>
                <li>Maintaining the confidentiality of your login credentials</li>
                <li>Notifying us immediately of any unauthorized use</li>
                <li>Providing accurate and up-to-date account information</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Acceptable Use</h2>
              
              <h3 className="text-lg font-medium text-gray-800 mb-3">4.1 Permitted Uses</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                You may use the Service for lawful purposes related to calendar management and synchronization.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">4.2 Prohibited Uses</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                You agree not to:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
                <li>Use the Service for any illegal or unauthorized purpose</li>
                <li>Violate any applicable laws or regulations</li>
                <li>Transmit malware, viruses, or other malicious code</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Harvest or collect user information without consent</li>
                <li>Use the Service to spam or send unsolicited communications</li>
                <li>Reverse engineer, decompile, or disassemble the Service</li>
                <li>Create derivative works based on the Service</li>
                <li>Use automated tools to access the Service without permission</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Third-Party Integrations</h2>
              
              <h3 className="text-lg font-medium text-gray-800 mb-3">5.1 Google Calendar Integration</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Our Service integrates with Google Calendar through Google's APIs. Your use of Google Calendar 
                through our Service is subject to Google's Terms of Service and Privacy Policy.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">5.2 External Calendar Sources</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                You may connect external calendar sources (ICS feeds) to our Service. You are responsible 
                for ensuring you have proper authorization to access and synchronize these calendar sources.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">5.3 Third-Party Limitations</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We are not responsible for:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
                <li>The availability or functionality of third-party services</li>
                <li>Changes to third-party APIs or services</li>
                <li>Content or data from external sources</li>
                <li>Privacy practices of third-party services</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Data and Privacy</h2>
              
              <h3 className="text-lg font-medium text-gray-800 mb-3">6.1 Your Data</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                You retain ownership of your calendar data. By using our Service, you grant us the necessary 
                rights to process your data to provide the Service as described in our Privacy Policy.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">6.2 Data Security</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We implement reasonable security measures to protect your data, but we cannot guarantee 
                absolute security. You acknowledge that you provide your data at your own risk.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">6.3 Data Backup</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                You are responsible for maintaining your own backups of important calendar data. We may 
                perform regular backups, but we do not guarantee data recovery in all circumstances.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Service Availability</h2>
              
              <h3 className="text-lg font-medium text-gray-800 mb-3">7.1 Uptime</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We strive to maintain high service availability but do not guarantee uninterrupted access. 
                The Service may be temporarily unavailable due to maintenance, updates, or technical issues.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">7.2 Maintenance</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We reserve the right to perform scheduled and emergency maintenance. We will provide 
                reasonable notice for scheduled maintenance when possible.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Intellectual Property Rights</h2>
              
              <h3 className="text-lg font-medium text-gray-800 mb-3">8.1 Our Rights</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                The Service and its original content, features, and functionality are owned by us and are 
                protected by intellectual property laws. You may not use our intellectual property without 
                our written consent.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">8.2 User Content</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                You retain rights to your calendar data and content. By using the Service, you grant us 
                a limited license to use your content solely to provide the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Limitation of Liability</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, 
                special, consequential, or punitive damages, including without limitation:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
                <li>Loss of profits, data, use, goodwill, or other intangible losses</li>
                <li>Damages resulting from unauthorized access to your account</li>
                <li>Interruption or cessation of the Service</li>
                <li>Bugs, viruses, or other harmful code</li>
                <li>Errors or omissions in content</li>
                <li>Third-party conduct or content</li>
              </ul>
              <p className="text-gray-700 leading-relaxed">
                Our total liability shall not exceed the amount you paid for the Service in the twelve months 
                preceding the claim.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Disclaimers</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind. We 
                disclaim all warranties, express or implied, including:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
                <li>Merchantability and fitness for a particular purpose</li>
                <li>Non-infringement and title</li>
                <li>Accuracy, reliability, or completeness</li>
                <li>Error-free or uninterrupted operation</li>
                <li>Security or freedom from harmful components</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Termination</h2>
              
              <h3 className="text-lg font-medium text-gray-800 mb-3">11.1 Termination by You</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                You may terminate your account at any time by contacting us or using account deletion 
                features within the Service.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">11.2 Termination by Us</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We may terminate or suspend your account immediately, without notice, for:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
                <li>Breach of these Terms</li>
                <li>Violation of applicable laws</li>
                <li>Fraudulent, abusive, or illegal activity</li>
                <li>Extended periods of inactivity</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-800 mb-3">11.3 Effects of Termination</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Upon termination:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
                <li>Your right to use the Service ceases immediately</li>
                <li>We may delete your account and data</li>
                <li>Provisions that should survive termination remain in effect</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">12. Dispute Resolution</h2>
              
              <h3 className="text-lg font-medium text-gray-800 mb-3">12.1 Informal Resolution</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Before filing a formal dispute, please contact us to seek an informal resolution.
              </p>

              <h3 className="text-lg font-medium text-gray-800 mb-3">12.2 Governing Law</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                These Terms are governed by the laws of [Your Jurisdiction], without regard to conflict 
                of law principles.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">13. Changes to Terms</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We reserve the right to modify these Terms at any time. We will provide notice of material 
                changes by posting the updated Terms on our website and updating the "Last updated" date.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Your continued use of the Service after changes become effective constitutes acceptance of 
                the updated Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">14. Severability</h2>
              <p className="text-gray-700 leading-relaxed">
                If any provision of these Terms is held to be invalid or unenforceable, the remaining 
                provisions will remain in full force and effect.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">15. Entire Agreement</h2>
              <p className="text-gray-700 leading-relaxed">
                These Terms, together with our Privacy Policy, constitute the entire agreement between 
                you and us regarding the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">16. Contact Information</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                If you have any questions about these Terms, please contact us:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-700">
                  <strong>Email:</strong> legal@calendar-sync.com<br />
                  <strong>Address:</strong> [Your Business Address]
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}