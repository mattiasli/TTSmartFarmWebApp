import { Button, Text, Title1 } from '@fluentui/react-components';
import { Link, useSearchParams } from 'react-router';

export function AccessDenied() {
  const [params] = useSearchParams();
  const reason = params.get('reason') ?? 'denied';
  return (
    <main className="page">
      <section className="section">
        <Title1>Access denied</Title1>
        <Text as="p">This GitHub account is not invited to the farm. Reason: {reason}.</Text>
        <Link to="/login">
          <Button>Back to sign in</Button>
        </Link>
      </section>
    </main>
  );
}
