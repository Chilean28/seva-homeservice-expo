import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { useWorkerProfile } from '@/lib/hooks/useWorkerProfile';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  addScheduleCalendarDays,
  deleteAvailabilityWindow,
  fetchAvailabilityWindows,
  formatWindowDate,
  getTodayScheduleDate,
  insertAvailabilityRanges,
  minutesToLabel,
} from '@/lib/workerAvailability';
import type { WorkerAvailabilityWindow } from '@/lib/types/database';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function buildTimeOptions(): { label: string; m: number }[] {
  const out: { label: string; m: number }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const mm of [0, 30]) {
      const m = h * 60 + mm;
      if (m >= 1440) continue;
      out.push({ label: minutesToLabel(m), m });
    }
  }
  return out;
}

const TIME_OPTIONS = buildTimeOptions();

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

function monthMatrix(year: number, monthIndex: number): (number | null)[] {
  const first = new Date(year, monthIndex, 1);
  const pad = first.getDay();
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(d);
  return cells;
}

function toISODate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

type TimeLine = { id: string; start: number; end: number };

function rangesOverlap(a: TimeLine, b: TimeLine): boolean {
  return a.start < b.end && b.start < a.end;
}

function hasAnyOverlap(lines: TimeLine[]): boolean {
  const sorted = [...lines].sort((x, y) => x.start - y.start);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (rangesOverlap(sorted[i], sorted[i + 1])) return true;
  }
  return false;
}

export default function AvailabilityScreen() {
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const { profile, loading, setAvailability, refetch, workerId } = useWorkerProfile(user?.id);

  const [windows, setWindows] = useState<WorkerAvailabilityWindow[]>([]);
  const [loadingWindows, setLoadingWindows] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  const lineIdRef = useRef(0);
  const [timeLines, setTimeLines] = useState<TimeLine[]>(() => [
    { id: `tl-${lineIdRef.current++}`, start: 9 * 60, end: 17 * 60 },
  ]);

  const [timePicker, setTimePicker] = useState<{ lineId: string; field: 'start' | 'end' } | null>(
    null
  );

  /** Filter upcoming list: all from today, or next 7 / 30 calendar days. */
  const [upcomingRange, setUpcomingRange] = useState<'all' | '7d' | '30d'>('all');

  const todayStr = useMemo(() => getTodayScheduleDate(), []);
  const masterToggleDisabled = loadingWindows || windows.length === 0;

  const loadWindows = useCallback(async () => {
    if (!workerId) {
      setWindows([]);
      setLoadingWindows(false);
      return;
    }
    setLoadingWindows(true);
    const list = await fetchAvailabilityWindows(workerId, todayStr);
    setWindows(list);
    setLoadingWindows(false);
  }, [workerId, todayStr]); // todayStr stable per mount; refresh on focus reloads

  useFocusEffect(
    useCallback(() => {
      refetch();
      loadWindows();
    }, [refetch, loadWindows])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), loadWindows()]);
    setRefreshing(false);
  }, [refetch, loadWindows]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = useMemo(() => monthMatrix(year, month), [year, month]);
  const monthLabel = viewDate.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  /** Scroll padding 20 + card padding 16 each side — % + aspectRatio in flexWrap yields 0-height cells on RN. */
  const calCellSize = useMemo(() => {
    const gridInner = Math.max(windowWidth - 72, 200);
    return Math.max(36, Math.floor(gridInner / 7));
  }, [windowWidth]);

  const toggleDate = (day: number) => {
    const iso = toISODate(year, month, day);
    if (iso < todayStr) return;
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  };

  const selectWeekdaysInMonth = () => {
    const next = new Set(selectedDates);
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(year, month, d);
      if (dt.getMonth() !== month) continue;
      const iso = toISODate(year, month, d);
      if (iso < todayStr) continue;
      const wd = dt.getDay();
      if (wd >= 1 && wd <= 5) next.add(iso);
    }
    setSelectedDates(next);
  };

  const clearSelection = () => setSelectedDates(new Set());

  const applySchedule = async () => {
    if (!workerId || selectedDates.size === 0) {
      Alert.alert('Select days', 'Tap calendar days to select when you are free.');
      return;
    }
    for (let i = 0; i < timeLines.length; i++) {
      const { start, end } = timeLines[i];
      if (end <= start) {
        Alert.alert('Invalid times', `Block ${i + 1}: end must be after start.`);
        return;
      }
      if (end - start < 30) {
        Alert.alert('Invalid times', `Block ${i + 1}: need at least 30 minutes.`);
        return;
      }
    }
    if (hasAnyOverlap(timeLines)) {
      Alert.alert('Overlapping times', 'Time blocks can’t overlap. Adjust start/end so one block ends before the next begins.');
      return;
    }
    setSaving(true);
    const { inserted, skipped } = await insertAvailabilityRanges(
      workerId,
      [...selectedDates],
      timeLines.map((l) => ({ start_minutes: l.start, end_minutes: l.end }))
    );
    setSaving(false);
    if (inserted === 0 && skipped > 0) {
      Alert.alert('Already added', 'Those time slots already exist for the selected days.');
    } else if (inserted > 0) {
      // Auto-enable master switch once the worker has at least one availability slot.
      if (profile && !profile.is_available) {
        await setAvailability(true);
      }
      let msg = `Added ${inserted} slot${inserted === 1 ? '' : 's'}.`;
      if (skipped) msg += ` ${skipped} skipped (duplicate).`;
      Alert.alert('Saved', msg);
      clearSelection();
      loadWindows();
    } else {
      Alert.alert('Could not save', 'Try again.');
    }
  };

  const removeWindow = async (w: WorkerAvailabilityWindow) => {
    Alert.alert('Remove slot', `${formatWindowDate(w.work_date)} ${minutesToLabel(w.start_minutes)}–${minutesToLabel(w.end_minutes)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteAvailabilityWindow(w.id);
          if (ok) loadWindows();
        },
      },
    ]);
  };

  const upcomingMaxDate =
    upcomingRange === 'all' ? null : addScheduleCalendarDays(todayStr, upcomingRange === '7d' ? 6 : 29);

  const filteredUpcomingWindows = useMemo(() => {
    if (!upcomingMaxDate) return windows;
    return windows.filter((w) => w.work_date <= upcomingMaxDate);
  }, [windows, upcomingMaxDate]);

  const groupedUpcoming = useMemo(() => {
    const map = new Map<string, WorkerAvailabilityWindow[]>();
    for (const w of filteredUpcomingWindows) {
      const arr = map.get(w.work_date) ?? [];
      arr.push(w);
      map.set(w.work_date, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredUpcomingWindows]);

  const pickerLine = timePicker != null ? timeLines.find((l) => l.id === timePicker.lineId) : null;
  const pickerOptions =
    timePicker && pickerLine
      ? timePicker.field === 'start'
        ? TIME_OPTIONS.filter((o) => o.m < pickerLine.end - 30)
        : TIME_OPTIONS.filter((o) => o.m > pickerLine.start + 30)
      : [];

  const addTimeLine = () => {
    setTimeLines((prev) => [
      ...prev,
      { id: `tl-${lineIdRef.current++}`, start: 13 * 60, end: 17 * 60 },
    ]);
  };

  const removeTimeLine = (lineId: string) => {
    setTimeLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== lineId)));
  };

  const clearTimes = () => {
    setTimeLines([{ id: `tl-${lineIdRef.current++}`, start: 9 * 60, end: 17 * 60 }]);
  };

  const onPickTime = (minutes: number) => {
    if (!timePicker) return;
    const { lineId, field } = timePicker;
    setTimeLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        if (field === 'start') {
          const end = line.end <= minutes + 30 ? Math.min(minutes + 120, 23 * 60 + 30) : line.end;
          return { ...line, start: minutes, end: Math.max(end, minutes + 30) };
        }
        return { ...line, end: minutes };
      })
    );
    setTimePicker(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerWrapper}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <View style={styles.headerSide} />
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Availability</Text>
            </View>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
      >
        {!loading && profile && (
          <View style={[styles.card, !loadingWindows && windows.length === 0 && styles.toggleDisabledAccent]}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.cardTitle}>Open for jobs</Text>
                {loadingWindows ? (
                  <Text style={styles.cardHint}>Checking availability slots...</Text>
                ) : windows.length === 0 ? (
                  <Text style={styles.cardHint}>Add at least one slot to enable job requests.</Text>
                ) : (
                  <Text style={styles.cardHint}>Master switch — off hides you from new requests</Text>
                )}
              </View>
              <Switch
                value={profile.is_available}
                onValueChange={setAvailability}
                disabled={masterToggleDisabled}
                // Make it slightly more visible when disabled because no slots exist yet.
                trackColor={{
                  false: windows.length === 0 && !loadingWindows ? '#FFEB3B' : '#e5e5e5',
                  true: '#FFEB3B',
                }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={() => setViewDate(new Date(year, month - 1, 1))} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color="#000" />
            </TouchableOpacity>
            <Text style={styles.calTitle}>{monthLabel}</Text>
            <TouchableOpacity onPress={() => setViewDate(new Date(year, month + 1, 1))} hitSlop={12}>
              <Ionicons name="chevron-forward" size={26} color="#000" />
            </TouchableOpacity>
          </View>
          <View style={[styles.weekRow, { width: calCellSize * 7, alignSelf: 'center' }]}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <Text key={i} style={[styles.weekDow, { width: calCellSize }]}>
                {d}
              </Text>
            ))}
          </View>
          <View style={[styles.calGrid, { width: calCellSize * 7, alignSelf: 'center' }]}>
            {cells.map((day, idx) => {
              const cellBox = { width: calCellSize, height: calCellSize };
              if (day == null) {
                return <View key={`e-${idx}`} style={[styles.calCell, cellBox]} />;
              }
              const iso = toISODate(year, month, day);
              const past = iso < todayStr;
              const sel = selectedDates.has(iso);
              return (
                <TouchableOpacity
                  key={iso}
                  style={[
                    styles.calCell,
                    cellBox,
                    past && styles.calCellPast,
                    sel && styles.calCellSel,
                  ]}
                  onPress={() => !past && toggleDate(day)}
                  disabled={past}
                  activeOpacity={0.7}
                >
                  <View style={styles.calCellLabelWrap}>
                    <Text style={[styles.calDayNum, past && styles.calDayPast, sel && styles.calDaySel]}>
                      {day}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.calActions}>
            <TouchableOpacity style={styles.linkBtn} onPress={selectWeekdaysInMonth}>
              <Text style={styles.linkBtnText}>Select weekdays</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={clearSelection}>
              <Text style={styles.linkBtnText}>Clear selection</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.hoursHeaderRow}>
            <Text style={styles.sectionLabel}>Hours (on selected days)</Text>
            <TouchableOpacity onPress={clearTimes} hitSlop={10}>
              <Text style={styles.clearTimesText}>Clear times</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionHint}>
            Tap + after end time to add another block (e.g. morning + afternoon).
          </Text>
          {timeLines.map((line, index) => (
            <View key={line.id} style={styles.timeBlock}>
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>Start</Text>
                <TouchableOpacity
                  style={styles.timePick}
                  onPress={() => setTimePicker({ lineId: line.id, field: 'start' })}
                >
                  <Text>{minutesToLabel(line.start)}</Text>
                </TouchableOpacity>
                <Text style={styles.timeDash}>–</Text>
                <Text style={styles.timeLabel}>End</Text>
                <TouchableOpacity
                  style={styles.timePick}
                  onPress={() => setTimePicker({ lineId: line.id, field: 'end' })}
                >
                  <Text>{minutesToLabel(line.end)}</Text>
                </TouchableOpacity>
                {index === 0 ? (
                  <TouchableOpacity
                    style={styles.timeRowPlusBtn}
                    onPress={addTimeLine}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Add time block"
                  >
                    <Text style={styles.timeRowPlus}>+</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.timeRowPlusBtn}
                    onPress={() => removeTimeLine(line.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Remove time block"
                  >
                    <Text style={styles.timeRowRemove}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={[styles.saveBtn, (saving || selectedDates.size === 0) && styles.saveBtnDisabled]}
            onPress={applySchedule}
            disabled={saving || selectedDates.size === 0}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.saveBtnText}>
                Add to schedule ({selectedDates.size} day{selectedDates.size === 1 ? '' : 's'})
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.upcomingTitle}>Upcoming availability</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterChipsScroll}
          contentContainerStyle={styles.filterChipsRow}
        >
          {(
            [
              { key: 'all' as const, label: 'All' },
              { key: '7d' as const, label: 'Next 7 days' },
              { key: '30d' as const, label: 'Next 30 days' },
            ] as const
          ).map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.filterChip, upcomingRange === key && styles.filterChipActive]}
              onPress={() => setUpcomingRange(key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, upcomingRange === key && styles.filterChipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {loadingWindows ? (
          <ActivityIndicator style={{ marginVertical: 20 }} color="#000" />
        ) : groupedUpcoming.length === 0 ? (
          <Text style={styles.emptyUpcoming}>
            {windows.length > 0 && upcomingRange !== 'all'
              ? `No slots in this range. Try “All” or add availability further out.`
              : 'No slots yet. Select days above and tap “Add to schedule”.'}
          </Text>
        ) : (
          groupedUpcoming.map(([dateStr, rows]) => (
            <View key={dateStr} style={styles.dayGroup}>
              <Text style={styles.dayGroupTitle}>{formatWindowDate(dateStr)}</Text>
              {rows.map((w) => (
                <View key={w.id} style={styles.slotRow}>
                  <Text style={styles.slotTime}>
                    {minutesToLabel(w.start_minutes)} – {minutesToLabel(w.end_minutes)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removeWindow(w)}
                    hitSlop={12}
                    style={styles.slotRemoveHit}
                  >
                    <Text style={styles.slotRemoveX}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        visible={timePicker != null}
        animationType="slide"
        transparent
        onRequestClose={() => setTimePicker(null)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setTimePicker(null)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {timePicker?.field === 'start' ? 'Start time' : 'End time'}
              {timePicker != null
                ? ` (block ${timeLines.findIndex((l) => l.id === timePicker.lineId) + 1})`
                : ''}
            </Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {pickerOptions.map((o) => {
                const current =
                  pickerLine && timePicker?.field === 'start'
                    ? pickerLine.start
                    : pickerLine?.end;
                return (
                  <TouchableOpacity
                    key={o.m}
                    style={[styles.tzRow, current === o.m && styles.tzRowActive]}
                    onPress={() => onPickTime(o.m)}
                  >
                    <Text style={styles.tzRowLabel}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerWrapper: { backgroundColor: APP_SCREEN_HEADER_BG },
  headerSafe: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...appScreenHeaderBarPadding,
  },
  headerSide: { width: 24 },
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...appScreenHeaderTitleStyle },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 120 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleDisabledAccent: {
    backgroundColor: '#FFFDE7',
    borderColor: '#FFEB3B',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { flex: 1, marginRight: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#000' },
  cardHint: { fontSize: 13, color: '#666', marginTop: 4 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#000', flex: 1 },
  hoursHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 12,
  },
  clearTimesText: { fontSize: 14, fontWeight: '600', color: '#1565C0' },
  sectionHint: { fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 18 },
  timeBlock: {
    marginBottom: 12,
  },
  timeRowPlusBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 0,
  },
  timeRowPlus: {
    fontSize: 26,
    fontWeight: '300',
    color: '#000',
    marginTop: -2,
  },
  timeRowRemove: {
    fontSize: 28,
    fontWeight: '300',
    color: '#666',
    marginTop: -4,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDow: { textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#666' },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    position: 'relative',
    overflow: 'hidden',
  },
  calCellLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calCellPast: { opacity: 0.35 },
  calCellSel: { backgroundColor: '#FFEB3B', borderRadius: 10 },
  calDayNum: {
    fontSize: 15,
    lineHeight: 15,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  calDayPast: { color: '#999' },
  calDaySel: { color: '#000' },
  calActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  linkBtn: { paddingVertical: 8 },
  linkBtnText: { fontSize: 14, fontWeight: '600', color: '#1565C0' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 6,
    marginBottom: 4,
  },
  timeLabel: { fontSize: 14, color: '#666' },
  timePick: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    minWidth: 90,
  },
  timeDash: { fontSize: 18, color: '#000' },
  saveBtn: {
    backgroundColor: '#FFEB3B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
  upcomingTitle: { fontSize: 18, fontWeight: '700', color: '#000', marginBottom: 10, marginTop: 8 },
  filterChipsScroll: { marginBottom: 14, marginHorizontal: -4 },
  filterChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: '#FFFDE7',
    borderColor: '#000',
  },
  filterChipText: { fontSize: 14, fontWeight: '600', color: '#555' },
  filterChipTextActive: { color: '#000' },
  emptyUpcoming: { fontSize: 14, color: '#666', marginBottom: 24 },
  dayGroup: { marginBottom: 16 },
  dayGroupTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 8 },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F9F9F9',
    borderRadius: 10,
    marginBottom: 6,
  },
  slotTime: { fontSize: 16, fontWeight: '600', color: '#000' },
  slotRemoveHit: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotRemoveX: {
    fontSize: 28,
    fontWeight: '300',
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#000' },
  tzRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  tzRowActive: { backgroundColor: '#FFFDE7' },
  tzRowLabel: { fontSize: 16, fontWeight: '600', color: '#000' },
});
