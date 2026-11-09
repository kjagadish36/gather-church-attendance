import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { attendanceByMonth } from './domain';
import type { Attendance } from './types';
import { colors, IconButton, T } from './ui';
import { useLanguage } from './Language';

type Props = { records: Attendance[]; selectedMonth: string | null; onSelectMonth: (month: string | null) => void };

export default function AttendanceChart({ records, selectedMonth, onSelectMonth }: Props) {
  const { t, locale, number } = useLanguage();
  const [offset, setOffset] = useState(0);
  const today = new Date();
  const endMonth = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const startMonth = new Date(endMonth.getFullYear(), endMonth.getMonth() - 5, 1);
  const months = attendanceByMonth(records, endMonth, locale);
  const maximum = Math.max(2, Math.ceil(Math.max(...months.map(month => month.count)) / 2) * 2);
  const selected = months.find(month => month.key === selectedMonth);
  const total = months.reduce((sum, month) => sum + month.count, 0);
  const format = (date: Date) => date.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
  const canGoBack = records.some(record => Date.parse(record.checked_in_at) < startMonth.getTime());

  function move(direction: number) {
    setOffset(current => current + direction * 6);
    onSelectMonth(null);
  }

  return <View style={styles.section}>
    <T style={styles.title}>Monthly attendance</T>
    <View style={styles.period}>
      <IconButton label="Previous six months" icon={ChevronLeft} disabled={!canGoBack} onPress={() => move(-1)} />
      <T style={styles.periodText}>{format(startMonth)} - {format(endMonth)}</T>
      <IconButton label="Next six months" icon={ChevronRight} disabled={offset >= 0} onPress={() => move(1)} />
    </View>
    <View style={styles.summary}>
      <T style={styles.total}>{selected ? selected.count : total}</T>
      <View style={{ gap: 3, flex: 1 }}><T style={styles.unit}>check-ins</T><T style={styles.caption}>{selected ? selected.title : 'Across this period'}</T></View>
      {selectedMonth && <Pressable accessibilityRole="button" accessibilityLabel={t('Show all months')} onPress={() => onSelectMonth(null)} style={styles.clear}><X size={14} color={colors.green} /><T style={{ color: colors.green, fontSize: 12 }}>All months</T></Pressable>}
    </View>
    <View style={styles.chart}>
      <View pointerEvents="none" style={styles.grid}>
        {[0, 1, 2].map(index => <View key={index} style={[styles.gridLine, { top: index * 80 }]} />)}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.axis}>
        {[maximum, maximum / 2, 0].map((value, index) => <T key={index} style={[styles.tick, { top: 18 + index * 80 }]}>{value}</T>)}
      </View>
      <View style={styles.columns}>
        {months.map(month => {
          const active = selectedMonth === month.key;
          const height = month.count ? month.count / maximum * 160 : 3;
          return <Pressable key={month.key} accessibilityRole="button" accessibilityLabel={t('{month}: {count} check-ins', { month: month.title, count: number(month.count) })} accessibilityState={{ selected: active }} onPress={() => onSelectMonth(active ? null : month.key)} style={styles.column}>
            <View style={styles.barSpace}>
              <T style={[styles.count, active && { color: colors.green }]}>{month.count}</T>
              <View testID={`attendance-bar-${month.key}`} style={[styles.bar, { height, backgroundColor: !month.count ? colors.line : active ? colors.green : '#8cb5a0', borderColor: active ? colors.green : 'transparent' }]} />
            </View>
            <T style={[styles.month, active && { color: colors.green, fontFamily: 'DMSans_700Bold' }]}>{month.label}</T>
            <View style={[styles.selection, active && { backgroundColor: colors.green }]} />
          </Pressable>;
        })}
      </View>
    </View>
    {!total && <T style={styles.caption}>No check-ins in this period.</T>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 22 },
  title: { fontSize: 19, fontFamily: 'DMSans_700Bold' },
  period: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  periodText: { fontSize: 12, color: colors.muted, textAlign: 'center', flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  total: { fontFamily: 'Newsreader_600SemiBold', fontSize: 34 },
  unit: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  caption: { color: colors.muted, fontSize: 11 },
  clear: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chart: { height: 245, position: 'relative' },
  grid: { position: 'absolute', top: 24, left: 30, right: 0 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.line },
  axis: { width: 26, height: 184, position: 'absolute', left: 0, top: 0 },
  tick: { position: 'absolute', left: 0, fontSize: 10, color: colors.muted },
  columns: { flexDirection: 'row', paddingLeft: 30, height: 245 },
  column: { flex: 1, minWidth: 0, alignItems: 'center' },
  barSpace: { width: '100%', height: 184, alignItems: 'center', justifyContent: 'flex-end' },
  count: { fontSize: 11, fontFamily: 'DMSans_700Bold', marginBottom: 7 },
  bar: { width: '65%', maxWidth: 38, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderWidth: 1 },
  month: { fontSize: 11, marginTop: 10, minHeight: 32, width: '100%', textAlign: 'center', paddingHorizontal: 1, color: colors.muted },
  selection: { width: 4, height: 4, borderRadius: 2, marginTop: 5, backgroundColor: 'transparent' },
});