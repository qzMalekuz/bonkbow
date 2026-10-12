// Exports the props of the three environment packs behind the paid maps to
// assets/licensed/maps/<map>.json (+ textures) for three.js. Gitignored:
// the Asset Store EULA lets the app ship them, not this public repo.
//
// One JSON per map: { mats: [{ tex, color }], props: { key: { parts, min, max } } }.
//   - "bake" packs (flat-colour low poly: Sky Den, HobiSoLoved) sample their
//     palette texture at each triangle's centre into one colour per face, so
//     the whole map draws as one vertex-coloured mesh: part = { p, c }, with p
//     non-indexed (3 vertices per face) and c one 0xRRGGBB (sRGB) per face.
//   - "tex" packs (painted textures: Supercyan) keep UVs and get their
//     textures downscaled to 512 px JPGs: part = { mat, p, n, uv, i }.
// Positions are millimetres (ints), normals ×1000, UVs ×10000.
// Unity is left-handed, three.js right-handed: X is mirrored and triangle
// winding reversed (same convention as export-stickman.cs).
//
// Run in a live Editor with the three packs imported (docs/ASSETS.md):
//   unity command eval -- --code "$(cat scripts/unity/export-environments.cs)" --timeout 300000
var outDir = System.Environment.GetFolderPath(System.Environment.SpecialFolder.UserProfile) + "/Developer/bonkbow/assets/licensed/maps/";
System.IO.Directory.CreateDirectory(outDir);
var ci = System.Globalization.CultureInfo.InvariantCulture;
var log = new System.Text.StringBuilder();

// map id, mode, model paths (key = file name without extension)
var packs = new (string id, bool bake, string[] paths)[] {
  ("grove", false, new[] {
    "Assets/Supercyan Free Forest Sample/Prefabs/Mobile/Tree/Fir/Mobile_forestpack_tree_fir_tall.prefab",
    "Assets/Supercyan Free Forest Sample/Prefabs/Mobile/Tree/Leaf/Normal/Mobile_forestpack_tree_1_leaf_1.prefab",
    "Assets/Supercyan Free Forest Sample/Prefabs/Mobile/Tree/Treestump/Mobile_forestpack_tree_stump_1.prefab",
    "Assets/Supercyan Free Forest Sample/Prefabs/Mobile/Stone/Mobile_forestpack_stone_large_1.prefab",
    "Assets/Supercyan Free Forest Sample/Prefabs/Mobile/Stone/Mobile_forestpack_stone_medium_1.prefab",
    "Assets/Supercyan Free Forest Sample/Prefabs/Mobile/Foliage/Grass/Mobile_forestpack_foliage_grassPatch_small_1.prefab",
    "Assets/Supercyan Free Forest Sample/Prefabs/Mobile/Foliage/Grass/Mobile_forestpack_foliage_grassPatch_small_2.prefab",
    "Assets/Supercyan Free Forest Sample/Prefabs/Mobile/Foliage/Mushroom/Mobile_forestpack_foliage_mushroom_blue_big.prefab",
    "Assets/Supercyan Free Forest Sample/Prefabs/Mobile/Foliage/Mushroom/Mobile_forestpack_foliage_mushroom_red_small.prefab",
    "Assets/Supercyan Free Forest Sample/Prefabs/Mobile/Sign/Mobile_forestpack_roadSign_westEast_1.prefab",
  }),
  ("valley", true, new[] {
    "Tree 1 ", "Tree 2 ", "Rock 1 ", "Rock 2 ", "Rock 3 ", "Rock 4 ", "Cliff 4", "Cliff 5", "Cliff 6", "Cliff 7",
    "Mountain 1", "Mountain 2 ", "House 1 ", "House 2 ", "House 4 ", "House 5 ", "Mill ", "Fence01", "Fence04",
    "Watch Tower ", "Water Well", "Tent 2 ", "Cart01", "Basket01", "Doghouse",
  }),
  ("snow", true, new[] {
    "Pine1", "Pine2", "Pine3", "Pine4", "Pine5", "Tree1", "Tree2", "DeadTree", "Cottage1", "Cottage2", "Cottage3",
    "Fence_1", "Fence_2", "Snowman", "Well", "Sign1", "Sign2", "Stump1", "Stump2", "Snow1", "Snow2", "Snow3",
    "Snow4", "Snow5", "Cloud1", "Cloud2", "Cloud3", "Cloud4", "Cloud5", "Wall1", "Wall3",
  }),
};
string Resolve(string id, string p) =>
  id == "valley" ? "Assets/Skyden_Games/Low Poly Environment/Prefabs/" + p + ".prefab"
  : id == "snow" ? "Assets/HobiSoloved/FBX/" + p + ".fbx" : p;

// Readable copy of a texture, decoded from its source file.
var texCache = new System.Collections.Generic.Dictionary<UnityEngine.Texture, UnityEngine.Texture2D>();
UnityEngine.Texture2D Readable(UnityEngine.Texture t) {
  if (texCache.TryGetValue(t, out var r)) return r;
  var path = UnityEditor.AssetDatabase.GetAssetPath(t);
  r = new UnityEngine.Texture2D(2, 2, UnityEngine.TextureFormat.RGBA32, false, false);
  r.LoadImage(System.IO.File.ReadAllBytes(path));
  r.wrapMode = UnityEngine.TextureWrapMode.Repeat;
  texCache[t] = r;
  return r;
}
// Downscaled sRGB JPG of a texture for the "tex" packs.
void WriteJpg(UnityEngine.Texture t, string file, int size) {
  var src = Readable(t);
  var rt = UnityEngine.RenderTexture.GetTemporary(size, size, 0, UnityEngine.RenderTextureFormat.ARGB32, UnityEngine.RenderTextureReadWrite.sRGB);
  UnityEngine.Graphics.Blit(src, rt);
  var prev = UnityEngine.RenderTexture.active;
  UnityEngine.RenderTexture.active = rt;
  var o = new UnityEngine.Texture2D(size, size, UnityEngine.TextureFormat.RGB24, false, false);
  o.ReadPixels(new UnityEngine.Rect(0, 0, size, size), 0, 0);
  o.Apply();
  UnityEngine.RenderTexture.active = prev;
  UnityEngine.RenderTexture.ReleaseTemporary(rt);
  System.IO.File.WriteAllBytes(outDir + file, o.EncodeToJPG(85));
}
UnityEngine.Color Tint(UnityEngine.Material m) =>
  m.HasProperty("_BaseColor") ? m.GetColor("_BaseColor") : m.HasProperty("_Color") ? m.color : UnityEngine.Color.white;

foreach (var pack in packs) {
  var sb = new System.Text.StringBuilder();
  var mats = new System.Collections.Generic.List<UnityEngine.Material>();
  sb.Append("{\"props\":{");
  int propN = 0, triTotal = 0;
  foreach (var rel in pack.paths) {
    var path = Resolve(pack.id, rel);
    var go = UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.GameObject>(path);
    if (go == null) { log.AppendLine("missing " + path); continue; }
    var key = System.IO.Path.GetFileNameWithoutExtension(path).Trim().Replace("Mobile_forestpack_", "").Replace(" ", "").ToLowerInvariant();
    var rootShift = UnityEngine.Matrix4x4.Translate(-go.transform.position);
    var mn = new UnityEngine.Vector3(1e9f, 1e9f, 1e9f); var mx = -mn;
    var parts = new System.Collections.Generic.List<string>();
    var renderers = go.GetComponentsInChildren<UnityEngine.Renderer>(true);
    foreach (var r in renderers) {
      UnityEngine.Mesh mesh = r is UnityEngine.SkinnedMeshRenderer smr ? smr.sharedMesh : r.GetComponent<UnityEngine.MeshFilter>()?.sharedMesh;
      if (mesh == null || r is UnityEngine.ParticleSystemRenderer) continue;
      // Skinned meshes: vertices are in the renderer's space at bind pose.
      var M = rootShift * r.transform.localToWorldMatrix;
      var v = mesh.vertices; var n = mesh.normals; var uv = mesh.uv;
      var wv = new UnityEngine.Vector3[v.Length];
      for (int i = 0; i < v.Length; i++) { wv[i] = M.MultiplyPoint3x4(v[i]); mn = UnityEngine.Vector3.Min(mn, wv[i]); mx = UnityEngine.Vector3.Max(mx, wv[i]); }
      for (int s = 0; s < mesh.subMeshCount; s++) {
        var mat = r.sharedMaterials[System.Math.Min(s, r.sharedMaterials.Length - 1)];
        var tris = mesh.GetTriangles(s);
        triTotal += tris.Length / 3;
        var p = new System.Text.StringBuilder();
        if (pack.bake) {
          var tex = mat && mat.mainTexture ? Readable(mat.mainTexture) : null;
          var st = mat && mat.HasProperty("_MainTex") ? mat.GetVector("_MainTex_ST") : new UnityEngine.Vector4(1, 1, 0, 0);
          var tint = mat ? Tint(mat) : UnityEngine.Color.white;
          var c = new System.Text.StringBuilder();
          for (int t = 0; t < tris.Length; t += 3) {
            foreach (var k in new[] { tris[t], tris[t + 2], tris[t + 1] }) {
              var q = wv[k];
              p.Append(p.Length > 0 ? "," : "").Append(UnityEngine.Mathf.RoundToInt(-q.x * 1000)).Append(',').Append(UnityEngine.Mathf.RoundToInt(q.y * 1000)).Append(',').Append(UnityEngine.Mathf.RoundToInt(q.z * 1000));
            }
            var col = tint;
            if (tex != null && uv.Length == v.Length) {
              var u = (uv[tris[t]] + uv[tris[t + 1]] + uv[tris[t + 2]]) / 3f;
              col *= tex.GetPixelBilinear(u.x * st.x + st.z, u.y * st.y + st.w);
            }
            var c32 = (UnityEngine.Color32)col;
            c.Append(c.Length > 0 ? "," : "").Append((c32.r << 16) | (c32.g << 8) | c32.b);
          }
          parts.Add("{\"p\":[" + p + "],\"c\":[" + c + "]}");
        } else {
          int mi = mats.IndexOf(mat); if (mi < 0) { mats.Add(mat); mi = mats.Count - 1; }
          // Only the vertices this submesh uses, re-indexed.
          var map = new System.Collections.Generic.Dictionary<int, int>();
          var nn = new System.Text.StringBuilder(); var uu = new System.Text.StringBuilder(); var ii = new System.Text.StringBuilder();
          int Use(int k) {
            if (map.TryGetValue(k, out var j)) return j;
            j = map.Count; map[k] = j;
            var q = wv[k]; var nr = M.MultiplyVector(n[k]).normalized;
            p.Append(j > 0 ? "," : "").Append(UnityEngine.Mathf.RoundToInt(-q.x * 1000)).Append(',').Append(UnityEngine.Mathf.RoundToInt(q.y * 1000)).Append(',').Append(UnityEngine.Mathf.RoundToInt(q.z * 1000));
            nn.Append(j > 0 ? "," : "").Append(UnityEngine.Mathf.RoundToInt(-nr.x * 1000)).Append(',').Append(UnityEngine.Mathf.RoundToInt(nr.y * 1000)).Append(',').Append(UnityEngine.Mathf.RoundToInt(nr.z * 1000));
            uu.Append(j > 0 ? "," : "").Append(UnityEngine.Mathf.RoundToInt(uv[k].x * 10000)).Append(',').Append(UnityEngine.Mathf.RoundToInt(uv[k].y * 10000));
            return j;
          }
          for (int t = 0; t < tris.Length; t += 3) {
            ii.Append(t > 0 ? "," : "").Append(Use(tris[t])).Append(',').Append(Use(tris[t + 2])).Append(',').Append(Use(tris[t + 1]));
          }
          parts.Add("{\"mat\":" + mi + ",\"p\":[" + p + "],\"n\":[" + nn + "],\"uv\":[" + uu + "],\"i\":[" + ii + "]}");
        }
      }
    }
    if (parts.Count == 0) { log.AppendLine("no mesh " + path); continue; }
    string V(UnityEngine.Vector3 a) => "[" + (-a.x).ToString("0.###", ci) + "," + a.y.ToString("0.###", ci) + "," + a.z.ToString("0.###", ci) + "]";
    // Mirrored X swaps which side is min/max.
    var lo = new UnityEngine.Vector3(mx.x, mn.y, mn.z); var hi = new UnityEngine.Vector3(mn.x, mx.y, mx.z);
    sb.Append(propN++ > 0 ? "," : "").Append("\"" + key + "\":{\"min\":" + V(lo) + ",\"max\":" + V(hi) + ",\"parts\":[" + string.Join(",", parts) + "]}");
    log.AppendLine(pack.id + "/" + key + " size " + (mx - mn).ToString("F1"));
  }
  sb.Append("},\"mats\":[");
  for (int m = 0; m < mats.Count; m++) {
    var mat = mats[m];
    string file = null;
    if (mat.mainTexture) { file = pack.id + "_" + mat.mainTexture.name.Replace("forestpack_", "").Replace("_diffuse", "") + ".jpg"; WriteJpg(mat.mainTexture, file, 512); }
    sb.Append(m > 0 ? "," : "").Append("{\"tex\":" + (file == null ? "null" : "\"" + file + "\"") + ",\"color\":\"#" + UnityEngine.ColorUtility.ToHtmlStringRGB(Tint(mat)) + "\"}");
  }
  sb.Append("]}");
  System.IO.File.WriteAllText(outDir + pack.id + ".json", sb.ToString());
  log.AppendLine(pack.id + ": " + propN + " props, " + triTotal + " triangles, " + mats.Count + " textured materials");
}
// Ground textures for the forest map (tiled across the field).
foreach (var g in new[] { "moss_light_tile", "road_tile" }) {
  var t = UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.Texture2D>("Assets/Supercyan Free Forest Sample/Textures/Ground/forestpack_" + g + "_diffuse.png");
  if (t) WriteJpg(t, "grove_" + g.Replace("_tile", "") + ".jpg", 512);
}
return log.ToString();
