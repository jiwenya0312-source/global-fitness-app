import { useContext } from 'react';
import { View } from 'react-native';

import { languageNames, useLanguage } from '@/fitness/language';
import { ProfileForm } from '@/fitness/profile-form';
import { SetupContext } from '@/fitness/setup-context';
import { Choice, Page, styles } from '@/fitness/ui';

export default function Setup() {
  const { profile, complete } = useContext(SetupContext);
  const { language, setLanguage, t } = useLanguage();
  return <ProfileForm initial={profile} onboarding onSaved={complete} frame={(form, actions, step) => (
    <Page title={t.setupTitle} detail={t.setupRequired} icon="profile" standalone scrollStep={step} footer={actions}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t.language} style={styles.row}>
        {(['zh', 'en'] as const).map((code) => <Choice key={code} label={languageNames[code]}
          selected={language === code} disabled={false} onPress={() => setLanguage(code)} />)}
      </View>
      {form}
    </Page>
  )} />;
}
