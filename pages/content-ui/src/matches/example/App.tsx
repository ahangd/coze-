import { t } from '@extension/i18n';
import { ToggleButton } from '@extension/ui';
import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    console.log('[CEB] Content ui example loaded');
  }, []);

  return null;
}
