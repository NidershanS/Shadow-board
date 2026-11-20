/* A uniform periodic cubic B-spline. Each closed ring has C² continuity
   even at the wraparound; STL uses a bounded chord approximation. */
function createCutCurve(controls, tolerance = .02) {
  const blend = (a,b,c) => ({x:(a.x+4*b.x+c.x)/6,y:(a.y+4*b.y+c.y)/6});
  const mix = (a,b,t=.5) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const distanceToChord = (p,a,b) => {
    const dx=b.x-a.x, dy=b.y-a.y, square=dx*dx+dy*dy;
    const t=square ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/square)) : 0;
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  };
  const spans = controls.map((a,i) => {
    const b=controls[(i+1)%controls.length], c=controls[(i+2)%controls.length];
    const d=controls[(i+3)%controls.length];
    return [blend(a,b,c),mix(b,c,1/3),mix(b,c,2/3),blend(b,c,d)];
  });
  const points = [spans[0][0]];
  function flatten(a,b,c,d) {
    if (Math.max(distanceToChord(b,a,d),distanceToChord(c,a,d))<=tolerance) {
      points.push(d);
      return;
    }
    const ab=mix(a,b), bc=mix(b,c), cd=mix(c,d);
    const left=mix(ab,bc), right=mix(bc,cd), center=mix(left,right);
    flatten(a,ab,left,center);
    flatten(center,right,cd,d);
  }
  spans.forEach(s=>flatten(...s));
  return {controls,spans,points};
}
