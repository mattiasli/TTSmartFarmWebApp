import { Button, Text, Title1 } from '@fluentui/react-components';
import { Link } from 'react-router';

export function NotFound() {
  return (
    <main className="page">
      <section className="section">
        <Title1>Page not found</Title1>
        <Text as="p">That farm page does not exist.</Text>
        <Link to="/dashboard">
          <Button>Farm dashboard</Button>
        </Link>
      </section>
    </main>
  );
}
