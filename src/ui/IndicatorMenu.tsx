/**
 * IndicatorMenu (PLAN §6, Stage 7) — a thin multi-select configuration of the
 * `SelectList` primitive that toggles which built-in studies are active. Overlays
 * draw on the price pane; panes draw as stacked sub-panes. Tapping a row toggles
 * it without closing the sheet (`closeOnSelect={false}`); the active set is shown
 * with a checkmark. A trigger button opens the sheet.
 */

import { useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import type {
  ChartStudiesConfig,
  ChartTheme,
  OverlayStudyId,
  PaneStudyId,
  SelectOption,
} from '../types';
import { DARK_THEME } from '../theme';
import { SelectList } from './SelectList';

export interface IndicatorMenuProps {
  value: ChartStudiesConfig;
  onChange: (config: ChartStudiesConfig) => void;
  theme?: ChartTheme;
  /** Optional trigger label (defaults to "ƒx Indicators"). */
  label?: string;
}

type StudyKind = 'overlay' | 'pane';

interface StudyMeta {
  id: OverlayStudyId | PaneStudyId;
  kind: StudyKind;
  label: string;
  sublabel: string;
}

// The curated built-in catalogue. Ids/kinds line up with ChartStudiesConfig and
// the renderers in <Chart/>.
const CATALOGUE: StudyMeta[] = [
  {
    id: 'sma',
    kind: 'overlay',
    label: 'SMA (20)',
    sublabel: 'Simple Moving Average',
  },
  {
    id: 'ema',
    kind: 'overlay',
    label: 'EMA (50)',
    sublabel: 'Exponential Moving Average',
  },
  {
    id: 'bollinger',
    kind: 'overlay',
    label: 'Bollinger Bands',
    sublabel: '20, 2σ',
  },
  {
    id: 'vwap',
    kind: 'overlay',
    label: 'VWAP',
    sublabel: 'Volume-Weighted Avg Price',
  },
  {
    id: 'volume',
    kind: 'pane',
    label: 'Volume',
    sublabel: 'Sub-pane histogram',
  },
  {
    id: 'rsi',
    kind: 'pane',
    label: 'RSI (14)',
    sublabel: 'Sub-pane oscillator',
  },
  { id: 'macd', kind: 'pane', label: 'MACD (12, 26, 9)', sublabel: 'Sub-pane' },
];

export function IndicatorMenu(props: IndicatorMenuProps): ReactElement {
  const theme = props.theme ?? DARK_THEME;
  const { value, onChange } = props;
  const sheetRef = useRef<BottomSheetModal>(null);

  const options = useMemo<SelectOption<StudyMeta>[]>(
    () =>
      CATALOGUE.map((m) => ({
        id: m.id,
        label: m.label,
        value: m,
        sublabel: m.sublabel,
        group: m.kind === 'overlay' ? 'Overlays' : 'Panes',
      })),
    []
  );

  const selectedIds = useMemo(
    () => [...value.overlays, ...value.panes] as string[],
    [value]
  );

  const toggle = (meta: StudyMeta): void => {
    if (meta.kind === 'overlay') {
      const id = meta.id as OverlayStudyId;
      const has = value.overlays.includes(id);
      onChange({
        ...value,
        overlays: has
          ? value.overlays.filter((o) => o !== id)
          : [...value.overlays, id],
      });
    } else {
      const id = meta.id as PaneStudyId;
      const has = value.panes.includes(id);
      onChange({
        ...value,
        panes: has ? value.panes.filter((o) => o !== id) : [...value.panes, id],
      });
    }
  };

  return (
    <>
      <Pressable
        onPress={() => sheetRef.current?.present()}
        style={[styles.trigger, { borderColor: theme.axisLineColor }]}
      >
        <Text style={[styles.label, { color: theme.crosshairLabelText }]}>
          {props.label ?? 'ƒx Indicators'}
        </Text>
      </Pressable>

      <SelectList<StudyMeta>
        sheetRef={sheetRef}
        title="Indicators"
        options={options}
        selectedIds={selectedIds}
        closeOnSelect={false}
        onSelect={(o) => toggle(o.value)}
        theme={theme}
        snapPoints={['70%']}
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
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
