export const REACT_VERSION = '19.3.0';

export const federationShared = {
  react: {
    singleton: true,
    requiredVersion: REACT_VERSION,
    eager: true,
  },
  'react-dom': {
    singleton: true,
    requiredVersion: REACT_VERSION,
    eager: true,
  },
  'react/jsx-runtime': {
    singleton: true,
    requiredVersion: REACT_VERSION,
    eager: true,
  },
  '@fluentui/react-components': {
    singleton: true,
  },
};
