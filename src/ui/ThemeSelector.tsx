/**
 * ThemeSelector (PLAN §6, Stage 8) — a thin chip toggle over the available themes
 * (dark/light by default). `onSelect(theme)` swaps the theme passed to <Chart/> and
 * the other controls. Like PeriodSelector's inline chips, it's a config, not new UI.
 */

import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChartTheme } from '../types';
import { DARK_THEME, LIGHT_THEME } from '../theme';

export interface ThemeSelectorProps {
  /** The active theme (drives styling + which chip is highlighted). */
  theme: ChartTheme;
  /** Selectable themes; defaults to the built-in dark/light pair. */
  themes?: ChartTheme[];
  onSelect: (theme: ChartTheme) => void;
}

const DEFAULT_THEMES: ChartTheme[] = [DARK_THEME, LIGHT_THEME];

export function ThemeSelector(props: ThemeSelectorProps): ReactElement {
  const { theme, onSelect } = props;
  const themes = props.themes ?? DEFAULT_THEMES;
  return (
    <View style={styles.row}>
      {themes.map((t) => {
        const active = t.name === theme.name;
        return (
          <Pressable
            key={t.name}
            onPress={() => onSelect(t)}
            style={[
              styles.chip,
              active && { backgroundColor: theme.axisLineColor },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: active
                    ? theme.crosshairLabelText
                    : theme.axisTextColor,
                },
              ]}
            >
              {t.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  chipText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
});
