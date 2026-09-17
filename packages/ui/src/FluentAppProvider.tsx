import { FluentProvider } from '@fluentui/react-components';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { themeForPreference } from './theme';

type Props = {
  children: ReactNode;
};

export function FluentAppProvider({ children }: Props) {
  const [dark, setDark] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const theme = useMemo(() => themeForPreference(dark), [dark]);
  return (
    <FluentProvider theme={theme} style={{ minHeight: '100%', backgroundColor: theme.colorNeutralBackground1 }}>
      {children}
    </FluentProvider>
  );
}
