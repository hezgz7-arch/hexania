const {crop,save}=require('./lib.cjs');const [x,y,w,h,o]=process.argv.slice(2);save(o,crop(+x,+y,+w,+h));
