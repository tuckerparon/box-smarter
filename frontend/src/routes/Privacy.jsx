export default function Privacy() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#d1d5db',
      fontFamily: 'system-ui, sans-serif',
      display: 'flex',
      justifyContent: 'center',
      padding: '64px 24px',
    }}>
      <div style={{ maxWidth: '600px', width: '100%' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f5f5f5', marginBottom: '8px' }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '40px' }}>
          Last updated: April 6, 2026
        </p>

        <p style={{ fontSize: '15px', lineHeight: 1.7, marginBottom: '24px' }}>
          BoxSmart is a personal research tool used to track and analyze neurological health data
          during a boxing training camp. It is not a commercial product and is not available to
          the general public.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f5f5f5', marginBottom: '12px' }}>
          Data Collection
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.7, marginBottom: '24px' }}>
          This application accesses data from WHOOP solely for the personal use of the account
          owner. No data is shared with third parties or used for any purpose other than personal
          health tracking and research.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f5f5f5', marginBottom: '12px' }}>
          Data Storage
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.7, marginBottom: '24px' }}>
          Data is stored in a private Google Cloud project accessible only to the account owner.
          No data is sold, shared, or used for advertising.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f5f5f5', marginBottom: '12px' }}>
          Contact
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.7 }}>
          Questions? Contact{' '}
          <a href="mailto:tuckerparon@gmail.com" style={{ color: '#9ca3af' }}>
            tuckerparon@gmail.com
          </a>
        </p>
      </div>
    </div>
  )
}
