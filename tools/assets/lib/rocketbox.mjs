// Microsoft Rocketbox avatars (github.com/microsoft/Microsoft-Rocketbox, MIT licence, Copyright (c) 2020 Microsoft) used
// as extra crowd identities: the list, local paths, and the Bip01 -> CARLA GEN2 joint map.
import path from 'node:path';

const TOOLS = process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`;
export const RB_ROOT = path.join(TOOLS, 'rocketbox');
export const FBX2GLTF = path.join(TOOLS, 'fbx2gltf/FBX2glTF-windows-x86_64/FBX2glTF-windows-x86_64.exe');

// NYC-plausible adults in everyday, office and delivery clothing. Left out: uniforms (police, fire, military, pilots,
// medical scrubs, construction), swimwear and sports kits, party outfits, and the full-cover robes, which read as rare on
// a Manhattan sidewalk next to the CARLA mix.
const F = (name, group = 'Adults') => ({ name, group, gender: 'f' });
const M = (name, group = 'Adults') => ({ name, group, gender: 'm' });
export const RB_AVATARS = [
  ...['01', '02', '03', '04', '05', '07', '08', '09', '11', '12', '13', '14', '15', '17'].map((n) => F('Female_Adult_' + n)),
  ...['01', '02', '03', '04'].map((n) => F('Business_Female_' + n, 'Professions')),
  ...['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '16', '17', '18', '20'].map((n) => M('Male_Adult_' + n)),
  ...['01', '02', '03', '04', '05', '06', '07'].map((n) => M('Business_Male_' + n, 'Professions')),
  M('Delivery_Male_01', 'Professions'), M('Wood_Male_01', 'Professions'),
  // children (GEN2 child clips; the CARLA GEN2 boy / girl are the reference binds)
  { ...F('Female_Child_01', 'Children'), age: 'child' }, { ...F('Female_Child_02', 'Children'), age: 'child' },
  { ...M('Male_Child_01', 'Children'), age: 'child' }, { ...M('Male_Child_02', 'Children'), age: 'child' },
];

// Bip01 joint -> GEN2 joint. Joints not listed fall back to their nearest listed ancestor (facial joints -> the head,
// Spine1 -> the lower spine, the biped root -> the hips).
export const RB_TO_GEN2 = {
  'Bip01 Pelvis': 'crl_hips__C', 'Bip01 Spine': 'crl_spine__C', 'Bip01 Spine2': 'crl_spine01__C',
  'Bip01 Neck': 'crl_neck__C', 'Bip01 Head': 'crl_Head__C', 'Bip01 LEye': 'crl_eye__L', 'Bip01 REye': 'crl_eye__R',
};
for (const [s, S] of [['L', 'L'], ['R', 'R']]) {
  Object.assign(RB_TO_GEN2, {
    [`Bip01 ${s} Clavicle`]: `crl_shoulder__${S}`, [`Bip01 ${s} UpperArm`]: `crl_arm__${S}`, [`Bip01 ${s} Forearm`]: `crl_foreArm__${S}`,
    [`Bip01 ${s} Hand`]: `crl_hand__${S}`,
    [`Bip01 ${s} Thigh`]: `crl_thigh__${S}`, [`Bip01 ${s} Calf`]: `crl_leg__${S}`, [`Bip01 ${s} Foot`]: `crl_foot__${S}`, [`Bip01 ${s} Toe0`]: `crl_toe__${S}`,
  });
  const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
  fingers.forEach((f, k) => {
    RB_TO_GEN2[`Bip01 ${s} Finger${k}`] = `crl_hand${f}__${S}`;
    RB_TO_GEN2[`Bip01 ${s} Finger${k}1`] = `crl_hand${f}01__${S}`;
    RB_TO_GEN2[`Bip01 ${s} Finger${k}2`] = `crl_hand${f}02__${S}`;
  });
}
