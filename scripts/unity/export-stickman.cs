// Exports the Free Pack - Stick Man model for the Bonk Bow three.js rig.
// Unity is left-handed; three.js is right-handed: mirror X on everything
// (positions/normals x → -x, quaternions (x, -y, -z, w), bind matrices S·M·S,
// triangle winding reversed).
UnityEngine.Application.runInBackground = true;
var root = "Assets/PolyOne/Free Stickman/";
var src = UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.GameObject>(root + "Model/Free Pack - Stick Man.fbx");
var go = (UnityEngine.GameObject)UnityEngine.Object.Instantiate(src);
go.name = "StickmanExport";
var smr = go.GetComponentInChildren<UnityEngine.SkinnedMeshRenderer>();
var mesh = smr.sharedMesh;
var ci = System.Globalization.CultureInfo.InvariantCulture;
System.Func<float, string> F = v => System.Math.Round(v, 5).ToString("0.#####", ci);
var sb = new System.Text.StringBuilder();

// Bones in depth-first order (parents first), from the skeleton root.
var bones = new System.Collections.Generic.List<UnityEngine.Transform>();
System.Action<UnityEngine.Transform> dfs = null;
dfs = t => { bones.Add(t); foreach (UnityEngine.Transform c in t) dfs(c); };
dfs(smr.rootBone);
var index = new System.Collections.Generic.Dictionary<UnityEngine.Transform, int>();
for (int i = 0; i < bones.Count; i++) index[bones[i]] = i;

sb.Append("{\"source\":\"Free Pack - Stick Man (PolyOne Studio), Unity Asset Store EULA\",\"bones\":[");
for (int i = 0; i < bones.Count; i++) {
  var t = bones[i];
  var p = t.localPosition; var q = t.localRotation;
  int parent = index.ContainsKey(t.parent) ? index[t.parent] : -1;
  if (i > 0) sb.Append(",");
  sb.Append("{\"name\":\"" + t.name + "\",\"parent\":" + parent + ",\"p\":[" + F(-p.x) + "," + F(p.y) + "," + F(p.z) + "],\"q\":[" + F(q.x) + "," + F(-q.y) + "," + F(-q.z) + "," + F(q.w) + "]}");
}
// Root bone's parent chain (model root → Root) is identity apart from Root's own transform.
sb.Append("],");

// Skin: map the renderer's bone list onto our DFS order.
var smrBones = smr.bones;
var remap = new int[smrBones.Length];
for (int i = 0; i < smrBones.Length; i++) remap[i] = index[smrBones[i]];
var bind = mesh.bindposes;
var inv = new UnityEngine.Matrix4x4[bones.Count];
for (int i = 0; i < bones.Count; i++) inv[i] = bones[i].worldToLocalMatrix * smr.transform.localToWorldMatrix;
for (int i = 0; i < smrBones.Length; i++) inv[remap[i]] = bind[i];
sb.Append("\"inverses\":[");
var S = UnityEngine.Matrix4x4.Scale(new UnityEngine.Vector3(-1, 1, 1));
for (int i = 0; i < bones.Count; i++) {
  var m = S * inv[i] * S;
  if (i > 0) sb.Append(",");
  sb.Append("[");
  // three.js Matrix4.fromArray is column-major.
  for (int c = 0; c < 4; c++) for (int r = 0; r < 4; r++) sb.Append((c + r > 0 ? "," : "") + F(m[r, c]));
  sb.Append("]");
}
sb.Append("],");

var v = mesh.vertices; var n = mesh.normals; var w = mesh.boneWeights; var tris = mesh.triangles;
sb.Append("\"position\":[");
for (int i = 0; i < v.Length; i++) sb.Append((i > 0 ? "," : "") + F(-v[i].x) + "," + F(v[i].y) + "," + F(v[i].z));
sb.Append("],\"normal\":[");
for (int i = 0; i < n.Length; i++) sb.Append((i > 0 ? "," : "") + F(-n[i].x) + "," + F(n[i].y) + "," + F(n[i].z));
sb.Append("],\"skinIndex\":[");
for (int i = 0; i < w.Length; i++) sb.Append((i > 0 ? "," : "") + remap[w[i].boneIndex0] + "," + remap[w[i].boneIndex1] + "," + remap[w[i].boneIndex2] + "," + remap[w[i].boneIndex3]);
sb.Append("],\"skinWeight\":[");
for (int i = 0; i < w.Length; i++) sb.Append((i > 0 ? "," : "") + F(w[i].weight0) + "," + F(w[i].weight1) + "," + F(w[i].weight2) + "," + F(w[i].weight3));
sb.Append("],\"index\":[");
for (int i = 0; i < tris.Length; i += 3) sb.Append((i > 0 ? "," : "") + tris[i] + "," + tris[i + 2] + "," + tris[i + 1]);
sb.Append("],");

// Clips: sample the humanoid animations onto this skeleton and record every
// bone's local rotation (plus Root's position) at 30 fps.
var clipNames = new[] { "Walk" };
sb.Append("\"clips\":{");
var report = "";
UnityEditor.AnimationMode.StartAnimationMode();
try {
  for (int c = 0; c < clipNames.Length; c++) {
    var clip = UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.AnimationClip>(root + "Animation/" + clipNames[c] + ".anim");
    int frames = UnityEngine.Mathf.Max(2, UnityEngine.Mathf.RoundToInt(clip.length * 30f) + 1);
    if (c > 0) sb.Append(",");
    sb.Append("\"" + clipNames[c].ToLower() + "\":{\"fps\":30,\"length\":" + F(clip.length) + ",\"frames\":[");
    for (int f = 0; f < frames; f++) {
      UnityEditor.AnimationMode.BeginSampling();
      UnityEditor.AnimationMode.SampleAnimationClip(go, clip, UnityEngine.Mathf.Min(clip.length, f / 30f));
      UnityEditor.AnimationMode.EndSampling();
      if (f > 0) sb.Append(",");
      var rp = bones[0].localPosition;
      sb.Append("[" + F(-rp.x) + "," + F(rp.y) + "," + F(rp.z));
      for (int b = 0; b < bones.Count; b++) { var q = bones[b].localRotation; sb.Append("," + F(q.x) + "," + F(-q.y) + "," + F(-q.z) + "," + F(q.w)); }
      sb.Append("]");
    }
    sb.Append("]}");
    report += clipNames[c] + " " + frames + " frames; ";
  }
} finally {
  UnityEditor.AnimationMode.StopAnimationMode();
  UnityEngine.Object.DestroyImmediate(go);
}
sb.Append("}}");

var outPath = System.Environment.GetEnvironmentVariable("STICKMAN_OUT") ?? (System.Environment.GetFolderPath(System.Environment.SpecialFolder.UserProfile) + "/Developer/bonkbow/assets/licensed/stickman/stickman.json");
System.IO.File.WriteAllText(outPath, sb.ToString());
return "bones=" + bones.Count + " verts=" + v.Length + " tris=" + tris.Length / 3 + " " + report + " bytes=" + sb.Length;
