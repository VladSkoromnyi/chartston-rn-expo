/**
 * PeriodSelector (PLAN §6.2) — common intervals as inline chips, the full set in a
 * SelectList sheet. `onSelect(interval)` drives the symbol/interval switch (§5.3).
 */

import { useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { ChartTheme, Interval, SelectOption } from '../types';
import { COMMON_INTERVALS, INTERVAL_METAS } from '../core';
import { DARK_THEME } from '../theme';
import { SelectList } from './SelectList';

export interface PeriodSelectorProps {
  interval: Interval;
  onSelect: (interval: Interval) => void;
  theme?: ChartTheme;
}

export function PeriodSelector(props: PeriodSelectorProps): ReactElement {
  const theme = props.theme ?? DARK_THEME;
  const sheetRef = useRef<BottomSheetModal>(null);

  const options = useMemo<SelectOption<Interval>[]>(
    () =>
      INTERVAL_METAS.map((m) => ({
        id: m.interval,
        label: m.interval,
        value: m.interval,
        sublabel: m.label,
      })),
    []
  );

  return (
    <View style={styles.row}>
      {COMMON_INTERVALS.map((iv) => {
        const active = iv === props.interval;
        return (
          <Pressable
            key={iv}
            onPress={() => props.onSelect(iv)}
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
              {iv}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => sheetRef.current?.present()}
        style={styles.chip}
      >
        <Text style={[styles.chipText, { color: theme.axisTextColor }]}>
          •••
        </Text>
      </Pressable>

      <SelectList<Interval>
        sheetRef={sheetRef}
        title="Interval"
        options={options}
        selectedId={props.interval}
        onSelect={(o) => props.onSelect(o.value)}
        theme={theme}
        snapPoints={['60%']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
