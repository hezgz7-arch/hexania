const {crop,save,PNG}=require('./lib.cjs');
// montage of raw hex crops
const xs=[93,243,391,535,676,819,961];
const W=160,H=172;const m=new PNG({width:W*7,height:H});
xs.forEach((cx,k)=>{const c=crop(cx-80,4,W,H);PNG.bitblt(c,m,0,0,W,H,k*W,0)});
save(process.argv[2],m);
