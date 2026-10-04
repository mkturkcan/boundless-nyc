// AR32 part hptSign: the measured facts for the Pepsi-Cola sign, the two LIRR gantries and Gantry Plaza State Park's
// benches (docs/notes/area-hptSign.md lists every source). World metres: x east, z south, y up (shared/geo.js project).
//
// The sign (an NYC landmark since June 2016; the facts as Wikipedia "Pepsi-Cola sign" gives them from the LPC's
// designation report): OSM way 238974585 (the sign's outline, 50.6 x 1.5 m) at 4-09 47th Road, its long axis NNE-SSW,
// facing west-northwest over the East River
// toward the United Nations. The steel grid is 46 m (150 ft) long and the letters stand from about 6.1 m (20 ft) over
// grade to about 21 m (70 ft); the "P" and the "C" are the tallest letters, 13.4 m (44 ft); the painted aluminium bottle
// to the right of the letters is 15.2 m (50 ft) tall and 0.24 m (9.5 in) deep. The column lines, the lattice tiers,
// the letters' layout and the bottle's place are measured on Wikimedia Commons photographs (Pepsi-Cola sign SWW.jpg,
// CC BY-SA 3.0; Long Island City Pepsi Cola Sign - May 2026.jpg, CC BY-SA 4.0), scaled to those dimensions.
export const SIGN = {
  N: [1147.55, 3935.45],          // the outline's north end (the "P" end: the left end seen from the river)
  S: [1129.75, 3982.80],          // the south end (the bottle)
  FRAME: [3.8, 49.8],             // the steel grid along the sign (u from N, m): 46.0 m
  COLS: [8.8, 20.9, 32.3, 43.3],  // the four column lines (u), each a front and a back column
  GIRDER: [6.1, 7.1],             // the main girder (m over the ground): the columns carry it at 20 ft
  TOP: 19.6,                      // the grid's top chord
  TIERS: [7.1, 10.2, 13.3, 16.4, 19.6],
  DEPTH: 2.8,                     // front to back of the grid
  LETTER_V0: 7.4,                 // the letters' lowest point (the swash) over the ground
  LETTER_W: 0.9,                  // the letter plane in front of the grid's front plane
  LETTER_D: 0.42,                 // the channel letters' depth
};
// The two restored transfer-bridge gantries (1925, the Long Island Rail Road's float-bridge cranes; "LONG" on the north
// one, "ISLAND" on the larger south one): the OSM disused rail ways 220194017/18/19/22 give the two float bridges' track
// pairs (6 m apart) and their direction (ESE inland, 14.7 degrees south of east); the NAIP 2022 aerial (USGS, public
// domain) shows the two frames at the tracks' west ends. Heights and widths measured on the Commons photograph "LONG
// ISLAND gantries at Gantry Plaza State Park, September 2018.jpg" (CC BY-SA 3.0) against the aprons' 1.1 m railings.
export const GANTRY = {
  T: [0.965, 0.253],              // the tracks' direction, inland (ESE)
  // each frame's front legs at the gantry platform's river edge (OSM pier way 296199836), the aprons out over the slip
  LONG: { C: [1046.6, 4249.1], W: 12.6, HB: 11.0, HT: 14.8, text: 'LONG' },
  ISLAND: { C: [1041.7, 4271.9], W: 17.0, HB: 12.4, HT: 17.6, text: 'ISLAND' },
  APRON: 13.5,                    // the float bridges' aprons out over the river from the frames
  DECK_Y: 1.9,                    // the aprons' decks over the river (y = 0 water), 1.4 m under the park's edge
};
// The south gantry off the park's south pier: one wide
// lattice-tower frame over the water, each tower on a concrete caisson (its top about a metre over the water), the machinery
// house on the girder, two operator cabins hung on the south tower, no lettering. The compiled city drew its OSM footprint (tile
// 1_8 building 2, a 29.1 x 2.7 m strip) as a 17 m stone block. The tower line is that strip's centre line (from 977.26, 4317.12
// to 970.98, 4345.57), the towers at its ends; the heights are ISLAND's (NOT measured on this frame).
export const GANTRY_S = {
  T: [0.9765, 0.2156],            // across the strip, inland (the tracks' direction)
  F: { C: [974.12, 4331.35], W: 25.5, HB: 12.4, HT: 17.6, deck: 1.4 },
  BASE: [-1.5, 1.4],              // the caissons' foot and top (y)
};
// compiled footprints that are these structures, drawn as stone blocks by the compiled city: [cx, cz] (the ring's vertex mean), area m2
export const GANTRY_FOOTPRINTS = [[1049.28, 4257.21, 136], [976.11, 4331.83, 94]];
// benches: OpenStreetMap amenity=bench nodes inside the park (ODbL, (c) OpenStreetMap contributors), world x, z
export const BENCHES = [[1109.2, 3949.9], [1108.1, 3952.6], [1107.2, 3955.0], [1106.4, 3957.6], [1105.7, 3960.2], [1105.2, 3963.0],
  [1104.8, 3965.7], [1104.3, 3968.3], [1104.1, 3971.1], [1028.3, 4101.3], [1029.6, 4098.5], [1031.1, 4095.3], [1032.6, 4092.3],
  [1040.2, 4077.1], [1038.6, 4080.2], [1036.9, 4083.2], [1035.6, 4086.3], [1034.1, 4089.3], [1049.9, 4071.4], [1052.7, 4070.8],
  [1055.3, 4069.8], [1057.7, 4069.0], [987.4, 4312.9], [984.6, 4307.8], [1000.4, 4309.9], [1060.9, 4130.7], [1057.8, 4129.9],
  [1054.5, 4129.2], [1051.2, 4128.3], [1044.4, 4126.7], [1041.6, 4126.0], [1034.9, 4124.4], [1031.4, 4123.5], [1028.5, 4122.9],
  [1025.2, 4122.1]];
// the park's piers (OSM way 296199836, man_made=pier, ODbL): the long north pier, the gantry platform along the bulkhead
// and the round-ended south pier, one outline; the edges on the coastline (the bulkhead) carry no railing. The compiled
// city had none of it (the terrain there is the river bed, y -9), so the deck is built here at the park's level.
// AR34 b4: the south pier's round end as the compiled land ring draws it, not the five points before
const PIER_END = [[993.7, 4279.6], [993.1, 4279.4], [992.5, 4279.1], [992.0, 4278.9], [991.5, 4278.5], [991.0, 4278.1], [990.6, 4277.7], [990.3, 4277.2], [989.9, 4276.7], [989.7, 4276.1], [989.5, 4275.6], [989.3, 4275.0], [989.2, 4274.4], [989.2, 4273.8], [989.3, 4273.2], [989.3, 4272.5], [989.4, 4271.8], [989.6, 4271.2], [989.8, 4270.5], [990.1, 4269.9], [990.4, 4269.3], [990.9, 4268.8], [991.3, 4268.3], [991.8, 4267.9], [992.4, 4267.5], [992.9, 4267.1], [993.6, 4266.8], [994.2, 4266.6], [994.8, 4266.5], [995.5, 4266.4], [996.2, 4266.3], [996.9, 4266.4]];
export const PIER = [[1047.3, 4283.6], [1011.7, 4274.7], [1009.6, 4283.8], ...PIER_END,
  [1039.0, 4274.9], [1047.0, 4238.1], [974.8, 4218.3], [972.8, 4215.5], [973.9, 4211.5], [978.3, 4210.1], [1022.2, 4221.0],
  [1022.2, 4223.0], [1060.4, 4231.9], [1059.2, 4236.7], [1048.0, 4280.9]];
const pierAt = (x, z) => PIER.findIndex(([a, b]) => a === x && b === z);
export const PIER_COAST = [pierAt(1060.4, 4231.9), pierAt(1059.2, 4236.7), pierAt(1048.0, 4280.9)];   // the edges from these vertices lie on the bulkhead
// the two piers in the outline, [first, last] vertex (the south pier, the north pier); the gantries' platform between them is paved
export const PIER_PARTS_AT = [[0, pierAt(1039.0, 4274.9)], [pierAt(1047.0, 4238.1), pierAt(1060.4, 4231.9)]];
// walker lines along the piers (the OSM footways 696508280 and 696508281 on them) and their deck boxes [x0, z0, x1, z1, half width]
export const PIER_WALKS = [[1059.2, 4236.7, 978.4, 4215.4, 2.6], [1048.0, 4280.9, 997.4, 4270.0, 3.6], [1057.5, 4234.0, 1044.8, 4282.0, 4.2]];
// the park's lawns and planted beds: OSM landuse=grass and leisure=garden ways inside the park (ODbL), [way id, kind, outline]
// (the compiled city had none here: the park's ground was the bare terrain with its paths)
export const LAWNS = [
  [238911723, 'lawn', [[1144.1, 3903.0], [1136.6, 3916.9], [1127.5, 3928.3], [1118.7, 3937.0], [1115.0, 3941.5], [1112.6, 3946.3], [1110.3, 3950.9], [1108.7, 3955.6], [1107.6, 3965.7], [1107.8, 3974.1], [1109.2, 3982.6], [1110.0, 3988.2], [1110.9, 3993.2], [1119.3, 3990.8], [1127.8, 3989.4], [1125.2, 3984.8], [1123.2, 3979.8], [1122.1, 3971.7], [1122.9, 3963.0], [1125.1, 3956.2], [1128.6, 3948.3], [1134.7, 3939.6], [1138.8, 3935.0], [1142.6, 3928.9], [1144.2, 3923.8], [1145.6, 3918.9], [1146.2, 3913.9], [1145.9, 3908.9], [1145.1, 3905.6]]],
  [238911724, 'lawn', [[1155.6, 3932.3], [1151.8, 3934.1], [1149.2, 3935.7], [1142.6, 3939.5], [1138.7, 3942.9], [1134.5, 3948.6], [1131.0, 3954.8], [1128.9, 3960.0], [1127.8, 3965.9], [1127.2, 3970.0], [1127.2, 3974.1], [1127.8, 3978.1], [1129.6, 3983.0], [1131.5, 3986.0], [1134.1, 3989.7], [1140.0, 3995.3], [1143.5, 3997.8], [1147.0, 4000.3], [1153.5, 4003.7], [1160.7, 4006.1], [1168.5, 4007.7], [1176.6, 4008.4], [1181.3, 4008.7], [1186.0, 4008.6], [1193.3, 4008.4], [1201.8, 4007.1], [1180.8, 4004.7], [1159.8, 4000.8], [1148.9, 3995.1], [1138.8, 3982.2], [1158.0, 3932.9], [1159.2, 3933.1], [1160.6, 3931.2], [1183.4, 3934.4], [1175.6, 3931.5], [1165.8, 3929.3]]],
  [238974573, 'lawn', [[1076.4, 4078.3], [1083.4, 4072.1], [1088.5, 4067.2], [1090.1, 4065.7], [1096.4, 4057.2], [1101.6, 4050.2], [1106.5, 4038.6], [1109.5, 4027.9], [1111.6, 4011.6], [1111.6, 3996.6], [1121.5, 3994.4], [1127.4, 3994.0], [1132.2, 3994.4], [1136.7, 3999.1], [1142.4, 4003.7], [1147.7, 4008.3], [1150.0, 4010.7], [1152.4, 4013.3], [1155.5, 4018.2], [1158.2, 4024.3], [1159.4, 4030.1], [1160.0, 4036.3], [1159.5, 4042.5], [1158.4, 4048.8], [1155.7, 4055.2], [1152.0, 4061.3], [1145.6, 4070.1], [1141.1, 4074.4], [1136.7, 4078.0], [1123.8, 4085.6], [1113.2, 4093.0], [1112.8, 4090.8], [1111.5, 4088.7], [1107.6, 4085.6], [1103.0, 4082.7], [1098.5, 4081.2], [1092.9, 4079.7], [1087.1, 4078.6], [1081.5, 4078.2]]],
  [238974576, 'bed', [[1067.0, 4065.8], [1065.8, 4076.8], [1065.7, 4082.6], [1066.0, 4088.0], [1067.1, 4084.4], [1069.3, 4081.3], [1072.6, 4079.1], [1076.4, 4078.3], [1083.4, 4072.1], [1088.5, 4067.2], [1090.1, 4065.7], [1096.4, 4057.2], [1101.6, 4050.2], [1106.5, 4038.6], [1109.5, 4027.9], [1111.6, 4011.6], [1111.6, 3996.6], [1106.0, 3997.8], [1105.8, 4004.2], [1105.4, 4011.2], [1103.6, 4020.2], [1100.8, 4028.9], [1097.4, 4035.1], [1092.6, 4043.1], [1086.9, 4049.8], [1084.0, 4053.3], [1077.0, 4059.3], [1073.0, 4062.6]]],
  [238974577, 'bed', [[1110.9, 3993.2], [1106.0, 3994.5], [1104.7, 3986.3], [1104.2, 3978.5], [1104.7, 3971.8], [1105.7, 3965.4], [1106.3, 3960.7], [1107.3, 3956.8], [1110.5, 3948.5], [1115.0, 3941.5], [1112.6, 3946.3], [1110.3, 3950.9], [1108.7, 3955.6], [1107.6, 3965.7], [1107.8, 3974.1], [1109.2, 3982.6], [1110.0, 3988.2]]],
  [239023742, 'lawn', [[1204.3, 4108.4], [1200.2, 4106.9], [1189.2, 4103.0], [1170.0, 4091.0], [1162.9, 4087.4], [1155.7, 4085.3], [1147.2, 4085.0], [1139.2, 4086.2], [1130.8, 4089.2], [1123.2, 4093.7], [1118.2, 4098.1], [1114.0, 4102.9], [1109.7, 4109.4], [1106.3, 4116.5], [1103.5, 4124.6], [1102.3, 4134.3], [1102.6, 4140.6], [1103.7, 4142.1], [1105.2, 4143.3], [1108.1, 4144.9], [1107.6, 4142.1], [1107.5, 4138.6], [1107.4, 4135.0], [1108.1, 4127.8], [1109.9, 4120.6], [1112.8, 4113.8], [1116.6, 4107.7], [1121.5, 4102.1], [1127.5, 4097.0], [1134.5, 4092.8], [1143.6, 4090.6], [1153.1, 4089.4], [1161.7, 4091.3], [1169.8, 4094.5], [1183.5, 4103.2], [1190.5, 4108.1], [1192.0, 4105.8], [1202.3, 4112.9]]],
  [239023743, 'lawn', [[1172.3, 4040.3], [1166.4, 4030.6], [1164.3, 4025.8], [1162.9, 4020.7], [1162.0, 4016.8], [1162.0, 4015.0], [1162.4, 4013.8], [1163.6, 4012.6], [1165.6, 4012.4], [1168.0, 4013.2], [1173.3, 4014.9], [1179.2, 4016.8], [1179.0, 4017.6], [1180.8, 4018.5], [1182.0, 4019.1], [1188.3, 4020.5], [1194.8, 4021.0], [1203.9, 4023.2], [1210.7, 4025.8], [1217.3, 4026.3], [1224.6, 4026.6], [1230.4, 4029.2], [1228.5, 4034.4], [1222.7, 4031.0], [1221.1, 4033.7], [1214.8, 4030.1], [1213.3, 4032.7], [1204.1, 4028.1], [1203.3, 4029.8], [1184.7, 4020.6], [1180.6, 4036.1], [1171.9, 4066.3], [1173.8, 4055.4], [1174.0, 4050.8], [1173.5, 4047.8], [1174.5, 4040.5], [1173.6, 4039.1], [1173.0, 4038.3]]],
  [239024737, 'lawn', [[1170.3, 4072.6], [1168.0, 4077.7], [1167.7, 4080.3], [1170.0, 4080.8], [1176.5, 4082.5], [1180.4, 4084.4], [1189.8, 4087.5], [1198.6, 4090.3], [1202.5, 4093.7], [1208.8, 4095.5], [1210.5, 4095.9], [1212.2, 4096.3], [1214.2, 4090.3], [1203.8, 4087.6], [1177.0, 4081.3], [1168.8, 4078.2]]],
  [256191824, 'lawn', [[1070.1, 4116.5], [1072.0, 4113.5], [1074.9, 4112.0], [1079.3, 4113.1], [1082.3, 4116.6], [1084.6, 4120.4], [1084.7, 4124.1], [1084.1, 4126.7], [1081.4, 4128.3], [1077.0, 4127.4], [1076.9, 4126.4], [1076.5, 4123.7], [1075.2, 4120.9], [1073.4, 4118.4]]],
  [286010956, 'lawn', [[1061.4, 4068.7], [1059.9, 4081.5], [1060.3, 4094.4], [1062.0, 4106.9], [1064.5, 4119.8], [1066.4, 4124.5], [1068.1, 4128.6], [1037.7, 4120.7], [1037.4, 4112.5], [1039.1, 4101.7], [1041.3, 4091.1], [1043.9, 4081.9], [1047.5, 4072.9]]],
  [286010958, 'lawn', [[1080.6, 4161.4], [1083.9, 4170.4], [1085.0, 4179.7], [1083.8, 4192.6], [1080.2, 4203.4], [1063.9, 4200.4], [1014.8, 4191.4], [1012.5, 4179.9], [1015.6, 4171.8], [1022.3, 4164.9], [1031.3, 4160.6], [1041.2, 4158.9], [1054.1, 4163.4], [1056.8, 4164.3], [1067.6, 4165.4], [1070.1, 4165.7]]],
  [286010960, 'lawn', [[1161.6, 4080.2], [1156.0, 4079.3], [1150.7, 4079.5], [1145.0, 4078.4], [1153.2, 4067.6], [1157.9, 4060.3], [1160.8, 4054.6], [1163.2, 4048.3], [1164.6, 4042.9], [1165.3, 4036.3], [1166.0, 4035.8], [1166.5, 4036.1], [1168.7, 4039.8], [1169.9, 4044.7], [1170.3, 4049.6], [1170.0, 4053.9], [1169.7, 4058.8], [1168.0, 4063.2], [1164.2, 4068.2], [1165.8, 4069.0], [1166.8, 4070.8], [1166.7, 4073.7], [1165.8, 4075.9], [1165.2, 4076.9], [1165.0, 4079.6], [1164.5, 4080.5]]],
  [295414156, 'bed', [[1070.5, 4043.6], [1064.8, 4048.0], [1060.5, 4052.9], [1066.6, 4054.7], [1072.9, 4050.2], [1079.0, 4044.9], [1085.0, 4037.9], [1090.2, 4030.3], [1093.1, 4024.0], [1095.6, 4017.8], [1097.0, 4012.2], [1097.9, 4006.7], [1094.7, 4005.7], [1093.9, 4011.2], [1090.7, 4020.3], [1086.9, 4027.7], [1081.9, 4035.7], [1076.2, 4040.4]]],
  [295414157, 'lawn', [[1094.7, 4005.7], [1089.2, 4004.2], [1087.4, 4011.1], [1083.7, 4018.4], [1080.6, 4023.7], [1077.5, 4029.9], [1072.6, 4036.1], [1066.1, 4043.5], [1062.4, 4048.2], [1060.5, 4052.9], [1064.8, 4048.0], [1070.5, 4043.6], [1076.2, 4040.4], [1081.9, 4035.7], [1086.9, 4027.7], [1090.7, 4020.3], [1093.9, 4011.2]]],
  [295423893, 'lawn', [[1087.9, 4156.9], [1090.2, 4156.9], [1091.4, 4158.3], [1094.3, 4161.3], [1096.7, 4162.5], [1095.8, 4173.9], [1088.8, 4198.7], [1088.4, 4200.0], [1087.6, 4199.9], [1085.1, 4207.9], [1082.7, 4206.9], [1085.4, 4201.3], [1087.4, 4195.5], [1089.2, 4188.2], [1090.0, 4172.6], [1089.2, 4164.6]]],
  [1213322027, 'lawn', [[1198.4, 4013.2], [1198.0, 4016.2], [1189.0, 4014.3], [1189.3, 4013.2], [1194.4, 4012.5]]],
  [1214199412, 'lawn', [[1185.0, 4092.0], [1185.0, 4094.0], [1185.8, 4095.7], [1187.5, 4098.2], [1190.2, 4100.4], [1192.6, 4100.9], [1196.4, 4101.3], [1199.8, 4101.2], [1201.1, 4100.3], [1205.3, 4103.5], [1206.6, 4100.8], [1204.2, 4100.2], [1201.5, 4098.7], [1197.9, 4095.7], [1194.8, 4093.5], [1191.4, 4092.4], [1187.8, 4092.1]]],
  [1214199413, 'lawn', [[1177.0, 4091.3], [1178.4, 4087.7], [1175.6, 4086.3], [1172.1, 4085.2], [1169.9, 4084.6], [1169.5, 4085.5], [1171.3, 4086.4], [1174.5, 4089.0]]],
];
// AR34 b4: the park's seawalls where the compiled city has none or a broken one, each a line along the compiled land ring
// (data/raw/boundaries.geojson, Queens), the land on its right hand going along it (x east, z south):
// * 'riverwalk', in front of the sign: ring vertices 10434 and 10435 and 150 m of the edge to 10436 (1153.2, 3867.0), where the
// ferry landing's pier begins. The compiled city built no bulkhead here (its offset face reached that pier) and its 16 m
// terrain grid stepped the river's edge into stairs with sloping walls (QA Q31, w2r1/qh_airSign_day.jpg).
// hpt_w2_sign_front (2024-10) shows a straight seawall, a timber boardwalk with a railing along it and a wider deck at its
// south corner; the widths (6.5 m, 12.3 m to vertex 10434) are read off that oblique, NOT measured.
// * 'walkway', the curved walkway south of the gantries' slip: ring vertices 10331-10344 (10332, a 5 m notch, left out). The
// compiled bulkhead's faces stood loose in the water there over ground graded to y 0.9-1.7.
// a railing over the water; its width (6 m) NOT measured.
export const SHORE_EDGES = [
  { name: 'riverwalk', line: [[1086.7, 4004.3], [1074.4, 4001.0], [1150.44, 3871.70]], W: 6.5 },
  { name: 'walkway', line: [[961.6, 4305.7], [984.2, 4305.8], [997.3, 4309.2], [1003.1, 4309.2], [1008.6, 4310.8], [1010.1, 4309.0],
    [1014.8, 4304.5], [1019.9, 4300.4], [1025.5, 4296.9], [1033.0, 4294.7], [1040.6, 4293.0], [1043.6, 4288.7], [1047.3, 4283.5]], W: 6.0,
    // the ring's other side is water west of x 995: the
    // walkway is a strip with a railing on each side, so the ground is lifted only under it (lift) and the river south of it stays
    lift: 6.6, rail2: true },
  // 'north': the park's edge from the gantries' slip to the riverwalk (ring vertices 10387-10434), where the compiled bulkhead's
  // faces stood 3.4 m out in the water, detached from ground graded down behind them (QA Q31, w2r1/qh_airPark_day.jpg). The edge's
  // kind is NOT verified against imagery: a concrete coping strip (W, no boards) on the wall, the wall 1.6 m out from the line
  // (out) so the grid's crossing stays behind it with the land nodes at the park's level (band: false), and the railing.
  { name: 'north', W: 1.2, out: 1.6, band: false, deck: false, line: [[1060.2, 4233.3], [1071.0, 4235.5], [1072.3, 4229.9], [1072.9, 4227.4],
    [1074.5, 4220.9], [1060.0, 4217.5], [1060.0, 4215.5], [1050.5, 4212.4], [1016.5, 4201.7], [1014.1, 4201.6], [1011.6, 4201.1], [1009.3, 4200.2],
    [1007.2, 4199.1], [1005.2, 4197.6], [1003.5, 4195.8], [1002.1, 4193.8], [1000.5, 4190.0], [999.6, 4186.0], [999.4, 4181.8], [999.9, 4177.7],
    [1001.0, 4173.7], [1002.8, 4170.0], [1005.2, 4166.7], [1007.8, 4162.4], [1011.0, 4158.6], [1014.7, 4155.3], [1018.8, 4152.5], [1023.3, 4150.4],
    [1031.1, 4148.0], [1043.0, 4150.4], [1058.6, 4153.1], [1065.1, 4152.5], [1070.3, 4149.1], [1069.7, 4146.6], [1068.8, 4144.1], [1067.4, 4141.9],
    [1065.8, 4139.9], [1062.1, 4134.6], [1016.2, 4122.9], [1047.0, 4061.1], [1051.9, 4051.2], [1056.6, 4051.6], [1064.0, 4039.5], [1071.9, 4029.9],
    [1078.3, 4024.4], [1079.1, 4021.0], [1082.5, 4014.8], [1086.7, 4004.3]] },
];
// the riverwalk's wider deck at its south corner: vertices 10435 and 10434, then 12.3 m in from the edge 30 m along it, tapering
// to the boardwalk's 6.5 m at 38 m
export const SHORE_PLATFORMS = [[[1074.4, 4001.0], [1086.7, 4004.3], [1100.21, 3981.37], [1099.26, 3971.54], [1093.66, 3968.24]]];
