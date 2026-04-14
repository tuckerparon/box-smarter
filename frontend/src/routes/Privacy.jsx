export default function Privacy() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F7F6F2',
      color: '#1A1A1A',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex',
      justifyContent: 'center',
      padding: '64px 24px',
    }}>
      <div style={{ maxWidth: '600px', width: '100%' }}>
        <a
          href="/"
          style={{ fontSize: '13px', color: '#9A9A9A', textDecoration: 'none', display: 'inline-block', marginBottom: '40px' }}
        >
          ← Back to BoxSmart
        </a>

        <h1 style={{
          fontFamily: 'Georgia, "Times New Roman", Times, serif',
          fontSize: '1.75rem',
          fontWeight: 700,
          color: '#1A1A1A',
          marginBottom: '8px',
          letterSpacing: '-0.01em',
        }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: '13px', color: '#9A9A9A', marginBottom: '40px', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Last updated: April 6, 2026
        </p>

        <div style={{ borderTop: '1px solid #E3DFD6', paddingTop: '32px' }}>
          <p style={{ fontSize: '15px', lineHeight: 1.75, marginBottom: '32px', color: '#5C5C5C' }}>
            BoxSmart is a personal research tool used to track and analyze neurological health data
            during a boxing training camp. It is not a commercial product and is not available to
            the general public.
          </p>

          <h2 style={{
            fontFamily: 'Georgia, "Times New Roman", Times, serif',
            fontSize: '1.1rem',
            fontWeight: 700,
            color: '#1A1A1A',
            marginBottom: '10px',
          }}>
            Data Collection
          </h2>
          <p style={{ fontSize: '15px', lineHeight: 1.75, marginBottom: '32px', color: '#5C5C5C' }}>
            This application accesses data from the WHOOP API and relies on manual uploading of
            data recorded from Pison and Neurable devices in tandem with a custom designed training
            survey. No data is shared for any purposes beyond personal health tracking and research.
          </p>

          <h2 style={{
            fontFamily: 'Georgia, "Times New Roman", Times, serif',
            fontSize: '1.1rem',
            fontWeight: 700,
            color: '#1A1A1A',
            marginBottom: '10px',
          }}>
            Data Storage
          </h2>
          <p style={{ fontSize: '15px', lineHeight: 1.75, marginBottom: '32px', color: '#5C5C5C' }}>
            Data is stored in a private Google Cloud project accessible only to the account owner.
            No data is sold, shared, or used for advertising.
          </p>

          <h2 style={{
            fontFamily: 'Georgia, "Times New Roman", Times, serif',
            fontSize: '1.1rem',
            fontWeight: 700,
            color: '#1A1A1A',
            marginBottom: '10px',
          }}>
            Contact
          </h2>
          <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#5C5C5C' }}>
            Questions? Contact{' '}
            <a href="mailto:tuckerparon@gmail.com" style={{ color: '#1A4A8A' }}>
              tuckerparon@gmail.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
