import App from '../components/App';
export const dynamic = 'force-dynamic';
export default function Page() {
  const emailEnabled = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_SENDER_EMAIL);
  return <App emailEnabled={emailEnabled} />;
}
