import { Platform } from 'react-native';

const HomeMapSection =
  Platform.OS === 'web'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./HomeMapSection.web').default
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./HomeMapSection.native').default;

export default HomeMapSection;
