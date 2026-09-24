#!/bin/sh
# Batch 100STYLE -> CARLA GEN2 retargets (tools/assets/retarget_bvh.mjs). BVHs fetched with remotezip.mjs into ~/.tools/100style.
# Wrists are 75 % CARLA's relaxed hand (retarget_bvh.mjs WRIST_RELAX) except where the hand does something: phones at the ear,
# folded arms, akimbo, hands behind the back or in pockets keep more of the mocap wrist.
D=${ASSET_TOOLS:-$HOME/.tools}/100style
R() { node retarget_bvh.mjs "$D/100STYLE__$1__$1_$2.bvh" "S100_$3" "$4" $5 2>&1 | tail -1; }
for st in Neutral Proud OnPhoneLeft OnPhoneRight HandsInPockets Heavyset Depressed ArmsBehindBack LookUp CrowdAvoidance Strutting PendulumHands BigSteps Elated ArmsFolded Akimbo; do
  lc=$(echo $st | tr 'A-Z' 'a-z')
  case $st in OnPhone*|ArmsFolded|Akimbo|ArmsBehindBack|HandsInPockets) W="--wristrelax 0.25";; *) W="";; esac
  R $st FW ${lc}_walk walk "--speed 1.3 --headup 10 $W"
  R $st ID ${lc}_idle idle "--seconds 8 $W"
done
R Rushed FW rushed_walk walk "--speed 1.8 --headup 10"
R Rushed ID rushed_idle idle "--seconds 6"
R Old FW old_walk walk "--speed 0.9 --headup 6"
R Old ID old_idle idle "--seconds 8"
R Neutral FW neutral_walk_fast walk "--speed 1.6 --headup 10"
R Neutral FW neutral_walk_slow walk "--speed 1.0 --headup 10"
