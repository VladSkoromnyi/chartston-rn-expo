import { Text, View, StyleSheet } from 'react-native';

// The full interactive chart is exercised in the `chartston-dev-test` harness.
// This in-repo example is a placeholder until it is aligned to Expo SDK 56 and
// turned into a real demo (TECH_PLAN Stage 8/9).
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chartston</Text>
      <Text style={styles.subtitle}>
        Run the interactive chart in the chartston-dev-test harness.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.7,
  },
});
