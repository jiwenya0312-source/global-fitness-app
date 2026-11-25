import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLanguage } from './language';
import { readRunRoute, removeRunRoute } from './run-gps';
import { summarizeRoute, type RoutePoint } from './run-route';
import { Action, Card, colors, SecondaryButton, styles } from './ui';

export function RunRouteCard({ id }: { id: number }) {
  const { t } = useLanguage();
  const [points, setPoints] = useState<RoutePoint[]>();
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    let live = true;
    void readRunRoute(id).then((data) => { if (live) setPoints(data); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id]);

  return <Card title={t.runGpsRoute} icon="run">
    {failed && <Text accessibilityRole="alert" style={styles.secondary}>{t.runGpsFailed}</Text>}
    {points === undefined ? <Text style={styles.secondary}>{t.runLoading}</Text>
      : points.length < 2 ? <Text style={styles.secondary}>{t.runGpsEmpty}</Text> : <>
        <RouteOutline points={points} label={t.runGpsRoute} />
        <Text style={styles.secondary}>{t.runGpsPrivate}</Text>
      </>}
    {!!points?.length && (confirm ? <>
      <Text style={styles.body}>{t.runGpsRemovePrompt}</Text>
      <Action label={t.runGpsRemove} disabled={deleting} onPress={() => {
        setDeleting(true);
        void removeRunRoute(id).then(() => {
          setPoints([]);
          setConfirm(false);
        }, () => setFailed(true)).finally(() => setDeleting(false));
      }} />
      <SecondaryButton label={t.profileCancel} disabled={deleting} onPress={() => setConfirm(false)} />
    </> : <SecondaryButton label={t.runGpsRemove} onPress={() => setConfirm(true)} />)}
  </Card>;
}

function RouteOutline({ points, label }: { points: RoutePoint[]; label: string }) {
  const [width, setWidth] = useState(0);
  const height = 164;
  const segments = summarizeRoute(points).segments;
  const step = Math.max(1, Math.ceil(points.length / 120));
  const path = segments.map((segment) => segment.filter((_, index) => index % step === 0 || index === segment.length - 1));
  const first = points[0];
  const longitude = (lon: number) => (((lon - first.lon + 540) % 360) - 180) * Math.cos(first.lat * Math.PI / 180);
  const vertices = path.map((segment) => segment.map((point) => ({ x: longitude(point.lon), y: -point.lat })));
  const flattened = vertices.flat();
  const minX = Math.min(...flattened.map(({ x }) => x));
  const minY = Math.min(...flattened.map(({ y }) => y));
  const dx = Math.max(...flattened.map(({ x }) => x)) - minX;
  const dy = Math.max(...flattened.map(({ y }) => y)) - minY;
  const scale = Math.max(0, Math.min((width - 32) / Math.max(dx, 0.000001), (height - 32) / Math.max(dy, 0.000001)));
  return <View style={routeStyles.plot} accessible accessibilityRole="image" accessibilityLabel={label}
    onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {width > 32 && vertices.flatMap((segment, index) => segment.slice(1).map((point, i) => {
      const prior = segment[i];
      const length = Math.hypot(point.x - prior.x, point.y - prior.y) * scale;
      const rotation = Math.atan2(point.y - prior.y, point.x - prior.x);
      const left = (width - dx * scale) / 2 + ((prior.x + point.x) / 2 - minX) * scale - length / 2;
      const top = (height - dy * scale) / 2 + ((prior.y + point.y) / 2 - minY) * scale;
      return <View key={`${index}/${i}`} style={[routeStyles.line, {
        left, top, width: length, transform: [{ rotate: `${rotation}rad` }],
      }]} />;
    }))}
  </View>;
}

const routeStyles = StyleSheet.create({
  plot: { height: 164, backgroundColor: colors.background, borderRadius: 12, overflow: 'hidden' },
  line: { position: 'absolute', height: 3, backgroundColor: colors.accent, borderRadius: 2 },
});
