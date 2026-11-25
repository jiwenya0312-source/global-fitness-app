import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, StyleSheet, Text, View } from 'react-native';

import { dayDate, localDay } from './calendar';
import { useLanguage } from './language';
import {
  comparePair, photoAngles, photoUri, validPhotoDay, type PhotoAngle, type PhotoImage, type ProgressPhoto,
} from './progress-photo';
import { exportProgressPhoto, selectProgressPhoto } from './progress-photo-picker';
import { deleteProgressPhoto, readProgressImage, readProgressPhotos, saveProgressPhoto } from './progress-photo-store';
import { Action, Card, Choice, colors, InputField, Page, SecondaryButton, styles } from './ui';

type GalleryView =
  | { type: 'list' | 'add' }
  | { type: 'detail' | 'match'; photo: ProgressPhoto }
  | { type: 'compare'; photo: ProgressPhoto; withPhoto: ProgressPhoto };

export function ProgressPhotos({ onClose }: { onClose: () => void }) {
  const { language, t } = useLanguage();
  const [view, setView] = useState<GalleryView>({ type: 'list' });
  const [photos, setPhotos] = useState<ProgressPhoto[]>();
  const [listError, setListError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(10);
  const [notice, setNotice] = useState<'photoSaved' | 'photoDeleted'>();

  useEffect(() => {
    let active = true;
    readProgressPhotos().then((rows) => {
      if (active) setPhotos(rows);
    }, () => {
      if (active) setListError(true);
    });
    return () => { active = false; };
  }, [attempt]);

  const back = useCallback(() => {
    if (view.type === 'list') onClose();
    else if (view.type === 'compare') setView({ type: 'match', photo: view.photo });
    else if (view.type === 'match') setView({ type: 'detail', photo: view.photo });
    else setView({ type: 'list' });
  }, [onClose, view]);

  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => listener.remove();
  }, [back]));

  function refresh(next?: 'photoSaved' | 'photoDeleted') {
    setView({ type: 'list' });
    setNotice(next);
    setListError(false);
    setPhotos(undefined);
    setAttempt((value) => value + 1);
  }

  const date = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium' });
  function photoLabel(photo: ProgressPhoto) {
    return `${date.format(dayDate(photo.day))} · ${t[photo.angle]}`;
  }

  let content;
  if (view.type === 'add') {
    content = <PhotoEditor onSaved={() => refresh('photoSaved')} />;
  } else if (view.type === 'detail') {
    const { photo } = view;
    const canCompare = photos?.some((item) => item.id !== photo.id && item.angle === photo.angle) ?? false;
    content = <PhotoDetail key={photo.id} photo={photo} label={photoLabel(photo)} canCompare={canCompare}
      onCompare={() => setView({ type: 'match', photo })} onDelete={() => refresh('photoDeleted')}
      onMissing={refresh} />;
  } else if (view.type === 'match') {
    const { photo } = view;
    const matches = photos?.filter((item) => item.id !== photo.id && item.angle === photo.angle) ?? [];
    content = (
      <Card title={t.photoMatch}>
        <Text style={styles.secondary}>{photoLabel(photo)}</Text>
        {matches.slice(0, visible).map((match) => (
          <SecondaryButton key={match.id} label={photoLabel(match)} onPress={() => {
            setView({ type: 'compare', photo, withPhoto: match });
          }} />
        ))}
        {matches.length > visible && <SecondaryButton label={t.workoutMore} onPress={() => setVisible(visible + 10)} />}
      </Card>
    );
  } else if (view.type === 'compare') {
    const pair = comparePair(view.photo, view.withPhoto);
    content = (
      <Card title={t.photoCompareTitle}>
        {pair && (
          <View style={photoStyles.compareRow}>
            {pair.map((photo) => (
              <View key={photo.id} style={photoStyles.compareColumn}>
                <Text style={styles.body}>{date.format(dayDate(photo.day))}</Text>
                <PhotoPreview photo={photo} label={photoLabel(photo)} />
              </View>
            ))}
          </View>
        )}
      </Card>
    );
  } else {
    content = (
      <Card title={t.photoHistory}>
        {!photos && <Text style={styles.secondary}>{t[listError ? 'photoReadError' : 'photoLoading']}</Text>}
        {listError && <SecondaryButton label={t.retry} onPress={() => refresh()} />}
        {photos && (
          <>
            {photos.length === 0 && <Text style={styles.secondary}>{t.photoEmpty}</Text>}
            {photos.slice(0, visible).map((photo) => (
              <SecondaryButton key={photo.id} label={photoLabel(photo)} onPress={() => {
                setNotice(undefined);
                setView({ type: 'detail', photo });
              }} />
            ))}
            {photos.length > visible && <SecondaryButton label={t.workoutMore} onPress={() => setVisible(visible + 10)} />}
          </>
        )}
        <Action label={t.photoAdd} onPress={() => { setNotice(undefined); setView({ type: 'add' }); }} />
      </Card>
    );
  }

  return (
    <Page key={view.type} title={t.photoTitle} icon="camera">
      <SecondaryButton label={t[view.type === 'list' ? 'photoBackToProgress' : 'photoBackButton']} onPress={back} />
      {view.type === 'list' && <Text style={styles.secondary}>{t.photoPrivacy}</Text>}
      {notice && <Text accessibilityRole="alert" style={styles.secondary}>{t[notice]}</Text>}
      {content}
    </Page>
  );
}

function PhotoEditor({ onSaved }: { onSaved: () => void }) {
  const { t } = useLanguage();
  const [day, setDay] = useState(localDay);
  const [angle, setAngle] = useState<PhotoAngle>('photoFront');
  const [image, setImage] = useState<PhotoImage | null>(null);
  const [busy, setBusy] = useState<'picking' | 'saving'>();
  const [error, setError] = useState<'photoPickError' | 'photoMissing' | 'photoInvalidDate' | 'photoDuplicate' | 'photoWriteError'>();
  const pending = useRef(false);

  async function pick() {
    if (pending.current) return;
    pending.current = true;
    setBusy('picking');
    setError(undefined);
    try {
      const photo = await selectProgressPhoto();
      if (photo) setImage(photo);
    } catch {
      setError('photoPickError');
    } finally {
      pending.current = false;
      setBusy(undefined);
    }
  }

  async function save() {
    if (pending.current) return;
    const date = day.trim();
    if (!validPhotoDay(date, localDay())) {
      setError('photoInvalidDate');
      return;
    }
    if (!image) {
      setError('photoMissing');
      return;
    }
    pending.current = true;
    setBusy('saving');
    setError(undefined);
    Keyboard.dismiss();
    try {
      if (await saveProgressPhoto({ day: date, angle, width: image.width, height: image.height }, image.jpeg)) onSaved();
      else setError('photoDuplicate');
    } catch {
      setError('photoWriteError');
    } finally {
      pending.current = false;
      setBusy(undefined);
    }
  }

  return (
    <Card title={t.photoAdd}>
      <InputField label={t.bodyDateInput} value={day} change={setDay} busy={!!busy}
        maxLength={10} placeholder="YYYY-MM-DD" />
      <Text style={styles.body}>{t.photoAngle}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t.photoAngle} style={styles.row}>
        {photoAngles.map((option) => (
          <Choice key={option} label={t[option]} selected={option === angle} disabled={!!busy}
            onPress={() => setAngle(option)} />
        ))}
      </View>
      {image && <Picture jpeg={image.jpeg} label={t.photoSelected} />}
      {error && <Text accessibilityRole="alert" style={styles.secondary}>{t[error]}</Text>}
      {busy ? <Text accessibilityRole="alert" style={styles.secondary}>
        {t[busy === 'picking' ? 'photoPreparing' : 'profileSaving']}
      </Text> : (
        <View style={styles.row}>
          <SecondaryButton label={t[image ? 'photoReplacePick' : 'photoPick']} onPress={() => { void pick(); }} />
          <Action label={t.photoSave} onPress={() => { void save(); }} />
        </View>
      )}
    </Card>
  );
}

function PhotoDetail({ photo, label, canCompare, onCompare, onDelete, onMissing }: {
  photo: ProgressPhoto;
  label: string;
  canCompare: boolean;
  onCompare: () => void;
  onDelete: () => void;
  onMissing: () => void;
}) {
  const { t } = useLanguage();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<'photoExported' | 'photoExportError' | 'photoDeleteError'>();
  const pending = useRef(false);

  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setNotice(undefined);
    setBusy(true);
    try {
      if (await deleteProgressPhoto(photo.id)) onDelete();
      else onMissing();
    } catch {
      setNotice('photoDeleteError');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function exportImage(jpeg: string) {
    if (pending.current) return;
    pending.current = true;
    setNotice(undefined);
    setBusy(true);
    try {
      if (await exportProgressPhoto(photo, jpeg)) setNotice('photoExported');
    } catch {
      setNotice('photoExportError');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Card title={label}>
      <PhotoPreview photo={photo} label={label} exportImage={exportImage} exportDisabled={confirmRemove || busy} />
      {notice && <Text accessibilityRole="alert" style={styles.secondary}>{t[notice]}</Text>}
      {busy ? <Text accessibilityRole="alert" style={styles.secondary}>{t.photoWorking}</Text> : (
        confirmRemove ? (
          <>
            <Text style={styles.secondary}>{t.photoDeletePrompt}</Text>
            <View style={styles.row}>
              <Action label={t.photoDelete} onPress={() => { void remove(); }} />
              <SecondaryButton label={t.profileCancel} onPress={() => setConfirmRemove(false)} />
            </View>
          </>
        ) : (
          <>
            {canCompare
              ? <Action label={t.photoMatch} onPress={onCompare} />
              : <Text style={styles.secondary}>{t.photoNeedMatch}</Text>}
            <SecondaryButton label={t.photoDelete} onPress={() => setConfirmRemove(true)} />
          </>
        )
      )}
    </Card>
  );
}

function PhotoPreview({ photo, label, exportImage, exportDisabled }: {
  photo: ProgressPhoto;
  label: string;
  exportImage?: (jpeg: string) => void;
  exportDisabled?: boolean;
}) {
  const { t } = useLanguage();
  const [jpeg, setJpeg] = useState<string | null | undefined>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    readProgressImage(photo.id).then((result) => {
      if (active) setJpeg(result);
    }, () => {
      if (active) setJpeg(null);
    });
    return () => { active = false; };
  }, [attempt, photo.id]);

  if (jpeg === undefined) return <Text style={styles.secondary}>{t.photoLoading}</Text>;
  if (jpeg === null) return (
    <>
      <Text accessibilityRole="alert" style={styles.secondary}>{t.photoReadError}</Text>
      <SecondaryButton label={t.retry} onPress={() => { setJpeg(undefined); setAttempt((value) => value + 1); }} />
    </>
  );

  return (
    <>
      <Picture jpeg={jpeg} label={label} />
      {exportImage && <SecondaryButton label={t.photoExport} disabled={exportDisabled}
        onPress={() => exportImage(jpeg)} />}
    </>
  );
}

function Picture({ jpeg, label }: { jpeg: string; label: string }) {
  const { t } = useLanguage();
  const [failedImage, setFailedImage] = useState<string>();
  return failedImage === jpeg ? <Text accessibilityRole="alert" style={styles.secondary}>{t.photoReadError}</Text> : (
    <Image source={photoUri(jpeg)} style={photoStyles.picture} contentFit="contain"
      accessible accessibilityLabel={label} cachePolicy="none" onError={() => setFailedImage(jpeg)} />
  );
}

const photoStyles = StyleSheet.create({
  picture: { width: '100%', aspectRatio: 3 / 4, maxHeight: 440, backgroundColor: colors.background, borderRadius: 12 },
  compareRow: { flexDirection: 'row', gap: 8 },
  compareColumn: { flex: 1, minWidth: 0, gap: 6 },
});
