// Arena looks. Each round's seed picks one, so every duel travels somewhere
// new and both multiplayer phones see the same place. One dominant hue per
// arena with fog doing the painterly depth; the foreground stays dark so the
// black stickmen read as silhouettes against a lit background.

export type Weather = 'pollen' | 'dust' | 'snow' | 'embers' | 'fireflies' | 'rain';

export type Theme = {
  id: string;
  name: string;
  skyTop: string;
  skyHorizon: string;
  sun: string;
  sunDir: [number, number, number]; // direction TO the sun
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  rim: string; // back light that outlines the black figures
  fog: string;
  fogNear: number;
  fogFar: number;
  ground: string;
  groundFar: string;
  rock: string; // pillars / cliffs
  rockDark: string;
  mountains: [string, string, string]; // near → far
  foliage: string;
  foliageDark: string;
  trunk: string;
  cloud: string;
  cloudOpacity: number;
  weather: Weather;
  weatherColor: string;
  trees: 'pine' | 'round' | 'dead' | 'mushroom';
  lava?: string;
  moon?: boolean;
};

export const THEMES: Theme[] = [
  {
    id: 'meadow',
    name: 'Golden Meadow',
    skyTop: '#4A90D9',
    skyHorizon: '#D6ECFA',
    sun: '#FFF1D0',
    sunDir: [-0.4, 0.75, 0.5],
    sunIntensity: 2.4,
    hemiSky: '#BFE3FF',
    hemiGround: '#5A6B2E',
    hemiIntensity: 1.1,
    rim: '#FFFFFF',
    fog: '#CFE6F5',
    fogNear: 30,
    fogFar: 190,
    ground: '#6E8B3D',
    groundFar: '#C9B458',
    rock: '#6A6158',
    rockDark: '#2E2A26',
    mountains: ['#6F8FA8', '#8FAABF', '#B4C8D8'],
    foliage: '#3F6B34',
    foliageDark: '#2A4A24',
    trunk: '#4A3525',
    cloud: '#FFFFFF',
    cloudOpacity: 0.95,
    weather: 'pollen',
    weatherColor: '#FFF6C8',
    trees: 'pine',
  },
  {
    id: 'canyon',
    name: 'Sunset Canyon',
    skyTop: '#2B1B4A',
    skyHorizon: '#FF9E5E',
    sun: '#FFC285',
    sunDir: [0.5, 0.28, -0.8],
    sunIntensity: 2.2,
    hemiSky: '#FF9E7A',
    hemiGround: '#5A2A20',
    hemiIntensity: 0.9,
    rim: '#FFB070',
    fog: '#E98A62',
    fogNear: 25,
    fogFar: 170,
    ground: '#8A4A30',
    groundFar: '#C8744A',
    rock: '#9A5238',
    rockDark: '#3A1C14',
    mountains: ['#7A3B3A', '#A0515A', '#C2707A'],
    foliage: '#6B7B3A',
    foliageDark: '#3E4A22',
    trunk: '#3A2418',
    cloud: '#FFC6A8',
    cloudOpacity: 0.85,
    weather: 'dust',
    weatherColor: '#FFD7A8',
    trees: 'dead',
  },
  {
    id: 'frost',
    name: 'Frost Peaks',
    skyTop: '#5F8FC8',
    skyHorizon: '#E8F4FF',
    sun: '#EAF4FF',
    sunDir: [-0.3, 0.55, 0.6],
    sunIntensity: 2.0,
    hemiSky: '#DDEEFF',
    hemiGround: '#8FA6BD',
    hemiIntensity: 1.3,
    rim: '#DDF1FF',
    fog: '#DCE9F5',
    fogNear: 22,
    fogFar: 150,
    ground: '#EAF1F8',
    groundFar: '#CFDCEA',
    rock: '#5E6E84',
    rockDark: '#2A3342',
    mountains: ['#8EA3BC', '#AFC0D4', '#CEDAE8'],
    foliage: '#2F5A5A',
    foliageDark: '#1E3C3E',
    trunk: '#3A2E28',
    cloud: '#FFFFFF',
    cloudOpacity: 0.9,
    weather: 'snow',
    weatherColor: '#FFFFFF',
    trees: 'pine',
  },
  {
    id: 'ember',
    name: 'Emberlands',
    skyTop: '#140606',
    skyHorizon: '#E0501E',
    sun: '#FF8A4A',
    sunDir: [0.35, 0.35, -0.7],
    sunIntensity: 1.6,
    hemiSky: '#FF6A3A',
    hemiGround: '#2A0E08',
    hemiIntensity: 0.8,
    rim: '#FF7A3A',
    fog: '#5A1E10',
    fogNear: 18,
    fogFar: 140,
    ground: '#2A1A16',
    groundFar: '#4A2418',
    rock: '#3E2A24',
    rockDark: '#150C0A',
    mountains: ['#2A1210', '#46201A', '#6A2E20'],
    foliage: '#2A1A14',
    foliageDark: '#150C0A',
    trunk: '#150C0A',
    cloud: '#6A3A30',
    cloudOpacity: 0.7,
    weather: 'embers',
    weatherColor: '#FFA040',
    trees: 'dead',
    lava: '#FF5A1F',
  },
  {
    id: 'mist',
    name: 'Moonlit Woods',
    skyTop: '#07131F',
    skyHorizon: '#2F6A6A',
    sun: '#BFE3FF',
    sunDir: [0.4, 0.6, -0.5],
    sunIntensity: 1.1,
    hemiSky: '#6FA8B8',
    hemiGround: '#0E2620',
    hemiIntensity: 0.9,
    rim: '#8FE3D8',
    fog: '#1E4442',
    fogNear: 14,
    fogFar: 120,
    ground: '#1C3A2E',
    groundFar: '#28504A',
    rock: '#3A4A48',
    rockDark: '#121A1A',
    mountains: ['#173432', '#22484A', '#2F5E60'],
    foliage: '#1E4A3A',
    foliageDark: '#10281F',
    trunk: '#1A1410',
    cloud: '#5A8A8A',
    cloudOpacity: 0.55,
    weather: 'fireflies',
    weatherColor: '#D8FF7A',
    trees: 'mushroom',
    moon: true,
  },
  {
    id: 'storm',
    name: 'Stormy Ruins',
    skyTop: '#27313E',
    skyHorizon: '#8C9AA8',
    sun: '#DCE6F0',
    sunDir: [-0.2, 0.8, 0.4],
    sunIntensity: 1.3,
    hemiSky: '#A8B8C8',
    hemiGround: '#2E3A30',
    hemiIntensity: 1.1,
    rim: '#C8D8E8',
    fog: '#7D8B98',
    fogNear: 16,
    fogFar: 120,
    ground: '#3C4D38',
    groundFar: '#5C6A5A',
    rock: '#5A5E62',
    rockDark: '#22262A',
    mountains: ['#46505A', '#5C6670', '#727C86'],
    foliage: '#34503A',
    foliageDark: '#1F3324',
    trunk: '#2A2420',
    cloud: '#5E6A76',
    cloudOpacity: 0.9,
    weather: 'rain',
    weatherColor: '#C8D8E8',
    trees: 'round',
  },
];

export const themeFor = (n: number) => THEMES[((n % THEMES.length) + THEMES.length) % THEMES.length];
