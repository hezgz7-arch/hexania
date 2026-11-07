// Re-tint the orange and white castles: orange roofs darker (contrast with the tan walls), white roofs without red speckles.
const fs=require('fs');const {PNG,save}=require('./lib.cjs');const {COL,tint}=require('./tint.cjs');
const OUT='apps/web/public/art/';const red=PNG.sync.read(fs.readFileSync(OUT+'city-red.png'));
COL.orange={h:22,s:1,l:-0.09};
for(const c of['orange','white']){const o=tint(red,c,{all:false,minS:0.22});fs.writeFileSync(OUT+`city-${c}.png`,PNG.sync.write(o))}
