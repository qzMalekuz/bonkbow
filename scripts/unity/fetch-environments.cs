// Downloads the three environment packs behind the paid maps from the
// signed-in Unity account into the local Asset Store cache, through the
// Package Manager's internal download manager (same trick as
// fetch-stickman.cs; no public API exists for this):
//   168396 Environment Pack: Free Forest Sample   → map "Elder Forest"
//   315184 Low Poly Environment                   → map "Windmill Valley"
//   383100 Cozy Snowy Environment - Low Poly      → map "Snowfall Village"
// Run in a live Editor: unity command eval -- --code "$(cat scripts/unity/fetch-environments.cs)"
var asm = typeof(UnityEditor.EditorWindow).Assembly;
var BF = System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.FlattenHierarchy;
var sc = asm.GetType("UnityEditor.PackageManager.UI.Internal.ServicesContainer");
var inst = sc.GetProperty("instance", BF).GetValue(null);
var ifc = asm.GetType("UnityEditor.PackageManager.UI.Internal.IAssetStoreDownloadManager");
var dm = sc.GetMethod("Resolve").MakeGenericMethod(ifc).Invoke(inst, null);
var dl = dm.GetType().GetMethod("Download", BF, null, new[] { typeof(long) }, null);
foreach (var id in new[] { 168396L, 315184L, 383100L }) dl.Invoke(dm, new object[] { id });
return "downloads started";
