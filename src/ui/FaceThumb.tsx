import { View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { ATLAS_COLS, ATLAS_ROWS, FACES, TILE, type FaceId } from '@/game/faces';

// The smiling front tile of a hero's atlas, cropped to a square.
export function FaceThumb({ face, size, style }: { face: FaceId; size: number; style?: ViewStyle }) {
  const col = TILE.smile % ATLAS_COLS;
  const row = Math.floor(TILE.smile / ATLAS_COLS);
  return (
    <View style={[{ width: size, height: size, overflow: 'hidden' }, style]}>
      <Image
        source={FACES[face].image}
        style={{ position: 'absolute', left: -col * size, top: -row * size, width: size * ATLAS_COLS, height: size * ATLAS_ROWS }}
        contentFit="fill"
      />
    </View>
  );
}
