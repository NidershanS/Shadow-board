function createInvertedShellGeometry() {
  const units = 100000;
  const C = ClipperLib;
  const rectangle = (x0, y0, x1, y1) => [
    {x:x0,y:y0}, {x:x1,y:y0}, {x:x1,y:y1}, {x:x0,y:y1}
  ];
  const mm = p => ({x:p.X / units, y:p.Y / units});
  function path(points) {
    const ring = points.map(p => ({X:Math.round(p.x * units), Y:Math.round(p.y * units)}));
    return C.Clipper.Orientation(ring) ? ring : ring.reverse();
  }
  function boolean(kind, subject, clip = []) {
    if (!subject.length) return [];
    const engine = new C.Clipper();
    engine.AddPaths(subject, C.PolyType.ptSubject, true);
    if (clip.length) engine.AddPaths(clip, C.PolyType.ptClip, true);
    const tree = new C.PolyTree();
    engine.Execute(kind, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    return C.JS.PolyTreeToExPolygons(tree).map(p => [p.outer, ...p.holes]);
  }
  const union = paths => boolean(C.ClipType.ctUnion, paths).flat();
  const minus = (a,b) => boolean(C.ClipType.ctDifference, a,b).flat();
  const intersect = (a,b) => boolean(C.ClipType.ctIntersection, a,b).flat();
  const area = paths => paths.reduce((sum,p) => sum+C.Clipper.Area(p),0) / units**2;
  function offset(paths, delta) {
    const offsetter = new C.ClipperOffset(2, 0.03 * units);
    offsetter.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
    const out = new C.Paths();
    offsetter.Execute(out, delta * units);
    return C.Clipper.CleanPolygons(out, .018 * units).filter(p => p.length >= 3);
  }
  function dimensions(settings, ent = {}) {
    const height = Number(settings.thickness) || 18;
    const plate = Number(settings.plate) || 2.5;
    const floor = Number(settings.floor) || 1.6;
    const depth = Math.min(height - floor, Math.max(plate, Number(ent.depth) || 15));
    return {height, plate, floor, depth};
  }
  function opening(points, anchors, radius) {
    const circles = anchors.map(center => path(Array.from({length:48}, (_,i) => {
      const theta = i * Math.PI / 24;
      return {x:center.x + radius*Math.cos(theta), y:center.y + radius*Math.sin(theta)};
    })));
    const polygons = boolean(C.ClipType.ctUnion,[path(points), ...circles]);
    if (polygons.length !== 1) return points;
    const ring = C.Clipper.CleanPolygon(polygons[0][0], .025 * units).map(mm);
    return [...ring, ring[0]];
  }

  function build(entities, drawer, settings) {
    const {height, plate, floor} = dimensions(settings);
    if (height <= plate + floor) throw Error("Board height must exceed the plate and floor thicknesses combined.");
    const outline = [path(settings.outline || rectangle(0,0,drawer.w,drawer.h))];
    const wall = Number(settings.wall) || 2;
    const rim = minus(outline,offset(outline,-wall));
    const pockets = entities.map(ent => {
      const loop = C.Clipper.CleanPolygon(path(ent.points), .015 * units);
      const enlarged = offset([loop],Number(settings.pocketWall) || 1.6);
      const supported = intersect(enlarged,outline);
      return {loop, supported, depth: dimensions(settings,ent).depth};
    });
    const voids = pockets.map(p => p.loop);
    const sumOpeningArea = voids.reduce((sum, loop) => sum + area([loop]), 0);
    if (sumOpeningArea - area(union(voids)) > .001 ||
        sumOpeningArea - area(intersect(voids,outline)) > .001) {
      throw Error("Print openings overlap or leave the board. Reduce the notch radius or turn off notches.");
    }

    const ribWidth = Number(settings.ribWidth) || 1.2;
    const spacing = Number(settings.ribSpacing) || 80;
    const ox = settings.ribOrigin?.x || 0;
    const oy = settings.ribOrigin?.y || 0;
    const ribPaths = [];
    if (settings.ribs !== false) {
      for (let x = Math.ceil(ox / spacing)*spacing-ox; x < drawer.w; x+=spacing) {
        if(x+ox > 0) ribPaths.push(path(rectangle(x-ribWidth/2,-1,x+ribWidth/2,drawer.h+1)));
      }
      for (let y = Math.ceil(oy / spacing)*spacing-oy; y < drawer.h; y+=spacing) {
        if(y+oy > 0) ribPaths.push(path(rectangle(-1,y-ribWidth/2,drawer.w+1,y+ribWidth/2)));
      }
    }
    const keepouts = union(pockets.flatMap(p => p.supported));
    const ribs = minus(intersect(union(ribPaths),outline),offset(keepouts,-.025));
    const keys = intersect(union((settings.keyPads || []).map(p => path(rectangle(...p)))),outline);
    const skeleton = union([...rim,...ribs,...keys]);
    // Put tile markings on the underside of the plate between structural walls.
    const originalLabels = settings.labelLoops || [];
    let labels = [];
    if (originalLabels.length) {
      const vacant = minus(outline,union([...skeleton,...keepouts]));
      const labelPoints = originalLabels.flat();
      const minX = Math.min(...labelPoints.map(p=>p.x));
      const minY = Math.min(...labelPoints.map(p=>p.y));
      for (let y=4;y<drawer.h && !labels.length;y+=8) {
        for (let x=4;x<drawer.w && !labels.length;x+=8) {
          const candidate = originalLabels.map(loop => path(loop.map(p=>({x:p.x-minX+x,y:p.y-minY+y}))));
          if (area(minus(candidate,vacant)) < 1e-8) labels = candidate;
        }
      }
    }
    const labelEnd = Math.min(height,plate+.6);
    const levels = [...new Set([plate,height,...(labels.length?[labelEnd]:[]),...pockets.map(p=>Math.min(height,p.depth+floor))])].sort((a,b)=>a-b);
    const triangles = [];
    function face(paths, z, upward) {
      for (const [outer,...holes] of boolean(C.ClipType.ctUnion, paths)) {
        for (const tri of triangulatePolygonWithHoles(outer.map(mm),holes.map(h=>h.map(mm)))) {
          const t = tri.map(p=>({...p,z}));
          triangles.push(upward ? t : [t[0],t[2],t[1]]);
        }
      }
    }
    function walls(paths, low, high, interior = false) {
      for (const loop of paths) {
        for (let i=0;i<loop.length;i++) {
          const a=mm(loop[i]), b=mm(loop[(i+1)%loop.length]);
          const quad=[{...a,z:low},{...b,z:low},{...b,z:high},{...a,z:high}];
          if (interior) quad.reverse();
          addStlQuad(triangles,...quad);
        }
      }
    }
    face(minus(outline,voids),0,false);
    walls(outline,0,plate);

    for (let i=0;i<levels.length;i++) {
      const low=levels[i], high=levels[i+1];
      const above=high===undefined ? [] : union([
        ...skeleton,
        ...pockets.filter(p=>p.depth+floor>low+1e-7).flatMap(p=>p.supported),
        ...(low<labelEnd ? labels : [])
      ]);
      const ended = low === plate ? outline : union([
        ...(low === height ? skeleton : []),
        ...pockets.filter(p=>Math.min(height,p.depth+floor)===low).flatMap(p=>p.supported),
        ...(low===labelEnd ? labels : [])
      ]);
      face(minus(ended,above),low,true);
      if (high!==undefined) walls(above,low,high);

    }

    for (const pocket of pockets) {
      const {loop, depth} = pocket;
      let bevel = Math.min(Number(settings.floorBevel ?? .8),depth/2);
      let inset = bevel > 0 ? offset([loop],-bevel) : [];
      while (bevel > .04 && (!inset.length || area(inset) < area([loop]) * .12)) {
        bevel /= 2;
        inset = offset([loop],-bevel);
      }
      if (!inset.length) bevel = 0;
      if (!bevel) {
        walls([loop],0,depth,true);
        face([loop],depth,false);
        continue;
      }
      walls([loop],0,depth-bevel,true);
      const outer = loop.map(mm);
      const holes = inset.filter(C.Clipper.Orientation).map(ring=>ring.map(mm));
      const inside = new Set(holes.flat());
      for (const [a,b,c] of triangulatePolygonWithHoles(outer,holes)) {
        triangles.push([a,c,b].map(p=>({...p,z:inside.has(p)?depth:depth-bevel})));
      }
      face(inset,depth,false);
    }
    return {triangles, outline, voids, labeled: labels.length, labelDropped: originalLabels.length>0 && !labels.length};
  }
  return {build, dimensions, opening, boolean, path, area, minus, intersect, union, mm};
}
