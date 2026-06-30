/**
 * SymbolSelector (PLAN §6.2) — a trigger showing the current symbol opens a
 * searchable SelectList of `SymbolInfo`. `onSelect(symbol)` drives the switch (§5.3).
 */

import { useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { ChartTheme, SelectOption, SymbolInfo } from '../types';
import { DARK_THEME } from '../theme';
import { SelectList } from './SelectList';

export interface SymbolSelectorProps {
  symbol: SymbolInfo;
  symbols: SymbolInfo[];
  onSelect: (symbol: SymbolInfo) => void;
  theme?: ChartTheme;
}

export function SymbolSelector(props: SymbolSelectorProps): ReactElement {
  const theme = props.theme ?? DARK_THEME;
  const sheetRef = useRef<BottomSheetModal>(null);

  const options = useMemo<SelectOption<SymbolInfo>[]>(
    () =>
      props.symbols.map((s) => ({
        id: s.id,
        label: s.displayName ?? s.id,
        value: s,
        sublabel: s.exchange,
      })),
    [props.symbols]
  );

  return (
    <>
      <Pressable
        onPress={() => sheetRef.current?.present()}
        style={styles.trigger}
      >
        <Text style={[styles.symbol, { color: theme.crosshairLabelText }]}>
          {props.symbol.displayName ?? props.symbol.id}
        </Text>
        <Text style={[styles.caret, { color: theme.axisTextColor }]}>▾</Text>
      </Pressable>

      <SelectList<SymbolInfo>
        sheetRef={sheetRef}
        title="Symbol"
        searchable
        options={options}
        selectedId={props.symbol.id}
        onSelect={(o) => props.onSelect(o.value)}
        theme={theme}
        snapPoints={['80%']}
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  symbol: {
    fontSize: 16,
    fontWeight: '700',
  },
  caret: {
    fontSize: 12,
  },
});
