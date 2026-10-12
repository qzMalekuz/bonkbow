import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from '@/components/haptic-touchable';
import { NAME_MAX, NAME_MIN, cleanName } from '@/game/progression';
import { useGameStore } from '@/game/store';
import { haptic } from '@/game/haptics';
import { playSfx } from '@/audio/sound';
import { FONT, GameButton } from '@/ui/kit';

const SUGGESTIONS = [
  'Sir Bonksalot',
  'Twangela',
  'Captain Miss',
  'Bowzilla',
  'Quiver Kid',
  'Noodle Arm',
  'Lord Wobble',
  'Dr Ricochet',
  'Arrowgant',
  'Big Bonk Energy',
  'Stringbean',
  'Missed It',
];

// "What do they call you?": pick or change the player name. Shown on first
// launch from the home screen, and from the name pill or Settings.
export function NameModal({ visible, onClose, firstTime }: { visible: boolean; onClose: () => void; firstTime?: boolean }) {
  const current = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const [draft, setDraft] = useState(current);
  const name = cleanName(draft);
  const ok = name.length >= NAME_MIN;

  const roll = () => {
    const pool = SUGGESTIONS.filter((s) => s !== name);
    setDraft(pool[Math.floor(Math.random() * pool.length)]);
    haptic.tap();
  };
  const save = () => {
    if (!ok) {
      haptic.warning();
      playSfx('ui_error');
      return;
    }
    setPlayerName(name);
    haptic.success();
    playSfx('ui_confirm');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose} onShow={() => setDraft(current)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Animated.View entering={FadeIn.duration(160)} style={StyleSheet.absoluteFill}>
          <HapticTouchable style={styles.fill} onPress={firstTime ? undefined : onClose} sound={null} />
        </Animated.View>
        <Animated.View entering={ZoomIn.duration(220)} style={styles.card}>
          <View style={styles.titleBar}>
            <Text style={styles.title}>{firstTime ? 'Who are you?' : 'Change your name'}</Text>
          </View>
          <Text style={styles.sub}>{firstTime ? 'Pick a name. Your rivals will see it. They will not respect it.' : 'Rivals see this on the name plates.'}</Text>
          <View style={styles.row}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Your name"
              placeholderTextColor="rgba(255,255,255,0.4)"
              maxLength={NAME_MAX + 4}
              autoFocus
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={save}
              style={styles.input}
            />
            <HapticTouchable style={styles.dice} onPress={roll} sound="ui_click" accessibilityLabel="Random name">
              <Ionicons name="dice" size={22} color="#0B0B0F" />
            </HapticTouchable>
          </View>
          <Text style={styles.count}>
            {ok ? `${name.length}/${NAME_MAX}` : `At least ${NAME_MIN} characters`}
          </Text>
          <View style={styles.buttons}>
            {!firstTime && <GameButton label="Cancel" color="dark" small onPress={onClose} sound="ui_back" style={styles.btn} />}
            <GameButton label={firstTime ? "That's me" : 'Save'} color="green" small onPress={save} disabled={!ok} style={styles.btn} />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 24, backgroundColor: 'rgba(5,6,16,0.72)' },
  fill: { flex: 1 },
  card: {
    width: 420,
    maxWidth: '90%',
    backgroundColor: '#1B1A33',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#0B0B0F',
    padding: 18,
    paddingTop: 26,
    gap: 8,
  },
  titleBar: {
    position: 'absolute',
    top: -18,
    alignSelf: 'center',
    backgroundColor: '#8E6CEF',
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#0B0B0F',
    paddingHorizontal: 20,
    paddingVertical: 2,
    transform: [{ rotate: '-1.5deg' }],
  },
  title: { fontFamily: FONT.bold, fontSize: 20, color: '#FFFFFF' },
  sub: { fontFamily: FONT.medium, fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    fontFamily: FONT.bold,
    fontSize: 20,
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dice: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#FFB020', alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4, borderBottomColor: '#C77A00' },
  count: { fontFamily: FONT.semi, fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'right' },
  buttons: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  btn: { minWidth: 130 },
});
