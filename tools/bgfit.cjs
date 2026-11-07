// Foreground extraction by fitting a smooth quadratic background to the crop border.
const {crop,PNG}=require('./lib.cjs');
function solve(A,b){const n=b.length;for(let i=0;i<n;i++){let p=i;for(let r=i+1;r<n;r++)if(Math.abs(A[r][i])>Math.abs(A[p][i]))p=r;[A[i],A[p]]=[A[p],A[i]];[b[i],b[p]]=[b[p],b[i]];for(let r=i+1;r<n;r++){const f=A[r][i]/A[i][i];for(let c=i;c<n;c++)A[r][c]-=f*A[i][c];b[r]-=f*b[i]}}
 const x=Array(n).fill(0);for(let i=n-1;i>=0;i--){let s=b[i];for(let c=i+1;c<n;c++)s-=A[i][c]*x[c];x[i]=s/A[i][i]}return x}
const feat=(u,v)=>[1,u,v,u*u,u*v,v*v,u*u*u,u*u*v,u*v*v,v*v*v];
function extract(x,y,w,h,{ring=3,t0=14,t1=34,iters=3}={}){
 const o=crop(x,y,w,h,()=>1);const d=o.data;let inl=new Uint8Array(w*h);
 for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(i<ring||j<ring||i>=w-ring||j>=h-ring)inl[j*w+i]=1;
 let coef;
 for(let it=0;it<iters;it++){coef=[];
  for(let c=0;c<3;c++){const n=10,A=Array.from({length:n},()=>Array(n).fill(0)),b=Array(n).fill(0);
   for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(inl[j*w+i]){const f=feat(i/w,j/h),v=d[(j*w+i)*4+c];for(let r=0;r<n;r++){b[r]+=f[r]*v;for(let q=0;q<n;q++)A[r][q]+=f[r]*f[q]}}
   for(let r=0;r<n;r++)A[r][r]+=1e-6;coef.push(solve(A,b))}
  const dist=new Float32Array(w*h);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const f=feat(i/w,j/h);let s=0;for(let c=0;c<3;c++){let m=0;for(let r=0;r<10;r++)m+=coef[c][r]*f[r];const e=d[(j*w+i)*4+c]-m;s+=e*e}dist[j*w+i]=Math.sqrt(s)}
  // next inliers: low distance
  inl=new Uint8Array(w*h);for(let k=0;k<w*h;k++)inl[k]=dist[k]<t0?1:0;
  if(it===iters-1){
   // mask: smoothstep, keep components touching a strong core, fill holes
   const fg=new Uint8Array(w*h);for(let k=0;k<w*h;k++)fg[k]=dist[k]>t0?1:0;
   // flood outside from border over non-fg to find holes
   const out=new Uint8Array(w*h),st=[];
   for(let j=0;j<h;j++)for(let i=0;i<w;i++)if((i==0||j==0||i==w-1||j==h-1)&&!fg[j*w+i]){out[j*w+i]=1;st.push(j*w+i)}
   while(st.length){const k=st.pop(),i=k%w,j=(k/w)|0;for(const [a,bb] of [[1,0],[-1,0],[0,1],[0,-1]]){const ni=i+a,nj=j+bb;if(ni<0||nj<0||ni>=w||nj>=h)continue;const nk=nj*w+ni;if(!out[nk]&&!fg[nk]){out[nk]=1;st.push(nk)}}}
   for(let k=0;k<w*h;k++){const s=Math.min(1,Math.max(0,(dist[k]-t0)/(t1-t0)));d[k*4+3]=out[k]?Math.round(255*s):255}
  }}
 return o}
module.exports={extract};
if(require.main===module){const [x,y,w,h,out,t0,t1]=process.argv.slice(2);require('./lib.cjs').save(out,extract(+x,+y,+w,+h,{t0:+(t0||14),t1:+(t1||34)}))}
/** keep only the largest connected opaque blob (drops stray background fragments) */
module.exports.largest=function(o){const {width:w,height:h,data:d}=o;const lab=new Int32Array(w*h),sz=[0];let n=0;
 for(let s=0;s<w*h;s++){if(lab[s]||d[s*4+3]<60)continue;n++;let c=0;const st=[s];lab[s]=n;while(st.length){const k=st.pop();c++;const i=k%w,j=(k/w)|0;for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){const ni=i+a,nj=j+b;if(ni<0||nj<0||ni>=w||nj>=h)continue;const nk=nj*w+ni;if(!lab[nk]&&d[nk*4+3]>=60){lab[nk]=n;st.push(nk)}}}sz.push(c)}
 let best=1;for(let i=1;i<=n;i++)if(sz[i]>sz[best])best=i;
 for(let k=0;k<w*h;k++)if(lab[k]!==best)d[k*4+3]=0;return o};
