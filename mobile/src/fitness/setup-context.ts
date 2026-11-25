import { createContext } from 'react';

import type { BodyProfile, ProfileRevision } from './profile';

export const SetupContext = createContext<{
  profile?: BodyProfile;
  complete: (revision: ProfileRevision) => void;
}>({ complete: () => {} });
