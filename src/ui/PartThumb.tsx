import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BOWS, INK, type BowId, type DerpId, type HatId } from '@/game/derps';
import { ARROWS, OUTFITS, STICK_BLACK, type ArrowId, type OutfitId } from '@/game/gear';
import { formatSol, isCoinSkin, type Currency, type ProductKind, type Skin } from '@/game/skins';
import { formatSkr } from '@/solana/skr';
import { DerpThumb } from '@/ui/DerpThumb';
import { CoinIcon, FONT } from '@/ui/kit';
import { makeStyles, useMetrics } from '@/ui/responsive';
import { Text } from '@/ui/Text';

// A white section glyph at a design size (scaled when it renders, so the
// icons can live in the module-level SECTIONS list).
export function SectionIcon({ ion, mci, size }: { ion?: keyof typeof Ionicons.glyphMap; mci?: keyof typeof MaterialCommunityIcons.glyphMap; size: number }) {
  const { s } = useMetrics();
  return mci ? <MaterialCommunityIcons name={mci} size={s(size)} color="#FFFFFF" /> : <Ionicons name={ion ?? 'ellipse'} size={s(size)} color="#FFFFFF" />;
}

// The five shop / style sections, in the order both screens show them.
export const SECTIONS: { kind: ProductKind; label: string; blurb: string; icon: React.ReactNode }[] = [
  { kind: 'derp', label: 'Characters', blurb: 'Same stick body. Same bow. Different idiot.', icon: <SectionIcon ion="happy" size={15} /> },
  { kind: 'outfit', label: 'Clothes', blurb: 'Dress for the duel you want. Get the one you have.', icon: <SectionIcon ion="shirt" size={15} /> },
  { kind: 'hat', label: 'Hats', blurb: 'They do not help.', icon: <SectionIcon mci="hat-fedora" size={16} /> },
  { kind: 'bow', label: 'Bows', blurb: 'Every bow shoots the same. Some shoot it in gold.', icon: <SectionIcon mci="bow-arrow" size={16} /> },
  { kind: 'arrow', label: 'Arrows', blurb: 'Pointy end first. Mostly.', icon: <SectionIcon mci="arrow-projectile" size={16} /> },
];

// Any product as a small drawing on paper: a derp's head, a hat on my derp,
// the clothes on a stick figure, a bow, an arrow. `size` is a design size.
export function PartThumb({ part, derp, size: design }: { part: Skin; derp: DerpId; size: number }) {
  const styles = useStyles();
  const size = useMetrics().s(design);
  const inner = size - 6; // inside the (unscaled) 2 dp border
  let art: React.ReactNode;
  switch (part.kind) {
    case 'derp':
      art = <DerpThumb derp={part.item as DerpId} size={inner} />;
      break;
    case 'hat':
      art = <DerpThumb derp={derp} hat={part.item as HatId} size={inner} />;
      break;
    case 'outfit':
      art = <OutfitArt id={part.item as OutfitId} size={inner} />;
      break;
    case 'bow':
      art = <BowArt id={part.item as BowId} size={inner} />;
      break;
    case 'arrow':
      art = <ArrowArt id={part.item as ArrowId} size={inner} />;
      break;
  }
  return (
    <View style={[styles.paper, { width: size, height: size, borderRadius: size * 0.28, borderColor: part.color }]}>{art}</View>
  );
}

function OutfitArt({ id, size }: { id: OutfitId; size: number }) {
  const o = OUTFITS[id] ?? OUTFITS.none;
  const body = o.body === STICK_BLACK ? INK : o.body;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      {o.acc === 'cape' && <Polygon points="15,13 25,13 30,31 10,31" fill={o.color} stroke={INK} strokeWidth={1} />}
      <Line x1={20} y1={13} x2={20} y2={26} stroke={body} strokeWidth={4} strokeLinecap="round" />
      <Line x1={20} y1={26} x2={14} y2={36} stroke={body} strokeWidth={3.4} strokeLinecap="round" />
      <Line x1={20} y1={26} x2={26} y2={36} stroke={body} strokeWidth={3.4} strokeLinecap="round" />
      <Line x1={20} y1={16} x2={12} y2={23} stroke={body} strokeWidth={3.2} strokeLinecap="round" />
      <Line x1={20} y1={16} x2={28} y2={22} stroke={body} strokeWidth={3.2} strokeLinecap="round" />
      <Circle cx={20} cy={8} r={5.2} fill="#FFFFFF" stroke={INK} strokeWidth={1.6} />
      {o.acc === 'scarf' && (
        <G>
          <Rect x={15.5} y={12} width={9} height={3.4} rx={1.6} fill={o.color} stroke={INK} strokeWidth={0.8} />
          <Polygon points="22,14 25,14 26,21 23,21" fill={o.color} stroke={INK} strokeWidth={0.8} />
        </G>
      )}
      {o.acc === 'tie' && <Polygon points="20,14 21.8,16.5 20.9,24 20,25.5 19.1,24 18.2,16.5" fill={o.color} stroke={INK} strokeWidth={0.8} />}
      {o.acc === 'cape' && <Rect x={16} y={12.2} width={8} height={2.2} rx={1} fill={o.trim} />}
      {o.acc === 'tutu' && <Polygon points="16,24 24,24 30,29 10,29" fill={o.color} stroke={INK} strokeWidth={0.8} />}
      {o.acc === 'belt' && (
        <G>
          <Rect x={15} y={21.5} width={10} height={3} rx={1} fill={o.trim} />
          <Rect x={17.5} y={20.8} width={5} height={4.4} rx={1} fill={o.color} stroke={INK} strokeWidth={0.6} />
        </G>
      )}
    </Svg>
  );
}

function BowArt({ id, size }: { id: BowId; size: number }) {
  if (id === 'shovel') return <MaterialCommunityIcons name="shovel" size={size * 0.8} color={INK} />;
  const b = BOWS[id] ?? BOWS.bow;
  const k = 0.75 + b.scale * 0.25;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <G transform={`translate(20 20) scale(${k}) translate(-20 -20)`}>
        <Line x1={27} y1={5} x2={27} y2={35} stroke="#9A9A9A" strokeWidth={1} />
        <Polygon points="27,5 18,10 13.5,20 18,30 27,35 17,30 12,20 17,10" fill={b.wood} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
        <Rect x={11} y={17} width={4} height={6} rx={1.4} fill={b.accent} stroke={INK} strokeWidth={0.8} />
        <Line x1={8} y1={20} x2={34} y2={20} stroke="#C8B48A" strokeWidth={1.4} />
        <Polygon points="34,20 30,18 30,22" fill="#C8CCD2" />
      </G>
    </Svg>
  );
}

function ArrowArt({ id, size }: { id: ArrowId; size: number }) {
  const a = ARROWS[id] ?? ARROWS.classic;
  const fat = a.tip === 'pencil';
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <G transform="rotate(-40 20 20)">
        <Line x1={6} y1={20} x2={30} y2={20} stroke={INK} strokeWidth={fat ? 5.4 : 3.4} strokeLinecap="round" />
        <Line x1={6} y1={20} x2={30} y2={20} stroke={a.shaft} strokeWidth={fat ? 3.8 : 1.9} strokeDasharray={a.stripes ? '0' : undefined} />
        {!!a.stripes && <Line x1={7} y1={20} x2={30} y2={20} stroke={a.stripes} strokeWidth={1.9} strokeDasharray="2.4 2.4" />}
        {a.tip === 'point' && <Polygon points="37,20 29,16 29,24" fill={a.head} stroke={INK} strokeWidth={0.9} />}
        {a.tip === 'plunger' && <Polygon points="29,20 34,14 37,14 37,26 34,26" fill={a.head} stroke={INK} strokeWidth={0.9} />}
        {a.tip === 'pencil' && (
          <G>
            <Polygon points="37,20 30,17 30,23" fill={a.head} stroke={INK} strokeWidth={0.8} />
            <Polygon points="37,20 34.5,19 34.5,21" fill="#3A3A3A" />
            <Rect x={3} y={17.4} width={4} height={5.2} rx={1.2} fill={a.fletch} stroke={INK} strokeWidth={0.7} />
          </G>
        )}
        {a.tip !== 'pencil' && (
          <G>
            <Polygon points="5,20 10,20 12,14 7,14" fill={a.fletch} stroke={INK} strokeWidth={0.7} />
            <Polygon points="5,20 10,20 12,26 7,26" fill={a.fletch} stroke={INK} strokeWidth={0.7} />
          </G>
        )}
      </G>
    </Svg>
  );
}

// What a locked product costs, in the way it's sold: coins, or SOL/SKR in
// the chosen currency (falling back to the other if it isn't sold in it).
export function priceOf(p: Pick<Skin, 'priceCoins' | 'priceLamports' | 'priceSkr'>, currency: Currency) {
  if (p.priceCoins > 0) return { kind: 'coins' as const, label: p.priceCoins.toLocaleString() };
  const cur: Currency = currency === 'SKR' ? (p.priceSkr > 0 ? 'SKR' : 'SOL') : p.priceLamports > 0 ? 'SOL' : 'SKR';
  return { kind: cur, label: cur === 'SKR' ? formatSkr(p.priceSkr) : formatSol(p.priceLamports) };
}

// A small price badge: coin icon + amount, or the SOL/SKR price.
export function PriceTag({ part, currency, style }: { part: Skin; currency: Currency; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const { s } = useMetrics();
  const price = priceOf(part, currency);
  return (
    <View style={[styles.tag, style]}>
      {isCoinSkin(part) ? <CoinIcon size={13} /> : <MaterialCommunityIcons name="lightning-bolt" size={s(12)} color="#B48CFF" />}
      <Text style={[styles.tagText, !isCoinSkin(part) && styles.tagSol]} numberOfLines={1}>
        {price.label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((m) => ({
  paper: { backgroundColor: '#E9E4D8', borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: m.s(3) },
  tagText: { flexShrink: 1, fontFamily: FONT.bold, fontSize: m.s(12), color: '#FFC83D' },
  tagSol: { color: '#D9C6FF' },
}));
