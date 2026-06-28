/**
 * `SelectList` — the one reusable control primitive (PLAN §6.1): a bottom sheet
 * that renders a data list; tapping a row fires `onSelect` and closes the sheet.
 * Generic over the row's value type. Period/Symbol/Indicator/Theme selectors are
 * all thin configurations of this.
 *
 * Opened imperatively via the `sheetRef` the caller owns (`sheetRef.current?.present()`).
 * Requires a `BottomSheetModalProvider` somewhere above it.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement, RefObject } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import type { ChartTheme, SelectListProps, SelectOption } from '../types';
import { DARK_THEME } from '../theme';

export interface SelectListExtraProps {
  /** Caller-owned ref used to open/close the sheet. */
  sheetRef: RefObject<BottomSheetModal | null>;
  theme?: ChartTheme;
}

export function SelectList<T>(
  props: SelectListProps<T> & SelectListExtraProps
): ReactElement {
  const {
    sheetRef,
    options,
    onSelect,
    searchable,
    selectedId,
    title,
    snapPoints,
    renderRow,
  } = props;
  const theme = props.theme ?? DARK_THEME;
  const [query, setQuery] = useState('');

  const data = useMemo(() => {
    if (!searchable || !query) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel?.toLowerCase().includes(q) ?? false)
    );
  }, [options, searchable, query]);

  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
    ),
    []
  );

  const handleSelect = useCallback(
    (option: SelectOption<T>) => {
      onSelect(option);
      sheetRef.current?.dismiss();
    },
    [onSelect, sheetRef]
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints ?? ['60%']}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.background }}
      handleIndicatorStyle={{ backgroundColor: theme.axisTextColor }}
    >
      {(title || searchable) && (
        <View style={styles.header}>
          {title ? (
            <Text style={[styles.title, { color: theme.crosshairLabelText }]}>
              {title}
            </Text>
          ) : null}
          {searchable ? (
            <TextInput
              placeholder="Search"
              placeholderTextColor={theme.axisTextColor}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="characters"
              style={[
                styles.search,
                {
                  color: theme.crosshairLabelText,
                  borderColor: theme.axisLineColor,
                },
              ]}
            />
          ) : null}
        </View>
      )}
      <BottomSheetFlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          if (renderRow) {
            return (
              <Pressable onPress={() => handleSelect(item)}>
                {renderRow(item)}
              </Pressable>
            );
          }
          const selected = item.id === selectedId;
          return (
            <Pressable
              style={styles.row}
              disabled={item.disabled}
              onPress={() => handleSelect(item)}
            >
              <Text
                style={[
                  styles.rowLabel,
                  {
                    color: selected ? theme.upColor : theme.crosshairLabelText,
                  },
                ]}
              >
                {item.label}
              </Text>
              {item.sublabel ? (
                <Text style={[styles.rowSub, { color: theme.axisTextColor }]}>
                  {item.sublabel}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  search: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 16,
  },
  rowSub: {
    fontSize: 13,
  },
});
