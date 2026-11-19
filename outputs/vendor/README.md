Bundled static geometry dependencies (no runtime network request):

- Earcut 2.2.4: https://github.com/mapbox/earcut/tree/v2.2.4 — ISC, see earcut-LICENSE. The minified UMD is wrapped in installEarcut() so the same source can initialize a local blob worker without file:// importScripts restrictions.
- polygon-clipping 0.15.7: https://github.com/mfogel/polygon-clipping/tree/v0.15.7 — MIT, see polygon-clipping-LICENSE.md. Used to clip pocket polygons at tile seams.

Local fonts in ../fonts use their adjacent SIL Open Font License files.
