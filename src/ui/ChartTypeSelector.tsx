/**
 * ChartTypeSelector (PLAN §6, Stage 8) — a thin SelectList config that switches the
 * price-pane series type (candlestick / bar / line / area / baseline). A trigger
 * button shows the current type and opens the sheet.
 */

import { useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { ChartTheme, ChartType, SelectOption } from '../types';
import { DARK_THEME } from '../theme';
import { SelectList } from './SelectList';

export interface ChartTypeSelectorProps {
  value: ChartType;
  onSelect: (type: ChartType) => void;
  theme?: ChartTheme;
}

const TYPES: { id: ChartType; label: string }[] = [
  { id: 'candlestick', label: 'Candles' },
  { id: 'bar', label: 'Bars (OHLC)' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'baseline', label: 'Baseline' },
];

export function ChartTypeSelector(props: ChartTypeSelectorProps): ReactElement {
  const theme = props.theme ?? DARK_THEME;
  const { value, onSelect } = props;
  const sheetRef = useRef<BottomSheetModal>(null);

  const options = useMemo<SelectOption<ChartType>[]>(
    () => TYPES.map((t) => ({ id: t.id, label: t.label, value: t.id })),
    []
  );
  const current = TYPES.find((t) => t.id === value)?.label ?? value;

  return (
    <>
      <Pressable
        onPress={() => sheetRef.current?.present()}
        style={[styles.trigger, { borderColor: theme.axisLineColor }]}
      >
        <Text style={[styles.label, { color: theme.crosshairLabelText }]}>
          {current}
        </Text>
      </Pressable>

      <SelectList<ChartType>
        sheetRef={sheetRef}
        title="Chart type"
        options={options}
        selectedId={value}
        onSelect={(o) => onSelect(o.value)}
        theme={theme}
        snapPoints={['50%']}
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  label: { fontSize: 13, fontWeight: '600' },
});
