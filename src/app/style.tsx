import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { StickmanRig } from '@/game3d/Stickman3D';
import { Turntable, useSpinGesture, type Spinnable } from '@/game3d/Turntable';
import type { Mood } from '@/game3d/sim';
import { lookFor, sanitizeLoadout, type Loadout, type Look } from '@/game/cosmetics';
import type { DerpId, HatId } from '@/game/derps';
import { SKINS, formatSol, ownsProduct, type ProductKind, type Skin } from '@/game/skins';
import { formatSkr } from '@/solana/skr';
import { DerpThumb } from '@/ui/DerpThumb';
import { useGameStore } from '@/game/store';
import { haptic } from '@/game/haptics';
import { playSfx } from '@/audio/sound';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { HapticTouchable } from '@/components/haptic-touchable';
import { FONT, GameButton } from '@/ui/kit';

// "Choose your style!": pick a derp, a hat and a bow among the ones you own.
// Three character cards — you as you are, you in the part you're looking
// at, and a featured part you don't own yet — over a slot switcher and a
// strip of that slot's parts; drag a card's archer sideways to spin it.
// A locked part shows its price and links to the shop.

const SLOTS: { kind: ProductKind; label: string }[] = [
  { kind: 'derp', label: 'Derp' },
  { kind: 'hat', label: 'Hat' },
  { kind: 'bow', label: 'Bow' },
];
const PARTS: Record<ProductKind, Skin[]> = {
  derp: SKINS.filter((s) => s.kind === 'derp'),
  hat: SKINS.filter((s) => s.kind === 'hat'),
  bow: SKINS.filter((s) => s.kind === 'bow'),
};
const wearing = (l: Loadout, part: Skin): Loadout => sanitizeLoadout({ ...l, [part.kind]: part.item });

export default function StyleScreen() {
  useScreenMusic('shop');
  const loadout = useGameStore((s) => s.loadout);
  const ownedSkins = useGameStore((s) => s.ownedSkins);
  const equip = useGameStore((s) => s.equip);
  const [slot, setSlot] = useState<ProductKind>('derp');
  const [selected, setSelected] = useState<string>(loadout.derp);
  const [wardrobe] = useState(() => new WardrobeView());
  const spinPan = useSpinGesture(wardrobe);
  const parts = PARTS[slot];
  const owns = (p: Skin) => ownsProduct(p.id, ownedSkins);
  const worn = (p: Skin) => loadout[p.kind] === p.item;
  const selPart = parts.find((p) => p.item === selected) ?? parts[0];
  // Featured: the last part of this slot you don't own yet, else any.
  const featured =
    [...parts].reverse().find((p) => !owns(p) && p.id !== selPart.id) ??
    [...SKINS].reverse().find((p) => !owns(p) && p.id !== selPart.id) ??
    selPart;

  const cards = useMemo(
    () => [loadout, wearing(loadout, selPart), wearing(loadout, featured)].map((l) => ({ look: lookFor(l) })),
    [loadout, selPart, featured],
  );

  const pickSlot = (k: ProductKind) => {
    setSlot(k);
    setSelected(loadout[k]);
  };
  const onEquip = (p: Skin) => {
    equip(p.kind, p.item);
    haptic.success();
    playSfx('ui_confirm');
  };
  const buy = (p: Skin) => router.push({ pathname: '/shop', params: { tab: p.kind === 'derp' ? 'derps' : 'hats', skin: p.id } });
  const action = (p: Skin) =>
    worn(p) ? (
      <GameButton label="EQUIPPED" color="dark" small disabled />
    ) : owns(p) ? (
      <GameButton label="EQUIP" color="green" small onPress={() => onEquip(p)} />
    ) : (
      <GameButton label={priceLabel(p)} color="orange" small onPress={() => buy(p)} />
    );

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#1F3B12', '#141428', '#3A1458']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <WardrobeCanvas view={wardrobe} cards={cards} />

      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top', 'bottom', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.top} pointerEvents="box-none">
          <HapticTouchable onPress={() => router.back()} hitSlop={12} sound="ui_back" style={styles.back}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </HapticTouchable>
          <Animated.View entering={ZoomIn.duration(240)} style={styles.titleWrap}>
            <LinearGradient colors={['#6FBF3A', '#7E57E6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.titleBar}>
              <Text style={styles.title}>Choose your style!</Text>
            </LinearGradient>
          </Animated.View>
          <View style={styles.back} />
        </View>

        {/* The open middle, where the archers stand: drag here to spin one. */}
        <GestureDetector gesture={spinPan}>
          <View style={styles.spinArea} collapsable={false} />
        </GestureDetector>

        {/* Buttons under the three cards */}
        <View style={styles.cardButtons}>
          <View style={styles.col}>
            <Text style={styles.cardName}>Current</Text>
            <GameButton label="LEAVE" color="purple" small onPress={() => router.back()} sound="ui_back" />
          </View>
          <View style={styles.col}>
            <Text style={styles.cardName}>{selPart.name}</Text>
            {action(selPart)}
          </View>
          <View style={styles.col}>
            <Text style={styles.cardName}>{featured.name}</Text>
            {action(featured)}
          </View>
        </View>

        {/* Slot switcher + that slot's parts */}
        <View style={styles.picker}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            <View style={styles.slots}>
              {SLOTS.map((s) => (
                <HapticTouchable key={s.kind} style={[styles.slot, slot === s.kind && styles.slotOn]} onPress={() => pickSlot(s.kind)}>
                  <Text style={[styles.slotText, slot === s.kind && styles.slotTextOn]}>{s.label}</Text>
                </HapticTouchable>
              ))}
            </View>
            {parts.map((p) => {
              const own = owns(p);
              const on = selPart.id === p.id;
              return (
                <HapticTouchable
                  key={p.id}
                  style={[styles.chip, { borderColor: on ? '#FFFFFF' : p.color, backgroundColor: on ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.45)' }]}
                  onPress={() => setSelected(p.item)}
                >
                  <PartIcon part={p} derp={loadout.derp} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {worn(p) ? (
                    <Ionicons name="checkmark-circle" size={14} color="#7CC23A" />
                  ) : !own ? (
                    <>
                      <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.chipPrice}>{priceLabel(p)}</Text>
                    </>
                  ) : null}
                </HapticTouchable>
              );
            })}
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

// A derp's head, a hat on my derp, or a bow glyph.
function PartIcon({ part, derp }: { part: Skin; derp: DerpId }) {
  if (part.kind === 'bow') return <MaterialCommunityIcons name={part.item === 'shovel' ? 'shovel' : 'bow-arrow'} size={18} color="#FFFFFF" />;
  return (
    <View style={styles.thumb}>
      {part.kind === 'derp' ? <DerpThumb derp={part.item as DerpId} size={22} /> : <DerpThumb derp={derp} hat={part.item as HatId} size={22} />}
    </View>
  );
}

function priceLabel(p: Skin) {
  if (p.priceLamports > 0) return formatSol(p.priceLamports);
  return p.priceSkr > 0 ? formatSkr(p.priceSkr) : 'SHOP';
}

// ---- 3D: three striped cards with a stickman standing in each -----------------------------
// Each card is tinted with its derp's colour; the middle one is pleased
// with itself, the featured one stares at you.
type Card = { look: Look };
const CARD_MOODS: Mood[] = ['neutral', 'happy', 'camera'];

function WardrobeCanvas({ view, cards }: { view: WardrobeView; cards: Card[] }) {
  const focused = useIsFocused();
  useEffect(() => view.setCards(cards), [view, cards]);
  return (
    <Animated.View entering={FadeIn.duration(300)} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas
        gl={{ antialias: false }}
        style={{ flex: 1 }}
        frameloop={focused ? 'always' : 'never'}
        camera={{ fov: 34, position: [0, 1.2, 7.4] }}
      >
        <WardrobeScene view={view} />
      </Canvas>
    </Animated.View>
  );
}

function WardrobeScene({ view }: { view: WardrobeView }) {
  const { scene, camera } = useThree();
  useEffect(() => view.attach(scene), [view, scene]);
  useFrame((_, dt) => view.frame(Math.min(dt, 1 / 20), camera as THREE.PerspectiveCamera));
  return null;
}

let stripeTex: THREE.DataTexture | null = null;
function stripes() {
  if (stripeTex) return stripeTex;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const band = Math.floor((x + y) / 8) % 2;
      const i = (y * n + x) * 4;
      const v = band ? 255 : 215;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  stripeTex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  stripeTex.wrapS = THREE.RepeatWrapping;
  stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.repeat.set(3, 4);
  stripeTex.needsUpdate = true;
  return stripeTex;
}

// The cards sit at 1/6, 3/6, 5/6 of the width; a touch spins the card in
// its third of the screen.
class WardrobeView implements Spinnable {
  private root = new THREE.Group();
  private rigs: StickmanRig[] = [];
  private spins = [new Turntable(), new Turntable(), new Turntable()];
  private active: Turntable | null = null;
  private faces: THREE.Mesh[] = [];
  private frames: THREE.Mesh[] = [];
  private glows: THREE.Mesh[] = [];
  private keys: string[] = [];
  private t = 0;

  constructor() {
    // Green → purple backdrop (the GL view is opaque, so it's drawn here).
    const bg = new THREE.PlaneGeometry(40, 18, 1, 1);
    const cols = new Float32Array([0.12, 0.23, 0.07, 0.23, 0.08, 0.35, 0.12, 0.23, 0.07, 0.23, 0.08, 0.35]);
    bg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const back = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true }));
    back.position.set(0, 1.2, -4);
    this.root.add(back);
    const hemi = new THREE.HemisphereLight('#FFFFFF', '#40304A', 1.6);
    const key = new THREE.DirectionalLight('#FFFFFF', 2);
    key.position.set(2, 4, 5);
    this.root.add(hemi, key);
    for (let i = 0; i < 3; i++) {
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 3.5),
        new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 3.15), new THREE.MeshBasicMaterial({ color: '#111111' }));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 2.95), new THREE.MeshBasicMaterial({ map: stripes(), color: '#9E9E9E' }));
      glow.position.z = -0.75;
      frame.position.z = -0.7;
      face.position.z = -0.68;
      this.root.add(glow, frame, face);
      this.glows.push(glow);
      this.frames.push(frame);
      this.faces.push(face);
    }
  }

  setCards(cards: Card[]) {
    cards.forEach((c, i) => {
      if (!this.rigs[i]) {
        const rig = new StickmanRig(c.look);
        this.rigs[i] = rig;
        this.root.add(rig.root);
      } else if (this.keys[i] !== c.look.key) {
        this.rigs[i].setLook(c.look);
      }
      this.keys[i] = c.look.key;
      (this.faces[i].material as THREE.MeshBasicMaterial).color.set(c.look.banner);
      (this.glows[i].material as THREE.MeshBasicMaterial).color.set(c.look.banner);
    });
  }

  hold(fx: number) {
    this.active = this.spins[Math.max(0, Math.min(2, Math.floor(fx * 3)))];
    this.active.hold();
  }

  start() {
    this.active?.start();
  }

  move(dx: number) {
    this.active?.move(dx);
  }

  release(vx: number) {
    this.active?.release(vx);
    this.active = null;
  }

  attach(scene: THREE.Scene) {
    scene.background = new THREE.Color('#141428');
    scene.add(this.root);
    return () => {
      scene.remove(this.root);
    };
  }

  frame(dt: number, camera: THREE.PerspectiveCamera) {
    this.t += dt;
    const t = this.t;
    // Lay the cards out at 1/6, 3/6, 5/6 of the screen width (the button
    // columns below), whatever the phone's aspect ratio.
    const dist = 7.4;
    const visW = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const cardY = 1.55;
    for (let i = 0; i < 3; i++) {
      const x = ((i * 2 + 1) / 6 - 0.5) * visW;
      const tilt = (i - 1) * -0.06;
      for (const m of [this.glows[i], this.frames[i], this.faces[i]]) {
        m.position.x = x;
        m.position.y = cardY;
        m.rotation.z = tilt;
      }
      this.glows[i].scale.setScalar(1 + Math.sin(t * 2 + i) * 0.03);
      const rig = this.rigs[i];
      if (!rig) continue;
      const draw = Math.max(0, Math.sin(t * 1.3 + i * 1.7)) * 0.6;
      rig.update(
        {
          x: x - 0.25,
          y: cardY - 1.45,
          facing: 1,
          angle: 0.1,
          draw,
          ready: i === 1,
          flash: 0,
          flinch: 0,
          shieldFlash: 0,
          death: null,
          walk: 0,
          stepT: 0,
          mood: CARD_MOODS[i],
          gesture: null,
          gestureT: 0,
          recoil: 0,
          showNocked: i === 1,
        },
        t + i,
        dt,
      );
      this.spins[i].frame(dt);
      rig.root.rotation.y += this.spins[i].yaw;
      rig.root.scale.setScalar(1.15);
    }
    camera.position.set(0, 1.2, dist);
    camera.lookAt(0, 1.2, 0);
  }
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.7)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 3,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#141428' },
  spinArea: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 6 },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  titleWrap: { transform: [{ rotate: '-1.5deg' }] },
  titleBar: { paddingHorizontal: 28, paddingVertical: 4, borderRadius: 6, borderWidth: 3, borderColor: '#0B0B0F' },
  title: { fontFamily: FONT.bold, fontSize: 24, color: '#FFFFFF', ...shadow },
  cardButtons: { flexDirection: 'row', paddingHorizontal: 8 },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  cardName: { fontFamily: FONT.bold, fontSize: 13, color: '#FFFFFF', ...shadow },
  picker: { paddingTop: 6, paddingBottom: 4, gap: 6 },
  strip: { gap: 8, paddingHorizontal: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 2,
  },
  thumb: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#E9E4D8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chipText: { fontFamily: FONT.semi, fontSize: 13, color: '#FFFFFF', maxWidth: 120 },
  chipPrice: { fontFamily: FONT.semi, fontSize: 11, color: '#FFC23D' },
  slots: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 3, marginRight: 4 },
  slot: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, justifyContent: 'center' },
  slotOn: { backgroundColor: '#FFFFFF' },
  slotText: { fontFamily: FONT.bold, fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  slotTextOn: { color: '#0B0B0F' },
});

