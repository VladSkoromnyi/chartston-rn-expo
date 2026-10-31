/* eslint-env jest */
require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  const { useRef } = require('react');
  return {
    ...mock,
    // Real shared values are stable for the component's lifetime; the stock
    // mock returns a new object per render, which re-fires every effect that
    // depends on one.
    useSharedValue: (init) => {
      const ref = useRef(null);
      if (ref.current === null) {
        ref.current = {
          value: init,
          get() {
            return this.value;
          },
          set(v) {
            this.value = typeof v === 'function' ? v(this.value) : v;
          },
        };
      }
      return ref.current;
    },
  };
});
jest.mock('react-native-worklets', () =>
  require('react-native-worklets/lib/module/mock')
);
