// Pawns drawn as SVG (the scanned ones had a chewed hem): bell body + sphere head, shaded per player colour.
const fs=require('fs');const OUT='apps/web/public/art/';
const C={red:['#ff6a55','#d6281c','#7a0f0a'],blue:['#6fb4ff','#1f6fd6','#0b3470'],orange:['#ffb04d','#f07c0a','#8f4300'],white:['#ffffff','#e4dccb','#9a917f'],green:['#6fe07a','#22a53a','#0b5a1a'],purple:['#c493ff','#8a4fc7','#4a1f7a']};
for(const[n,[l,m,d]]of Object.entries(C)){
fs.writeFileSync(OUT+`pawn-${n}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 92">
<defs><radialGradient id="b" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="${l}"/><stop offset=".55" stop-color="${m}"/><stop offset="1" stop-color="${d}"/></radialGradient>
<radialGradient id="h" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${l}"/><stop offset=".5" stop-color="${m}"/><stop offset="1" stop-color="${d}"/></radialGradient></defs>
<ellipse cx="30" cy="86" rx="27" ry="5" fill="#2b1a0a" opacity=".28"/>
<path d="M21 33C10 46 4 68 5 82Q11 89 19 85Q30 91 41 85Q49 89 55 82C56 68 50 46 39 33Q30 37 21 33Z" fill="url(#b)" stroke="${d}" stroke-width="1.2" stroke-linejoin="round"/>
<path d="M17 50C13 62 11 72 12 80" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>
<circle cx="30" cy="19" r="15" fill="url(#h)" stroke="${d}" stroke-width="1.2"/>
<ellipse cx="24.5" cy="13" rx="5" ry="3.4" fill="#fff" opacity=".55" transform="rotate(-30 24.5 13)"/></svg>`)}
