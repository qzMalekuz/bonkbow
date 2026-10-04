// Downloads "Free Pack - Stick Man" (Asset Store product 389802) from the
// signed-in Unity account into the local Asset Store cache, through the
// Package Manager's internal download manager (no public API exists for this).
// Run in a live Editor: unity command eval -- --code "$(cat scripts/unity/fetch-stickman.cs)"
var asm = typeof(UnityEditor.EditorWindow).Assembly;
var BF = System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.FlattenHierarchy;
var sc = asm.GetType("UnityEditor.PackageManager.UI.Internal.ServicesContainer");
var inst = sc.GetProperty("instance", BF).GetValue(null);
var ifc = asm.GetType("UnityEditor.PackageManager.UI.Internal.IAssetStoreDownloadManager");
var dm = sc.GetMethod("Resolve").MakeGenericMethod(ifc).Invoke(inst, null);
dm.GetType().GetMethod("Download", BF, null, new[] { typeof(long) }, null).Invoke(dm, new object[] { 389802L });
return "download started";
